#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const canonicalOrigin = "https://marble-fit.app";
const ignoredDirectories = new Set([".git", "node_modules"]);

const homeContract = {
  sectionIds: ["marble-2-3", "features", "screens", "faq", "download"],
  labels: [
    "Marble 2.2",
    "Paste your workout",
    "on-device",
    "Sprints, measured to the tenth",
  ],
};

const errors = [];
let checkCount = 0;

function walk(directory, extensions) {
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(absolutePath, extensions));
    } else if (extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

function relativeName(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function lineNumber(source, index) {
  return source.slice(0, Math.max(0, index)).split("\n").length;
}

function fail(file, source, index, message) {
  const location = typeof index === "number" ? `:${lineNumber(source, index)}` : "";
  errors.push(`${relativeName(file)}${location} — ${message}`);
}

function check(condition, file, source, index, message) {
  checkCount += 1;
  if (!condition) fail(file, source, index, message);
}

function parseAttributes(tag) {
  const attributes = new Map();
  const body = tag
    .replace(/^<\s*[^\s/>]+/, "")
    .replace(/\/?>\s*$/, "");
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of body.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attributes;
}

function tags(source, name) {
  return [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))];
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)));
}

function visibleText(source) {
  return decodeHtml(
    source
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function pagePath(file) {
  const relative = relativeName(file);
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
}

function expectedCanonical(file) {
  return `${canonicalOrigin}${pagePath(file)}`;
}

function findLocalFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const normalized = path.posix.normalize(`/${decoded}`).replace(/^\/+/, "");
  if (normalized.startsWith("../")) return null;

  const direct = path.join(root, normalized);
  const candidates = [];

  if (decoded.endsWith("/")) {
    candidates.push(path.join(direct, "index.html"));
  } else if (path.extname(decoded)) {
    candidates.push(direct);
  } else {
    candidates.push(direct, `${direct}.html`, path.join(direct, "index.html"));
  }

  return candidates.find((candidate) => {
    const relative = path.relative(root, candidate);
    return !relative.startsWith("..") && !path.isAbsolute(relative) && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  }) || null;
}

function idsForFile(file, cache) {
  if (cache.has(file)) return cache.get(file);

  const source = fs.readFileSync(file, "utf8");
  const ids = new Set();
  for (const match of source.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
    ids.add(decodeHtml(match[1] ?? match[2] ?? match[3] ?? ""));
  }
  cache.set(file, ids);
  return ids;
}

function validateReference({ file, source, rawValue, index, baseUrl, idCache, label }) {
  const value = decodeHtml(rawValue.trim());
  if (
    !value ||
    value.startsWith("data:") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:") ||
    value.startsWith("javascript:")
  ) {
    return;
  }

  let url;
  try {
    url = new URL(value, baseUrl);
  } catch {
    check(false, file, source, index, `${label} is not a valid URL: ${JSON.stringify(value)}`);
    return;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.origin !== canonicalOrigin) return;

  const target = findLocalFile(url.pathname);
  check(Boolean(target), file, source, index, `${label} points to missing local file: ${url.pathname}`);
  if (!target || !url.hash) return;

  let fragment;
  try {
    fragment = decodeURIComponent(url.hash.slice(1));
  } catch {
    check(false, file, source, index, `${label} has an invalid encoded fragment: ${url.hash}`);
    return;
  }

  check(
    idsForFile(target, idCache).has(fragment),
    file,
    source,
    index,
    `${label} points to missing fragment #${fragment} in ${relativeName(target)}`,
  );
}

function validateHtml(file, idCache) {
  const source = fs.readFileSync(file, "utf8");
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, "");
  const canonical = expectedCanonical(file);

  const htmlTags = tags(withoutComments, "html");
  const htmlAttributes = htmlTags.length ? parseAttributes(htmlTags[0][0]) : new Map();
  check(htmlTags.length === 1, file, source, 0, "must contain exactly one <html> element");
  check(Boolean(htmlAttributes.get("lang")?.trim()), file, source, htmlTags[0]?.index ?? 0, "<html> must have a non-empty lang attribute");

  const titles = [...withoutComments.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  check(titles.length === 1, file, source, titles[0]?.index ?? 0, "must contain exactly one <title>");
  if (titles.length === 1) {
    check(Boolean(visibleText(titles[0][1])), file, source, titles[0].index, "<title> must not be empty");
  }

  const metaTags = tags(withoutComments, "meta").map((match) => ({
    match,
    attributes: parseAttributes(match[0]),
  }));
  const metaByName = (name) =>
    metaTags.filter(({ attributes }) => attributes.get("name")?.toLowerCase() === name.toLowerCase());
  const metaByProperty = (property) =>
    metaTags.filter(({ attributes }) => attributes.get("property")?.toLowerCase() === property.toLowerCase());

  check(
    metaTags.some(({ attributes }) => attributes.has("charset")),
    file,
    source,
    0,
    "must declare a character encoding",
  );

  for (const requiredName of ["viewport", "description"]) {
    const matches = metaByName(requiredName);
    check(matches.length === 1, file, source, matches[0]?.match.index ?? 0, `must contain exactly one meta[name="${requiredName}"]`);
    if (matches.length === 1) {
      check(
        Boolean(matches[0].attributes.get("content")?.trim()),
        file,
        source,
        matches[0].match.index,
        `meta[name="${requiredName}"] must have non-empty content`,
      );
    }
  }

  const canonicalTags = tags(withoutComments, "link")
    .map((match) => ({ match, attributes: parseAttributes(match[0]) }))
    .filter(({ attributes }) =>
      (attributes.get("rel") || "").toLowerCase().split(/\s+/).includes("canonical"),
    );
  check(canonicalTags.length === 1, file, source, canonicalTags[0]?.match.index ?? 0, "must contain exactly one canonical link");
  if (canonicalTags.length === 1) {
    check(
      canonicalTags[0].attributes.get("href") === canonical,
      file,
      source,
      canonicalTags[0].match.index,
      `canonical URL must be ${canonical}`,
    );
  }

  const openGraphTags = metaTags.filter(({ attributes }) =>
    attributes.get("property")?.toLowerCase().startsWith("og:"),
  );
  if (openGraphTags.length) {
    for (const property of ["og:title", "og:description", "og:type", "og:url", "og:image", "og:image:alt"]) {
      const matches = metaByProperty(property);
      check(matches.length === 1, file, source, matches[0]?.match.index ?? 0, `must contain exactly one meta[property="${property}"]`);
      if (matches.length === 1) {
        check(Boolean(matches[0].attributes.get("content")?.trim()), file, source, matches[0].match.index, `meta[property="${property}"] must have non-empty content`);
      }
    }

    const ogUrl = metaByProperty("og:url");
    if (ogUrl.length === 1) {
      check(ogUrl[0].attributes.get("content") === canonical, file, source, ogUrl[0].match.index, `og:url must match canonical URL ${canonical}`);
    }

    for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"]) {
      const matches = metaByName(name);
      check(matches.length === 1, file, source, matches[0]?.match.index ?? 0, `must contain exactly one meta[name="${name}"]`);
      if (matches.length === 1) {
        check(Boolean(matches[0].attributes.get("content")?.trim()), file, source, matches[0].match.index, `meta[name="${name}"] must have non-empty content`);
      }
    }
  }

  const idOccurrences = new Map();
  for (const match of withoutComments.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
    const id = decodeHtml(match[1] ?? match[2] ?? match[3] ?? "");
    check(Boolean(id), file, source, match.index, "id attributes must not be empty");
    if (!idOccurrences.has(id)) idOccurrences.set(id, []);
    idOccurrences.get(id).push(match.index);
  }
  for (const [id, occurrences] of idOccurrences) {
    if (occurrences.length > 1) {
      fail(file, source, occurrences[1], `duplicate id "${id}" appears ${occurrences.length} times`);
    }
    checkCount += 1;
  }
  idCache.set(file, new Set(idOccurrences.keys()));

  for (const image of tags(withoutComments, "img")) {
    const attributes = parseAttributes(image[0]);
    check(attributes.has("alt"), file, source, image.index, `<img> is missing an alt attribute`);
  }

  const jsonLdScripts = [
    ...withoutComments.matchAll(
      /<script\b([^>]*)type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)([^>]*)>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const script of jsonLdScripts) {
    checkCount += 1;
    try {
      JSON.parse(script[3]);
    } catch (error) {
      fail(file, source, script.index, `JSON-LD does not parse: ${error.message}`);
    }
  }
  if (["index.html", "changelog/index.html"].includes(relativeName(file))) {
    check(jsonLdScripts.length > 0, file, source, 0, "must contain JSON-LD structured data");
  }

  const baseUrl = canonical;
  const referenceAttributes = {
    a: ["href"],
    area: ["href"],
    link: ["href"],
    script: ["src"],
    img: ["src"],
    source: ["src"],
    video: ["src", "poster"],
    audio: ["src"],
    track: ["src"],
    iframe: ["src"],
    object: ["data"],
  };

  for (const [tagName, attributeNames] of Object.entries(referenceAttributes)) {
    for (const match of tags(withoutComments, tagName)) {
      const attributes = parseAttributes(match[0]);
      for (const attributeName of attributeNames) {
        if (!attributes.has(attributeName)) continue;
        validateReference({
          file,
          source,
          rawValue: attributes.get(attributeName),
          index: match.index,
          baseUrl,
          idCache,
          label: `<${tagName}> ${attributeName}`,
        });
      }

      if (attributes.has("srcset")) {
        for (const candidate of attributes.get("srcset").split(",")) {
          const url = candidate.trim().split(/\s+/)[0];
          validateReference({
            file,
            source,
            rawValue: url,
            index: match.index,
            baseUrl,
            idCache,
            label: `<${tagName}> srcset`,
          });
        }
      }
    }
  }

  if (relativeName(file) === "index.html") {
    const pageIds = idCache.get(file);
    const text = visibleText(withoutComments);

    for (const id of homeContract.sectionIds) {
      check(pageIds.has(id), file, source, 0, `home contract requires section id="${id}"`);
    }
    for (const label of homeContract.labels) {
      check(text.includes(label), file, source, 0, `home contract requires visible text "${label}"`);
    }
  }
}

