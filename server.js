// DarDoc · PeptiDoc — unified doctor + patient telehealth app.
// Zero-dependency Node.js server (node:http + node:sqlite).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { handleApi, guidePageMeta, refillPageMeta, formPageMeta } = require("./src/api");

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

const escAttr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The private-link pages (/g/, /r/ and /f/<token>). Each is a static shell that
// fetches its data with the token, but link-preview crawlers (WhatsApp) only
// read the HTML, so the clinic's name and logo are written into the <head>
// here. Nothing about the patient is.
function serveLinkPage(req, res, dir, meta, title, description) {
  fs.readFile(path.join(PUBLIC_DIR, dir, "index.html"), "utf8", (err, html) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    const origin = `${proto}://${req.headers.host || "localhost"}`;
    const tags = [
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${escAttr(meta && meta.clinic ? `${title} — ${meta.clinic}` : title)}">`,
      `<meta property="og:description" content="${escAttr(description)}">`,
      meta && meta.clinic ? `<meta property="og:site_name" content="${escAttr(meta.clinic)}">` : "",
      meta && meta.logoUrl ? `<meta property="og:image" content="${escAttr(origin + meta.logoUrl)}">` : "",
    ].filter(Boolean).join("\n");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    });
    res.end(html.replace("<!--OG-->", tags));
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

  const linkMatch = pathname.match(/^\/([grf])\/([A-Za-z0-9_-]{20,64})\/?$/);
  if (linkMatch) {
    const [, kind, token] = linkMatch;
    if (kind === "g") return serveLinkPage(req, res, "g", guidePageMeta(token), "Your personal treatment guide", "Tap to open your guide: how to take your medication, what to expect, side effects and when to contact us.");
    if (kind === "r") return serveLinkPage(req, res, "r", refillPageMeta(token), "Request a refill", "Tap to request your next refill — your doctor will review and confirm.");
    return serveLinkPage(req, res, "f", formPageMeta(token), "Complete your details", "A few questions so your doctor can review your treatment safely.");
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
