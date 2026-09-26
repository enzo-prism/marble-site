#!/usr/bin/env node

"use strict";

// Builds the human release notes from data/releases.json (the public App Store
// version history):
//
//   /releases/index.html            timeline of every version, newest first
//   /releases/<slug>/index.html     one page per version (2.5 -> /releases/2-5/)
//   /index.html                     the region between the marble:latest-release
//                                   markers, plus the JSON-LD softwareVersion line
//
// Usage:
//   node scripts/build-releases.js           write everything
//   node scripts/build-releases.js --check   write nothing; exit 1 if any output
//                                            differs from what is on disk
//
// Output is deterministic: the same releases.json always produces byte-identical
// files. /releases/releases.css is hand-written and never touched here.

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataFile = path.join(root, "data", "releases.json");
const releasesDir = path.join(root, "releases");
const homeFile = path.join(root, "index.html");

const ORIGIN = "https://marble-fit.app";
const { appStoreHref, loadAppStore } = require("./build-app-store");

const APP_ID = loadAppStore().appId;
const OG_IMAGE = `${ORIGIN}/images/og/releases.png`; // rendered by scripts/build-og.js
const OG_IMAGE_ALT = "What’s new in marble, a free, private workout journal for iPhone.";
const MARKER_START = "<!-- marble:latest-release:start -->";
const MARKER_END = "<!-- marble:latest-release:end -->";
const FIRST_RELEASE_TEXT = "First release on the App Store.";
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Copied verbatim from the <head> of /index.html.
const THEME_BOOTSTRAP = `    <script>
      (() => {
        try {
          const stored = localStorage.getItem("marble-theme");
          const theme =
            stored === "light" || stored === "dark"
              ? stored
              : window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
          document.documentElement.dataset.theme = theme;
        } catch {}
      })();
    </script>`;

// Copied verbatim from /index.html; scripts/validate-site.js executes it.
const ANALYTICS_BOOTSTRAP = `    <script>
      window.va =
        window.va ||
        function () {
          (window.vaq = window.vaq || []).push(arguments);
        };

      window.va("beforeSend", function (event) {
        if (!event || typeof event !== "object" || typeof event.url !== "string") return event;

        try {
          const url = new URL(event.url);
          url.hash = "";
          return { ...event, url: url.toString() };
        } catch {
          return event;
        }
      });

      if (!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
        const analyticsScript = document.createElement("script");
        analyticsScript.defer = true;
        analyticsScript.src = "/_vercel/insights/script.js";
        document.head.appendChild(analyticsScript);
      }
    </script>`;

