#!/usr/bin/env node

"use strict";

// Writes llms-full.txt: llms.txt followed by the readable text of every page,
// as Markdown, so a language model can read the whole site in one request.
// It converts each page's <main> (headings, paragraphs, lists, tables, code,
// FAQ <details>) and skips decoration: anything aria-hidden, canvases, SVG,
// scripts, the home page's animated demo and the product-story overlays.
//
// Usage:
//   node scripts/build-llms-full.js          write llms-full.txt
//   node scripts/build-llms-full.js --check  fail if llms-full.txt is stale
//                                           (the validator runs this)

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ORIGIN = "https://marble-fit.app";
const outFile = path.join(root, "llms-full.txt");

// Pages in reading order. Release notes are summarised by their index.
const PAGES = [
  "index.html",
  "features/index.html",
  "guides/hevy-alternative/index.html",
  "guides/strong-alternative/index.html",
  "guides/import-hevy-strong-workouts/index.html",
  "guides/log-workouts-from-apple-notes/index.html",
  "guides/workout-notation/index.html",
  "guides/private-offline-workout-tracker/index.html",
  "guides/sprint-training-log/index.html",
  "guides/apple-watch-strength-training-log/index.html",
  "tools/one-rep-max-calculator/index.html",
  "tools/dots-calculator/index.html",
  "about/index.html",
  "privacy/index.html",
  "releases/index.html",
];

const SKIP_TAGS = new Set(["script", "style", "svg", "canvas", "template", "noscript", "dialog", "video", "audio", "picture", "img", "button", "form", "select", "input", "nav", "header.nav"]);
// Decorative or interactive pieces of the home page that read as noise.
const SKIP_CLASSES = [
  "type-demo",
  "story-mark",
  "story-fly",
  "story-land",
  "story-ring",
  "story-wipe",
  "story-screen",
  "marquee",
  "bento-visual",
  "orbit",
  "visually-hidden",
  "skip-link",
  "crumbs",
  "page-cta",
  "related-guides",
  "try-chip",
  "screen-item",
  "page-backdrop",
  "hero-actions",
];
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const BLOCK = new Set(["p", "h1", "h2", "h3", "h4", "li", "tr", "pre", "summary", "figcaption", "blockquote", "dt", "dd", "caption"]);

function decode(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, (m) => (m === "&lsquo;" ? "‘" : "’"))
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&middot;/g, "·")
    .replace(/&times;/g, "×")
    .replace(/&divide;/g, "÷")
    .replace(/&minus;/g, "−")
    .replace(/&asymp;/g, "≈")
    .replace(/&rsaquo;/g, "›")
    .replace(/&rarr;/g, "→")
    .replace(/&hellip;/g, "…")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[3] ?? m[4];
  return out;
}

function skipped(name, a) {
  if (SKIP_TAGS.has(name)) return true;
  if (a["aria-hidden"] === "true") return true;
  if (name === "header" && /\bnav\b/.test(a.class || "")) return true;
  const classes = (a.class || "").split(/\s+/);
  return classes.some((c) => SKIP_CLASSES.some((s) => c === s || c.startsWith(`${s}-`)));
}

function absolute(href) {
  if (!href) return "";
  if (/^https?:/.test(href)) return href;
  if (href.startsWith("/")) return `${ORIGIN}${href}`;
  return href;
}

