# Product Hunt — QA Engineering Assignment

Test strategy, exploratory findings and automated coverage for
[Product Hunt](https://www.producthunt.com) and its public GraphQL API.

**16 automated tests** (8 API, 8 E2E) and **14 documented findings**, all
reproducible from the scripts in this repository.

| Document | Contents |
|---|---|
| [`docs/test-strategy.md`](docs/test-strategy.md) | **Part 1** — what matters, why, and what is deliberately out of scope |
| [`docs/findings.md`](docs/findings.md) | **Part 2** — 13 findings with reproduction steps |
| `tests/api/` + `tests/e2e/` | **Part 3** — the suites |

## Setup

### Prerequisites

- [Bun](https://bun.sh) — runtime and package manager
- [Node.js](https://nodejs.org) LTS — required by the Playwright runner (see
  *Architecture decisions*)
- A Product Hunt developer token (free, never expires)

### Install

```bash
bun install
bun x playwright install chromium
```

### Configure

```bash
cp .env.example .env      # Windows: copy .env.example .env
bun run token             # prompts for your token and writes it to .env
```

To get a token: create an application at
<https://www.producthunt.com/v2/oauth/applications>, then use **Create Token**
in its *Developer Token* section. Note that the redirect URI must be `https://`
even for localhost — see finding F-03.

Confirm it works:

```bash
bun run verify
```

This makes one authenticated call and prints the rate limit budget. `.env` is
gitignored; `.env.example` is the committed template.

## Running the tests

```bash
bun run test         # both suites
bun run test:api     # 8 API tests  (~4s)
bun run test:e2e     # 8 E2E tests  (~21s)
bun run report       # open the Playwright HTML report
bun run typecheck    # TypeScript, no emit
```

Exploration scripts, kept because every finding should be re-runnable:

```bash
bun run explore      # API edge cases: auth, bad syntax, introspection
bun run explore:web  # HTTP statuses, redirects, security headers
bun run cost         # measures rate limit cost by query size
```

## Continuous integration

[`.github/workflows/tests.yml`](.github/workflows/tests.yml) runs typecheck,
the API suite and the E2E suite on every push and pull request, and nightly at
07:00 UTC. The Playwright HTML report is uploaded as an artifact on every run,
passing or failing.

The nightly schedule is the important one. The system under test is a
third-party production site that changes without warning, so most breakages
will arrive on a day nobody touched this repository.

Both suites are gated, and both gates are deliberate:

| Suite | Runs when | Why |
|---|---|---|
| Typecheck | always | No external dependency |
| API | `PRODUCT_HUNT_TOKEN` secret is set | A cloner without a token cannot fix a red build |
| E2E | `RUN_E2E` variable is `true` | **Product Hunt returns HTTP 403 to GitHub-hosted runners** |

**The E2E gate is the interesting one.** Pushing this workflow is how finding
**F-14** was discovered: the suite passes locally and fails in Actions with a
flat `403` on the homepage — not the bot challenge of F-12, a hard block on
datacenter egress IPs. Running it by default would leave a permanently red
build that says nothing about the code.

Fixing it properly needs a self-hosted runner on non-datacenter egress, a
residential-egress proxy, or an allowlist arrangement with the vendor. Until
then the step is skipped with a visible warning rather than hidden.

To enable either suite: add the `PRODUCT_HUNT_TOKEN` secret, or set the
`RUN_E2E` variable to `true`, under *Settings → Secrets and variables →
Actions*.

## Summary of findings

Full detail in [`docs/findings.md`](docs/findings.md).

| ID | Severity | Finding |
|---|---|---|
| F-07 | **Medium** | No `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy` or COOP |
| F-08 | **Medium** | HSTS declares `preload` but `max-age` is 30 days, not the required year |
| F-02 | **Medium** | API Key and Secret rendered in permanent plaintext on the dashboard |
| F-05 | Info | Rate limiting is flat per request, not complexity-based; failed queries charged |
| F-01 | Low | Signed-out API dashboard silently redirects to the marketing homepage |
| F-03 | Low | `redirect_uri` must be HTTPS — undocumented, no localhost exemption |
| F-04 | Info | Rate limits are undocumented but fully disclosed in headers |
| F-06 | Low | GraphQL introspection enabled in production (context-dependent) |
| F-09 | Low | 404 pages return a correct status but keep the homepage `<title>` |
| F-10 | Low | Wrong `Content-Type` reports `query_missing` instead of 415 |
| F-11 | Low | Homepage ships 1,091,244 bytes of HTML before any assets |
| F-12 | Low | Bot protection challenges deep links but not in-app navigation |
| F-13 | Low | Search results page has no `<h1>` and reuses the generic title |
| F-14 | Low | Datacenter egress IPs hard-blocked with 403, not challenged — blocks cloud CI |

**The three worth leading with:**

**F-08** is the sharpest. The HSTS header advertises `preload` while carrying
`max-age=2592000` — 30 days, where the preload list requires a year. It passes
every functional test and is only visible to someone reading the header against
the specification.

**F-07**, the absent CSP, matters because Product Hunt is built on
user-generated content. CSP is the control that limits the blast radius of an
XSS flaw if output encoding fails anywhere; without it, one encoding mistake
has no second line of defence.

**F-05** changed how the API suite is designed. Measured, not assumed: a 20-post
query with nested topics costs exactly the same 100 points as
`viewer { user { id } }`. The quota caps request *count*, not work done — so
the right strategy is to fetch more per request and make fewer of them.

## Architecture decisions

**Bun for packages and API tests; Node under Playwright.** The brief specifies
Bun, and Bun installs dependencies and runs the API suite. Playwright's test
runner, however, is a Node program that spawns workers using Node internals Bun
does not fully implement, and running it under Bun alone is unreliable. The
split keeps the stated stack while keeping E2E stable. `bun run test:e2e`
drives it, so the seam is invisible in use.

**One worker, no parallelism.** Not an oversight. Four workers reliably
triggered Cloudflare challenges (F-12), and the API quota is shared across
workers anyway (F-05), so parallelism buys nothing and costs reliability.
It is also simply correct conduct toward someone else's production site.

**`data-test` attributes as the only selectors.** Product Hunt exposes 64 of
them. CSS classes are generated and change without notice; text changes daily.
Test IDs are the only stable contract available, and they are centralised in
`tests/e2e/helpers.ts` so a DOM change is a one-line fix.

**Assert structure, never content.** The feed changes every day. Assertions
target invariants — types, non-negative counts, parseable timestamps, disjoint
pagination pages, vote labels that are numeric — so the suite tests the
contract rather than today's data.

**A thin API client that does not hide HTTP.** `src/api-client.ts` returns
status, headers, data, errors and the parsed rate limit together. A client that
wrapped errors or retried internally would make most of the suite unwritable,
because the suite's job is to assert on exactly those things.

**No fixed waits.** Every wait is a condition — a web-first assertion or
`waitForURL`. Building this produced one genuine flake: reading a heading after
a client-side navigation, before the new page mounted. It was fixed by waiting
on the URL, not by lengthening a timeout. A timeout that "fixes" a flake has
only widened the window in which it still fails.

**Known defects encoded, not hidden.** `tests/e2e/resilience.spec.ts` asserts
that the 404 page *still has* the wrong title (F-09). The test is green today
and will fail the day it is fixed, prompting the correct assertion — which sits
commented out beside it — to be switched on. A tracked bug should not make CI
permanently red, but it should not be forgotten either.

## What I would do with more time

**Accessibility, first.** F-13 found a search results page with no `<h1>` —
and found it incidentally, while looking for selectors. An axe-core sweep
across the main templates would almost certainly surface more, and it is the
highest-value area currently uncovered.

**Schema diffing.** A contract test that snapshots the GraphQL schema and
diffs it between runs would catch breaking API changes before consumers do.
Introspection is enabled (F-06), so this is straightforward to build.

**Core Web Vitals.** F-11 observed a 1 MB homepage document but stopped short
of calling it a defect. Real LCP and INP measurement on throttled mobile would
settle whether it matters.

**Cross-browser.** Chromium only today. WebKit is the gap that matters, given
the mobile share of a link-sharing product.

**Authenticated journeys**, if given a dedicated test account — voting,
commenting and profile flows are entirely uncovered, and deliberately so while
the only available account is a real one on production.

## Testing conduct

Product Hunt is a live third-party service, not a system owned by this project.
All testing here is **read-only**: nothing is created, modified or deleted; no
account other than my own API application was touched; no finding was exploited
beyond the observation needed to describe it; and request volume was kept
deliberately low. Security observations are reasoned about, not attacked.