const APPLE_MARK = `<svg class="apple-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.702" />
              </svg>`;

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function slugFor(version) {
  return version.replace(/\./g, "-");
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid releasedAt: ${iso}`);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function isHeading(line) {
  return /^[A-Z][A-Z0-9 &/'-]{1,39}$/.test(line) && (line.match(/[A-Z]/g) || []).length >= 2;
}

function titleCase(line) {
  return line.charAt(0) + line.slice(1).toLowerCase();
}

const BULLET = /^(?:[-•*–])\s+/;

// Turns Apple's plain-text notes into blocks:
//   { type: "h2", text } | { type: "ul", items: [] } | { type: "p", text }
function parseNotes(notes) {
  const blocks = [];
  let list = null;

  for (const rawLine of String(notes || "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      list = null;
      continue;
    }
    if (BULLET.test(line)) {
      if (!list) {
        list = { type: "ul", items: [] };
        blocks.push(list);
      }
      list.items.push(line.replace(BULLET, ""));
      continue;
    }
    list = null;
    if (isHeading(line)) {
      blocks.push({ type: "h2", text: titleCase(line) });
    } else {
      blocks.push({ type: "p", text: line });
    }
  }

  if (!blocks.length) blocks.push({ type: "p", text: FIRST_RELEASE_TEXT });
  return blocks;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function firstSentence(text) {
  text = text.replace(/^New in \d+(?:\.\d+)*:\s*/i, "");
  const match = text.match(/^.+?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

// The one-line summary: the first sentence of the first paragraph. A lead-in
// such as "New in 1.6:" is skipped in favour of the first bullet.
function summaryFor(blocks) {
  for (const block of blocks) {
    if (block.type === "p" && !block.text.endsWith(":")) return capitalize(firstSentence(block.text));
    if (block.type === "ul") return capitalize(firstSentence(block.items[0]));
  }
  return FIRST_RELEASE_TEXT;
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

function sectionCounts(blocks) {
  const counts = [];
  let current = null;
  for (const block of blocks) {
    if (block.type === "h2") {
      current = { label: block.text.toLowerCase(), count: 0 };
      counts.push(current);
    } else if (block.type === "ul" && current) {
      current.count += block.items.length;
    }
  }
  return counts.filter((entry) => entry.count > 0);
}

function highlightsFor(blocks, limit) {
  let inNew = false;
  const fromNew = [];
  for (const block of blocks) {
    if (block.type === "h2") inNew = block.text.toLowerCase() === "new";
    else if (block.type === "ul" && inNew) fromNew.push(...block.items);
  }
  if (fromNew.length) return fromNew.slice(0, limit);
  const firstList = blocks.find((block) => block.type === "ul");
  return firstList ? firstList.items.slice(0, limit) : [];
}

function normalize(release) {
  if (!release || typeof release.version !== "string" || !/^\d+(\.\d+)*$/.test(release.version)) {
    throw new Error(`invalid release version: ${JSON.stringify(release && release.version)}`);
  }
  const blocks = parseNotes(release.notes);
  const summary = summaryFor(blocks);
  const date = formatDate(release.releasedAt);
  const slug = slugFor(release.version);
  return {
    version: release.version,
    releasedAt: release.releasedAt,
    isoDay: release.releasedAt.slice(0, 10),
    date,
    slug,
    path: `/releases/${slug}/`,
    blocks,
    summary,
    counts: sectionCounts(blocks),
  };
}

function loadReleases() {
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const releases = (data.releases || []).map(normalize);
  const seen = new Set();
  for (const release of releases) {
    if (seen.has(release.slug)) throw new Error(`duplicate version ${release.version}`);
    seen.add(release.slug);
  }
  if (!releases.length) throw new Error("data/releases.json has no releases");
  return releases.sort((a, b) => compareVersions(b.version, a.version));
}

// ---------------------------------------------------------------------------
// shared chrome
// ---------------------------------------------------------------------------

// Escaped for an href; the provider token comes from data/app-store.json.
function appStoreUrl(ct) {
  return appStoreHref(ct);
}

function head({ title, description, pagePath, ogType, jsonLd, extraMeta = "" }) {
  const url = `${ORIGIN}${pagePath}`;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="application-name" content="marble" />
    <meta name="author" content="Lorenzo Quaid Sison" />
    <meta name="apple-itunes-app" content="app-id=${APP_ID}" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon%20small.png" />
    <link rel="icon" type="image/png" sizes="256x256" href="/Favicon%20large.png" />
    <link rel="apple-touch-icon" sizes="256x256" href="/Favicon%20large.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="marble" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}" />
${extraMeta}    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
    <meta name="twitter:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#faf9f7" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0908" />
${THEME_BOOTSTRAP}
    <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2).replace(/</g, "\\u003c").replace(/^/gm, "      ")}
    </script>
${ANALYTICS_BOOTSTRAP}
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/releases/releases.css" />
    <script src="/scripts/analytics.js" defer></script>
    <script src="/scripts/site.js" defer></script>
  </head>`;
}

// page: analytics location prefix; ct: App Store campaign page token;
// current: "page" on the index, "true" on a single release (same section).
function header({ page, ct, current }) {
  return `    <a class="skip-link" href="#top">skip to content</a>
    <header class="nav">
      <div class="container nav-inner">
        <a class="brand" href="/" aria-label="marble home">
          <img src="/Favicon%20large.png" alt="" width="26" height="26" />
          <span>marble</span>
        </a>
        <nav class="nav-links" aria-label="site">
          <a href="/features/" data-analytics-event="Nav Click" data-analytics-location="${page}_nav" data-analytics-target="features">Features</a>
          <a href="/guides/" data-analytics-event="Nav Click" data-analytics-location="${page}_nav" data-analytics-target="guides">Guides</a>
          <a href="/releases/" aria-current="${current}" data-analytics-event="Nav Click" data-analytics-location="${page}_nav" data-analytics-target="releases">What’s new</a>
          <a href="/#faq" data-analytics-event="Nav Click" data-analytics-location="${page}_nav" data-analytics-target="faq">FAQ</a>
        </nav>
        <div class="nav-actions">
          <button
            class="theme-toggle"
            type="button"
            aria-label="toggle light and dark mode"
            data-analytics-event="Theme Toggle"
            data-analytics-location="${page}_header"
            data-analytics-target="theme"
          >
            <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.8A8.7 8.7 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
            <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4.4" />
              <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" />
            </svg>
          </button>
          <a
            class="btn btn-small"
            href="${appStoreUrl(`${ct}-header`)}"
            data-analytics-event="App Store Click"
            data-analytics-location="${page}_header"
            data-analytics-target="app_store"
          >
            Download
          </a>
        </div>
      </div>
    </header>`;
}

