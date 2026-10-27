/**
 * Exploratory probes against the Product Hunt GraphQL API.
 *
 * Run:  bun run explore
 *
 * Every probe is read-only and deliberately cheap. Nothing here attempts to
 * exploit, overload or degrade the service: the goal is to observe how the API
 * behaves at its edges — bad auth, bad syntax, unknown fields — and to record
 * what it discloses while doing so.
 *
 * Rate limit budget is 6250 points per 15 minutes and a trivial query costs
 * 100, so the probe count is kept deliberately low.
 */

import { config } from "../src/config";

type Probe = {
  name: string;
  question: string;
  auth: "valid" | "none" | "invalid";
  body?: unknown;
  method?: string;
  contentType?: string | null;
};

const PROBES: Probe[] = [
  {
    name: "no-auth",
    question: "What happens with no Authorization header?",
    auth: "none",
    body: { query: `query { viewer { user { id } } }` },
  },
  {
    name: "invalid-token",
    question: "Does an invalid token leak anything useful to an attacker?",
    auth: "invalid",
    body: { query: `query { viewer { user { id } } }` },
  },
  {
    name: "malformed-syntax",
    question: "How are GraphQL syntax errors reported?",
    auth: "valid",
    body: { query: `query { viewer { user { id }` },
  },
  {
    name: "unknown-field",
    question: "Does requesting a non-existent field disclose schema detail?",
    auth: "valid",
    body: { query: `query { viewer { user { id totallyNotARealField } } }` },
  },
  {
    name: "introspection",
    question: "Is schema introspection enabled in production?",
    auth: "valid",
    body: { query: `query { __schema { queryType { name } } }` },
  },
  {
    name: "empty-query",
    question: "How is an empty query string handled?",
    auth: "valid",
    body: { query: `` },
  },
  {
    name: "get-not-post",
    question: "Is the endpoint reachable over GET?",
    auth: "valid",
    method: "GET",
  },
  {
    name: "wrong-content-type",
    question: "Is Content-Type validated?",
    auth: "valid",
    body: { query: `query { viewer { user { id } } }` },
    contentType: "text/plain",
  },
  {
    name: "realistic-query",
    question: "What does a realistic collection query cost?",
    auth: "valid",
    body: {
      query: `query { posts(first: 5) {
        edges { node { id name tagline votesCount } }
        pageInfo { hasNextPage endCursor }
      } }`,
    },
  },
];

function authHeader(mode: Probe["auth"]): Record<string, string> {
  if (mode === "none") return {};
  if (mode === "invalid") return { Authorization: "Bearer not-a-real-token-000" };
  return { Authorization: `Bearer ${config.token}` };
}

function truncate(value: unknown, max = 220): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "(empty)";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

console.log("\nProduct Hunt API — exploratory probes");
console.log("=".repeat(72));

for (const probe of PROBES) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authHeader(probe.auth),
  };

  if (probe.contentType !== null) {
    headers["Content-Type"] = probe.contentType ?? "application/json";
  }

  const started = Date.now();
  let response: Response;

  try {
    response = await fetch(config.apiUrl, {
      method: probe.method ?? "POST",
      headers,
      body: probe.body === undefined ? undefined : JSON.stringify(probe.body),
    });
  } catch (error) {
    console.log(`\n### ${probe.name}\n  ${probe.question}`);
    console.log(`  NETWORK ERROR: ${String(error)}`);
    continue;
  }

  const elapsed = Date.now() - started;
  const raw = await response.text();

  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* not JSON — reported below */
  }

  console.log(`\n### ${probe.name}`);
  console.log(`  Q: ${probe.question}`);
  console.log(`  HTTP ${response.status} ${response.statusText}  (${elapsed}ms)`);
  console.log(`  content-type: ${response.headers.get("content-type") ?? "(none)"}`);

  const remaining = response.headers.get("x-rate-limit-remaining");
  if (remaining) console.log(`  quota remaining: ${remaining}`);

  if (parsed === null) {
    console.log(`  body (not JSON): ${truncate(raw)}`);
  } else if (parsed.errors) {
    console.log(`  errors: ${truncate(parsed.errors)}`);
  } else if (parsed.error || parsed.error_description) {
    console.log(`  error: ${truncate(parsed.error)} / ${truncate(parsed.error_description)}`);
  } else {
    console.log(`  data: ${truncate(parsed.data)}`);
  }

  // Be a good citizen: space the probes out.
  await new Promise((resolve) => setTimeout(resolve, 400));
}

console.log(`\n${"=".repeat(72)}\nProbes complete.\n`);
