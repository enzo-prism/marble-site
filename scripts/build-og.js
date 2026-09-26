#!/usr/bin/env node

"use strict";

// Renders the 1200 x 630 share cards in images/og/ (Open Graph and Twitter)
// with headless Chromium. Each card carries the name, the page's headline and
// the product: the home card shows the Paste or Type review demo, every other
// card a phone screen from images/app-store-<version>/screens/.
//
// Usage:
//   node scripts/build-og.js            render every card
//   node scripts/build-og.js home faq   render only the named cards
//
// Chromium: set CHROME_PATH, or it looks for Playwright's headless shell
// (fast), then Google Chrome. Cards are committed; this only runs when copy changes.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "images", "og");
const screens = "images/app-store-2.5/screens";
const WIDTH = 1200;
const HEIGHT = 630;

// Keep titles short enough for two lines at 64px in 620px.
const cards = [
  { id: "home", kicker: "Free workout journal for iPhone", title: "Type your workout. marble logs it.", demo: true },
  { id: "features", kicker: "Features", title: "Everything marble does.", screen: "04-journal" },
  { id: "guides", kicker: "Guides", title: "Import, log and track your training.", screen: "02-workout-history" },
  { id: "guide-hevy-strong", kicker: "Guide", title: "Import Hevy and Strong workouts.", screen: "01-paste-or-type-review" },
  { id: "guide-notes", kicker: "Guide", title: "Log workouts from Apple Notes.", screen: "03-repeat-review" },
  { id: "guide-private", kicker: "Guide", title: "A private, offline workout tracker.", screen: "10-private-backup" },
  { id: "guide-sprint", kicker: "Guide", title: "Keep a sprint training log.", screen: "09-sprint-prescription" },
  { id: "guide-watch", kicker: "Guide", title: "Log strength training with Apple Watch.", screen: "07-active-workout" },
  { id: "guide-hevy-alternative", kicker: "Switching from Hevy", title: "A Hevy alternative with no account.", screen: "05-strength-trends" },
  { id: "guide-strong-alternative", kicker: "Switching from Strong", title: "A Strong alternative with nothing to unlock.", screen: "06-fast-set-logger" },
  { id: "releases", kicker: "Release notes", title: "What’s new in marble.", screen: "08-training-calendar" },
  { id: "privacy", kicker: "App Store privacy label", title: "Data Not Collected.", screen: "10-private-backup" },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileUrl(relative) {
  return pathToFileURL(path.join(root, relative)).href;
}

// The same markup as the home page demo, in its final state.
const demo = `<figure class="type-demo">
  <div class="type-demo-stage">
    <div class="type-demo-panel type-demo-input">
      <div class="type-demo-bar"><span>Paste or Type</span><span class="type-demo-hint">Your words</span></div>
      <div class="type-demo-lines">
        <span class="type-demo-line">Leg day</span>
        <span class="type-demo-line">Squat 5x5 @ 225, rest 2 min</span>
        <span class="type-demo-line">RDL 3x8 @ 185</span>
        <span class="type-demo-line">Calf raises 3x12 @ 90</span>
      </div>
    </div>
    <div class="type-demo-panel type-demo-review">
      <div class="type-demo-bar"><span>Review Workout</span><span class="type-demo-hint">On device</span></div>
      <div class="type-demo-body">
        <p class="type-demo-head"><strong>Leg Day</strong> &middot; 3 exercises &middot; 11 sets</p>
        <ul class="type-demo-rows">
          <li class="type-demo-row"><strong>Squat</strong><span>5 × 5 · 225 lb · rest 2m</span></li>
          <li class="type-demo-row"><strong>Romanian Deadlift</strong><span>3 × 8 · 185 lb</span><small>matched from “RDL”</small></li>
          <li class="type-demo-row"><strong>Calf Raises</strong><span>3 × 12 · 90 lb</span></li>
        </ul>
        <span class="type-demo-button">Add 1 workout (11 sets)</span>
      </div>
    </div>
  </div>
</figure>`;

function cardHtml(card) {
  const visual = card.demo
    ? `<div class="og-demo">${demo}</div>`
    : `<div class="og-phone"><img src="${fileUrl(`${screens}/${card.screen}.png`)}" alt="" /></div>`;

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="${fileUrl("styles.css")}" />
<style>
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; min-height: 0; overflow: hidden; transition: none; }
  body { position: relative; background: var(--bg); }
  .og-copy { position: absolute; inset: 64px auto 60px 72px; width: 600px; display: flex; flex-direction: column; }
  .og-brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 600; letter-spacing: -0.02em; }
  .og-brand img { width: 44px; height: 44px; border-radius: 11px; }
  .og-kicker { margin-top: auto; font-size: 17px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--faint); }
  .og-title { margin-top: 16px; font-size: 64px; font-weight: 600; letter-spacing: -0.045em; line-height: 1.02; text-wrap: balance; }
  .og-facts { margin-top: 30px; font-size: 22px; color: var(--muted); letter-spacing: -0.005em; }
  .og-facts strong { color: var(--ink); font-weight: 600; }
  .og-phone { position: absolute; top: 64px; right: 88px; width: 330px; filter: drop-shadow(0 24px 60px rgba(0, 0, 0, 0.6)); }
  .og-phone img { display: block; width: 100%; border-radius: 26px; }
  .og-demo { position: absolute; top: 50%; right: 64px; width: 420px; transform: translateY(-50%) scale(1.12); transform-origin: right center; }
  .og-demo .type-demo { max-width: none; }
