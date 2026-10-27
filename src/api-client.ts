/**
 * Typed client for the Product Hunt GraphQL API.
 *
 * Deliberately thin: it does not wrap errors, retry, or hide the HTTP layer,
 * because the tests need to assert on status codes, rate limit headers and the
 * GraphQL error envelope directly. A client that swallowed those would make
 * most of the suite impossible to write.
 */

import { config } from "./config";

export type GraphQLError = {
  message?: string;
  error?: string;
  error_description?: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
  extensions?: Record<string, unknown>;
};

export type RateLimit = {
  limit: number | null;
  remaining: number | null;
  /** Seconds until the window resets. */
  reset: number | null;
};

export type GraphQLResult<T> = {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T | null;
  errors: GraphQLError[] | null;
  rateLimit: RateLimit;
  durationMs: number;
};

export type AuthMode = "valid" | "none" | "invalid";

export type RequestOptions = {
  /** Which Authorization header to send. Defaults to the real token. */
  auth?: AuthMode;
  variables?: Record<string, unknown>;
  /** Override the Content-Type, or pass null to omit it entirely. */
  contentType?: string | null;
};

function numberOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function authorizationFor(mode: AuthMode): Record<string, string> {
  switch (mode) {
    case "none":
      return {};
    case "invalid":
      return { Authorization: "Bearer invalid-token-for-testing-000000" };
    case "valid":
      return { Authorization: `Bearer ${config.token}` };
  }
}

/**
 * Executes a GraphQL document and returns the full envelope: status, headers,
 * data, errors and the parsed rate limit budget.
 */
export async function graphql<T = unknown>(
  query: string,
  options: RequestOptions = {},
): Promise<GraphQLResult<T>> {
  const { auth = "valid", variables, contentType = "application/json" } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authorizationFor(auth),
  };

  if (contentType !== null) {
    headers["Content-Type"] = contentType;
  }

  const started = Date.now();

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(variables ? { query, variables } : { query }),
  });

  const durationMs = Date.now() - started;
  const text = await response.text();

  let parsed: { data?: T; errors?: GraphQLError[] } | null = null;
  try {
    parsed = JSON.parse(text) as { data?: T; errors?: GraphQLError[] };
  } catch {
    // Left as null; tests assert on status and raw shape instead.
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    data: parsed?.data ?? null,
    errors: parsed?.errors ?? null,
    rateLimit: {
      limit: numberOrNull(response.headers.get("x-rate-limit-limit")),
      remaining: numberOrNull(response.headers.get("x-rate-limit-remaining")),
      reset: numberOrNull(response.headers.get("x-rate-limit-reset")),
    },
    durationMs,
  };
}

// --- Domain shapes -------------------------------------------------------
// Only the fields the suite actually asserts on. Modelling the whole schema
// would be dead weight that drifts out of date.

export type Post = {
  id: string;
  name: string;
  tagline: string;
  slug: string;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
};

export type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type PostsConnection = {
  posts: {
    edges: Array<{ node: Post; cursor?: string }>;
    pageInfo: PageInfo;
  };
};

export type Viewer = {
  viewer: {
    user: {
      id: string;
      username: string;
    } | null;
  } | null;
};

export const POSTS_QUERY = `
  query Posts($first: Int!, $after: String) {
    posts(first: $first, after: $after) {
      edges {
        node { id name tagline slug votesCount commentsCount createdAt }
        cursor
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const VIEWER_QUERY = `
  query Viewer {
    viewer { user { id username } }
  }
`;
