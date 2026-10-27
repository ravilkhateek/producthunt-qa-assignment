/**
 * Writes the Product Hunt developer token into .env.
 *
 * Run:  bun run token
 *
 * Prompts in the terminal so the token goes straight from your clipboard to
 * the file. Nothing leaves this machine, and the token is never printed back.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(import.meta.dir, "..", ".env");

console.log("\nPaste your Product Hunt developer token, then press Enter.\n");

const token = (prompt("Token:") ?? "").trim();

if (token.length === 0) {
  console.error("\nNothing entered. Nothing was saved.\n");
  process.exit(1);
}

if (token.length < 20) {
  console.error(
    `\nThat is only ${token.length} characters, too short for a developer token.` +
      `\nNothing was saved. Run 'bun run token' again.\n`,
  );
  process.exit(1);
}

if (/\s/.test(token)) {
  console.error(
    "\nThe value contains a space, which a token should not." +
      "\nNothing was saved. Check what you copied and try again.\n",
  );
  process.exit(1);
}

const content = readFileSync(envPath, "utf8");

if (!/^PRODUCT_HUNT_TOKEN=.*$/m.test(content)) {
  console.error("\nCould not find a PRODUCT_HUNT_TOKEN line in .env.\n");
  process.exit(1);
}

writeFileSync(
  envPath,
  content.replace(/^PRODUCT_HUNT_TOKEN=.*$/m, `PRODUCT_HUNT_TOKEN=${token}`),
  "utf8",
);

console.log(`\nSaved to .env - token length ${token.length} characters.`);
console.log("Now run:  bun run verify\n");