// Turns the HTML of <main> into Markdown blocks.
function toMarkdown(html) {
  const blocks = [];
  const stack = [];
  let skipDepth = 0;
  let buffer = "";
  let list = []; // stack of "ul" / "ol" counters
  let row = null;
  let tableRows = null;
  let inPre = false;
  let link = null;

  const flush = (kind) => {
    const text = inPre ? buffer.replace(/^\n+|\s+$/g, "") : buffer.replace(/\s+/g, " ").trim();
    buffer = "";
    if (!text) return;
    blocks.push({ kind, text });
  };

  const tokens = html.split(/(<!--[\s\S]*?-->|<[^>]+>)/);
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith("<!--")) continue;
    if (token.startsWith("<")) {
      const closing = token.startsWith("</");
      const name = (token.match(/^<\/?\s*([a-zA-Z0-9]+)/) || [])[1]?.toLowerCase();
      if (!name) continue;

      if (!closing) {
        const a = attrs(token);
        const selfClosing = VOID.has(name) || token.endsWith("/>");
        if (skipDepth || skipped(name, a)) {
          if (!selfClosing) {
            stack.push({ name, skip: true });
            skipDepth += 1;
          }
          continue;
        }
        if (selfClosing) {
          if (name === "br") buffer += inPre ? "\n" : " ";
          continue;
        }
        stack.push({ name, skip: false, attrs: a });
        if (BLOCK.has(name) || name === "td" || name === "th" || name === "ul" || name === "ol" || name === "table" || name === "details") {
          if (buffer.trim() && !row) flush("p");
          buffer = row ? buffer : "";
        }
        if (name === "ul" || name === "ol") list.push({ type: name, n: 0 });
        if (name === "li" && list.length) list[list.length - 1].n += 1;
        if (name === "table") tableRows = [];
        if (name === "tr") row = [];
        if (name === "pre") inPre = true;
        if (name === "code" && !inPre) buffer += "`";
        if (name === "strong" || name === "b") buffer += "**";
        if (name === "a") {
          link = absolute(decode(a.href || ""));
          buffer += "[";
        }
        continue;
      }

      // closing tag: pop to the matching element
      let open;
      while (stack.length) {
        open = stack.pop();
        if (open.skip) skipDepth -= 1;
        if (open.name === name) break;
      }
      if (!open || open.skip || skipDepth) continue;

      if (name === "code" && !inPre) buffer += "`";
      if (name === "strong" || name === "b") buffer += "** ";
      if (name === "a") {
        const open = buffer.lastIndexOf("[");
        if (open !== -1) buffer = `${buffer.slice(0, open + 1)}${buffer.slice(open + 1).replace(/\s+/g, " ").trim().replace(/\*\* +$/, "**")}`;
        buffer += link && !link.startsWith("#") ? `](${link})` : "]";
        if (!link || link.startsWith("#")) buffer = buffer.replace(/\[([^\[\]]*)\]$/, "$1");
        link = null;
      }
      if ((name === "td" || name === "th") && row) {
        row.push(buffer.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|"));
        buffer = "";
      }
      if (name === "tr" && row) {
        if (tableRows) tableRows.push(row);
        row = null;
      }
      if (name === "table" && tableRows) {
        if (tableRows.length) blocks.push({ kind: "table", rows: tableRows });
        tableRows = null;
      }
      if (name === "pre") {
        flush("pre");
        inPre = false;
      }
      if (name === "ul" || name === "ol") list.pop();
      if (name === "li") {
        const current = list[list.length - 1];
        const depth = Math.max(0, list.length - 1);
        const marker = current && current.type === "ol" ? `${current.n}.` : "-";
        flush(`li:${"  ".repeat(depth)}${marker}`);
      } else if (/^h[1-4]$/.test(name)) {
        flush(name);
      } else if (name === "summary") {
        flush("q");
      } else if (name === "caption") {
        flush("caption");
      } else if (BLOCK.has(name) && name !== "tr") {
        flush("p");
      }
      continue;
    }

    if (skipDepth) continue;
    buffer += inPre ? decode(token) : decode(token).replace(/\s+/g, " ");
  }
  flush("p");

  const lines = [];
  for (const block of blocks) {
    if (block.kind === "table") {
      const width = Math.max(...block.rows.map((r) => r.length));
      const rows = block.rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
      lines.push(`| ${rows[0].join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map((r) => `| ${r.join(" | ")} |`), "");
    } else if (block.kind.startsWith("li:")) {
      lines.push(`${block.kind.slice(3)} ${block.text}`);
    } else if (block.kind === "pre") {
      lines.push("```", block.text, "```", "");
    } else if (/^h[1-4]$/.test(block.kind)) {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      lines.push(`${"#".repeat(Number(block.kind[1]) + 2)} ${block.text}`, "");
    } else if (block.kind === "q") {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      lines.push(`**Q: ${block.text}**`);
    } else if (block.kind === "caption") {
      lines.push(`*${block.text}*`, "");
    } else {
      if (lines.length && /^\s*(-|\d+\.) /.test(lines[lines.length - 1])) lines.push("");
      lines.push(block.text, "");
    }
  }
  return lines
    .join("\n")
    .replace(/\*\* +([.,;:!?)’”])/g, "**$1")
    .replace(/\*\* +$/gm, "**")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageUrl(rel) {
  return `${ORIGIN}/${rel.replace(/index\.html$/, "")}`;
}

function build() {
  const llms = fs.readFileSync(path.join(root, "llms.txt"), "utf8").trim();
  const parts = [
    llms,
    "",
    "---",
    "",
    "# Full text of marble-fit.app",
    "",
    "Generated from the site's pages by scripts/build-llms-full.js. Each section is one page.",
  ];

  for (const rel of PAGES) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error(`missing page ${rel}`);
    const html = fs.readFileSync(file, "utf8");
    const title = decode((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || rel).trim();
    const description = decode((html.match(/<meta\s+name="description"\s+content="([^"]*)"/) || [])[1] || "").replace(/\s+/g, " ").trim();
    const modified = (html.match(/"dateModified":\s*"([^"]+)"/) || [])[1];
    const main = (html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/) || [])[1];
    if (!main) throw new Error(`no <main> in ${rel}`);
    const body = toMarkdown(main);
    parts.push(
      "",
      "---",
      "",
      `## ${title}`,
      "",
      `URL: ${pageUrl(rel)}`,
      ...(modified ? [`Updated: ${modified.slice(0, 10)}`] : []),
      `Summary: ${description}`,
      "",
      body,
    );
  }
  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function main() {
  const output = build();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "";
    if (current !== output) {
      console.error("llms-full.txt is out of date. Run `npm run build:llms` and commit the result.");
      process.exitCode = 1;
      return;
    }
    console.log("✓ llms-full.txt is up to date.");
    return;
  }
  fs.writeFileSync(outFile, output);
  console.log(`✓ Wrote llms-full.txt (${PAGES.length} pages, ${Math.round(output.length / 1024)} KB).`);
}

module.exports = { toMarkdown, build };

if (require.main === module) main();
