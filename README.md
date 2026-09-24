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
- `pnpm run validate` checks local links, assets, metadata, structured data, accessibility labels, and required product copy

## structure

- `index.html` home page: hero with a live "type a workout" demo, Add / Log / Progress tour, screenshots, iOS integrations, privacy, what's new, FAQ
- `features/` every feature, grouped by the app's tabs
- `guides/` search-intent guides (Hevy/Strong import, Apple Notes, private offline tracker, sprint log, Apple Watch via Apple Health); shared styles in `pages.css`
- `releases/` release notes, **generated**: one page per App Store version plus an index
- `data/releases.json` the single source of truth for versions and release notes (the public App Store version history)
- `privacy/` privacy policy for the app and website
- `styles.css` base styles and the home page; `pages.css` content pages; `releases/releases.css` release notes
- `scripts/build-releases.js` generates `releases/` and the home page's latest-release block from `data/releases.json`
- `scripts/validate-site.js` build-time checks (Vercel runs it as the build command)
- `server.js` tiny static server for local preview

## shipping a new app version

1. Add the new version to the top of `data/releases.json` with the App Store "What's New" text and release timestamp. The public App Store page's version history is the source.
2. Run `npm run build:releases`. It writes `releases/<version>/`, updates `releases/index.html`, and rewrites the home page's `<!-- marble:latest-release -->` region plus the JSON-LD `softwareVersion`.
3. Add the new `releases/<version>/` URL to `sitemap.xml`, and replace the screenshots under `images/` if the App Store set changed.
4. Run `npm run validate`. It fails if the generated pages are stale, if a version number is hard-coded elsewhere on the home page, if a page is missing from the sitemap, or if an App Store link lacks its `ct` campaign token.

Never write a version number into the home page by hand. The validator rejects it outside the generated region.

## seo / geo

The canonical domain is **https://marble-fit.app**. Search/LLM discovery files live at the repo root and are served as-is:

- `robots.txt` allows all crawlers (including AI/LLM bots) and points to the sitemap
- `sitemap.xml` lists every page. The validator fails if a page is missing or a listed URL has no page.
- `llms.txt` a concise, structured product summary for language models (GEO)

Every page ships a canonical link, Open Graph and Twitter Card tags (absolute image URLs), the Smart App Banner (`apple-itunes-app`), and JSON-LD: `MobileApplication`, `WebSite`/`Organization` and `FAQPage` on home; `WebPage` + `BreadcrumbList` on features, releases and privacy; `TechArticle` + `FAQPage` + `BreadcrumbList` on guides. Visible FAQs mirror their `FAQPage` schema, so edit both together.

App Store links carry an App Store Connect campaign token (`?ct=<page>-<location>`). Add the provider token (`pt=`) from App Store Connect → Analytics → Acquisition → Campaigns to turn on install attribution.

`/changelog/` (the old commit feed) permanently redirects to `/releases/`.

If you change the domain, update the absolute URLs in the HTML pages, `scripts/build-releases.js`, `scripts/validate-site.js`, `robots.txt`, `sitemap.xml`, `llms.txt`, and `vercel.json`.

## deploy

this project is static. deploy with vercel as a static site or any static host.

`vercel.json` 301-redirects `www.marble-fit.app` → the apex `marble-fit.app` so the canonical host is unambiguous. In the Vercel dashboard, `marble-fit.app` is the primary domain.

> Note: the site originally canonicalized to `marble.fit`, which was never registered/never resolved. All absolute URLs now point to `marble-fit.app` (the working domain). If `marble.fit` is registered later, attach it + `www.marble.fit` in Vercel, set the apex as primary, and flip the absolute URLs listed above.

## assets

- media is fully self-hosted: no CDNs or web fonts. The site uses Vercel Analytics.
- screenshots are the live App Store set for the current version, in `images/app-store-<version>/` as complete 1320 × 2868 compositions with WebP copies, plus 660 × 1434 derivatives in `660w/`. Render them with `.store-shot` inside `<picture>` (WebP source, PNG fallback). Don't frame them or swap them by theme.
