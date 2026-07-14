# Google Search Console runbook (eazyexchange.com)

Search Console is the single biggest lever for two of the search complaints:
ranking for the brand word "eazyexchange" and getting the favicon/logo to show.
Code (title, structured data, raster favicon, Open Graph) removes the blockers
and hands Google correct signals; Search Console is how you tell Google to
re-crawl now and how the brand/logo signals surface fastest. These steps are
manual (they need DNS + Google account access) — they are not automated.

## One-time setup

1. Go to https://search.google.com/search-console and add a **Domain** property
   for `eazyexchange.com` (domain property, not URL-prefix — it covers www and
   all paths).
2. Google shows a **TXT record** to add for verification. Add it in
   **Cloudflare → DNS** (this project's DNS is at Cloudflare, grey-cloud):
   type `TXT`, name `@`, value = the string Google gives. Save, then click
   **Verify** in Search Console (DNS can take a few minutes to propagate).
3. Under **Sitemaps**, submit: `https://eazyexchange.com/sitemap.xml`.

## After each production deploy that changes SEO metadata

1. Open **URL Inspection**, enter `https://eazyexchange.com/`, and click
   **Request Indexing**. Repeat for `https://eazyexchange.com/signup`.
2. This forces a re-crawl so the new `<title>`, JSON-LD, and PNG favicon are
   picked up sooner than the natural crawl cadence.

## Expectations (be patient)

- **Brand ranking** for the bare word "eazyexchange" climbs over days/weeks as
  Google builds trust in a new domain (live since ~2026-07-05). No code or
  Search Console action forces a #1 result immediately; requesting indexing and
  accruing any inbound links is the accelerant.
- **The favicon/logo** in search results typically lags several crawls behind
  indexing even once the raster favicon and Organization JSON-LD are live.
  Confirm the favicon is fetchable at `https://eazyexchange.com/icon` and valid
  in the Rich Results Test; then wait for re-crawl.

## Verification tools

- **Rich Results Test:** https://search.google.com/test/rich-results — paste the
  homepage URL; confirm the `Organization` block parses with a `logo`.
- **Share preview:** paste `https://eazyexchange.com` into any link debugger
  (e.g. a Slack/LinkedIn message draft) and confirm the Open Graph card renders
  the navy image with the wordmark.
