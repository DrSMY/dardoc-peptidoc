// DarDoc · PeptiDoc — unified doctor + patient telehealth app.
// Zero-dependency Node.js server (node:http + node:sqlite).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { handleApi } = require("./src/api");

const PORT = process.env.PORT || 4700;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// Pretty routes → SPA entry points
const PAGE_ROUTES = {
  "/": "index.html",
  "/doctor": "doctor/index.html",
  "/portal": "portal/index.html",
  "/admin": "admin/index.html",
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
    });
    res.end(data);
  });
}

// One-shot legacy data import on boot (idempotent — skips existing patients).
// Set IMPORT_SUPABASE=1 in the environment to enable; new PINs print to logs.
if (process.env.IMPORT_SUPABASE === "1") {
  try { require("./scripts/import-supabase"); } catch (e) { console.error("Legacy import failed:", e.message); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith("/api/")) {
    const handled = await handleApi(req, res, pathname);
    if (!handled) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unknown API route." }));
    }
    return;
  }

  if (PAGE_ROUTES[pathname]) {
    return serveFile(res, path.join(PUBLIC_DIR, PAGE_ROUTES[pathname]));
  }

  // Static assets — resolve safely inside public/
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`DarDoc · PeptiDoc running at http://localhost:${PORT}`);
  console.log(`  Doctor dashboard: http://localhost:${PORT}/doctor`);
  console.log(`  Patient portal:   http://localhost:${PORT}/portal`);
});
