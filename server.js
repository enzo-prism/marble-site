const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || "127.0.0.1";
const root = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const server = http.createServer((req, res) => {
  const rawUrl = req.url || "/";
  const pathname = rawUrl.split("?")[0].split("#")[0];
  let urlPath = pathname;

  try {
    urlPath = decodeURIComponent(pathname);
  } catch {
    // Keep the raw path if decoding fails.
  }

  const candidates = [];
  if (urlPath === "/") {
    candidates.push("/index.html");
  } else if (urlPath.endsWith("/")) {
    candidates.push(`${urlPath}index.html`);
  } else if (!path.extname(urlPath)) {
    // Nice local dev behavior: /changelog -> /changelog/index.html
    candidates.push(`${urlPath}.html`);
    candidates.push(`${urlPath}/index.html`);
    candidates.push(urlPath);
  } else {
    candidates.push(urlPath);
  }

  const tryRead = (idx) => {
    if (idx >= candidates.length) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }

    const filePath = path.join(root, candidates[idx]);
    const rel = path.relative(root, filePath);

    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("bad request");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === "ENOENT" || err.code === "EISDIR") {
          tryRead(idx + 1);
          return;
        }
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("server error");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  };

  tryRead(0);
});

server.listen(port, host, () => {
  console.log(`marble site running on http://${host}:${port}`);
});
