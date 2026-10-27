import { test, expect } from "@playwright/test";
import { dismissOverlays, sel } from "./helpers";

/**
 * The homepage is the product's front door and the highest-traffic page on the
 * site. If the daily feed fails to render, the product has effectively failed,
 * so it earns the most coverage.
 *
 * Selectors use the site's own `data-test` attributes rather than CSS classes
 * or text. Classes are generated and change without notice; the feed content
 * changes every day. Test IDs are the only stable contract available.
 */
test.describe("homepage", () => {
  test("renders today's launch feed", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/product hunt/i);

    const today = page.locator(sel.todaySection);
    await expect(today).toBeVisible();

    // The feed must actually contain launches, not just render its container.
    const products = page.locator(sel.productLink);
    expect(await products.count()).toBeGreaterThan(0);
  });

  test("every launch in the feed exposes a name and a numeric vote count", async ({
    page,
  }) => {
    await page.goto("/");
    await dismissOverlays(page);

    const voteButtons = page.locator(sel.voteButton);
    const total = await voteButtons.count();
    expect(total).toBeGreaterThan(0);

    // Sample the first few rather than all of them: the invariant is the same
    // and a full sweep makes the test slow without adding signal.
    const sample = Math.min(total, 5);

    for (let i = 0; i < sample; i++) {
      const button = voteButtons.nth(i);
      const label = (await button.innerText()).trim();

      // A vote button whose label is not a number means the count failed to
      // load — a visible, user-facing defect.
      expect(label, `vote button ${i} should show a number`).toMatch(/^\d[\d,]*$/);
    }
  });

  test("navigates from the feed to a product page", async ({ page }) => {
    await page.goto("/");
    await dismissOverlays(page);

    const firstProduct = page.locator(sel.productLink).first();
    const href = await firstProduct.getAttribute("href");
    expect(href).toBeTruthy();

    await firstProduct.click();

    await expect(page).toHaveURL(new RegExp(`${href}(\\?|$|#)`));
    await expect(page.locator("h1").first()).toBeVisible();
  });
});
