# Exploratory Findings

Running log of bugs, inconsistencies and security observations found while
exploring Product Hunt and its public API.

All testing is read-only and stays within normal product usage. No attempt is
made to exploit, overload or access data belonging to other accounts.

**Severity scale:** Critical / High / Medium / Low / Informational

---

## F-01 — API dashboard silently redirects to the marketing homepage when signed out

| | |
|---|---|
| **Severity** | Low |
| **Area** | Web — OAuth application dashboard |
| **Status** | Confirmed |

**Steps to reproduce**
1. Sign out of Product Hunt, or open a clean browser profile.
2. Navigate to `https://www.producthunt.com/v2/oauth/applications`.

**Expected** — A sign-in prompt, or a message explaining that authentication is
required, with a return path back to the dashboard.

**Actual** — The request is redirected to `https://www.producthunt.com/`, the
marketing homepage showing today's product list. No message, no error, no
indication that authentication was the reason.

**Why it matters** — The user cannot distinguish between "I am signed out",
"the URL is wrong" and "this feature no longer exists". A developer following
the API docs to this exact URL lands on a product listing with no explanation.
Losing the return path also means that after signing in they must find the URL
again.

---

## F-02 — API Key and API Secret rendered in plaintext on the applications list

| | |
|---|---|
| **Severity** | Medium |
| **Area** | Web — OAuth application dashboard |
| **Status** | Confirmed |

**Steps to reproduce**
1. Sign in and create an application at `/v2/oauth/applications`.
2. Observe the application entry on the resulting page.

**Expected** — The client secret shown once at creation, then masked behind a
click-to-reveal control or replaced by a regenerate action, which is the
common pattern for OAuth dashboards.

**Actual** — Both **API Key** and **API Secret** are rendered as plain text on
every subsequent page load, with no masking and no reveal interaction.

**Why it matters** — The secret is exposed to shoulder-surfing, screen sharing,
screen recording and casual screenshots. A user capturing this page to share a
question about their integration leaks a live credential without realising.
Persistent plaintext rendering also means the secret appears in any browser
page cache or automated screenshot of that route.

**Note** — The page does carry the warning *"Please do not share your developer
tokens with any untrusted sources"*, which suggests the risk is understood for
tokens, but the same protection is not applied to the secret itself.

---

## F-03 — `redirect_uri` must be HTTPS, but this is undocumented and only surfaces after submission

| | |
|---|---|
| **Severity** | Low |
| **Area** | Web — application creation form / Docs |
| **Status** | Confirmed |

**Steps to reproduce**
1. Go to `https://www.producthunt.com/v2/oauth/applications/new`.
2. Enter any name and set **Redirect URI** to `http://localhost:3000/auth/callback`.
3. Submit.

**Expected** — Either the value is accepted, or the constraint is stated on the
field before submission, and documented in the API docs.

**Actual** — The form is rejected with `redirect_uri must be an HTTPS/SSL URI.`
The rule appears nowhere in the API documentation, and the field carries no
hint, placeholder or inline validation.

**Why it matters** — Requiring TLS on redirect URIs is sound security practice,
but with no `localhost` exemption it forces developers to provision a local TLS
certificate purely to complete a registration form. Many OAuth providers
explicitly exempt `http://localhost` and `http://127.0.0.1` for this reason
(see RFC 8252 §8.3 for native apps). Surfacing the rule only on submit, and not
in the docs, turns a one-line constraint into a trial-and-error loop.

---

## F-04 — Rate limits are undocumented, but fully disclosed in response headers

| | |
|---|---|
| **Severity** | Informational |
| **Area** | API — documentation |
| **Status** | Confirmed, measured |

**Observation** — The API documentation states only that Product Hunt
"reserves the right to rate limit" applications violating fair use, and gives
no numbers. The actual budget is returned on every response:

```
x-rate-limit-limit: 6250
x-rate-limit-remaining: 6150
x-rate-limit-reset: 881
```

**Measured** — Three successive identical calls to the cheapest authenticated
query, `viewer { user { id username } }`:

| Call | `remaining` | `reset` |
|---|---|---|
| 1 | 6250 | 900 |
| 2 | 6150 | 881 |
| 3 | 6050 | 879 |

So the budget is **6250 points per 900-second window**, and this trivial query
costs **100 points** — an effective ceiling of roughly **62 such queries per
15 minutes**, and fewer for anything fetching real collections.

**Why it matters** — This is the single most important number for anyone
designing an automated client, and it is discoverable only by making a request
and reading the headers. A developer planning a polling integration or a CI
suite has no way to size it in advance from the documentation. Publishing the
figure would cost nothing and prevent a class of accidental abuse.

