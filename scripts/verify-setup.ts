/**
 * Setup verification.
 *
 * Confirms the developer token authenticates against the GraphQL API and
 * reports the rate limit budget the server hands back. Product Hunt does not
 * publish its limits in the docs, so the response headers are the only
 * reliable source — and those numbers drive how the API suite is designed.
 *
 * Run with:  bun run verify
 *
 * The token is never printed.
 */

import { config } from "../src/config";

// Deliberately tiny. The point is to authenticate, not to fetch data, and a
// cheap query spends the least rate-limit budget doing it.
const QUERY = `query VerifySetup { viewer { user { id username } } }`;

const started = Date.now();

const response = await fetch(config.apiUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${config.token}`,
  },
  body: JSON.stringify({ query: QUERY }),
});

const elapsed = Date.now() - started;
const body = await response.json().catch(() => null);

console.log(`\nHTTP ${response.status} ${response.statusText}  (${elapsed}ms)`);

console.log("\nRate limit headers");
const rateHeaders = [...response.headers.entries()]
  .filter(([name]) => /rate|limit|retry|quota|complex/i.test(name))
  .sort(([a], [b]) => a.localeCompare(b));

if (rateHeaders.length === 0) {
  console.log("  (none returned)");
} else {
  for (const [name, value] of rateHeaders) {
    console.log(`  ${name}: ${value}`);
  }
}

console.log("\nResponse");
if (body && typeof body === "object" && "errors" in body) {
  console.log("  GraphQL errors:", JSON.stringify(body.errors, null, 2));
} else {
  console.log(`  ${JSON.stringify(body)}`);
}

if (!response.ok) {
  console.error("\nToken did NOT authenticate. Check PRODUCT_HUNT_TOKEN in .env\n");
  process.exit(1);
}

console.log("\nToken authenticates correctly.\n");
