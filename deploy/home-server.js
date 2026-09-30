import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync, readdirSync, statSync, realpathSync } from "node:fs";
import { dirname, join, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8793);
const HOME_DIR = process.env.HOME_DIR || "/var/lib/teachforth-home";
const STATIC_DIR = process.env.STATIC_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const PREFIX = process.env.PUBLIC_PREFIX ?? "/teachforth-home";
const IDE_HEALTH = process.env.IDE_HEALTH_URL || "http://74.248.20.108/api/health";
const IDE_PUBLIC = (process.env.IDE_PUBLIC_URL || "https://74-248-20-108.sslip.io").replace(/\/$/, "");
const SESSIONS = join(HOME_DIR, "sessions");
const ID_RE = /^[a-f0-9]{48}$/;
const PATH_RE = /^[\w./-]{1,120}$/;
const MAX_FILE = 200_000;
const MAX_FILES = 40;
const queues = new Map();
const hits = new Map();
let healthCache = { at: 0, up: false };
let TOKEN = "";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

export function safeRel(path) {
  const clean = String(path || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!PATH_RE.test(clean) || clean.split("/").some((part) => !part || part === "." || part === "..")) {
    fail(400, "Use a simple file name");
  }
  if (clean === ".teachforth" || clean.endsWith("/.teachforth")) fail(400, "That file stays in class");
  return clean;
}

const server = createServer(async (req, res) => {
  try {
    if (String(req.url || "").includes("..")) return json(res, 400, { error: "Use a simple file name" });
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });
    if (url.pathname === "/push") return await pushRoute(req, res, url);
    if (url.pathname.startsWith("/assets/")) return serveAsset(res, url.pathname.slice("/assets/".length));
    const session = url.pathname.match(/^\/s\/([a-f0-9]{48})(\/.*)?$/);
    if (!session) return json(res, 404, { error: "Not found" });
    return await sessionRoute(req, res, url, session[1], session[2] || "/");
  } catch (err) {
    json(res, err.status || 500, { error: err.publicMessage || "Home link failed" });
  }
});

if (isMain()) {
  TOKEN = loadToken();
  if (!TOKEN) {
    console.error("home token missing");
    process.exit(1);
  }
  mkdirSync(SESSIONS, { recursive: true, mode: 0o700 });
  sweep();
  setInterval(sweep, 60_000).unref();
  server.listen(PORT, HOST, () => {
    console.log(`TeachForth home on http://${HOST}:${PORT}`);
  });
}

async function pushRoute(req, res, url) {
  if (!authorized(req.headers["x-teachforth-token"])) return json(res, 401, { error: "Unauthorized" });
  if (req.method === "DELETE") {
    const id = String(url.searchParams.get("id") || "");
    if (!ID_RE.test(id)) return json(res, 400, { error: "Unknown link" });
    removeSession(id);
    return json(res, 200, { ok: true });
  }
  if (req.method !== "POST") return json(res, 404, { error: "Not found" });
  const body = JSON.parse(await readBody(req, 8_000_000));
  const saved = acceptPush(body);
  return json(res, 200, { ok: true, id: saved.id, expiresAt: saved.expiresAt });
}

function acceptPush(body) {
  const id = String(body.id || "");
  if (!ID_RE.test(id)) fail(400, "Bad link");
  const projectId = Number(body.projectId);
  if (!Number.isInteger(projectId) || projectId < 1) fail(400, "Bad project");
  const expiresAt = String(body.expiresAt || "");
  const exp = Date.parse(expiresAt);
  const span = exp - Date.now();
  if (!Number.isFinite(exp) || span < 60_000 || span > 169 * 60 * 60 * 1000) fail(400, "Bad expiry");
  const repo = String(body.githubRepo || "");
  if (!/^[\w.-]+\/TeachForth-[\w.-]+$/.test(repo)) fail(400, "Not a TeachForth repository");
  const token = String(body.token || "");
  if (token.length < 8 || token.length > 200 || /[\r\n]/.test(token)) fail(400, "Missing GitHub link");
  const marker = String(body.marker || "").slice(0, 500);
  if (!marker) fail(400, "Missing student marker");
  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length > MAX_FILES) fail(400, "Too many files");
  const map = {};
  for (const file of files) {
    const path = safeRel(file.path);
    const content = String(file.content ?? "");
    if (content.length > MAX_FILE || content.includes("\u0000")) fail(400, "A file is too large");
    map[path] = content;
  }
  mkdirSync(SESSIONS, { recursive: true, mode: 0o700 });
  for (const name of readdirSync(SESSIONS)) {
    if (!ID_RE.test(name) || name === id) continue;
    const meta = readMeta(name);
    if (meta?.projectId === projectId) removeSession(name);
  }
  const dir = join(SESSIONS, id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeJson(join(dir, "files.json"), map);
  writeJson(join(dir, "meta.json"), {
    projectId,
    title: String(body.title || "Project").slice(0, 80),
    language: String(body.language || "web").slice(0, 20),
    githubRepo: repo,
    githubUrl: String(body.githubUrl || "").slice(0, 200),
    expiresAt,
    token,
    marker,
    basePaths: Object.keys(map),
    dirty: false,
  });
  return { id, expiresAt };
}

