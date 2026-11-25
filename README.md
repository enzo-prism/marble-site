# marble site

marketing site for the marble fitness app: a home page, a features page, search-intent guides, free calculators, an about page and generated release notes.

**Brand:** quiet, monochrome, in motion — the site mirrors the app's own white/black/gray design. System fonts only; no web fonts, no external assets, and no accent colour beyond the faint warm vein of the marble. Full light **and** dark mode: it follows the system by default, and a nav toggle overrides it (persisted in `localStorage` as `marble-theme`).

## design system

- **Show, don't list.** Sections lead with a heading of a few words, one short line, and something visual: a phone screen, an icon, or a live widget. Longer detail lives on `/features/` and in the guides.
- **Space.** Sections are separated by `--section-space`; content sits in `.container` (1120px). Don't add dividers where space already separates.
- **Icons.** `icons.svg` is a sprite of 24 × 24 line icons drawn for this site. Use `<svg class="icon" aria-hidden="true"><use href="/icons.svg#i-name"/></svg>`; `.icon` sets the stroke, so symbols stay stroke-only unless a part is deliberately solid. Put an icon in `.icon-tile` for a soft rounded square, or in `.chip` for a pill. The validator fails on an id that isn't in the sprite.
- **Components** (all in `styles.css`): floating glass nav with a phone menu sheet (`.nav-menu`), `.badge`, `.chip` / `.chips`, `.icon-tile`, the pinned Add / Log / Progress `.story` (a phone bezel around real 2.7 screens), the `.bento` of live iOS widgets, `.switch-list` link rows, `.marquee` of example notation, and the FAQ plus-to-cross toggle.
- **Motion.**
  - `data-reveal` fades an element in as it scrolls into view, using CSS scroll-driven animations. Browsers without them show it immediately, so nothing is ever hidden.
  - `data-animate` marks a one-shot widget (the weekly-goal ring). `scripts/site.js` adds `.is-in` when it's on screen; without JS it rests in its finished state.
  - **Motion tokens** (top of the motion section in `styles.css`): `--dur-1/2/3`, `--stagger`, `--rise`, `--blur-in`, and the springs `--ease-spring-snappy` / `--ease-spring-soft` (CSS `linear()` curves) plus `--ease-out-expo`. New motion should use these rather than its own timings.
  - **Material:** layered shadows (`--shadow-*`), a warm `--vein` accent (P3 under `@media (color-gamut: p3)`, gold in dark mode), and a faint fixed grain on `body::before`. Numbers use tabular figures.
  - Loops (the ticker, Siri waveform, Quick log press, Spotlight typing, floating chips) are pure CSS, and anything marked `.is-offscreen` by `scripts/site.js` pauses. The rest timer (`data-countdown`), the goal widget and the Live Activity's +30s press run in `scripts/site.js`, only while on screen and the tab is visible. The ticker follows scroll speed (and reverses on scroll up), then eases back.
  - **Hero demo:** a note types itself, the recognised parts light up, and each one flies (Web Animations) into the review row it became. The examples are real notes with the review the 2.7 app shows for them, stored as JSON in `#demo-examples` on the home page; the **Try** chips jump to one and loop it. The review keeps the tallest example's height (`--review-h`, measured in JS) so nothing below moves.
  - **Product story** (`#tour`, `data-story`): `site.js` adds `.is-pinned`, then one phone stays pinned through four chapters while you scroll: the note's parts are marked, fly into the review rows, the Add button rings, the set logger, then Progress draws in. JS only sets `--sp`, `--read`, `--fly`, `--ring`, `--draw`, `data-step` and `data-screen`; CSS does the rest. Overlay positions are percentages of the screen, measured with OCR from the captures. Without JS it is a plain list beside the first screen; the tabs scroll to each chapter.
  - **Carved wordmark:** the footer `marble` is drawn by the marble shader in text mode (`data-marble-text`), masked by the word in the page's own font.
  - **Living marble** (`scripts/marble.js`): a small WebGL shader draws slowly drifting stone veins in any `<canvas class="marble-canvas" data-marble>`, used behind the home hero, the final call to action and every content-page title. Vein colour and strength come from `--marble-ink` / `--marble-strength` (set per theme, and overridable per canvas in CSS); `data-marble-seed` varies the pattern and `data-marble-host` on an ancestor is where a mouse moves the soft light. It renders below device resolution near 30 fps, only while on screen and the tab is visible, and fades in once ready, so without WebGL the CSS backdrop simply shows.
  - **Hero choreography:** the headline words (`.hero-title .hw`, each with `--w`) blur up in sequence, then the lede, button, chips and the demo. While the demo reads, a scan line sweeps the note and recognised parts (`.tok`) light up; the review button shines once.
  - **Pointer polish** (fine pointers only, from `scripts/site.js`): the demo tilts toward the cursor with a glare; `.bento-tile`, `.switch-list a`, `.feature-item` and `.guide-list a` get a spotlight and lit edge (`.spot-glow`); `.btn-large` leans toward the cursor and sweeps a sheen on hover.
  - **Scroll-driven** (CSS only, where supported): the hero backdrop recedes, bento tiles land in a stagger, gallery phones deal in from the right edge, the nav pill carries a reading-progress hairline, and the footer wordmark settles as it arrives.
  - The privacy orbit (`.privacy-orbit`) and the floating app icon in the final call to action are pure CSS loops. Pages cross-fade with cross-document view transitions; the nav stays put, and a guide card's title morphs into that guide's page title (`view-transition-name: guide-<slug>` on both).
  - `prefers-reduced-motion: reduce` stops all of it: no autoplay, a still ticker, no typing demo, a story that steps without flights, a single still marble frame, no tilt, spotlight, magnet or view transition.

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
- `pnpm run build` regenerates everything derived from data: release pages, App Store links, then `llms-full.txt` (run it after any data or page change)
- `pnpm run build:llms` regenerates `llms-full.txt` from `llms.txt` and the pages' `<main>` content
- `pnpm run build:og` renders the share cards in `images/og/` with headless Chromium
- `pnpm run crop:screens` crops the App Store screenshots to the phone (needs Python with Pillow)
- `pnpm run indexnow` tells Bing and other IndexNow engines about every sitemap URL (run after a production deploy)