function footer({ page, ct }) {
  return `    <footer class="footer">
      <div class="container footer-inner">
        <span>marble</span>
        <div class="footer-links">
          <a href="/features/" data-analytics-event="Nav Click" data-analytics-location="${page}_footer" data-analytics-target="features">Features</a>
          <a href="/guides/" data-analytics-event="Nav Click" data-analytics-location="${page}_footer" data-analytics-target="guides">Guides</a>
          <a href="/releases/" data-analytics-event="Nav Click" data-analytics-location="${page}_footer" data-analytics-target="releases">Release notes</a>
          <a href="/privacy/" data-analytics-event="Nav Click" data-analytics-location="${page}_footer" data-analytics-target="privacy">Privacy</a>
          <a href="https://github.com/enzo-prism/marble/issues" data-analytics-event="Support Click" data-analytics-location="${page}_footer" data-analytics-target="github_issues">Support</a>
          <a href="${appStoreUrl(`${ct}-footer`)}" data-analytics-event="App Store Click" data-analytics-location="${page}_footer" data-analytics-target="app_store">App Store</a>
        </div>
      </div>
    </footer>`;
}

function breadcrumb(pagePath, items) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${ORIGIN}${pagePath}#breadcrumb`,
    itemListElement: items.map(([name, itemPath], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: `${ORIGIN}${itemPath}`,
    })),
  };
}

function webPage({ pagePath, name, description, extra = {} }) {
  return {
    "@type": "WebPage",
    "@id": `${ORIGIN}${pagePath}#webpage`,
    url: `${ORIGIN}${pagePath}`,
    name,
    description,
    inLanguage: "en",
    isPartOf: { "@id": `${ORIGIN}/#website` },
    about: { "@id": `${ORIGIN}/#app` },
    publisher: { "@id": `${ORIGIN}/#organization` },
    breadcrumb: { "@id": `${ORIGIN}${pagePath}#breadcrumb` },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// pages
// ---------------------------------------------------------------------------

function countsLine(release) {
  if (!release.counts.length) return "";
  const text = release.counts.map(({ label, count }) => `${count} ${label}`).join(" &middot; ");
  return `\n              <p class="release-counts">${text}</p>`;
}

function renderIndex(releases) {
  const pagePath = "/releases/";
  const title = "marble release notes";
  const description = `What changed in each version of marble, the minimal workout journal for iPhone, from ${releases[releases.length - 1].version} to ${releases[0].version}. Newest first.`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      webPage({
        pagePath,
        name: title,
        description,
        extra: {
          mainEntity: {
            "@type": "ItemList",
            itemListOrder: "https://schema.org/ItemListOrderDescending",
            numberOfItems: releases.length,
            itemListElement: releases.map((release, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: `marble ${release.version}`,
              url: `${ORIGIN}${release.path}`,
            })),
          },
        },
      }),
      breadcrumb(pagePath, [["Home", "/"], ["Release notes", pagePath]]),
    ],
  };

  const entries = releases
    .map((release, index) => {
      const badge = index === 0 ? `\n                <span class="release-badge">Latest</span>` : "";
      return `          <li class="release-entry">
            <article>
              <div class="release-entry-head">
                <h2><a href="${release.path}">marble ${escapeHtml(release.version)}</a></h2>${badge}
                <time datetime="${release.releasedAt}">${release.date}</time>
              </div>
              <p>${escapeHtml(release.summary)}</p>${countsLine(release)}
            </article>
          </li>`;
    })
    .join("\n");

  return `${head({ title, description, pagePath, ogType: "website", jsonLd })}
  <body data-page="releases">
${header({ page: "releases", ct: "releases", current: "page" })}

    <main id="top" tabindex="-1">
      <section class="hero releases-hero">
        <div class="container">
          <p class="release-label">Release notes</p>
          <h1>What’s new in marble</h1>
          <p class="hero-lede">Every version on the App Store, newest first, in the words that shipped with it.</p>
        </div>
      </section>

      <section class="section releases-list" aria-label="All releases">
        <div class="container">
          <ol class="release-timeline">
${entries}
          </ol>
        </div>
      </section>
    </main>

${footer({ page: "releases", ct: "releases" })}
  </body>
</html>
`;
}