function validateCss(file, idCache) {
  const source = fs.readFileSync(file, "utf8");
  const baseUrl = `${canonicalOrigin}/${relativeName(file)}`;

  for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi)) {
    validateReference({
      file,
      source,
      rawValue: match[1] ?? match[2] ?? match[3] ?? "",
      index: match.index,
      baseUrl,
      idCache,
      label: "CSS url()",
    });
  }
}

function main() {
  const htmlFiles = walk(root, new Set([".html"]));
  const cssFiles = walk(root, new Set([".css"]));
  const idCache = new Map();

  check(htmlFiles.length > 0, path.join(root, "index.html"), "", 0, "no HTML files found");

  for (const file of htmlFiles) validateHtml(file, idCache);
  for (const file of cssFiles) validateCss(file, idCache);

  if (errors.length) {
    console.error(`\nSite validation failed with ${errors.length} error${errors.length === 1 ? "" : "s"}:\n`);
    for (const error of errors) console.error(`  ✖ ${error}`);
    console.error(`\n${checkCount} checks ran across ${htmlFiles.length} HTML and ${cssFiles.length} CSS file${cssFiles.length === 1 ? "" : "s"}.\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`✓ Site validation passed: ${checkCount} checks across ${htmlFiles.length} HTML and ${cssFiles.length} CSS file${cssFiles.length === 1 ? "" : "s"}.`);
}

main();
