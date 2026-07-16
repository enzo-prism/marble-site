# marble site

single-page marketing site for the marble fitness app.

**Brand:** quiet, monochrome, typographic — the site mirrors the app's own white/black/gray design. System fonts only (SF-style sans for UI, New York/Georgia serif for the rotating hero quotes and pull statements); no web fonts, no external assets, no accent color. Full light **and** dark mode: it follows the system by default, and a nav toggle overrides it (persisted in `localStorage` as `marble-theme`).

## quick start

```bash
pnpm run dev
```

then open: http://127.0.0.1:5173

## scripts

- `pnpm run dev` starts a lightweight local static server

## structure

- `index.html` single-page markup
- `changelog/` changelog page + bundled commit data
- `privacy/` privacy policy for the app and website
- `styles.css` styles and layout
- `server.js` tiny static server for local preview
- `package.json` dev script only

## seo / geo

The canonical domain is **https://marble-fit.app** (the live, registered domain). Search/LLM discovery files live at the repo root and are served as-is:

- `robots.txt` allows all crawlers (including AI/LLM bots) and points to the sitemap
- `sitemap.xml` lists the home, changelog, and privacy URLs (update `lastmod` when content changes)
- `llms.txt` a concise, structured product summary for language models (GEO)

Each page also ships a canonical link, Open Graph + Twitter Card tags (absolute image URLs), and JSON-LD structured data (`MobileApplication`, `WebSite`/`Organization`, `FAQPage` on the home page; `WebPage` + `BreadcrumbList` on the changelog). The home page FAQ section mirrors the `FAQPage` schema, so keep the two in sync if you edit either.

If you change the domain, update the absolute URLs in `index.html`, `changelog/index.html`, `robots.txt`, `sitemap.xml`, `llms.txt`, and `vercel.json`.

## deploy

this project is static. deploy with vercel as a static site or any static host.

`vercel.json` 301-redirects `www.marble-fit.app` → the apex `marble-fit.app` so the canonical host is unambiguous. In the Vercel dashboard, `marble-fit.app` is the primary domain.

> Note: the site originally canonicalized to `marble.fit`, which was never registered/never resolved. All absolute URLs now point to `marble-fit.app` (the working domain). If `marble.fit` is registered later, attach it + `www.marble.fit` in Vercel, set the apex as primary, and flip the absolute URLs in `index.html`, `changelog/index.html`, `robots.txt`, `sitemap.xml`, `llms.txt`, and `vercel.json`.

## assets

- fully self-hosted: no cloudinary, no google fonts, no external requests (besides vercel analytics).
- current App Store marketing screenshots live in the versioned `images/app-store-2.1/` directory as complete 1320 × 2868 compositions, with responsive 660 × 1434 derivatives in `images/app-store-2.1/660w/`. Render them directly with `.store-shot`; do not place them inside the legacy `.device` frame or theme-swap them.
- legacy raw light/dark captures remain in `images/` for historical reference. They use `<screen>-light.png` / `<screen>-dark.png` pairs and can still be theme-swapped through `data-light` / `data-dark` when used.