</style>
</head>
<body>
  <div class="og-copy">
    <div class="og-brand"><img src="${fileUrl("Favicon large.png")}" alt="" />marble</div>
    <p class="og-kicker">${escapeHtml(card.kicker)}</p>
    <p class="og-title">${escapeHtml(card.title)}</p>
    <p class="og-facts">Free &middot; No account &middot; Works offline<br /><strong>marble.fit</strong> on the App Store</p>
  </div>
  ${visual}
</body>
</html>
`;
}

function findChrome() {
  const candidates = [process.env.CHROME_PATH];
  const playwright = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (fs.existsSync(playwright)) {
    for (const dir of fs.readdirSync(playwright).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()) {
      for (const arch of ["chrome-headless-shell-mac-arm64", "chrome-headless-shell-mac-x64", "chrome-headless-shell-linux64"]) {
        candidates.push(path.join(playwright, dir, arch, "chrome-headless-shell"));
      }
    }
  }
  candidates.push(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  );
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) throw new Error("no Chromium found; set CHROME_PATH");
  return found;
}

function render(chrome, card, workDir) {
  const htmlFile = path.join(workDir, `${card.id}.html`);
  const pngFile = path.join(outDir, `${card.id}.png`);
  fs.writeFileSync(htmlFile, cardHtml(card));

  const result = spawnSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      "--force-device-scale-factor=1",
      "--force-color-profile=srgb",
      `--window-size=${WIDTH},${HEIGHT}`,
      "--virtual-time-budget=3000",
      `--user-data-dir=${path.join(workDir, "profile")}`,
      `--screenshot=${pngFile}`,
      pathToFileURL(htmlFile).href,
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  if (result.status !== 0 || !fs.existsSync(pngFile)) {
    throw new Error(`Chromium failed on ${card.id}: ${(result.stderr || result.error?.message || "").trim()}`);
  }
  return pngFile;
}

function main() {
  const only = new Set(process.argv.slice(2));
  const selected = only.size ? cards.filter((card) => only.has(card.id)) : cards;
  const unknown = [...only].filter((id) => !cards.some((card) => card.id === id));
  if (unknown.length) throw new Error(`unknown card ${unknown.join(", ")}`);

  const chrome = findChrome();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "marble-og-"));
  fs.mkdirSync(outDir, { recursive: true });
  try {
    for (const card of selected) {
      if (card.screen && !fs.existsSync(path.join(root, screens, `${card.screen}.png`))) {
        throw new Error(`missing ${screens}/${card.screen}.png; run python3 scripts/crop-screens.py`);
      }
      console.log(`  ${path.relative(root, render(chrome, card, workDir))}`);
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  console.log(`✓ Rendered ${selected.length} share card${selected.length === 1 ? "" : "s"}.`);
}

module.exports = { cards };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`build-og: ${error.message}`);
    process.exitCode = 1;
  }
}
