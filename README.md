# FSI Daily

Financial Services Intelligence — banking, payments, fintech, insurance, regulation and AI + finance.

## Phase 1

RSS-first publication MVP designed for Netlify.

Positioning: What matters in financial services.

## Sources

The first version is intentionally limited to a small set of verified/official feeds. Source URLs are kept in `netlify/functions/feed.js` so they can be expanded later.

## Source Verification

As of August 14, 2026, FSI Daily preserves the existing Finextra feeds and uses verified official RBI XML feeds:

- `https://rbi.org.in/pressreleases_rss.xml`
- `https://rbi.org.in/notifications_rss.xml`

NPCI was investigated but not added because no official public RSS, Atom, or equivalent machine-readable feed endpoint could be verified from primary sources, and the official site returned `403 Forbidden` to direct endpoint checks from this environment.

IRDAI was investigated but not added because the official site exposed HTML pages and a sitemap reference, but no verified public RSS or Atom feed endpoint could be confirmed from the official markup or source pages.

## Deploy

1. Upload these files to the `manasmahodaya/fsi-daily` GitHub repository.
2. In Netlify choose **Add new project → Import an existing project**.
3. Select the GitHub repository.
4. Publish directory: `.`
5. Build command: leave blank.
6. Deploy.

No WordPress dependency is included in this project.
