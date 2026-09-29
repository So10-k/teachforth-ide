import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { publishedUrl, removeSite, writeSite } from "../server/publish.js";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8792);
const ROOT = process.env.PROJECTS_DIR || "/var/www/teachforth-projects";
const TOKEN = loadToken();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });
    if (!authorized(req.headers["x-teachforth-token"] || bearer(req.headers.authorization))) {
      return json(res, 401, { error: "Unauthorized" });
    }
    if (req.method === "POST" && url.pathname === "/publish") {
      const body = JSON.parse(await readBody(req));
      const slug = String(body.slug || "");
      writeSite(ROOT, slug, body.files || {});
      return json(res, 200, { ok: true, slug, url: publishedUrl(slug) });
    }
    if (req.method === "DELETE" && url.pathname === "/publish") {
      removeSite(ROOT, String(url.searchParams.get("slug") || ""));
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, err.status || 400, { error: err.publicMessage || "Publish failed" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TeachForth projects on http://${HOST}:${PORT}`);
});

function loadToken() {
  if (process.env.PUBLISH_TOKEN) return process.env.PUBLISH_TOKEN.trim();
  const file = process.env.PUBLISH_TOKEN_FILE || "/var/lib/teachforth-projects/token";
  return readFileSync(file, "utf8").trim();
}

function bearer(header) {
  const match = String(header || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function authorized(given) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(TOKEN);
  if (!TOKEN || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_500_000) {
        reject(Object.assign(new Error("Too large"), { status: 413, publicMessage: "Too large" }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8") || "{}"));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
}
