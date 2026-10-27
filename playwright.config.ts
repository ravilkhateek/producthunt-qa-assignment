import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const baseURL = process.env.PH_WEB_URL ?? "https://www.producthunt.com";

export default defineConfig({
  testDir: "./tests/e2e",

  // Fail the build if someone leaves test.only in the source.
  forbidOnly: isCI,

  // Retry on CI only. Locally a retry hides a real flake from the author.
  retries: isCI ? 2 : 0,

  // Single worker, serially. This is not a performance oversight.
  //
  // Product Hunt sits behind Cloudflare bot protection. Running this suite at
  // four parallel workers reliably triggered an interstitial challenge page
  // ("Just a moment...") instead of the application, failing tests for a
  // reason unrelated to the product. See docs/findings.md F-12.
  //
  // It is also the right thing to do: this is someone else's production site,
  // not a system we own, and a test suite has no business generating burst
  // traffic against it.
  workers: 1,
  fullyParallel: false,

  // Product Hunt is a third-party production site. Keep timeouts generous
  // enough to absorb normal latency, so a slow response is not read as a bug.
  timeout: 45_000,
  expect: { timeout: 15_000 },

  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
