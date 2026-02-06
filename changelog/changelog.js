(() => {
  "use strict";

  const OWNER = "enzo-prism";
  const REPO = "marble";
  const BRANCH = "main";

  const APP_STORE_URL = "https://apps.apple.com/us/app/marble-fit/id6757725234";
  const GITHUB_WEB_BASE = `https://github.com/${OWNER}/${REPO}`;
  const GITHUB_API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;

  const PER_PAGE = 100;
  const MAX_COMMITS = 500;

  // Keep the list pretty fresh so the page feels "latest", while still limiting requests.
  const COMMIT_LIST_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const COMMIT_DETAIL_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

  const CONCURRENCY = 4;

  const summaryRoot = document.getElementById("changelog-summary");
  const detailsRoot = document.getElementById("changelog-details");
  const lastUpdatedEl = document.getElementById("changelog-last-updated");

  if (!summaryRoot || !detailsRoot) return;

  const dtf = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  function el(tag, { className, text, attrs } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null) continue;
        node.setAttribute(k, String(v));
      }
    }
    return node;
  }

  function shortSha(sha) {
    return typeof sha === "string" ? sha.slice(0, 7) : "";
  }

  function commitSubject(message) {
    const msg = typeof message === "string" ? message : "";
    const firstLine = msg.split("\n")[0] || "";
    return firstLine.trim() || "(no commit message)";
  }

  function commitBodyParagraphs(message) {
    const msg = typeof message === "string" ? message : "";
    const [, ...rest] = msg.split("\n");
    const body = rest.join("\n").trim();
    if (!body) return [];

    // Convert double-newlines into paragraphs; keep it simple.
    return body
      .split(/\n{2,}/g)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return dtf.format(d);
  }

  function isSnapshotFile(filename) {
    const name = String(filename || "");
    if (!name) return false;
    if (name.includes("/__Snapshots__/")) return true;
    if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return true;
    return false;
  }

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.ts !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeCache(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore cache failures (private mode/quota/etc).
    }
  }

  async function fetchJsonCached({ url, cacheKey, ttlMs }) {
    const now = Date.now();
    const cached = readCache(cacheKey);

    if (cached && cached.data !== undefined && now - cached.ts < ttlMs) {
      return { data: cached.data, cached: true };
    }

    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (cached && cached.etag) headers["If-None-Match"] = cached.etag;

    const res = await fetch(url, { headers });

    if (res.status === 304 && cached && cached.data !== undefined) {
      writeCache(cacheKey, { ...cached, ts: now });
      return { data: cached.data, cached: true };
    }

    if (!res.ok) {
      let message = `request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body && typeof body.message === "string") message = body.message;
      } catch {
        // ignore
      }
      const err = new Error(message);
      err.status = res.status;
      err.url = url;
      err.rateLimitRemaining = res.headers.get("x-ratelimit-remaining");
      err.rateLimitReset = res.headers.get("x-ratelimit-reset");
      throw err;
    }

    const data = await res.json();
    const etag = res.headers.get("etag");
    writeCache(cacheKey, { ts: now, etag, data });
    return { data, cached: false };
  }

  async function fetchOverrides() {
    try {
      const res = await fetch("/changelog/overrides.json", { cache: "no-store" });
      if (res.status === 404) return {};
      if (!res.ok) return {};
      const data = await res.json();
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  function findOverride(overrides, sha) {
    if (!overrides || typeof overrides !== "object") return null;
    if (overrides[sha]) return overrides[sha];

    let bestKey = null;
    for (const key of Object.keys(overrides)) {
      if (key.startsWith("_")) continue;
      if (!sha.startsWith(key)) continue;
      if (!bestKey || key.length > bestKey.length) bestKey = key;
    }
    return bestKey ? overrides[bestKey] : null;
  }

  function setLastUpdated(text) {
    if (!lastUpdatedEl) return;
    lastUpdatedEl.textContent = String(text);
  }

  function errorCard({ title, message, href, linkText }) {
    const card = el("div", { className: "card changelog-error" });
    const h = el("h3", { text: title });
    const p = el("p", { className: "changelog-muted", text: message });
    card.appendChild(h);
    card.appendChild(p);

    if (href) {
      const a = el("a", {
        className: "chip",
        text: linkText || "view on github",
        attrs: { href, target: "_blank", rel: "noreferrer noopener" },
      });
      card.appendChild(a);
    }

    return card;
  }

  function summaryCardSkeleton(commit) {
    const sha = commit.sha;
    const message = commit?.commit?.message;
    const subject = commitSubject(message);
    const dateIso = commit?.commit?.author?.date || commit?.commit?.committer?.date;
    const date = formatDate(dateIso);
    const url = commit.html_url || `${GITHUB_WEB_BASE}/commit/${sha}`;

    const card = el("article", { className: "card commit-card", attrs: { "data-sha": sha } });

    const top = el("div", { className: "commit-top" });
    const left = el("div", { className: "commit-top-left" });
    const title = el("h3", { className: "commit-title", text: subject });

    const meta = el("div", { className: "commit-meta" });
    if (date) meta.appendChild(el("span", { text: date }));
    meta.appendChild(el("span", { className: "commit-sha", text: shortSha(sha) }));
    meta.appendChild(
      el("a", {
        className: "chip",
        text: "view",
        attrs: { href: url, target: "_blank", rel: "noreferrer noopener" },
      })
    );

    left.appendChild(title);
    left.appendChild(meta);
    top.appendChild(left);

    const bullets = el("ul", { className: "commit-bullets" });
    bullets.appendChild(el("li", { className: "commit-placeholder", text: "loading details…" }));

    card.appendChild(top);
    card.appendChild(bullets);

    return { card, bullets, subject, dateIso, url };
  }

  function detailsSkeleton(commit, { openByDefault }) {
    const sha = commit.sha;
    const message = commit?.commit?.message;
    const subject = commitSubject(message);
    const dateIso = commit?.commit?.author?.date || commit?.commit?.committer?.date;
    const date = formatDate(dateIso);
    const url = commit.html_url || `${GITHUB_WEB_BASE}/commit/${sha}`;

    const root = el("details", { className: "commit-details", attrs: { "data-sha": sha } });
    if (openByDefault) root.open = true;

    const summary = el("summary", { className: "commit-summary" });
    const summaryMain = el("div", { className: "commit-summary-main" });
    summaryMain.appendChild(el("span", { className: "commit-summary-title", text: subject }));

    const summaryMeta = el("span", { className: "commit-summary-meta" });
    if (date) summaryMeta.appendChild(el("span", { text: date }));
    summaryMeta.appendChild(el("span", { className: "commit-sha", text: shortSha(sha) }));
    summaryMain.appendChild(summaryMeta);

    summary.appendChild(summaryMain);
    root.appendChild(summary);

    const body = el("div", { className: "commit-body" });

    const whySection = el("div", { className: "commit-section" });
    whySection.appendChild(el("div", { className: "commit-kicker", text: "Why" }));
    const whyBody = el("div", { className: "commit-paragraphs" });
    whyBody.appendChild(el("p", { className: "changelog-muted", text: "loading…" }));
    whySection.appendChild(whyBody);

    const notesSection = el("div", { className: "commit-section", attrs: { hidden: "" } });
    notesSection.appendChild(el("div", { className: "commit-kicker", text: "Notes" }));
    const notesBody = el("div", { className: "commit-paragraphs" });
    notesSection.appendChild(notesBody);

    const whatSection = el("div", { className: "commit-section" });
    whatSection.appendChild(el("div", { className: "commit-kicker", text: "What changed" }));
    const whatList = el("ul", { className: "commit-bullets" });
    whatList.appendChild(el("li", { className: "commit-placeholder", text: "loading details…" }));
    whatSection.appendChild(whatList);

    const filesSection = el("div", { className: "commit-section" });
    filesSection.appendChild(el("div", { className: "commit-kicker", text: "Files changed" }));
    const filesBody = el("div", { className: "commit-files" });
    filesBody.appendChild(el("div", { className: "changelog-muted", text: "loading…" }));
    filesSection.appendChild(filesBody);

    const actions = el("div", { className: "commit-actions" });
    actions.appendChild(
      el("a", {
        className: "chip",
        text: "view on github",
        attrs: { href: url, target: "_blank", rel: "noreferrer noopener" },
      })
    );
    actions.appendChild(
      el("a", {
        className: "chip",
        text: "app store",
        attrs: { href: APP_STORE_URL, target: "_blank", rel: "noreferrer noopener" },
      })
    );

    body.appendChild(whySection);
    body.appendChild(notesSection);
    body.appendChild(whatSection);
    body.appendChild(filesSection);
    body.appendChild(actions);

    root.appendChild(body);

    return {
      root,
      whyBody,
      notesSection,
      notesBody,
      whatList,
      filesBody,
      subject,
      dateIso,
      url,
    };
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function computeAreaCounts(files) {
    const counts = new Map();
    for (const f of files) {
      const name = String(f.filename || "");
      const parts = name.split("/");
      const area = parts.length > 1 ? parts[0] : "(root)";
      counts.set(area, (counts.get(area) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  function computeKeyFiles(files) {
    const scored = files
      .filter((f) => f && typeof f.filename === "string")
      .filter((f) => !isSnapshotFile(f.filename))
      .map((f) => ({
        filename: f.filename,
        changes: typeof f.changes === "number" ? f.changes : (f.additions || 0) + (f.deletions || 0),
      }))
      .sort((a, b) => b.changes - a.changes);

    const names = scored.slice(0, 3).map((s) => s.filename);
    return names;
  }

  function genSentenceFromAreas(areaCounts) {
    const top = areaCounts.slice(0, 2).map(([a]) => a);
    if (!top.length) return "";

    const a = top[0];
    const b = top[1];

    if (a === "Tests" && b === "marble") return "Mostly tests + app code, likely a feature iteration with coverage updates.";
    if (a === "Tests") return "Heavily test-focused changes, likely stabilizing or expanding coverage.";
    if (a === "marble") return "Primarily app-side changes, likely UI/feature iteration.";
    if (a.endsWith(".xcodeproj")) return "Project configuration changes, likely build/settings maintenance.";
    if (a === "(root)") return "Repo-level maintenance (docs, tooling, or configuration).";
    return `Most changes are in ${a}${b ? ` and ${b}` : ""}.`;
  }

  function setBulletList(ul, bullets) {
    clearChildren(ul);
    for (const b of bullets) {
      ul.appendChild(el("li", { text: b }));
    }
  }

  function renderParagraphs(container, paragraphs) {
    clearChildren(container);
    for (const p of paragraphs) {
      container.appendChild(el("p", { text: p }));
    }
  }

  function buildFileList(files) {
    const snapshot = [];
    const other = [];
    for (const f of files) {
      if (!f || typeof f.filename !== "string") continue;
      if (isSnapshotFile(f.filename)) snapshot.push(f);
      else other.push(f);
    }

    const wrap = el("div", { className: "file-lists" });

    const list = el("ul", { className: "file-list" });
    for (const f of other) {
      const li = el("li", { className: "file-item" });
      li.appendChild(el("code", { className: "file-name", text: f.filename }));
      const add = typeof f.additions === "number" ? f.additions : 0;
      const del = typeof f.deletions === "number" ? f.deletions : 0;
      li.appendChild(el("span", { className: "file-diff", text: `+${add} -${del}` }));
      list.appendChild(li);
    }

    if (other.length) {
      wrap.appendChild(list);
    }

    if (snapshot.length) {
      const group = el("details", { className: "file-group" });
      const sum = el("summary", { className: "file-group-summary", text: `Snapshots (${snapshot.length} files)` });
      group.appendChild(sum);

      const snapList = el("ul", { className: "file-list file-list-snapshots" });
      for (const f of snapshot) {
        const li = el("li", { className: "file-item" });
        li.appendChild(el("code", { className: "file-name", text: f.filename }));
        snapList.appendChild(li);
      }
      group.appendChild(snapList);

      wrap.appendChild(group);
    }

    if (!other.length && !snapshot.length) {
      wrap.appendChild(el("div", { className: "changelog-muted", text: "No file list available for this commit." }));
    }

    return wrap;
  }

  async function fetchAllCommits() {
    const commits = [];
    const maxPages = Math.ceil(MAX_COMMITS / PER_PAGE);

    for (let page = 1; page <= maxPages; page++) {
      const url = `${GITHUB_API_BASE}/commits?sha=${encodeURIComponent(BRANCH)}&per_page=${PER_PAGE}&page=${page}`;
      const cacheKey = `marble:changelog:commits:${OWNER}/${REPO}:${BRANCH}:page:${page}`;
      const { data } = await fetchJsonCached({ url, cacheKey, ttlMs: COMMIT_LIST_TTL_MS });
      if (!Array.isArray(data)) break;
      commits.push(...data);
      if (data.length < PER_PAGE) break;
    }

    return commits.slice(0, MAX_COMMITS);
  }

  async function fetchCommitDetail(sha) {
    const url = `${GITHUB_API_BASE}/commits/${encodeURIComponent(sha)}`;
    const cacheKey = `marble:changelog:commit:${sha}`;
    const { data } = await fetchJsonCached({ url, cacheKey, ttlMs: COMMIT_DETAIL_TTL_MS });
    return data;
  }

  async function runLimited(items, limit, fn) {
    const queue = items.slice();
    const workers = Array.from({ length: limit }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          await fn(item);
        } catch {
          // Per-item errors are handled inside fn.
        }
      }
    });
    await Promise.all(workers);
  }

  function applyCommitDetails({ summaryBullets, whyBody, notesSection, notesBody, whatList, filesBody }, commit, detail, override) {
    const sha = commit.sha;

    const files = Array.isArray(detail?.files) ? detail.files : [];
    const stats = detail?.stats || {};
    const additions = typeof stats.additions === "number" ? stats.additions : 0;
    const deletions = typeof stats.deletions === "number" ? stats.deletions : 0;

    const areaCounts = computeAreaCounts(files);
    const areasShown = areaCounts.slice(0, 3).map(([a, c]) => `${a} (${c})`);
    const areasMore = areaCounts.length > 3 ? ` +${areaCounts.length - 3} more` : "";
    const areasLine = areasShown.length ? `Areas: ${areasShown.join(", ")}${areasMore}` : "Areas: (unknown)";

    const keyFiles = computeKeyFiles(files);
    const keyFilesLine = keyFiles.length ? `Key files: ${keyFiles.join(", ")}` : "";

    const autoBullets = [
      `Changed ${files.length} files (+${additions}/-${deletions})`,
      areasLine,
    ];
    if (keyFilesLine) autoBullets.push(keyFilesLine);
    const sentence = genSentenceFromAreas(areaCounts);
    if (sentence) autoBullets.push(sentence);

    const summary = override?.summary && Array.isArray(override.summary) ? override.summary.filter(Boolean) : null;
    setBulletList(summaryBullets, summary && summary.length ? summary : autoBullets.slice(0, 3));

    const subject = commitSubject(commit?.commit?.message);
    const whyText = typeof override?.why === "string" && override.why.trim() ? override.why.trim() : subject;
    renderParagraphs(whyBody, [whyText]);

    const noteParas = [];
    if (override?.details && Array.isArray(override.details)) {
      for (const p of override.details) {
        if (typeof p === "string" && p.trim()) noteParas.push(p.trim());
      }
    } else {
      noteParas.push(...commitBodyParagraphs(commit?.commit?.message));
    }

    if (noteParas.length) {
      notesSection.hidden = false;
      renderParagraphs(notesBody, noteParas);
    } else {
      notesSection.hidden = true;
      clearChildren(notesBody);
    }

    setBulletList(whatList, autoBullets);

    clearChildren(filesBody);
    filesBody.appendChild(buildFileList(files));

    const url = detail?.html_url || commit?.html_url || `${GITHUB_WEB_BASE}/commit/${sha}`;
    const viewLinks = filesBody.closest(".commit-body")?.querySelectorAll(".commit-actions a");
    if (viewLinks && viewLinks[0] && viewLinks[0].getAttribute("href") !== url) {
      viewLinks[0].setAttribute("href", url);
    }
  }

  function applyCommitError({ summaryBullets, whyBody, notesSection, notesBody, whatList, filesBody }, commit, err) {
    setBulletList(summaryBullets, ["Details unavailable (GitHub API error)."]);
    renderParagraphs(whyBody, [commitSubject(commit?.commit?.message)]);
    notesSection.hidden = true;
    clearChildren(notesBody);
    setBulletList(whatList, ["Details unavailable (GitHub API error)."]);
    clearChildren(filesBody);
    filesBody.appendChild(
      errorCard({
        title: "Could not load commit details",
        message: err && err.message ? String(err.message) : "Unknown error",
        href: commit?.html_url || `${GITHUB_WEB_BASE}/commits/${encodeURIComponent(BRANCH)}`,
      })
    );
  }

  async function main() {
    setLastUpdated("loading commits…");

    const overrides = await fetchOverrides();

    let commits;
    try {
      commits = await fetchAllCommits();
    } catch (err) {
      const reset = err?.rateLimitReset ? Number(err.rateLimitReset) * 1000 : null;
      const resetText = reset ? ` Rate limit resets at ${new Date(reset).toLocaleTimeString()}.` : "";
      const msg = `${err?.message || "Unable to load commits."}${resetText}`;

      summaryRoot.appendChild(
        errorCard({
          title: "Could not load changelog",
          message: msg,
          href: `${GITHUB_WEB_BASE}/commits/${encodeURIComponent(BRANCH)}`,
          linkText: "view commits on github",
        })
      );

      setLastUpdated("unable to load commits");
      return;
    }

    if (!commits.length) {
      summaryRoot.appendChild(
        errorCard({
          title: "No commits found",
          message: "GitHub returned an empty commit list.",
          href: `${GITHUB_WEB_BASE}/commits/${encodeURIComponent(BRANCH)}`,
          linkText: "view on github",
        })
      );
      setLastUpdated("no commits found");
      return;
    }

    const latestIso = commits[0]?.commit?.author?.date || commits[0]?.commit?.committer?.date;
    setLastUpdated(latestIso ? `latest commit: ${formatDate(latestIso)}` : "latest commit loaded");

    const refBySha = new Map();

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const sha = commit.sha;

      const s = summaryCardSkeleton(commit);
      summaryRoot.appendChild(s.card);

      const d = detailsSkeleton(commit, { openByDefault: i < 3 });
      detailsRoot.appendChild(d.root);

      refBySha.set(sha, {
        summaryBullets: s.bullets,
        whyBody: d.whyBody,
        notesSection: d.notesSection,
        notesBody: d.notesBody,
        whatList: d.whatList,
        filesBody: d.filesBody,
      });
    }

    await runLimited(commits, CONCURRENCY, async (commit) => {
      const sha = commit.sha;
      const refs = refBySha.get(sha);
      if (!refs) return;

      try {
        const detail = await fetchCommitDetail(sha);
        const override = findOverride(overrides, sha);
        applyCommitDetails(refs, commit, detail, override);
      } catch (err) {
        applyCommitError(refs, commit, err);
      }
    });
  }

  main().catch((err) => {
    summaryRoot.appendChild(
      errorCard({
        title: "Changelog failed to load",
        message: err && err.message ? String(err.message) : "Unknown error",
        href: `${GITHUB_WEB_BASE}/commits/${encodeURIComponent(BRANCH)}`,
        linkText: "view on github",
      })
    );
    setLastUpdated("unable to load commits");
  });
})();
