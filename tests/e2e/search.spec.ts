import { test, expect } from "@playwright/test";
import { sel } from "./helpers";

/**
 * Search is the main way a visitor who did not arrive for today's feed finds
 * anything. It is also the most common place for an empty state to be handled
 * badly — a blank page instead of "no results" reads as a broken site.
 */
test.describe("search", () => {
  test("returns matching products for a common term", async ({ page }) => {
    await page.goto("/search?q=ai");

    const results = page.locator(sel.searchResult);

    // Web-first assertion: retries until results render, with no fixed wait.
    await expect(results.first()).toBeVisible();
    expect(await results.count()).toBeGreaterThan(0);
  });

  test("handles a term with no matches without breaking the page", async ({ page }) => {
    const nonsense = "zzqqxx-no-such-product-" + Date.now();
    const response = await page.goto(`/search?q=${nonsense}`);

    // The page must still be a healthy document, not a 5xx or a blank body.
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toBeVisible();

    // The search control must survive, so the user can correct their query
    // rather than reaching a dead end.
    await expect(page.locator(sel.searchInput).first()).toBeVisible();

    // No unhandled error should have surfaced to the user.
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("something went wrong");
    expect(body).not.toContain("internal server error");
  });
});
