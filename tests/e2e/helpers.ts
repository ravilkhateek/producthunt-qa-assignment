import type { Page } from "@playwright/test";

/**
 * The homepage renders a newsletter banner that can overlay content and
 * intercept clicks. Dismissing it up front is what a real user does, and it
 * keeps click-based tests from failing for a reason unrelated to what they
 * are checking.
 *
 * Written as a non-blocking check: if the banner is not shown (it is not
 * always rendered), the helper returns immediately rather than waiting out a
 * timeout.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  const dismiss = page.locator('[data-test^="dismiss-"]').first();

  if ((await dismiss.count()) > 0 && (await dismiss.isVisible())) {
    await dismiss.click();
  }
}

/** Stable selectors, gathered in one place so a DOM change is a one-line fix. */
export const sel = {
  todaySection: '[data-test="homepage-section-today"]',
  searchInput: '[data-test="header-search-input"]',
  signInLink: '[data-test="header-nav-link-sign-in"]',
  voteButton: '[data-test="vote-button"]',
  productLink: 'a[href^="/products/"]',
  searchResult: '[data-test^="spotlight-result-product-"]',
  visitWebsite: '[data-test="visit-website-button"]',
  commentsFeed: '[data-test="comments-feed"]',
} as const;