**Secondary observation** — The `remaining` value lags by one request. Call 1
reported the full 6250 despite consuming 100 points. A client tracking its own
budget from these headers will be consistently one request optimistic, which
matters when operating close to the limit.

---

## F-05 — Rate limiting is flat per request, not complexity-based, and failed queries are charged in full

| | |
|---|---|
| **Severity** | Informational (high design impact) |
| **Area** | API — rate limiting |
| **Status** | Confirmed, measured |

**Measured** — Three queries of very different sizes, each charged identically:

| Query | Charge |
|---|---|
| `viewer { user { id } }` | 100 points |
| 5 posts × 4 fields | 100 points |
| 20 posts × 8 fields + nested topics + pageInfo | 100 points |

Separately, requests that **failed** were also charged 100 points each — both
a GraphQL syntax error and a request for a non-existent field.

**Why it matters** — Two consequences, pulling in opposite directions:

1. *For legitimate clients*, the cost model inverts normal GraphQL advice.
   Since size is free, the right strategy is to **fetch as much as possible per
   request** and minimise request count. A client making many small queries
   exhausts its budget ~20× faster than one making few large ones, for the
   same data.
2. *For the platform*, charging a flat rate means a large, deeply nested query
   costs the same as a trivial one. Complexity-based limiting exists precisely
   to prevent expensive queries from consuming disproportionate server
   resources; a flat per-request charge does not bound that. The quota caps
   request volume, not work done per request.

That failed queries are billed is defensible — it prevents using invalid
syntax as a free probe — but combined with the flat rate it means a buggy
client can exhaust a user's entire window with 62 malformed requests.

---

## F-06 — GraphQL introspection is enabled in production

| | |
|---|---|
| **Severity** | Low |
| **Area** | API — configuration |
| **Status** | Confirmed |

**Observed** — `query { __schema { queryType { name } } }` returns
`{"__schema":{"queryType":{"name":"Query"}}}` against the production endpoint
with an ordinary developer token.

**Why it matters** — This is a deliberate trade-off rather than a clear defect,
and for a *public, documented* API it is largely reasonable: the schema is
published anyway. Noting it because it is commonly flagged in API security
reviews, and because the judgement differs by context. On a public API,
introspection aids legitimate developers. On an internal or partner API — the
Open Banking case — the same setting leaks the full attack surface, including
fields never meant to be discovered, and should be disabled in production.

Raised here as a *context-dependent* observation, not a bug to fix.

---

## F-07 — Several standard security response headers are absent

| | |
|---|---|
| **Severity** | Medium |
| **Area** | Web — HTTP security headers |
| **Status** | Confirmed |

**Observed** on `https://www.producthunt.com/`:

| Header | Status |
|---|---|
| `strict-transport-security` | Present (see F-08) |
| `x-frame-options` | `SAMEORIGIN` |
| `x-content-type-options` | `nosniff` |
| **`content-security-policy`** | **ABSENT** |
| **`referrer-policy`** | **ABSENT** |
| **`permissions-policy`** | **ABSENT** |
| **`cross-origin-opener-policy`** | **ABSENT** |

**Why it matters** — The missing CSP is the significant one. Product Hunt
hosts large volumes of user-generated content: product names, taglines,
comments and external links. CSP is the main defence-in-depth control that
limits the blast radius of an XSS flaw if output encoding fails anywhere. Its
absence does not mean the site is vulnerable, but it does mean a single
encoding mistake has no second line of defence.

`referrer-policy` absent means full URLs are sent as referrers to third-party
destinations, and Product Hunt is fundamentally a directory of outbound links.

---

## F-08 — HSTS declares `preload` but `max-age` is far below the preload requirement

| | |
|---|---|
| **Severity** | Medium |
| **Area** | Web — HTTP security headers |
| **Status** | Confirmed |

**Observed**

```
strict-transport-security: max-age=2592000; includeSubDomains; preload
```

`max-age=2592000` is **30 days**. The HSTS preload list requires a `max-age` of
at least **31536000 (one year)**, along with `includeSubDomains` and `preload`.

**Why it matters** — The header advertises an intent the policy does not meet.
A domain submitted with this value would be rejected from the preload list, and
if it is already on the list the directive gives a false impression that the
preload requirements are satisfied. More practically, a 30-day window means a
client that has not visited in a month is once again exposed to an SSL-stripping
downgrade on first contact — exactly what preload exists to prevent.

This is the kind of mismatch that passes every functional test and is only
caught by someone reading the header against the specification.

---

## F-09 — 404 pages return the correct status but keep the generic homepage title

| | |
|---|---|
| **Severity** | Low |
| **Area** | Web — error handling |
| **Status** | Confirmed |

**Steps to reproduce**
1. Request `https://www.producthunt.com/this-page-does-not-exist-qa-probe`.

