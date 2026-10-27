/**
 * Measures what the API actually charges for queries of different sizes.
 *
 * Run:  bun run cost
 *
 * The probe run suggested every successful request costs a flat 100 points
 * regardless of how much it asks for. If that holds, it inverts the usual
 * advice: fetching more per request is free, and the thing to minimise is the
 * number of requests, not their size.
 */

import { config } from "../src/config";

const QUERIES: Array<{ label: string; query: string }> = [
  {
    label: "tiny     (1 field, no collection)",
    query: `query { viewer { user { id } } }`,
  },
  {
    label: "medium   (5 posts, 4 fields each)",
    query: `query { posts(first: 5) {
      edges { node { id name tagline votesCount } }
    } }`,
  },
  {
    label: "large    (20 posts, 8 fields + nested topics)",
    query: `query { posts(first: 20) {
      edges { node {
        id name tagline slug url votesCount commentsCount createdAt
        topics(first: 3) { edges { node { id name } } }
      } }
      pageInfo { hasNextPage endCursor }
    } }`,
  },
];

console.log("\nRate limit cost by query size");
console.log("=".repeat(62));

let previousRemaining: number | null = null;

for (const { label, query } of QUERIES) {
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({ query }),
  });

  const body = await response.json().catch(() => null);
  const remaining = Number(response.headers.get("x-rate-limit-remaining"));

  const delta =
    previousRemaining === null ? "(baseline)" : `${previousRemaining - remaining} points`;

  const errors = body && typeof body === "object" && "errors" in body;

  console.log(`\n${label}`);
  console.log(`  HTTP ${response.status}  remaining ${remaining}  charged since previous: ${delta}`);
  if (errors) {
    console.log(`  errors: ${JSON.stringify((body as any).errors).slice(0, 200)}`);
  }

  previousRemaining = remaining;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.log(`\n${"=".repeat(62)}`);
console.log("Note: the charge shown is for the PREVIOUS request, because the");
console.log("remaining header reflects state before the current one is billed.\n");