## structure

- `index.html` home page: hero with a live "type a workout" demo, a ticker of notation marble reads, the pinned Add / Log / Progress product story, live iOS widgets, screenshots, switching guides, privacy, what's new, FAQ
- `icons.svg` the icon sprite; `scripts/site.js` theme, nav menu, hero demo, product story, rest timer and one-shot animations
- `features/` every feature, grouped by the app's tabs
- `guides/` search-intent guides (Hevy and Strong alternatives, Hevy/Strong import, Apple Notes, workout notation, private offline tracker, sprint log, Apple Watch via Apple Health); shared styles in `pages.css`
- `tools/` free calculators: one-rep max (Epley, the same formula as the app) and DOTS (OpenPowerlifting's published coefficients). `scripts/tools.js` recalculates as you type; the HTML already shows a worked example, so the answer is there without JS
- `about/` the developer, key facts, principles and contact; its "Latest version" and "First release" rows are a generated region (`<!-- marble:about-release -->`) written by `build-releases.js`
- `404.html` not-found page (`noindex`, no canonical, links to the main pages); Vercel serves it for unknown paths
- `releases/` release notes, **generated**: one page per App Store version plus an index
- `data/releases.json` the single source of truth for versions and release notes (the public App Store version history)
- `data/app-store.json` the App Store listing: URL, listing name, App Store Connect provider token, and the last rating snapshot
- `scripts/build-app-store.js` generates every App Store link, the home page rating line and its JSON-LD `aggregateRating`
- `scripts/build-og.js` renders `images/og/<page>.png` share cards; `scripts/crop-screens.py` makes `images/app-store-<version>/screens/` from App Store compositions; `scripts/prepare-screens.py` makes them from raw simulator captures (the 2.7 set)
- `privacy/` privacy policy for the app and website
- `styles.css` base styles and the home page; `pages.css` content pages; `releases/releases.css` release notes
- `scripts/build-releases.js` generates `releases/` and the home page's latest-release block from `data/releases.json`
- `scripts/build-llms-full.js` converts each page's `<main>` to Markdown and appends it to `llms.txt` as `llms-full.txt`; `--check` (used by the validator) fails when it is stale
- `scripts/validate-site.js` build-time checks (Vercel runs it as the build command)
- `server.js` tiny static server for local preview

## shipping a new app version

1. Add the new version to the top of `data/releases.json` with the App Store "What's New" text and release timestamp. The public App Store page's version history is the source.
2. Run `npm run build`. Its `build:releases` step writes `releases/<version>/`, updates `releases/index.html`, and rewrites the home page's `<!-- marble:latest-release -->` region, the JSON-LD `softwareVersion`, the about page's release rows and the `llms.txt` release status; the last step then regenerates `llms-full.txt` to match.
3. Add the new `releases/<version>/` URL to `sitemap.xml`.
4. If the App Store screenshots changed: add the 1320 × 2868 set as `images/app-store-<version>/NN-name.png`, run `python3 scripts/crop-screens.py images/app-store-<version>`, point the pages and `scripts/build-og.js` at the new folder, and run `npm run build:og`.
5. Run `npm run refresh:ratings` so the home page shows the current rating (it stays hidden below `minRatingsToShow`).
6. Run `npm run validate`. It fails if the generated pages are stale, if a version number is hard-coded elsewhere on the home page, if a page is missing from the sitemap, or if an App Store link lacks its `ct` campaign token.

Keep submitted updates separate from public releases. `data/releases.json` may
contain a `pendingUpdate` object with `version`, `submittedAt` and `summary`,
verified against App Store Connect. The generator adds a dated submission notice
to home, the release index and `llms.txt`; it never adds that version to the
released timeline or `softwareVersion`. Once the public release list reaches that
version, the pending notice disappears automatically. Run `build:releases` after
either public release data or the pending submission changes.

The November 13, 2026 refresh verified released 2.7 (build 86) against App Store
Connect and uses its release/phased-rollout start timestamp. Build 87 remains
TestFlight and is not represented as a public release. Earlier release timestamps
come from the public App Store version history, not ASC creation or upload dates.
The retained sample screenshots still depict supported interfaces; their asset
folder name records their capture provenance rather than the current app version.

Never write a version number into the home page by hand. The validator rejects it outside the generated region.

## seo / aeo

The canonical domain is **https://marble-fit.app**. URLs end in a slash (`vercel.json` sets `cleanUrls` and `trailingSlash`, so `/features` and `/features/index.html` redirect to `/features/`). Search and answer-engine files live at the repo root and are served as-is:

- `robots.txt` allows every crawler, names the AI search and answer bots explicitly, and points to the sitemap
- `sitemap.xml` lists every indexable page. The validator fails if a page is missing, a listed URL has no page, or a `noindex` page is listed.
- `llms.txt` a hand-written summary for language models: exact naming (marble, listed as marble.fit, website marble-fit.app; the marble.fit domain is not ours), key facts, the formulas the app uses, comparisons, page list and FAQ. Its release status is a generated region.
- `llms-full.txt` **generated** by `npm run build:llms`: `llms.txt` followed by every page's main content as Markdown, so an answer engine can read the whole site in one request
- `*.vercel.app` deployment hosts send `X-Robots-Tag: noindex, nofollow`, so preview URLs never compete with the canonical site

Every indexable page ships a canonical link, a title of at most 70 characters, a description of 50–165, Open Graph and Twitter Card tags pointing at its own 1200 × 630 card in `images/og/` (the validator checks the file exists), the Smart App Banner (`apple-itunes-app`), and one JSON-LD `@graph`. The validator checks all of that, and that every `@id` a page references is defined on the same page.

Structured data:

- **Entity:** `Organization` (`/#organization`, logo `images/icon-512.png`) and `Person` (`/about/#lorenzo`, the developer) are repeated on the pages that reference them; guides and tools cite the person as `author`.
- **Home:** `MobileApplication` (App Store ID, price, iOS 26 requirement, release notes, screenshots), `WebSite`, `VideoObject` (the product film) and `FAQPage`.
- **Guides:** `TechArticle` + `FAQPage` + `BreadcrumbList`, with a visible byline and updated date (`.guide-meta`) that match `dateModified`. The notation guide adds a `DefinedTermSet` glossary.
- **Tools:** `WebApplication` + `FAQPage` + `BreadcrumbList`; `/tools/` is a `CollectionPage`.
- **About:** `AboutPage`; features, releases and privacy: `WebPage` + `BreadcrumbList`.

Visible FAQs mirror their `FAQPage` schema, so edit both together.

Writing for answer engines: open each page with a self-contained answer paragraph (`.guide-answer`) that names marble and states the fact plainly, keep numbers checkable (worked examples, formulas, sources), and use the same names everywhere.

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

`vercel.json` permanently redirects `www.marble-fit.app` → the apex `marble-fit.app` so the canonical host is unambiguous. In the Vercel dashboard, `marble-fit.app` is the primary domain.

> Note: the site originally canonicalized to `marble.fit`, which was never registered/never resolved. All absolute URLs now point to `marble-fit.app` (the working domain). If `marble.fit` is registered later, attach it + `www.marble.fit` in Vercel, set the apex as primary, and flip the absolute URLs listed above.

## assets

- media is fully self-hosted: no CDNs or web fonts. The site uses Vercel Analytics.
- **2.7 screens** (`images/app-store-2.7/`): `raw/` holds full-screen simulator captures (1320 × 2868, light mode, 9:41 status bar) from the app's own XCUITest screenshot suite at the released 2.7 source, with sample data. `python3 scripts/prepare-screens.py images/app-store-2.7` (Pillow) writes `screens/` at 720 px with rounded corners, PNG and WebP. Every page and share card uses these. To refresh them, rerun the app's `AppStoreScreenshotUITests` with `xcrun simctl status_bar <device> override --time 9:41` applied after the simulator boots, export the attachments with `xcrun xcresulttool export attachments`, copy them into `raw/` under the same names, and rerun the script. `s01-typed-note` and `s02-typed-review` came from two extra tests that aren't in the app repo: they type the home demo's Leg day note into Add and open its review. If the note or review screens change, re-measure the story overlay positions (`.story-mark`, `.story-fly`, `.story-land`, `.story-ring` and `.story-wipe` in `index.html` are percentages of the screen).
- **Product film** (`videos/marble-film.mp4` and its poster): silent, 1920 × 1080, made with HyperFrames; the source project lives outside this repo at `~/Documents/Codex/Projects/marble-film`. The hero's "Watch the film" link opens it in a dialog and only then loads it; without JS the link is the MP4 itself.
- The 2.5 App Store compositions, which JSON-LD `screenshot` still uses, are the live App Store set for that version, in `images/app-store-<version>/` as complete 1320 × 2868 compositions. Pages don't show those directly: their baked-in headlines are unreadable at web sizes. `screens/` holds 600 px crops of just the phone (transparent rounded corners), rendered with `.phone-shot` inside `<picture>` (WebP source, PNG fallback), with the page's own heading or `figcaption` as the caption. The full compositions stay for JSON-LD `screenshot` and as the crop source.
- Icons come from the app's 1024 px icon: `favicon.ico` (48 px), `apple-touch-icon.png` (180 px), and `images/icon-192.png` / `images/icon-512.png` for the manifest and the JSON-LD logo. The older `favicon small.png` stays as the 32 px PNG icon.
- `images/og/` holds the share cards. Edit the card list in `scripts/build-og.js`, then run `npm run build:og`. `Opengraph.png` is the old card, kept so existing shares don't break.
