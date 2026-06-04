# marble site

single-page marketing site for the marble fitness app.

**Brand:** "the warrior's terminal" — a black-marble + terminal/cyberpunk aesthetic (greek-god monument meets hacker), tagline **"designed for the conquerors."** Type registers: Cinzel (carved-stone headlines), IBM Plex Mono (terminal/UI/data), IBM Plex Sans (body). Dark obsidian field, marble-white text, a single phosphor-green accent for the terminal layer.

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
- `styles.css` styles and layout
- `server.js` tiny static server for local preview
- `package.json` dev script only

## seo / geo

The canonical domain is **https://marble.fit**. Search/LLM discovery files live at the repo root and are served as-is:

- `robots.txt` allows all crawlers (including AI/LLM bots) and points to the sitemap
- `sitemap.xml` lists the home and changelog URLs (update `lastmod` when content changes)
- `llms.txt` a concise, structured product summary for language models (GEO)

Each page also ships a canonical link, Open Graph + Twitter Card tags (absolute image URLs), and JSON-LD structured data (`MobileApplication`, `WebSite`/`Organization`, `FAQPage` on the home page; `WebPage` + `BreadcrumbList` on the changelog). The home page FAQ section mirrors the `FAQPage` schema, so keep the two in sync if you edit either.

If you change the domain, update the absolute URLs in `index.html`, `changelog/index.html`, `robots.txt`, `sitemap.xml`, `llms.txt`, and `vercel.json`.

## deploy

this project is static. deploy with vercel as a static site or any static host.

`vercel.json` 301-redirects `www.marble.fit` → the apex `marble.fit` so the canonical host is unambiguous. In the Vercel dashboard, add both `marble.fit` and `www.marble.fit` to the project and set `marble.fit` as primary.

## assets

- feature thumbnails and the hero video are served from cloudinary.
- device-framed product screenshots live in `images/` (exported from the app's snapshot tests, resized to 660px wide).
