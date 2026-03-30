import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const DIST_DIR = path.join(process.cwd(), "dist");
const HOST = process.env.PREVIEW_HOST ?? "127.0.0.1";
const PORT = Number(process.env.PREVIEW_PORT ?? 4173);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function resolveFile(requestUrl) {
  const pathname = decodeURIComponent(url.parse(requestUrl).pathname ?? "/");
  let target = path.normalize(path.join(DIST_DIR, pathname));

  if (!target.startsWith(DIST_DIR)) {
    return null;
  }

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, "index.html");
  } else if (!path.extname(target)) {
    target = path.join(target, "index.html");
  }

  return target;
}

const server = http.createServer((req, res) => {
  const filePath = resolveFile(req.url ?? "/");
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": "no-cache"
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`preview server ready at http://${HOST}:${PORT}/`);
});
