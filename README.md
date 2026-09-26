# marble site

single-page marketing site for the marble fitness app.

**Brand:** quiet, monochrome, typographic — the site mirrors the app's own white/black/gray design. System fonts only; no web fonts, no external assets, no accent color. Full light **and** dark mode: it follows the system by default, and a nav toggle overrides it (persisted in `localStorage` as `marble-theme`).

## quick start

```bash
pnpm run dev
```

then open: http://127.0.0.1:5173

## scripts

- `pnpm run dev` starts a lightweight local static server
- `pnpm run validate` checks local links, assets, metadata, share images, structured data, accessibility labels, App Store links, and required product copy
- `pnpm run build:app-store` rewrites every App Store link and the home page rating from `data/app-store.json`
- `pnpm run refresh:ratings` fetches the current US App Store rating first, then rebuilds
- `pnpm run build:og` renders the share cards in `images/og/` with headless Chromium
- `pnpm run crop:screens` crops the App Store screenshots to the phone (needs Python with Pillow)
- `pnpm run indexnow` tells Bing and other IndexNow engines about every sitemap URL (run after a production deploy)

## structure

- `index.html` home page: hero with a live "type a workout" demo, Add / Log / Progress tour, screenshots, iOS integrations, privacy, what's new, FAQ
- `features/` every feature, grouped by the app's tabs
- `guides/` search-intent guides (Hevy and Strong alternatives, Hevy/Strong import, Apple Notes, private offline tracker, sprint log, Apple Watch via Apple Health); shared styles in `pages.css`
- `releases/` release notes, **generated**: one page per App Store version plus an index
- `data/releases.json` the single source of truth for versions and release notes (the public App Store version history)
- `data/app-store.json` the App Store listing: URL, listing name, App Store Connect provider token, and the last rating snapshot
- `scripts/build-app-store.js` generates every App Store link, the home page rating line and its JSON-LD `aggregateRating`
- `scripts/build-og.js` renders `images/og/<page>.png` share cards; `scripts/crop-screens.py` makes `images/app-store-<version>/screens/`
- `privacy/` privacy policy for the app and website
- `styles.css` base styles and the home page; `pages.css` content pages; `releases/releases.css` release notes
- `scripts/build-releases.js` generates `releases/` and the home page's latest-release block from `data/releases.json`
- `scripts/validate-site.js` build-time checks (Vercel runs it as the build command)
- `server.js` tiny static server for local preview

## shipping a new app version

1. Add the new version to the top of `data/releases.json` with the App Store "What's New" text and release timestamp. The public App Store page's version history is the source.
2. Run `npm run build:releases`. It writes `releases/<version>/`, updates `releases/index.html`, and rewrites the home page's `<!-- marble:latest-release -->` region plus the JSON-LD `softwareVersion`.
3. Add the new `releases/<version>/` URL to `sitemap.xml`.
4. If the App Store screenshots changed: add the 1320 × 2868 set as `images/app-store-<version>/NN-name.png`, run `python3 scripts/crop-screens.py images/app-store-<version>`, point the pages and `scripts/build-og.js` at the new folder, and run `npm run build:og`.
5. Run `npm run refresh:ratings` so the home page shows the current rating (it stays hidden below `minRatingsToShow`).
6. Run `npm run validate`. It fails if the generated pages are stale, if a version number is hard-coded elsewhere on the home page, if a page is missing from the sitemap, or if an App Store link lacks its `ct` campaign token.

Never write a version number into the home page by hand. The validator rejects it outside the generated region.

## seo / geo

The canonical domain is **https://marble-fit.app**. Search/LLM discovery files live at the repo root and are served as-is:

- `robots.txt` allows all crawlers (including AI/LLM bots) and points to the sitemap
- `sitemap.xml` lists every page. The validator fails if a page is missing or a listed URL has no page.
- `llms.txt` a concise, structured product summary for language models (GEO)

Every page ships a canonical link, Open Graph and Twitter Card tags pointing at its own 1200 × 630 card in `images/og/` (the validator checks the file exists), the Smart App Banner (`apple-itunes-app`), and JSON-LD: `MobileApplication`, `WebSite`/`Organization` and `FAQPage` on home; `WebPage` + `BreadcrumbList` on features, releases and privacy; `TechArticle` + `FAQPage` + `BreadcrumbList` on guides. Visible FAQs mirror their `FAQPage` schema, so edit both together.

App Store links carry an App Store Connect campaign token (`?ct=<page>-<location>`). Apple only attributes installs to a campaign when the link also has the provider token, so:

1. In App Store Connect, open Analytics → Acquisition → Campaigns → Generate a campaign link, and copy the number after `pt=`.
2. Put it in `data/app-store.json` as `"providerToken": "<number>"`.
3. Run `npm run build:app-store`. Every link becomes `…/id6757725234?pt=<number>&ct=<campaign>&mt=8`, including the generated release pages.

The validator fails if any link differs from what `data/app-store.json` produces, so links can't drift.

The App Store listing is named **marble.fit** and searching "marble" returns games, so pages say "on the App Store as marble.fit" next to download buttons.

### getting indexed

- **Google:** add `marble-fit.app` as a Domain property in Search Console (DNS verification) and submit `https://marble-fit.app/sitemap.xml`.
- **Bing and friends:** after a production deploy that adds pages, run `npm run indexnow`. The key file is `<key>.txt` at the repo root; it has to be live before the ping.

`/changelog/` (the old commit feed) permanently redirects to `/releases/`.

If you change the domain, update the absolute URLs in the HTML pages, `scripts/build-releases.js`, `scripts/validate-site.js`, `robots.txt`, `sitemap.xml`, `llms.txt`, and `vercel.json`.

## deploy

this project is static. deploy with vercel as a static site or any static host.

`vercel.json` 301-redirects `www.marble-fit.app` → the apex `marble-fit.app` so the canonical host is unambiguous. In the Vercel dashboard, `marble-fit.app` is the primary domain.

> Note: the site originally canonicalized to `marble.fit`, which was never registered/never resolved. All absolute URLs now point to `marble-fit.app` (the working domain). If `marble.fit` is registered later, attach it + `www.marble.fit` in Vercel, set the apex as primary, and flip the absolute URLs listed above.

## assets

- media is fully self-hosted: no CDNs or web fonts. The site uses Vercel Analytics.
- screenshots are the live App Store set for the current version, in `images/app-store-<version>/` as complete 1320 × 2868 compositions. Pages don't show those directly: their baked-in headlines are unreadable at web sizes. `screens/` holds 600 px crops of just the phone (transparent rounded corners), rendered with `.phone-shot` inside `<picture>` (WebP source, PNG fallback), with the page's own heading or `figcaption` as the caption. The full compositions stay for JSON-LD `screenshot` and as the crop source.
- `images/og/` holds the share cards. Edit the card list in `scripts/build-og.js`, then run `npm run build:og`. `Opengraph.png` is the old card, kept so existing shares don't break.
