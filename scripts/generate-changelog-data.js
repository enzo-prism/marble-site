const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// The changelog shows the iOS APP repo's history (enzo-prism/marble), NOT this
// marketing site's repo. Read commits from the app repo so the "view on github"
// links point at SHAs that actually exist in enzo-prism/marble.
const OWNER = "enzo-prism";
const REPO = "marble";
const BRANCH = process.env.CHANGELOG_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || "main";
const REVISION = process.env.CHANGELOG_REVISION || process.env.VERCEL_GIT_COMMIT_SHA || "HEAD";
const MAX_COMMITS = Number(process.env.CHANGELOG_MAX_COMMITS || 200);

const rootDir = path.join(__dirname, "..");
const outFile = path.join(rootDir, "changelog", "data.json");

// Candidate locations for the app repo, in priority order. First usable git
// repo wins; if none is usable we fall back to the GitHub REST API.
const APP_REPO_CANDIDATES = [
  process.env.MARBLE_APP_REPO,
  "/Users/enzo/Projects/marble",
  path.join(__dirname, "..", "..", "marble"),
];

function isGitRepo(dir) {
  if (!dir) return false;
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
  } catch {
    return false;
  }
  try {
    const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() === "true";
  } catch {
    return false;
  }
}

function resolveAppRepoDir() {
  for (const candidate of APP_REPO_CANDIDATES) {
    if (isGitRepo(candidate)) {
      return candidate;
    }
  }
  return null;
}

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseGitLog(raw) {
  return raw
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const fields = entry.split("\x1f");
      const sha = fields[0] || "";
      const date = fields[1] || "";
      const message = fields.slice(2).join("\x1f").trim();

      return {
        sha,
        date,
        message,
      };
    })
    .filter((commit) => commit.sha);
}

function parseNumstat(raw) {
  return raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [additionsRaw, deletionsRaw, ...rest] = line.split("\t");
      const filename = rest.join("\t").trim();
      const additions = Number.parseInt(additionsRaw, 10);
      const deletions = Number.parseInt(deletionsRaw, 10);
      const safeAdditions = Number.isFinite(additions) ? additions : 0;
      const safeDeletions = Number.isFinite(deletions) ? deletions : 0;

      return {
        filename,
        additions: safeAdditions,
        deletions: safeDeletions,
        changes: safeAdditions + safeDeletions,
      };
    })
    .filter((file) => file.filename);
}

function statsFromFiles(files) {
  return files.reduce(
    (acc, file) => {
      acc.additions += file.additions;
      acc.deletions += file.deletions;
      acc.total += file.changes;
      return acc;
    },
    { additions: 0, deletions: 0, total: 0 }
  );
}

function buildCommitRecord(commit, files) {
  const stats = statsFromFiles(files);

  return {
    sha: commit.sha,
    html_url: `https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`,
    commit: {
      message: commit.message,
      author: { date: commit.authorDate || commit.date },
      committer: { date: commit.date },
    },
    files,
    stats,
  };
}

// --- Source: local git clone of the app repo ---------------------------------
function generateFromGit(appRepoDir) {
  const log = git(
    [
      "log",
      REVISION,
      `--max-count=${MAX_COMMITS}`,
      "--date=iso-strict",
      "--pretty=format:%H%x1f%cI%x1f%B%x1e",
    ],
    appRepoDir
  );

  return parseGitLog(log).map((commit) => {
    const files = parseNumstat(
      git(["show", commit.sha, "--numstat", "--format=", "--no-renames", "--no-ext-diff"], appRepoDir)
    );
    return buildCommitRecord(commit, files);
  });
}

// --- Source: GitHub REST API (fallback when no local clone) ------------------
const API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": `${OWNER}-${REPO}-changelog-generator`,
};

async function githubJson(url) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = token ? { ...API_HEADERS, Authorization: `Bearer ${token}` } : API_HEADERS;
  const res = await fetch(url, { headers });
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    throw new Error(
      `GitHub API rate-limited (HTTP ${res.status}, x-ratelimit-remaining=${remaining}) for ${url}`
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub API error HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function generateFromApi() {
  const ref = REVISION && REVISION !== "HEAD" ? REVISION : BRANCH;
  const perPage = 100;
  const pages = Math.ceil(MAX_COMMITS / perPage);
  const summaries = [];

  for (let page = 1; page <= pages && summaries.length < MAX_COMMITS; page += 1) {
    const url =
      `https://api.github.com/repos/${OWNER}/${REPO}/commits` +
      `?sha=${encodeURIComponent(ref)}&per_page=${perPage}&page=${page}`;
    const batch = await githubJson(url);
    if (!Array.isArray(batch) || batch.length === 0) break;
    summaries.push(...batch);
    if (batch.length < perPage) break;
  }

  const sliced = summaries.slice(0, MAX_COMMITS);
  const records = [];

  for (const summary of sliced) {
    const detail = await githubJson(
      `https://api.github.com/repos/${OWNER}/${REPO}/commits/${summary.sha}`
    );
    const files = (detail.files || []).map((file) => {
      const additions = Number.isFinite(file.additions) ? file.additions : 0;
      const deletions = Number.isFinite(file.deletions) ? file.deletions : 0;
      return {
        filename: file.filename,
        additions,
        deletions,
        changes: Number.isFinite(file.changes) ? file.changes : additions + deletions,
      };
    });

    records.push(
      buildCommitRecord(
        {
          sha: detail.sha,
          date: detail.commit?.committer?.date || detail.commit?.author?.date || "",
          authorDate: detail.commit?.author?.date || detail.commit?.committer?.date || "",
          message: (detail.commit?.message || "").trim(),
        },
        files
      )
    );
  }

  return records;
}

async function main() {
  let commits;
  const appRepoDir = resolveAppRepoDir();

  if (appRepoDir) {
    process.stdout.write(`Reading commits from local app repo: ${appRepoDir}\n`);
    commits = generateFromGit(appRepoDir);
  } else {
    process.stdout.write(
      `No local app repo found; falling back to GitHub API for ${OWNER}/${REPO}\n`
    );
    commits = await generateFromApi();
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    owner: OWNER,
    repo: REPO,
    branch: BRANCH,
    commitCount: commits.length,
    commits,
  };

  fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`Wrote ${commits.length} commits to ${outFile}\n`);
}

main().catch((err) => {
  // Never break the build. Leave the existing changelog/data.json untouched,
  // warn, and exit cleanly. The snapshot is committed and regenerated manually.
  process.stderr.write(
    `[generate-changelog-data] WARNING: could not regenerate changelog data: ${err && err.message ? err.message : err}\n`
  );
  process.stderr.write(`[generate-changelog-data] Leaving existing ${outFile} untouched.\n`);
  process.exit(0);
});
