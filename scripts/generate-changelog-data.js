const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OWNER = "enzo-prism";
const REPO = "marble";
const BRANCH = process.env.CHANGELOG_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || "main";
const REVISION = process.env.CHANGELOG_REVISION || process.env.VERCEL_GIT_COMMIT_SHA || "HEAD";
const MAX_COMMITS = Number(process.env.CHANGELOG_MAX_COMMITS || 200);

const rootDir = path.join(__dirname, "..");
const outFile = path.join(rootDir, "changelog", "data.json");

function git(args) {
  return execFileSync("git", args, {
    cwd: rootDir,
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

function buildCommitRecord(commit) {
  const files = parseNumstat(
    git(["show", commit.sha, "--numstat", "--format=", "--no-renames", "--no-ext-diff"])
  );

  const stats = files.reduce(
    (acc, file) => {
      acc.additions += file.additions;
      acc.deletions += file.deletions;
      acc.total += file.changes;
      return acc;
    },
    { additions: 0, deletions: 0, total: 0 }
  );

  return {
    sha: commit.sha,
    html_url: `https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`,
    commit: {
      message: commit.message,
      author: { date: commit.date },
      committer: { date: commit.date },
    },
    files,
    stats,
  };
}

function main() {
  const log = git([
    "log",
    REVISION,
    `--max-count=${MAX_COMMITS}`,
    "--date=iso-strict",
    "--pretty=format:%H%x1f%cI%x1f%B%x1e",
  ]);

  const commits = parseGitLog(log).map(buildCommitRecord);

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

main();
