#!/usr/bin/env node

"use strict";

// App Store links and ratings, from data/app-store.json:
//
//   every App Store link   the listing URL with its campaign token, plus the
//                          App Store Connect provider token once it is set:
//                          …/id6757725234?pt=<providerToken>&ct=<campaign>&mt=8
//   /index.html            the marble:rating region under the hero button and
//                          the JSON-LD aggregateRating. Both stay empty until
//                          the US storefront has minRatingsToShow ratings.
//
// Usage:
//   node scripts/build-app-store.js                    rewrite links and ratings
//   node scripts/build-app-store.js --refresh-ratings  fetch current US ratings first
//   node scripts/build-app-store.js --check            write nothing; exit 1 if stale
//
// Output is deterministic: the same app-store.json always produces the same files.

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataFile = path.join(root, "data", "app-store.json");
const homeFile = path.join(root, "index.html");
const ignoredDirectories = new Set([".git", "node_modules"]);

const RATING_START = "<!-- marble:rating:start -->";
const RATING_END = "<!-- marble:rating:end -->";
const ratingRegionPattern = /<!-- marble:rating:start -->[\s\S]*?<!-- marble:rating:end -->/;
const aggregateRatingLinePattern = /^[ \t]*"aggregateRating": \{.*\},\n/m;
const campaignPattern = /^[a-z0-9-]{1,40}$/;

function loadAppStore() {
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const listing = new URL(data.url);
  if (listing.search || listing.hash) throw new Error("data/app-store.json url must not carry a query or fragment");
  if (!listing.pathname.endsWith(`/id${data.appId}`)) throw new Error("data/app-store.json url must end with the app id");
  if (data.providerToken && !/^\d{1,20}$/.test(String(data.providerToken))) {
    throw new Error("providerToken must be the numeric token from App Store Connect, or empty");
  }
  return data;
}

// The raw URL. Use appStoreHref() inside HTML attributes.
function appStoreUrl(campaign, data = loadAppStore()) {
  if (!campaignPattern.test(campaign)) throw new Error(`invalid campaign token "${campaign}"`);
  const params = [];
  if (data.providerToken) params.push(`pt=${data.providerToken}`);
  params.push(`ct=${campaign}`);
  if (data.providerToken) params.push("mt=8");
  return `${data.url}?${params.join("&")}`;
}

function appStoreHref(campaign, data) {
  return appStoreUrl(campaign, data).replace(/&/g, "&amp;");
}

function ratingToShow(data) {
  const ratings = data.ratings || {};
  const count = Number(ratings.userRatingCount) || 0;
  const average = Number(ratings.averageUserRating) || 0;
  if (count < (Number(data.minRatingsToShow) || 1) || average <= 0) return null;
  return { average: (Math.round(average * 10) / 10).toFixed(1), count };
}

function ratingRegion(rating) {
  if (!rating) return `${RATING_START}${RATING_END}`;
  const ratings = `${rating.count.toLocaleString("en-US")} rating${rating.count === 1 ? "" : "s"}`;
  return `${RATING_START}
              <p class="hero-rating"><span class="hero-rating-star" aria-hidden="true">&#9733;</span> Rated ${rating.average} out of 5 on the App Store <span aria-hidden="true">&middot;</span> ${ratings}</p>
              ${RATING_END}`;
}

function aggregateRatingLine(rating, indent) {
  return `${indent}"aggregateRating": { "@type": "AggregateRating", "ratingValue": "${rating.average}", "ratingCount": "${rating.count}", "bestRating": "5", "worstRating": "1" },\n`;
}

function updateHome(source, data) {
  if (!ratingRegionPattern.test(source)) throw new Error("index.html is missing the marble:rating markers");
  const rating = ratingToShow(data);
  let next = source.replace(ratingRegionPattern, ratingRegion(rating));

  next = next.replace(aggregateRatingLinePattern, "");
  if (rating) {
    const offers = next.match(/^([ \t]*)"offers": \{/m);
    if (!offers) throw new Error("index.html JSON-LD has no offers block to place aggregateRating before");
    next = `${next.slice(0, offers.index)}${aggregateRatingLine(rating, offers[1])}${next.slice(offers.index)}`;
  }
  return next;
}

function rewriteLinks(source, data) {
  const listing = new URL(data.url);
  return source.replace(/href="(https:\/\/apps\.apple\.com\/[^"]*)"/g, (match, rawHref) => {
    const url = new URL(rawHref.replace(/&amp;/g, "&"));
    if (url.pathname !== listing.pathname) return match;
    const campaign = url.searchParams.get("ct");
    if (!campaign) throw new Error(`App Store link without a campaign token: ${rawHref}`);
    return `href="${appStoreHref(campaign, data)}"`;
  });
}

function htmlFiles(directory = root) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...htmlFiles(absolute));
    else if (entry.name.endsWith(".html")) files.push(absolute);
  }
  return files.sort();
}

function buildOutputs(data = loadAppStore()) {
  const outputs = new Map();
  for (const file of htmlFiles()) {
    const source = fs.readFileSync(file, "utf8");
    let next = rewriteLinks(source, data);
    if (file === homeFile) next = updateHome(next, data);
    outputs.set(file, next);
  }
  return outputs;
}

async function refreshRatings(data) {
  const storefront = data.ratings?.storefront || "us";
  const response = await fetch(`https://itunes.apple.com/lookup?id=${data.appId}&country=${storefront}`);
  if (!response.ok) throw new Error(`iTunes lookup failed with HTTP ${response.status}`);
  const result = (await response.json()).results?.[0];
  if (!result) throw new Error(`iTunes lookup found no app ${data.appId} in the ${storefront} storefront`);

  data.ratings = {
    storefront,
    checkedAt: new Date().toISOString().slice(0, 10),
    averageUserRating: Number(result.averageUserRating) || 0,
    userRatingCount: Number(result.userRatingCount) || 0,
  };
  fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    `Ratings (${storefront}): ${data.ratings.userRatingCount} at ${data.ratings.averageUserRating}; ` +
      `shown on the site from ${data.minRatingsToShow}.`,
  );
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const data = loadAppStore();
  if (!checkOnly && process.argv.includes("--refresh-ratings")) await refreshRatings(data);

  const outputs = buildOutputs(data);
  const changed = [...outputs].filter(([file, content]) => fs.readFileSync(file, "utf8") !== content).map(([file]) => file);

  if (checkOnly) {
    if (!changed.length) {
      const state = data.providerToken ? "with install attribution" : "without a provider token";
      console.log(`✓ App Store links and ratings are up to date (${state}).`);
      return;
    }
    console.error("App Store links or ratings are out of date with data/app-store.json:");
    for (const file of changed) console.error(`  ✖ ${rel(file)}`);
    console.error("Run `npm run build:app-store` and commit the result.");
    process.exitCode = 1;
    return;
  }

  for (const file of changed) fs.writeFileSync(file, outputs.get(file));
  console.log(`✓ App Store links and ratings: ${changed.length} file${changed.length === 1 ? "" : "s"} written.`);
  for (const file of changed) console.log(`  ${rel(file)}`);
  if (!data.providerToken) {
    console.warn("warning: providerToken is empty, so installs are not attributed to campaigns. See README.");
  }
}

module.exports = { appStoreUrl, appStoreHref, loadAppStore, updateHome, rewriteLinks, ratingToShow, buildOutputs };

if (require.main === module) {
  main().catch((error) => {
    console.error(`build-app-store: ${error.message}`);
    process.exitCode = 1;
  });
}
