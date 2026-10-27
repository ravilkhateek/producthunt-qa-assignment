/**
 * Exploratory probes against the Product Hunt web app.
 *
 * Run:  bun run explore:web
 *
 * Read-only HTTP observation only: status codes, redirect behaviour, document
 * titles and security response headers. Nothing is submitted and no account
 * state is touched.
 */

export {}; // makes this a module, so top-level await is allowed

const WEB = process.env.PH_WEB_URL ?? "https://www.producthunt.com";

const SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
];

const TARGETS: Array<{ label: string; path: string }> = [
  { label: "homepage", path: "/" },
  { label: "404 probe", path: "/this-page-does-not-exist-qa-probe" },
  { label: "oauth dashboard (signed out)", path: "/v2/oauth/applications" },
  { label: "robots.txt", path: "/robots.txt" },
];

function titleOf(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.trim().replace(/\s+/g, " ") ?? "(no <title>)";
}

console.log("\nProduct Hunt web — exploratory probes");
console.log("=".repeat(72));

for (const { label, path } of TARGETS) {
  const url = `${WEB}${path}`;

  // redirect: manual so the redirect itself is observable, not swallowed.
  const head = await fetch(url, { method: "GET", redirect: "manual" });

  console.log(`\n### ${label}  —  ${path}`);
  console.log(`  HTTP ${head.status} ${head.statusText}`);

  const location = head.headers.get("location");
  if (location) console.log(`  redirects to: ${location}`);

  if (!location) {
    const html = await head.text();
    console.log(`  title: ${titleOf(html)}`);
    console.log(`  bytes: ${html.length}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
}

console.log(`\n${"=".repeat(72)}`);
console.log("Security response headers on the homepage\n");

const home = await fetch(WEB);
for (const name of SECURITY_HEADERS) {
  const value = home.headers.get(name);
  const shown = value ? (value.length > 90 ? `${value.slice(0, 90)}...` : value) : "ABSENT";
  console.log(`  ${name.padEnd(30)} ${shown}`);
}

console.log("");