function renderBlocks(blocks) {
  const usedIds = new Map();
  const idFor = (text) => {
    const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
    const n = (usedIds.get(base) || 0) + 1;
    usedIds.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  return blocks
    .map((block, index) => {
      if (block.type === "h2") return `            <h2 id="${idFor(block.text)}">${escapeHtml(block.text)}</h2>`;
      if (block.type === "ul") {
        const items = block.items.map((item) => `              <li>${escapeHtml(item)}</li>`).join("\n");
        return `            <ul>\n${items}\n            </ul>`;
      }
      const lede = index === 0 ? ` class="release-lede"` : "";
      return `            <p${lede}>${escapeHtml(block.text)}</p>`;
    })
    .join("\n");
}

function pagerLink(release, direction) {
  if (!release) return `            <span class="release-pager-empty" aria-hidden="true"></span>`;
  const label = direction === "older" ? "Older" : "Newer";
  return `            <a class="release-pager-${direction}" href="${release.path}" data-analytics-event="Nav Click" data-analytics-location="release_pager" data-analytics-target="${direction}_release">
              <small>${label}</small>
              <span>marble ${escapeHtml(release.version)}</span>
            </a>`;
}

function metaDescription(release) {
  const text = release.summary.length >= 70
    ? release.summary
    : `marble ${release.version}, released ${release.date}: ${release.summary}`;
  return truncate(text, 155);
}

function renderRelease(release, newer, older, isLatest) {
  const pagePath = release.path;
  const ct = `release-${release.slug}`;
  const title = `marble ${release.version} release notes | marble`;
  const description = metaDescription(release);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      webPage({
        pagePath,
        name: `marble ${release.version} release notes`,
        description,
        extra: { datePublished: release.releasedAt },
      }),
      breadcrumb(pagePath, [["Home", "/"], ["Release notes", "/releases/"], [release.version, pagePath]]),
    ],
  };
  const extraMeta = `    <meta property="article:published_time" content="${release.releasedAt}" />\n`;
  const kicker = isLatest ? "Latest release" : "Release notes";

  return `${head({ title, description, pagePath, ogType: "article", jsonLd, extraMeta })}
  <body data-page="release">
${header({ page: "release", ct, current: "true" })}

    <main id="top" tabindex="-1">
      <article>
        <header class="hero releases-hero">
          <div class="container">
            <nav class="release-crumbs" aria-label="Breadcrumb">
              <a href="/releases/">Release notes</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">${escapeHtml(release.version)}</span>
            </nav>
            <p class="release-label">${kicker}</p>
            <h1>marble ${escapeHtml(release.version)}</h1>
            <p class="release-date"><time datetime="${release.releasedAt}">${release.date}</time> &middot; App Store</p>
          </div>
        </header>

        <div class="section release-body">
          <div class="container release-notes">
${renderBlocks(release.blocks)}
          </div>

          <div class="container">
            <div class="release-cta">
              <a
                class="btn"
                href="${appStoreUrl(ct)}"
                data-analytics-event="App Store Click"
                data-analytics-location="release_cta"
                data-analytics-target="app_store"
              >
                ${APPLE_MARK}
                Download on the App Store
              </a>
              <span class="fine">Free &middot; iPhone and iPad &middot; No account</span>
            </div>

            <nav class="release-pager" aria-label="More releases">
${pagerLink(older, "older")}
${pagerLink(newer, "newer")}
            </nav>
            <p class="release-all"><a class="text-link" href="/releases/">All release notes</a></p>
          </div>
        </div>
      </article>
    </main>

${footer({ page: "release", ct })}
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------
// home injection
// ---------------------------------------------------------------------------

function hasHomeMarkers(html) {
  const start = html.indexOf(MARKER_START);
  const end = html.indexOf(MARKER_END);
  return start !== -1 && end !== -1 && start < end;
}

// Replaces the region between the latest-release markers (which sit inside the
// home page's own .latest-release wrapper) with a compact summary of `latest` (a releases.json entry or an already-normalized one) and
// rewrites the home JSON-LD `"softwareVersion": "X",` line. Returns html
// unchanged when the markers are missing.
function updateHome(html, latest) {
  if (!hasHomeMarkers(html)) return html;
  const release = latest && latest.blocks ? latest : normalize(latest);

  const start = html.indexOf(MARKER_START);
  const end = html.indexOf(MARKER_END);
  const lineStart = html.lastIndexOf("\n", start) + 1;
  const indent = /^[ \t]*/.exec(html.slice(lineStart, start))[0];

  const version = escapeHtml(release.version);
  const bullets = highlightsFor(release.blocks, 4);
  const list = bullets.length
    ? [
        `<ul class="latest-release-points">`,
        ...bullets.map((item) => `  <li>${escapeHtml(item)}</li>`),
        `</ul>`,
      ]
    : [];
  const lines = [
    `<p class="release-label">marble ${version} &middot; <time datetime="${release.releasedAt}">${release.date}</time></p>`,
    `<p class="latest-release-summary">${escapeHtml(release.summary)}</p>`,
    ...list,
    `<a class="text-link" href="${release.path}" data-analytics-event="Nav Click" data-analytics-location="home_latest_release" data-analytics-target="release_notes">Read the ${version} release notes <span aria-hidden="true">&rarr;</span></a>`,
  ];
  const block = lines.map((line) => `${indent}${line}`).join("\n");

  const updated = `${html.slice(0, start + MARKER_START.length)}\n${block}\n${indent}${html.slice(end)}`;
  return updated.replace(
    /("softwareVersion"\s*:\s*")[^"]*(",)/,
    (_, before, after) => `${before}${release.version}${after}`,
  );
}

// ---------------------------------------------------------------------------
// build / check
// ---------------------------------------------------------------------------

function buildOutputs() {
  const releases = loadReleases();
  const outputs = new Map();

  outputs.set(path.join(releasesDir, "index.html"), renderIndex(releases));
  releases.forEach((release, index) => {
    outputs.set(
      path.join(releasesDir, release.slug, "index.html"),
      renderRelease(release, releases[index - 1], releases[index + 1], index === 0),
    );
  });

  const warnings = [];
  if (fs.existsSync(homeFile)) {
    const home = fs.readFileSync(homeFile, "utf8");
    if (hasHomeMarkers(home)) {
      outputs.set(homeFile, updateHome(home, releases[0]));
      if (!/"softwareVersion"\s*:\s*"[^"]*",/.test(home)) {
        warnings.push('index.html has no `"softwareVersion": "X",` line to update');
      }
    } else {
      warnings.push(`index.html has no ${MARKER_START} … ${MARKER_END} region; skipped the home update`);
    }
  }

  const expectedDirs = new Set(releases.map((release) => release.slug));
  const staleDirs = fs.existsSync(releasesDir)
    ? fs
        .readdirSync(releasesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !expectedDirs.has(entry.name))
        .map((entry) => path.join(releasesDir, entry.name))
        .sort()
    : [];

  return { outputs, staleDirs, warnings, releases };
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const { outputs, staleDirs, warnings, releases } = buildOutputs();
  for (const warning of warnings) console.warn(`warning: ${warning}`);

  const changed = [...outputs]
    .filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content)
    .map(([file]) => file);

  if (checkOnly) {
    if (!changed.length && !staleDirs.length) {
      console.log(`✓ Release notes are up to date (${releases.length} versions, latest ${releases[0].version}).`);
      return;
    }
    console.error("Release notes are out of date with data/releases.json:");
    for (const file of changed) console.error(`  ✖ ${rel(file)}`);
    for (const dir of staleDirs) console.error(`  ✖ ${rel(dir)}/ (no matching version)`);
    console.error("Run `npm run build:releases` and commit the result.");
    process.exitCode = 1;
    return;
  }

  for (const dir of staleDirs) fs.rmSync(dir, { recursive: true });
  for (const file of changed) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, outputs.get(file));
  }
  console.log(
    `✓ Built ${releases.length} release pages (latest ${releases[0].version}); ` +
      `${changed.length} file${changed.length === 1 ? "" : "s"} written, ${staleDirs.length} stale removed.`,
  );
  for (const file of changed) console.log(`  ${rel(file)}`);
  for (const dir of staleDirs) console.log(`  removed ${rel(dir)}/`);
}

module.exports = {
  updateHome,
  hasHomeMarkers,
  parseNotes,
  compareVersions,
  formatDate,
  loadReleases,
  buildOutputs,
  normalize,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`build-releases: ${error.message}`);
    process.exitCode = 1;
  }
}