async function sessionRoute(req, res, url, id, rest) {
  const meta = liveMeta(id);
  if (!meta) return json(res, 410, { error: "This home link has ended." });
  if (rest === "/" || rest === "") {
    if (req.method !== "GET") return json(res, 405, { error: "Not found" });
    if (!url.pathname.endsWith("/")) {
      res.writeHead(302, { location: `${PREFIX}/s/${id}/`, "cache-control": "no-store", "referrer-policy": "no-referrer" });
      res.end();
      return;
    }
    if (await classUp() && !meta.dirty) {
      res.writeHead(302, { location: classUrl(meta.projectId), "cache-control": "no-store", "referrer-policy": "no-referrer" });
      res.end();
      return;
    }
    return html(res, page(id, meta));
  }
  if (rest === "/api/state" && req.method === "GET") {
    pace(`read:${id}`, 40, 10_000);
    const files = readFiles(id);
    return json(res, 200, {
      title: meta.title,
      language: meta.language,
      expiresAt: meta.expiresAt,
      githubRepo: meta.githubRepo,
      files: Object.entries(files).map(([path, content]) => ({ path, content })),
    });
  }
  if (rest === "/api/handoff" && req.method === "GET") return json(res, 200, await handoff(id));
  if (rest === "/api/file" && req.method === "PUT") return saveFile(req, res, id);
  if (rest === "/api/file" && req.method === "POST") return saveFile(req, res, id);
  if (rest === "/api/file" && req.method === "DELETE") return deleteFile(res, id, url.searchParams.get("path"));
  if (rest === "/api/rename" && req.method === "POST") return renameFile(req, res, id);
  if (rest === "/api/commit" && req.method === "POST") {
    const saved = await commitSession(id);
    const up = await classUp();
    return json(res, 200, up ? { ...saved, redirect: classUrl(meta.projectId) } : saved);
  }
  const preview = rest.match(/^\/preview\/?(.*)$/);
  if (preview && req.method === "GET") return servePreview(res, id, preview[1]);
  return json(res, 404, { error: "Not found" });
}

async function saveFile(req, res, id) {
  pace(`save:${id}`, 8, 2_000);
  const body = JSON.parse(await readBody(req, MAX_FILE + 2_000));
  const path = safeRel(body.path);
  const content = String(body.content ?? "");
  if (content.length > MAX_FILE || content.includes("\u0000")) fail(400, "That file is too large");
  await lock(id, async () => {
    const files = readFiles(id);
    if (!Object.hasOwn(files, path) && Object.keys(files).length >= MAX_FILES) fail(400, "Too many files");
    files[path] = content;
    writeFiles(id, files);
    markDirty(id);
  });
  return json(res, 200, { ok: true });
}

function deleteFile(res, id, raw) {
  const path = safeRel(raw);
  return lock(id, async () => {
    const files = readFiles(id);
    delete files[path];
    writeFiles(id, files);
    markDirty(id);
    json(res, 200, { ok: true });
  });
}

async function renameFile(req, res, id) {
  const body = JSON.parse(await readBody(req, 4_000));
  const from = safeRel(body.from);
  const to = safeRel(body.to);
  await lock(id, async () => {
    const files = readFiles(id);
    if (!Object.hasOwn(files, from)) fail(404, "File not found");
    if (from !== to && Object.hasOwn(files, to)) fail(409, "That name is already used");
    files[to] = files[from];
    if (from !== to) delete files[from];
    writeFiles(id, files);
    markDirty(id);
  });
  return json(res, 200, { ok: true });
}

async function handoff(id) {
  if (!(await classUp())) return { up: false };
  const meta = liveMeta(id);
  if (!meta) return { up: true, error: "This home link has ended." };
  if (meta.dirty) await commitSession(id);
  return { up: true, redirect: classUrl(meta.projectId) };
}

