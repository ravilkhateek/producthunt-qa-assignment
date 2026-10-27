import { test, expect } from "@playwright/test";
import { dismissOverlays, sel } from "./helpers";

/**
 * Product pages are where a launch converts into a click-through, which is the
 * value Product Hunt delivers to makers. A broken outbound link or a missing
 * title is a commercial failure, not a cosmetic one.
 *
 * Navigation note: these tests reach the product page by clicking from the
 * feed rather than calling page.goto() with a product URL. That is not a
 * stylistic choice — a direct document request to /products/<slug> from an
 * automated browser is served a Cloudflare interstitial, while the same
 * browser arriving via an in-app click renders the application normally.
 * See docs/findings.md F-12.
 *
 * It is also the more faithful test: it exercises the journey a visitor
 * actually takes.
 */
test.describe("product page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await dismissOverlays(page);

    await page.locator(sel.productLink).first().click();

    // Navigation is client-side, so the old heading stays mounted for a beat.
    // Waiting on the URL — a condition, never a duration — is what makes the
    // assertions below read the product page rather than a stale homepage.
    await page.waitForURL(/\/products\//);

    // Fail fast and legibly if a bot challenge was served instead of the app.
    await expect(page).not.toHaveTitle(/just a moment/i);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("h1").first()).not.toHaveText(/top products launching today/i);
  });

  test("shows the product name in both the heading and the document title", async ({
    page,
  }) => {
    const name = (await page.locator("h1").first().innerText()).trim();
    expect(name.length).toBeGreaterThan(0);

    // Product pages follow "<Name>: <tagline> | Product Hunt". The heading and
    // the title must agree — when they diverge, shared links and search
    // results describe a different product than the page shows.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(page).toHaveTitle(new RegExp(escaped, "i"));
    await expect(page).toHaveTitle(/product hunt/i);
  });

  test("offers a working outbound link to the product's own site", async ({ page }) => {
    const visit = page.locator(sel.visitWebsite).first();
    await expect(visit).toBeVisible();

    // The control must resolve to a real destination. An empty or "#" href is
    // the failure mode that silently breaks the maker's referral traffic.
    const target = await visit.evaluate(
      (el) => el.closest("a")?.getAttribute("href") ?? el.getAttribute("href") ?? "",
    );

    expect(target).toBeTruthy();
    expect(target).not.toBe("#");
  });
});
