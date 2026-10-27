# Test Strategy — Product Hunt

Written as if I were the sole QA engineer owning quality for this product.

## What the product actually is

Product Hunt is a two-sided marketplace wearing a content site's clothes.
Makers supply launches; visitors supply attention and votes. The transaction
that matters is a visitor discovering a product and clicking through to it.
Everything else — comments, ratings, newsletters — is supporting cast.

That framing sets the priorities. A broken comment box is embarrassing. A feed
that does not render, or an outbound link that does not resolve, breaks the
value exchange the business runs on.

## What matters most, and why

**1. The daily feed renders, with real data.** This is the product's front
door and its highest-traffic surface. The failure mode worth guarding is not a
blank page — that is obvious and would be caught in minutes — but a feed that
renders its container while the launches inside fail to load, or vote counts
that come back as blanks. The suite therefore asserts that launches exist
*and* that each vote button shows a number.

**2. The maker click-through path.** A launch that cannot be clicked through
to is a broken promise to the maker who paid attention to get there. An empty
or `#` outbound href is silent: nothing errors, traffic simply stops. This is
the single highest-value, lowest-visibility failure on the site.

**3. The public API's contract.** Third parties build integrations on this
API, and they find out about breaking changes when their code breaks. Field
types, pagination semantics and the error envelope are the contract. Cursor
pagination gets explicit coverage because overlapping pages are the classic
connection bug and they silently duplicate rows downstream.

**4. The API's authentication boundary.** It is the one place where a
regression is a security incident rather than a bug. Coverage asserts not only
that bad credentials are rejected, but that a missing token and an invalid
token are *indistinguishable* — otherwise the difference confirms to an
attacker whether a captured token was ever real.

**5. Search, including its empty state.** Search is how visitors who did not
come for today's feed find anything. Empty states are where teams stop caring,
and a blank page instead of "no results" reads as a broken site.

## What I am deliberately not testing

- **Anything that writes.** No voting, commenting, posting or profile edits.
  This is someone else's production system; automated writes would be
  vandalism, not testing.
- **Authenticated user journeys.** Covering them needs a test account whose
  state the suite controls. Against production, with no reset, tests would
  accumulate state and interfere with each other.
- **Payments, admin, and email.** No legitimate access, and inventing coverage
  for them would be theatre.
- **Pixel-level visual regression.** The feed changes daily by design; a
  visual baseline would be red every morning for no reason.

## Test layers

| Layer | Scope | Tooling | Why this layer |
|---|---|---|---|
| API | Auth, posts contract, pagination, errors, rate limits | Bun + TypeScript | Fast, deterministic, no browser; catches contract breaks precisely |
| E2E | Feed, product page, search, 404 | Playwright | Only layer that proves the thing a user touches actually works |
| Exploratory | Security headers, cost model, bot protection | Manual + scripts | Found every issue in `findings.md`; no automation would have asked these questions |

Each API test is one HTTP request. Each E2E test is one user journey. Neither
suite mocks the system under test — mocking a third-party API we are trying to
characterise would only test our assumptions about it.

## Environment constraints that shape everything

There is no staging, no seeded data and no way to reset state. Three
measured constraints follow, each documented in `findings.md`:

**Rate limiting is flat per request, not complexity-based (F-05).** The budget
is 6250 points per 15 minutes and *every* successful request costs 100,
regardless of size — a 20-post query with nested topics costs the same as
`viewer { user { id } }`. Failed queries are charged too. This caps the suite
at roughly 62 API requests per window, shared across all workers, and inverts
normal GraphQL advice: fetch more per request, make fewer requests. Parallelism
here is bounded by quota, not CPU.

**Bot protection is uneven (F-12).** Direct document requests to
`/products/<slug>` are served a Cloudflare challenge; the same page reached by
clicking from the feed is not. Parallel workers sharply increase the challenge
rate. The suite runs on a single worker and navigates as a user does.

**The data changes daily.** Every assertion targets structure and invariants —
types, non-negative counts, parseable timestamps, disjoint pagination pages —
never specific values. A test asserting today's top product would fail
tomorrow and teach nobody anything.

## Flake policy

No fixed waits anywhere. Every wait is on a condition: a web-first assertion
or `waitForURL`. Building this suite produced exactly one flake — reading a
heading after a client-side navigation, before the new page had mounted — and
it was fixed by waiting on the URL rather than lengthening a timeout. That
distinction is the whole policy: a timeout that "fixes" a flake has only
widened the window in which it still fails.

Retries run on CI only, capped at two, and only for transport-level failures.
Retrying an assertion failure converts a real bug into an intermittent one.
Locally retries are off, because a flake the author never sees is a flake that
ships.

## CI approach

Run both suites on every pull request; block the merge on either failing.
Nightly runs matter more than per-PR ones here: the system under test is
third-party and changes without warning, so most breakages will arrive on a day
nobody touched the code. `trace: on-first-retry` plus failure screenshots and
video keep the evidence without bloating green runs.

The API suite would use a dedicated token in CI, not a developer's personal
one, so quota exhaustion in CI cannot block local work.

## Production monitoring

The tests worth running continuously are a small subset: feed renders with
launches, a product page resolves, the API answers an authenticated query
inside its latency budget. Beyond that, the rate limit headers are free
telemetry — a client tracking `x-rate-limit-remaining` sees quota exhaustion
coming rather than discovering it as a wall of 429s.

The 404-status check is worth monitoring too: a soft 404 regression would be
invisible to users and quietly corrosive to search ranking.

## If I had more time

Accessibility is the largest gap. F-13 found a search results page with no
`<h1>`, discovered incidentally — an axe-core sweep across key templates would
almost certainly find more, and it is the highest-value area currently
uncovered. After that: Core Web Vitals against the 1 MB homepage document
(F-11), cross-browser coverage beyond Chromium, and a contract test that diffs
the GraphQL schema between runs to catch breaking API changes before consumers
do.