async function commitSession(id) {
  return lock(id, async () => {
    const meta = liveMeta(id);
    if (!meta?.token) fail(410, "This home link has ended.");
    if (!pace(`commit:${id}`, 1, 8_000)) fail(429, "That project was just saved to GitHub. Wait a few seconds.");
    if (!pace(`commit-hour:${id}`, 30, 60 * 60 * 1000)) fail(429, "Too many home commits this hour. Wait a bit.");
    const [login, repo] = meta.githubRepo.split("/");
    const files = readFiles(id);
    const list = Object.entries(files).map(([path, content]) => ({ path, content }));
    list.push({ path: ".teachforth", content: meta.marker });
    const removed = (meta.basePaths || []).filter((path) => !Object.hasOwn(files, path));
    const sha = await commitFiles(meta.token, login, repo, list, removed, "TeachForth home save");
    meta.dirty = false;
    meta.basePaths = Object.keys(files);
    meta.sha = sha;
    writeJson(join(SESSIONS, id, "meta.json"), meta);
    return { sha, url: meta.githubUrl || `https://github.com/${meta.githubRepo}` };
  });
}

async function commitFiles(token, owner, repo, files, deleted, message) {
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await commitOnce(token, owner, repo, files, deleted, message);
    } catch (err) {
      last = err;
      if (attempt === 1 || !/fast forward|not a fast-forward/i.test(err.publicMessage || "")) throw err;
    }
  }
  throw last;
}

