// GL-Service: tiny zero-dependency server.
// Serves the web app from ./public and proxies requests to the GrainLink API
// so the customer's API key never hits CORS issues in the browser.
//
// Usage:  node server.js           (http://localhost:3000)
// Env:    PORT                      default 3000
//         GRAINLINK_API_BASE        default https://api.grainlink.com
//         GRAINLINK_AUTH_HEADER     header the API expects the key in
//                                   (default "Authorization")
//         GRAINLINK_AUTH_PREFIX     prefix before the key (default "Bearer ")

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const API_BASE = (process.env.GRAINLINK_API_BASE || "https://api.grainlink.com").replace(/\/+$/, "");
const AUTH_HEADER = process.env.GRAINLINK_AUTH_HEADER || "Authorization";
const AUTH_PREFIX = process.env.GRAINLINK_AUTH_PREFIX ?? "Bearer ";
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function proxy(req, res, url) {
  const apiPath = url.searchParams.get("path") || "";
  // Only allow relative API paths, never a full URL to another host.
  if (!apiPath.startsWith("/") || apiPath.startsWith("//")) {
    return send(res, 400, { error: "path must start with /" });
  }
  const key = req.headers["x-gl-key"];
  if (!key) return send(res, 401, { error: "Missing API key" });

  try {
    const upstream = await fetch(API_BASE + apiPath, {
      headers: { [AUTH_HEADER]: AUTH_PREFIX + key, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const text = await upstream.text();
    send(res, upstream.status, text, upstream.headers.get("content-type") || "application/json");
  } catch (err) {
    send(res, 502, { error: `Could not reach ${API_BASE}: ${err.message}` });
  }
}

function serveStatic(res, url) {
  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: "Forbidden" });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: "Not found" });
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/proxy" && req.method === "GET") return proxy(req, res, url);
    if (req.method === "GET") return serveStatic(res, url);
    send(res, 405, { error: "Method not allowed" });
  })
  .listen(PORT, () => {
    console.log(`GL-Service running at http://localhost:${PORT}  (API: ${API_BASE})`);
  });
