import { test, expect } from "@playwright/test";

/**
 * Error paths. A site that returns a soft 404 — HTTP 200 with "not found"
 * content — poisons search indexes and hides broken links from monitoring, so
 * the status code matters as much as the page.
 */
test.describe("error handling", () => {
  test("serves a real 404 status and a helpful page for unknown URLs", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist-qa-probe");

    // The status, not just the content, must say "not found".
    expect(response?.status()).toBe(404);

    // Web-first assertion so it retries while the page renders, rather than
    // snapshotting innerText at a single instant.
    await expect(page.locator("body")).toContainText("404");

    // The user must be offered a way back rather than a dead end.
    const homeLink = page.locator('a[href="/"], a[href="https://www.producthunt.com/"]');
    expect(await homeLink.count()).toBeGreaterThan(0);

    // KNOWN DEFECT — see docs/findings.md F-09.
    // The 404 page keeps the generic homepage <title>, so tab text, bookmarks
    // and link previews describe a missing page as the homepage. The assertion
    // below is what should pass once that is fixed; it is left commented out
    // so the suite reports real regressions rather than a tracked open bug.
    //
    //   await expect(page).toHaveTitle(/not found|404/i);
    //
    // Asserted here instead: the defect still exists, so that this test starts
    // failing — prompting the comment above to be re-enabled — if it is fixed.
    await expect(page).toHaveTitle(/the best new products in tech/i);
  });
});
