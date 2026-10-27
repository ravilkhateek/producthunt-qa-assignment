/**
 * Central configuration. Fails loudly and early when a required secret is
 * missing, so a misconfigured run reports "token not set" instead of a wall
 * of confusing 401s from the API.
 */

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "" || value.startsWith("paste_your_")) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and set a real value.\n` +
        `Get a token at https://www.producthunt.com/v2/oauth/applications`,
    );
  }

  return value.trim();
}

export const config = {
  /** Product Hunt GraphQL endpoint. */
  apiUrl: process.env.PH_API_URL ?? "https://api.producthunt.com/v2/api/graphql",

  /** Product Hunt web app. */
  webUrl: process.env.PH_WEB_URL ?? "https://www.producthunt.com",

  /** Developer token. Read lazily so E2E runs do not require it. */
  get token(): string {
    return required("PRODUCT_HUNT_TOKEN");
  },
} as const;
