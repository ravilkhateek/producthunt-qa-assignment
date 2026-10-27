# Test Strategy — Product Hunt

Product Hunt is a two-sided marketplace wearing a content site's clothes.
Makers supply launches; visitors supply attention. The transaction that matters
is a visitor discovering a product and clicking through to it. A broken comment
box is embarrassing; a feed that fails to render, or an outbound link that does
not resolve, breaks the business.

## What matters most

1. **The daily feed renders with real data.** The highest-traffic surface.
   The failure worth guarding is not a blank page — that is obvious — but a
   feed that renders its container while launches or vote counts come back
   empty. Covered by asserting launches exist *and* vote labels are numeric.
2. **The maker click-through path.** An empty or `#` outbound href is silent:
   nothing errors, traffic just stops. Highest-value, lowest-visibility failure
   on the site.
3. **The API contract.** Third parties discover breaking changes when their
   code breaks. Field types, pagination and the error envelope are the
   contract. Cursor pagination is covered explicitly because overlapping pages
   silently duplicate rows downstream.
4. **The API auth boundary.** The one place a regression is an incident, not a
   bug. Asserted: bad credentials are rejected, *and* a missing token is
   indistinguishable from an invalid one — otherwise the difference confirms to
   an attacker whether a captured token was ever real.
5. **Search, including its empty state.** Empty states are where teams stop
   caring, and a blank page instead of "no results" reads as a broken site.

## Out of scope, deliberately

No writes — no voting, commenting or posting. This is someone else's
production system; automated writes would be vandalism. No authenticated
journeys without a dedicated test account, since state cannot be reset. No
visual regression: the feed changes daily by design.

## Layers

| Layer | Scope | Tooling |
|---|---|---|
| API | Auth, posts contract, pagination, errors, rate limits | Bun + TypeScript |
| E2E | Feed, product page, search, 404 | Playwright |
| Exploratory | Security headers, cost model, bot protection | Manual + scripts |

Neither suite mocks the system under test. Mocking a third-party API we are
trying to characterise would only test our assumptions about it.

## Constraints that shape everything

No staging, no seeded data, no way to reset state. Three measured constraints
follow (detail in `findings.md`):

- **Rate limiting is flat, not complexity-based (F-05).** 6250 points per 15
  minutes; *every* successful request costs 100 regardless of size, and failed
  queries are charged too. That caps the suite near 62 requests per window and
  inverts normal advice: fetch more per request, make fewer requests.
  Parallelism is bounded by quota, not CPU.
- **Bot protection is uneven (F-12).** Deep links to `/products/<slug>` get a
  Cloudflare challenge; the same page reached by clicking does not. Parallel
  workers worsen it. Hence one worker, navigating as a user does.
- **Data changes daily.** Every assertion targets structure and invariants,
  never values.

## Flake policy and CI

No fixed waits. Every wait is a condition — a web-first assertion or
`waitForURL`. Building this produced one flake (reading a heading before a
client-side navigation completed), fixed by waiting on the URL rather than
lengthening a timeout. A timeout that "fixes" a flake has only widened the
window in which it still fails.

Retries on CI only, capped at two, transport failures only; retrying an
assertion failure turns a real bug into an intermittent one. Both suites run
per PR and block the merge. Nightly runs matter more here than per-PR ones:
the system under test is third-party, so most breakages will land on a day
nobody touched the code.

## If I had more time

Accessibility first — F-13 found a search page with no `<h1>` incidentally, so
an axe-core sweep would likely find more. Then schema diffing to catch breaking
API changes before consumers do, Core Web Vitals against the 1 MB homepage
document (F-11), and WebKit coverage.