**Observed** — The server correctly returns **HTTP 404** (not a soft 404, which
is the more common defect), and the page body renders a proper "We seem to have
lost this page" message. However the document `<title>` is
`Product Hunt – The best new products in tech.` — identical to the homepage.

**Why it matters** — The browser tab, bookmarks, history entries and any
shared link preview all describe a missing page as though it were the homepage.
It also removes the cheapest possible signal for automated monitoring: a crawler
or test asserting on page title cannot distinguish an error page from a healthy
one.

---

## F-10 — Invalid `Content-Type` produces a misleading error instead of 415

| | |
|---|---|
| **Severity** | Low |
| **Area** | API — request validation |
| **Status** | Confirmed |

**Steps to reproduce**
1. POST a valid GraphQL body to the API with `Content-Type: text/plain`.

**Expected** — `415 Unsupported Media Type`, naming the content type problem.

**Actual** — `400 Bad Request` with
`{"error":"query_missing","error_description":"The query object is missing in the request body."}`

**Why it matters** — The body was present and well-formed; it simply was not
parsed because of the header. The error sends the developer to inspect their
query, which is correct, while the actual fault is one header away. A related
inconsistency: a `GET` to the same endpoint returns **404 Not Found** rather
than **405 Method Not Allowed**, again describing the wrong problem.

---

## F-11 — Homepage ships over 1 MB of HTML in the initial document

| | |
|---|---|
| **Severity** | Low |
| **Area** | Web — performance |
| **Status** | Confirmed |

**Observed** — A plain `GET` of the homepage returns **1,091,244 bytes** of
HTML, before any CSS, JavaScript or images are fetched. For comparison, the 404
page is 41,616 bytes.

**Why it matters** — Over a megabyte of markup in the initial document
suggests a large server-rendered payload with embedded state. This is parse
work on the main thread before anything becomes interactive, and it is borne
worst by low-end mobile devices and slow connections. Worth measuring properly
against Core Web Vitals rather than asserting a defect from byte count alone —
recorded here as a lead to investigate, not a confirmed problem.

---

## F-12 — Bot protection is applied unevenly: deep links are challenged where in-app navigation is not

| | |
|---|---|
| **Severity** | Low (Informational for the platform; high impact on testability) |
| **Area** | Web — edge / bot protection |
| **Status** | Confirmed, reproducible |

**Observed** — Running the Playwright suite against production surfaced a
Cloudflare interstitial (`<title>Just a moment...</title>`) instead of the
application. Narrowing it down produced a consistent pattern:

| Navigation | Result |
|---|---|
| `GET /` (document request) | Application renders |
| `GET /products/<slug>` (document request) | **Cloudflare challenge** |
| `/` then clicking through to `/products/<slug>` | Application renders |
| 4 parallel workers, any route | Challenge rate increases sharply |

**Why it matters** — Two separate observations:

1. *For testability*, this makes deep-link coverage of product pages
   unreliable from automation. The suite works around it by navigating as a
   user does — loading the homepage and clicking through — which is also the
   more faithful test. Worker count was reduced to one for the same reason.
2. *For the product*, it is worth confirming this is intended. Direct document
   requests to product pages are exactly what arrives from a shared link, a
   search engine result, or a social preview crawler. If the challenge is
   shown to any of those in the way it is shown here, it sits directly on the
   acquisition path for the maker's launch.

Not raised as a defect: a challenge served to an automated headless browser is
bot protection doing its job. Raised because the *differential* between route
types is the interesting part, and because it is the single biggest constraint
on testing this product from CI.

---

## F-13 — Search results page has no `<h1>` and reuses the generic homepage title

| | |
|---|---|
| **Severity** | Low |
| **Area** | Web — search, accessibility |
| **Status** | Confirmed |

**Steps to reproduce**
1. Navigate to `https://www.producthunt.com/search?q=ai`.
2. Inspect `document.title` and the page's heading structure.

**Observed** — Results render correctly (16 product results for `ai`), but:

- `document.title` is `Product Hunt – The best new products in tech.`, identical
  to the homepage and to the 404 page (see F-09)
- the document contains **no `<h1>` at all**

**Why it matters** — A missing top-level heading breaks the primary navigation
mechanism for screen reader users, who commonly jump between headings to orient
themselves on a page. Arriving at a results page with no `<h1>` gives no
announcement of what the results are for.

The shared title compounds it: a user with several tabs open, or reviewing
browser history, cannot tell the homepage, a search for "ai", and a 404 apart.
Three distinct states, one label.

---

## Template for new findings

```
## F-NN — <one-line summary>

| | |
|---|---|
| **Severity** | |
| **Area** | |
| **Status** | |

**Steps to reproduce**
1.

**Expected** —

**Actual** —

**Why it matters** —
```