async function commitOnce(token, owner, repo, files, deleted, message) {
  const info = await gh(token, "GET", `/repos/${owner}/${repo}`);
  const branch = info.default_branch || "main";
  const ref = await gh(token, "GET", `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const parent = await gh(token, "GET", `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
  const treeItems = [];
  for (const file of files) {
    const blob = await gh(token, "POST", `/repos/${owner}/${repo}/git/blobs`, {
      content: String(file.content ?? ""),
      encoding: "utf-8",
    });
    treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  for (const path of deleted) {
    if (path === ".teachforth") continue;
    treeItems.push({ path, mode: "100644", type: "blob", sha: null });
  }
  const tree = await gh(token, "POST", `/repos/${owner}/${repo}/git/trees`, { base_tree: parent.tree.sha, tree: treeItems });
  const commit = await gh(token, "POST", `/repos/${owner}/${repo}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [ref.object.sha],
  });
  await gh(token, "PATCH", `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
  return commit.sha;
}

async function gh(token, method, path, body) {
  const key = `gh:${String(token).slice(-8)}`;
  if (!pace(key, 40, 10 * 60 * 1000)) fail(429, "GitHub is being asked for too much. Wait a minute and try again.");
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "teachforth-home",
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(data.message || "GitHub request failed").slice(0, 160);
    console.error("home-github", method, path.split("?")[0], response.status);
    fail(response.status === 401 ? 401 : 502, message === "Bad credentials" ? "Link GitHub again in class, then ask for a new home link." : message);
  }
  return data;
}

function servePreview(res, id, raw) {
  const wanted = raw ? safeRel(decodeURIComponent(raw)) : "index.html";
  const files = readFiles(id);
  const content = files[wanted];
  if (content == null) {
    res.writeHead(404, headers("text/plain; charset=utf-8"));
    res.end("Not found");
    return;
  }
  const ext = extname(wanted).toLowerCase();
  let body = content;
  if (ext === ".html" || ext === ".htm") body = rewriteHtml(body, files);
  res.writeHead(200, {
    ...headers(TYPES[ext] || "text/plain; charset=utf-8"),
    "content-security-policy": "sandbox allow-scripts allow-modals",
  });
  res.end(body);
}

function rewriteHtml(html, files) {
  let page = String(html).replace(/\b(src|href)\s*=\s*(["'])\/(?!\/)([^"']*)\2/gi, (all, attr, quote, path) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return all;
    return `${attr}=${quote}${path.replace(/^\/+/, "")}${quote}`;
  });
  if (files["style.css"] && !/<link\b[^>]*href\s*=\s*["'][^"']*style\.css/i.test(page)) {
    const tag = `<link rel="stylesheet" href="style.css">`;
    page = page.includes("</head>") ? page.replace("</head>", `${tag}</head>`) : `${tag}${page}`;
  }
  if (files["script.js"] && !/<script\b[^>]*\bsrc\s*=/i.test(page)) {
    const tag = `<script src="script.js"></script>`;
    page = page.includes("</body>") ? page.replace("</body>", `${tag}</body>`) : `${page}${tag}`;
  }
  return page;
}

function page(id, meta) {
  const base = `${PREFIX}/s/${id}`;
  const asset = `${PREFIX}/assets`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>TeachForth IDE</title>
  <link rel="icon" href="${asset}/favicon.svg">
  <link rel="stylesheet" href="${asset}/vendor/codemirror.min.css">
  <link rel="stylesheet" href="${asset}/app.css">
</head>
<body data-base="${base}">
  <div id="app"></div>
  <script src="${asset}/vendor/codemirror.min.js"></script>
  <script src="${asset}/vendor/xml.min.js"></script>
  <script src="${asset}/vendor/javascript.min.js"></script>
  <script src="${asset}/vendor/css.min.js"></script>
  <script src="${asset}/vendor/htmlmixed.min.js"></script>
  <script src="${asset}/vendor/python.min.js"></script>
  <script src="${asset}/vendor/clike.min.js"></script>
  <script src="${asset}/vendor/addon/closebrackets.js"></script>
  <script src="${asset}/vendor/addon/closetag.js"></script>
  <script src="${asset}/home.js"></script>
</body>
</html>`;
}

function serveAsset(res, raw) {
  const rel = String(raw || "").replaceAll("\\", "/");
  if (!/^[\w./-]+$/.test(rel) || rel.includes("..")) return json(res, 404, { error: "Not found" });
  const root = resolve(STATIC_DIR);
  const file = resolve(root, rel);
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return json(res, 404, { error: "Not found" });
  const ext = extname(file).toLowerCase();
  res.writeHead(200, headers(TYPES[ext] || "application/octet-stream"));
  res.end(readFileSync(file));
}

function liveMeta(id) {
  if (!ID_RE.test(id)) return null;
  const meta = readMeta(id);
  if (!meta) return null;
  if (Date.parse(meta.expiresAt) < Date.now()) {
    removeSession(id);
    return null;
  }
  return meta;
}

function readMeta(id) {
  const file = join(SESSIONS, id, "meta.json");
  if (!ID_RE.test(id) || !existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readFiles(id) {
  const file = join(SESSIONS, id, "files.json");
  if (!existsSync(file)) return {};
  const data = JSON.parse(readFileSync(file, "utf8"));
  return data && typeof data === "object" ? data : {};
}

function writeFiles(id, files) {
  writeJson(join(SESSIONS, id, "files.json"), files);
}

function markDirty(id) {
  const meta = readMeta(id);
  if (!meta) fail(410, "This home link has ended.");
  meta.dirty = true;
  writeJson(join(SESSIONS, id, "meta.json"), meta);
}

function removeSession(id) {
  if (!ID_RE.test(id)) return;
  rmSync(join(SESSIONS, id), { recursive: true, force: true });
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  renameSync(tmp, file);
}

function sweep() {
  if (!existsSync(SESSIONS)) return;
  for (const name of readdirSync(SESSIONS)) {
    if (!ID_RE.test(name)) continue;
    const meta = readMeta(name);
    if (!meta || Date.parse(meta.expiresAt) < Date.now()) removeSession(name);
  }
}

async function classUp() {
  if (Date.now() - healthCache.at < 20_000) return healthCache.up;
  let up = false;
  try {
    const response = await fetch(IDE_HEALTH, { signal: AbortSignal.timeout(4_000) });
    up = response.ok;
  } catch {
    up = false;
  }
  healthCache = { at: Date.now(), up };
  return up;
}

function classUrl(projectId) {
  return `${IDE_PUBLIC}/?home=1#/project/${projectId}`;
}

function pace(key, limit, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) fail(429, "Wait a few seconds and try again.");
  recent.push(now);
  hits.set(key, recent);
}

function lock(id, fn) {
  const prev = queues.get(id) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(() => {}, () => {});
  queues.set(id, tail);
  return run;
}

function authorized(given) {
  const token = TOKEN || loadToken();
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(token);
  if (!token || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function loadToken() {
  if (process.env.HOME_PUSH_TOKEN) return process.env.HOME_PUSH_TOKEN.trim();
  const file = process.env.HOME_TOKEN_FILE || join(HOME_DIR, "token");
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").trim();
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Too large"), { status: 413, publicMessage: "That upload is too large" }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8") || "{}"));
    req.on("error", reject);
  });
}

function html(res, body) {
  res.writeHead(200, headers("text/html; charset=utf-8"));
  res.end(body);
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, headers("application/json; charset=utf-8"));
  res.end(payload);
}

function headers(type) {
  return {
    "content-type": type,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  throw err;
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return pathToFileURL(process.argv[1]).href === import.meta.url;
  }
}
