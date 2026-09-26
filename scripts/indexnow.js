#!/usr/bin/env node

"use strict";

// Tells IndexNow search engines (Bing, and the engines that share its index)
// that the site's pages changed, so new guides are crawled in hours instead of
// weeks. Run it after a production deploy, not before: the engines fetch the
// key file from the live site to verify ownership.
//
// Usage:
//   node scripts/indexnow.js              submit every URL in sitemap.xml
//   node scripts/indexnow.js --dry-run    print what would be submitted
//
// The key is the <32 hex chars>.txt file at the repo root, served at
// https://marble-fit.app/<key>.txt. Google does not use IndexNow; submit the
// sitemap in Search Console for Google.

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const host = "marble-fit.app";

function findKey() {
  const keys = fs.readdirSync(root).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name));
  if (keys.length !== 1) throw new Error(`expected one IndexNow key file at the repo root, found ${keys.length}`);
  const key = keys[0].slice(0, -4);
  if (fs.readFileSync(path.join(root, keys[0]), "utf8").trim() !== key) {
    throw new Error(`${keys[0]} must contain exactly its own key`);
  }
  return key;
}

async function main() {
  const key = findKey();
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  const body = { host, key, keyLocation: `https://${host}/${key}.txt`, urlList };

  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  const live = await fetch(body.keyLocation);
  if (!live.ok || (await live.text()).trim() !== key) {
    throw new Error(`${body.keyLocation} is not live yet; deploy first`);
  }

  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow answered HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  console.log(`✓ Submitted ${urlList.length} URLs to IndexNow (HTTP ${response.status}).`);
}

main().catch((error) => {
  console.error(`indexnow: ${error.message}`);
  process.exitCode = 1;
});
