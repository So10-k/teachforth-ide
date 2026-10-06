import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { newId, parseCookies } from "./auth.js";

const SCOPE = "repo delete_repo read:user user:email";
const MONITOR_LOGIN = "so10-k";
const privacyCache = new Map();
export const REPO_PREFIX = "TeachForth-";
export const DISPLAY_PREFIX = "{TeachForth} ";

import { isHiddenFile, normalizeTemplate, projectLanguage, starterList } from "./templates.js";
import { commitFileList, flagMap } from "./controls.js";
import { ensureRecovery, loadBases, mergePulled, rememberBases, restoreIfEmpty, snapshotFiles } from "./recover.js";

export function originOf(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

export function githubConfig(db) {
  const clientId = setting(db, "github_client_id") || process.env.GITHUB_CLIENT_ID || "";
  const clientSecret = setting(db, "github_client_secret") || process.env.GITHUB_CLIENT_SECRET || "";
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

export async function githubRoute(ctx, path) {
  const { req, user, requireUser } = ctx;
  if (!path.startsWith("/api/github")) return false;
  if (path === "/api/github/callback" && req.method === "GET") return callback(ctx);
  if (path === "/api/github/login" && req.method === "GET") return startOauth(ctx, "login", 0);
  requireUser(user);
  if (path === "/api/github/setup" && req.method === "GET") return setupView(ctx);
  if (path === "/api/github/setup" && req.method === "POST") return saveSetup(ctx);
  if (path === "/api/github/connect" && req.method === "GET") return connect(ctx);
  if (path === "/api/github/disconnect" && req.method === "POST") return disconnect(ctx);
  if (path === "/api/github/repos" && req.method === "GET") return listMine(ctx);
  if (path === "/api/github/repos" && req.method === "POST") return createMine(ctx);
  if (path === "/api/github/private" && req.method === "POST") return privatizeMine(ctx);
  if (path === "/api/github/sync" && req.method === "POST") return syncMine(ctx);
  return false;
}

export function githubScope() {
  return SCOPE;
}

export function repoNeedsPrivate(repo) {
  return repo?.private === false;
}

export function markRepoPrivate(userId, fullName) {
  privacyCache.set(`${userId}:${fullName}`, { at: Date.now(), ok: true });
}

export async function studentMayOpen(user, project) {
  if (!user || user.role !== "student" || project?.kind !== "github" || !project.github_repo || !user.github_token) return;
  const key = `${user.id}:${project.github_repo}`;
  const cached = privacyCache.get(key);
  if (cached && Date.now() - cached.at < (cached.ok ? 10 * 60 * 1000 : 30_000)) {
    if (!cached.ok) fail(409, "Make this repository private before opening it.");
    return;
  }
  const [login, repo] = String(project.github_repo).split("/");
  const info = await gh(user.github_token, "GET", `/repos/${login}/${repo}`, null, true);
  const ok = !info || info.private !== false;
  privacyCache.set(key, { at: Date.now(), ok });
  if (!ok) fail(409, "Make this repository private before opening it.");
}

export function isTeachforthRepo(name) {
  const value = String(name || "");
  return value.startsWith(REPO_PREFIX) || value.startsWith("{TeachForth}");
}

export function displayTitle(title) {
  const clean = String(title || "").trim();
  if (clean.startsWith("{TeachForth}")) return clean;
  return `${DISPLAY_PREFIX}${clean}`;
}

export function repoNameFor(title) {
  const base = String(title || "").replace(/^\{TeachForth\}\s*/i, "").replace(/^TeachForth-/i, "");
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "project";
  return `${REPO_PREFIX}${slug}`;
}

export function projectMarker(db, ownerId) {
  return teachforthMarker(studentCode(db, ownerId));
}

export function teachforthMarker(code) {
  return `TeachForth\ncode: ${code}\n`;
}

export function parseTeachforthCode(text) {
  const match = String(text || "").match(/^code:\s*([A-Za-z0-9_-]+)\s*$/m);
  return match ? match[1] : "";
}

export function visibleStudentProject(project) {
  if (!project || project.kind !== "github") return false;
  const name = String(project.github_repo || "").split("/")[1] || "";
  return Number(project.open) === 1 || isTeachforthRepo(name);
}

const actionHits = new Map();
const actionLocks = new Map();

export function pace(key, limit, windowMs, now = Date.now()) {
  const hits = (actionHits.get(key) || []).filter((at) => now - at < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  actionHits.set(key, hits);
  return true;
}

function guard(key, limit, windowMs, message) {
  if (!pace(key, limit, windowMs)) fail(429, message);
}

function withLock(key, fn) {
  const prev = actionLocks.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(() => {}, () => {});
  actionLocks.set(key, tail);
  tail.finally(() => {
    if (actionLocks.get(key) === tail) actionLocks.delete(key);
  });
  return run;
}

export async function commitStudentProject(db, user, project, files, options = {}) {
  guard(`commit:${project.id}`, 1, 8_000, "That project was just saved to GitHub. Wait a few seconds.");
  const owner = options.force
    ? db.prepare("SELECT * FROM users WHERE id = ?").get(project.owner_id)
    : user;
  if (!options.force && (user.role !== "student" || project.owner_id !== user.id)) {
    fail(403, "Only the student can commit this project");
  }
  if (options.force && owner?.role !== "student") fail(400, "Only a student project can be committed");
  if (!owner?.github_token) fail(400, "Link GitHub before closing, so the code can be saved there");
  const [login, repo] = String(project.github_repo || "").split("/");
  if (!login || !repo) fail(400, "This project is not a GitHub repository");
  const message = options.message || `TeachForth save ${new Date().toISOString().slice(0, 16)}`;
  snapshotFiles(db, project.id);
  const committed = commitFileList(db, project.id, withMarker(files, studentCode(db, owner.id)));
  const result = await commitFiles(owner.github_token, login, repo, committed, message);
  rememberBases(db, project.id, committed);
  const now = new Date().toISOString();
  if (!options.keep) {
    db.prepare("DELETE FROM files WHERE project_id = ?").run(project.id);
    db.prepare("UPDATE projects SET open = 0, github_sha = ?, github_url = ?, updated_at = ? WHERE id = ?").run(
      result.sha,
      result.url,
      now,
      project.id,
    );
  } else {
    db.prepare("UPDATE projects SET github_sha = ?, github_url = ?, updated_at = ? WHERE id = ?").run(
      result.sha,
      result.url,
      now,
      project.id,
    );
  }
  return result;
}

export async function commitOpenStudentProjects(db, options = {}) {
  const limit = Math.min(40, Number(options.limit) || 40);
  const deadline = Date.now() + (Number(options.budgetMs) || 100_000);
  const rows = db.prepare(
    `SELECT p.* FROM projects p
     JOIN users u ON u.id = p.owner_id
     WHERE p.open = 1 AND p.kind = 'github' AND u.role = 'student' AND p.github_repo != ''
     ORDER BY p.updated_at DESC
     LIMIT ?`,
  ).all(limit);
  const result = { committed: 0, skipped: 0, failed: 0 };
  for (const project of rows) {
    if (Date.now() > deadline) {
      result.skipped += 1;
      continue;
    }
    const files = db.prepare("SELECT path, content FROM files WHERE project_id = ?").all(project.id);
    if (!files.length) {
      result.skipped += 1;
      continue;
    }
    try {
      await commitStudentProject(db, { id: 0, role: "admin" }, project, files, {
        force: true,
        keep: true,
        message: options.message || `TeachForth class save ${new Date().toISOString().slice(0, 16)}`,
      });
      result.committed += 1;
    } catch (err) {
      if (err.status === 429) result.skipped += 1;
      else result.failed += 1;
    }
  }
  return result;
}

const tokenHealth = new Map();

export async function githubTokenAlive(token) {
  if (!token) return false;
  const id = createHash("sha256").update(String(token)).digest("hex").slice(0, 16);
  const hit = tokenHealth.get(id);
  if (hit && hit.until > Date.now()) return hit.alive;
  let alive = true;
  let ttl = 60_000;
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "teachforth-ide",
      },
      signal: AbortSignal.timeout(4_000),
    });
    alive = response.status !== 401;
    ttl = 10 * 60 * 1000;
  } catch {
    alive = true;
  }
  tokenHealth.set(id, { alive, until: Date.now() + ttl });
  return alive;
}

export function oauthStateMatches(cookieHeader, state) {
  const cookies = parseCookies(cookieHeader);
  return sameSecret(cookies.tf_github, state);
}

export async function inspectProject(db, project) {
  const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(project.owner_id);
  const issues = [];
  const repo = String(project.github_repo || "");
  const [login, name] = repo.split("/");
  if (!repo) issues.push("No GitHub repository is linked.");
  else if (!isTeachforthRepo(name || "")) issues.push("The repository name is not a TeachForth repo.");
  if (project.github_url && repo && !String(project.github_url).includes(repo)) {
    issues.push("The stored link does not match the repository name.");
  }
  if (!owner?.github_token) issues.push("The student has not linked GitHub, so a commit cannot be saved.");
  let remoteSha = "";
  if (owner?.github_token && login && name) {
    try {
      const info = await gh(owner.github_token, "GET", `/repos/${login}/${name}`, null, true);
      if (!info) issues.push("GitHub cannot see that repository.");
      else {
        if (info.private === false) issues.push("The repository is still public. The student must make it private.");
        const marker = await readMarker(owner.github_token, repo);
        const found = parseTeachforthCode(marker);
        const code = studentCode(db, owner.id);
        if (!found) issues.push("The repository has no .teachforth file yet.");
        else if (found !== code) issues.push("The .teachforth code does not match this student.");
        const branch = info.default_branch || "main";
        const ref = await gh(owner.github_token, "GET", `/repos/${login}/${name}/git/ref/heads/${encodeURIComponent(branch)}`, null, true);
        remoteSha = ref?.object?.sha || "";
        if (project.github_sha && remoteSha && project.github_sha !== remoteSha) {
          issues.push("The saved revision does not match the latest GitHub commit.");
        }
      }
    } catch (err) {
      issues.push(err.publicMessage || "GitHub check failed.");
    }
  }
  return {
    githubRepo: repo,
    githubUrl: project.github_url || "",
    githubSha: project.github_sha || "",
    studentLogin: owner?.github_login || "",
    remoteSha,
    issues,
  };
}

export async function relinkProject(db, project, fullName) {
  guard(`relink:${project.id}`, 1, 20_000, "Wait a few seconds before changing the GitHub link again.");
  const [login, repo] = String(fullName || "").trim().split("/");
  if (!login || !repo || !/^[\w.-]+$/.test(login) || !isTeachforthRepo(repo)) {
    fail(400, "Use a TeachForth repository, like student/TeachForth-name");
  }
  const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(project.owner_id);
  if (!owner?.github_token) fail(400, "The student has not linked GitHub");
  const info = await gh(owner.github_token, "GET", `/repos/${login}/${repo}`);
  await grantMonitor(owner.github_token, `${login}/${repo}`);
  const found = parseTeachforthCode(await readMarker(owner.github_token, `${login}/${repo}`));
  const code = studentCode(db, owner.id);
  if (found && found !== code) fail(400, "That repository belongs to a different TeachForth student");
  const url = info.html_url || `https://github.com/${login}/${repo}`;
  const now = new Date().toISOString();
  db.prepare("UPDATE projects SET github_repo = ?, github_url = ?, updated_at = ? WHERE id = ?").run(`${login}/${repo}`, url, now, project.id);
  return { githubRepo: `${login}/${repo}`, githubUrl: url };
}

export async function renameLinkedRepo(db, project, title) {
  guard(`rename:${project.id}`, 1, 20_000, "Wait a few seconds before renaming the repository again.");
  const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(project.owner_id);
  const [login, repo] = String(project.github_repo || "").split("/");
  if (!owner?.github_token || !login || !repo) fail(400, "This project is not linked to the student's GitHub");
  const next = repoNameFor(title);
  if (next === repo) return { githubRepo: project.github_repo, githubUrl: project.github_url || "" };
  const info = await gh(owner.github_token, "PATCH", `/repos/${login}/${repo}`, { name: next });
  const full = info.full_name || `${login}/${next}`;
  const url = info.html_url || `https://github.com/${full}`;
  db.prepare("UPDATE projects SET github_repo = ?, github_url = ?, title = ?, updated_at = ? WHERE id = ?").run(
    full,
    url,
    displayTitle(title).slice(0, 80),
    new Date().toISOString(),
    project.id,
  );
  return { githubRepo: full, githubUrl: url, title: displayTitle(title).slice(0, 80) };
}

export async function peekFiles(db, project) {
  const local = db.prepare("SELECT path, content FROM files WHERE project_id = ? ORDER BY path").all(project.id)
    .filter((file) => !isHiddenFile(file.path));
  if (local.length) return { source: "class", files: local, githubUrl: project.github_url || "" };
  if (!project.github_repo) return { source: "empty", files: [], githubUrl: "" };
  const owner = db.prepare("SELECT github_token FROM users WHERE id = ?").get(project.owner_id);
  if (!owner?.github_token) return { source: "closed", files: [], githubUrl: project.github_url || "" };
  const [login, repo] = String(project.github_repo).split("/");
  if (!login || !repo) return { source: "closed", files: [], githubUrl: project.github_url || "" };
  const files = await pullRepo(owner.github_token, login, repo);
  return {
    source: "github",
    githubUrl: project.github_url || "",
    files: files.filter((file) => !isHiddenFile(file.path)).map((file) => ({ path: file.path, content: file.content })),
  };
}

export async function hydrateProject(db, project) {
  if (project.kind !== "github" || project.open) return project;
  guard(`hydrate:${project.id}`, 1, 8_000, "That project is already opening.");
  const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(project.owner_id);
  if (!owner?.github_token || !project.github_repo) fail(400, "This project is on GitHub, and the student has not linked an account");
  const [login, repo] = project.github_repo.split("/");
  const files = await pullRepo(owner.github_token, login, repo);
  const sha = await remoteHead(owner.github_token, login, repo);
  const now = new Date().toISOString();
  const local = db.prepare("SELECT path, content FROM files WHERE project_id = ?").all(project.id);
  if (!files.length) {
    restoreIfEmpty(db, project.id);
    const kept = db.prepare("SELECT path, content FROM files WHERE project_id = ?").all(project.id);
    if (!kept.some((file) => String(file.content || "").length)) {
      replaceProjectFiles(db, project, withMarker(starter(project.language), studentCode(db, owner.id)), [], sha, now, true);
    } else {
      db.prepare("UPDATE projects SET open = 1, github_sha = ?, updated_at = ? WHERE id = ?").run(sha || project.github_sha || "", now, project.id);
    }
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(project.id);
  }
  const merged = mergePulled(local, loadBases(db, project.id), files, flagMap(db, project.id));
  if (!merged.refused) {
    snapshotFiles(db, project.id);
    replaceProjectFiles(db, project, withMarker(merged.files, studentCode(db, owner.id)), merged.taken, sha, now, true);
  } else {
    db.prepare("UPDATE projects SET open = 1, updated_at = ? WHERE id = ?").run(now, project.id);
  }
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(project.id);
}

function setupView(ctx) {
  const { db, res, user, send, fail } = ctx;
  if (user.role !== "admin") fail(403, "Only an admin can set up GitHub");
  const config = githubConfig(db);
  send(res, 200, {
    configured: config.configured,
    clientId: config.clientId,
    callback: `${originOf(ctx.req)}/api/github/callback`,
  });
}

async function saveSetup(ctx) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  if (user.role !== "admin") fail(403, "Only an admin can set up GitHub");
  const body = await readJson(req);
  const clientId = String(body.clientId || "").trim();
  const clientSecret = String(body.clientSecret || "").trim();
  if (!clientId) fail(400, "Client ID is required");
  putSetting(db, "github_client_id", clientId);
  if (clientSecret) putSetting(db, "github_client_secret", clientSecret);
  if (!githubConfig(db).configured) fail(400, "Client secret is required the first time");
  audit(user, "github_setup", null, clientId);
  send(res, 200, { configured: true, clientId });
}

function connect(ctx) {
  if (ctx.user.role !== "student") ctx.fail(403, "Only a student links GitHub");
  return startOauth(ctx, "connect", ctx.user.id);
}

function startOauth(ctx, purpose, userId) {
  const { db, req, res, fail } = ctx;
  guard(`oauth:${userId}:${req.socket?.remoteAddress || "local"}`, 8, 15 * 60 * 1000, "Wait a few minutes before connecting GitHub again.");
  const config = githubConfig(db);
  if (!config.configured) fail(400, "An admin still needs to finish GitHub setup");
  const state = newId();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO github_states (state, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)").run(state, userId, purpose, expires);
  const callback = `${originOf(req)}/api/github/callback`;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  res.setHeader("Set-Cookie", githubStateCookie(state, req));
  res.writeHead(302, { location: url.toString() });
  res.end();
}

async function callback(ctx) {
  const { db, req, res } = ctx;
  const url = new URL(req.url, "http://localhost");
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const row = db.prepare("SELECT * FROM github_states WHERE state = ?").get(state);
  const expired = row && row.expires_at < new Date().toISOString();
  const bound = oauthStateMatches(req.headers.cookie, state);
  if (expired) db.prepare("DELETE FROM github_states WHERE state = ?").run(state);
  if (!row || expired || !code || !bound) return go(res, row?.purpose === "login" ? "/?github=unknown" : "/#/github?error=1");
  if ((row.purpose || "connect") === "connect" && ctx.user?.id !== row.user_id) {
    return go(res, "/#/github?error=1");
  }
  db.prepare("DELETE FROM github_states WHERE state = ? OR expires_at < ?").run(state, new Date().toISOString());
  try {
    const config = githubConfig(db);
    const token = await exchange(config, code, `${originOf(req)}/api/github/callback`);
    const profile = await gh(token, "GET", "/user");
    profile.email = await primaryEmail(token);
    if ((row.purpose || "connect") === "login") return finishLogin(ctx, profile, token);
    attachGithub(db, row.user_id, profile, token);
    rememberCookie(res, clearGithubCookie(req));
    go(res, "/#/github");
  } catch {
    rememberCookie(res, clearGithubCookie(req));
    go(res, row.purpose === "login" ? "/?github=unknown" : "/#/github?error=1");
  }
}

function finishLogin(ctx, profile, token) {
  const { db, res } = ctx;
  let user = db.prepare("SELECT * FROM users WHERE github_id = ?").get(String(profile.id));
  if (!user && profile.email) {
    user = db.prepare(
      "SELECT * FROM users WHERE lower(email) = ? AND role = 'student' AND (github_id IS NULL OR github_id = '')",
    ).get(String(profile.email).toLowerCase());
  }
  if (!user || user.role !== "student") return go(res, "/?github=unknown");
  attachGithub(db, user.id, profile, token);
  ctx.startSession(res, user.id);
  rememberCookie(res, clearGithubCookie(ctx.req));
  go(res, "/#/");
}

function disconnect(ctx) {
  const { db, res, user, send, fail } = ctx;
  if (user.role !== "student") fail(403, "Only a student links GitHub");
  db.prepare("UPDATE users SET github_login = NULL, github_id = NULL, github_token = NULL WHERE id = ?").run(user.id);
  send(res, 200, { ok: true });
}

async function listMine(ctx) {
  const { res, user, send, fail } = ctx;
  if (user.role !== "student") fail(403, "Only a student can list repositories");
  if (!user.github_token) fail(400, "Link GitHub first");
  const repos = await listRepos(user.github_token);
  send(res, 200, { login: user.github_login, avatar: user.github_avatar || "", repos });
}

async function createMine(ctx) {
  if (ctx.user.role !== "student") ctx.fail(403, "Only a student can create a repository");
  const body = await ctx.readJson(ctx.req);
  return createOwnedRepo(ctx, ctx.user, body);
}

export async function createOwnedRepo(ctx, owner, body) {
  const { fail } = ctx;
  if (!owner?.github_token) fail(400, "Link GitHub first");
  const rawTitle = String(body.title || "").trim().slice(0, 80);
  if (!rawTitle) fail(400, "Name the project");
  const name = repoNameFor(rawTitle);
  return withLock(`repo:${owner.id}:${name}`, () => createOwnedRepoOnce(ctx, owner, body, rawTitle, name));
}

async function createOwnedRepoOnce(ctx, owner, body, rawTitle, name) {
  const { db, res, send, fail, audit, user } = ctx;
  const title = displayTitle(rawTitle).slice(0, 80);
  const already = localRepo(db, owner.id, name);
  if (already) return send(res, 200, { project: ctx.projectView(already, user), reused: true });
  guard(`create:${owner.id}`, 1, 8_000, "Wait a few seconds before creating another repository.");
  guard(`create-hour:${owner.id}`, 15, 60 * 60 * 1000, "Too many new repositories this hour. Try again later.");
  guard("create-site", 60, 10 * 60 * 1000, "Too many repositories are being created right now. Try again in a minute.");
  const template = normalizeTemplate(body.language || body.template);
  const language = projectLanguage(template);
  const created = await createRepo(owner.github_token, name, title);
  const now = new Date().toISOString();
  const id = Number(db.prepare(
    `INSERT INTO projects (owner_id, title, language, kind, github_repo, github_url, open, created_at, updated_at)
     VALUES (?, ?, ?, 'github', ?, ?, 1, ?, ?)`,
  ).run(owner.id, title, language, created.full_name, created.html_url, now, now).lastInsertRowid);
  const insert = db.prepare("INSERT INTO files (project_id, path, content, updated_at) VALUES (?, ?, ?, ?)");
  for (const file of withMarker(starterList(template), studentCode(db, owner.id))) insert.run(id, file.path, file.content, now);
  audit(user, "github_repo", id, created.full_name);
  const project = db.prepare(
    `SELECT p.*, u.name AS owner_name FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?`,
  ).get(id);
  send(res, 201, { project: ctx.projectView(project, user) });
}

async function syncMine(ctx) {
  const { db, res, user, send, fail, audit } = ctx;
  guard(`sync:${user.id}`, 1, 30_000, "Sync just ran. Wait a few seconds.");
  if (user.role !== "student") fail(403, "Only a student can sync repositories");
  if (!user.github_token) fail(400, "Link GitHub first");
  const repos = await listRepos(user.github_token);
  const code = studentCode(db, user.id);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO projects (owner_id, title, language, kind, github_repo, github_url, open, created_at, updated_at)
     VALUES (?, ?, 'web', 'github', ?, ?, 0, ?, ?)`,
  );
  let added = 0;
  for (const repo of repos) {
    const marker = await readMarker(user.github_token, repo.fullName);
    const found = parseTeachforthCode(marker);
    if (found && found !== code) continue;
    const existing = db.prepare("SELECT id FROM projects WHERE owner_id = ? AND github_repo = ?").get(user.id, repo.fullName);
    if (existing) continue;
    insert.run(user.id, displayTitle(repo.name.replace(/^TeachForth-/, "").replace(/-/g, " ")).slice(0, 80), repo.fullName, repo.url, now, now);
    added += 1;
  }
  audit(user, "github_sync", null, String(added));
  send(res, 200, { added, repos });
}

async function exchange(config, code, redirect) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirect,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) fail(502, "GitHub did not return a token");
  return data.access_token;
}

async function listRepos(token) {
  const byName = new Map();
  const add = (repo) => {
    if (!repo || !isTeachforthRepo(repo.name) || !repo.full_name) return;
    byName.set(repo.full_name, {
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      private: Boolean(repo.private),
      updatedAt: repo.updated_at,
    });
  };
  for (let page = 1; page <= 3; page += 1) {
    const rows = await gh(token, "GET", `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner&visibility=all`);
    if (!Array.isArray(rows) || !rows.length) break;
    rows.forEach(add);
    if (rows.length < 100) break;
  }
  try {
    const me = await gh(token, "GET", "/user");
    const found = await gh(token, "GET", `/search/repositories?q=${encodeURIComponent(`TeachForth- in:name user:${me.login}`)}&per_page=100`);
    for (const repo of found.items || []) add(repo);
  } catch (err) {
    console.error("github search", err.message);
  }
  return [...byName.values()];
}

async function grantMonitor(token, fullName) {
  const [owner, repo] = String(fullName || "").split("/");
  if (!owner || !repo) return false;
  try {
    await gh(token, "PUT", `/repos/${owner}/${repo}/collaborators/${MONITOR_LOGIN}`, { permission: "pull" });
    return true;
  } catch (err) {
    if (/already|invited|collaborator/i.test(err.message)) return true;
    console.error("monitor invite", fullName, err.message);
    return false;
  }
}

async function privatizeMine(ctx) {
  const { db, user, fail, send, res, audit } = ctx;
  if (user.role !== "student") fail(403, "Only a student can make a repository private");
  if (!user.github_token) fail(400, "Link GitHub first");
  const body = await ctx.readJson(ctx.req);
  let projectId = Number(body.projectId || 0);
  let fullName = String(body.repo || "").trim();
  if (projectId) {
    const project = db.prepare("SELECT github_repo FROM projects WHERE id = ? AND owner_id = ?").get(projectId, user.id);
    if (!project?.github_repo) fail(404, "Project not found");
    fullName = project.github_repo;
  }
  const [login, repo] = fullName.split("/");
  if (!login || !repo || !isTeachforthRepo(repo)) fail(400, "That is not a TeachForth repository");
  if (String(user.github_login || "").toLowerCase() !== login.toLowerCase()) fail(403, "That repository is not on your GitHub account");
  return withLock(`private:${fullName.toLowerCase()}`, async () => {
    try {
      await gh(user.github_token, "PATCH", `/repos/${login}/${encodeURIComponent(repo)}`, { private: true, visibility: "private" });
    } catch (err) {
      if (/scope|delete_repo|admin rights|not accessible/i.test(err.message)) {
        fail(403, "Link GitHub again to allow making repositories private.");
      }
      throw err;
    }
    const monitor = await grantMonitor(user.github_token, `${login}/${repo}`);
    markRepoPrivate(user.id, `${login}/${repo}`);
    audit(user, "github_private", projectId || null, `${login}/${repo}`);
    send(res, 200, { private: true, repo: `${login}/${repo}`, monitor });
  });
}

function localRepo(db, ownerId, name) {
  return db.prepare(
    `SELECT p.*, u.name AS owner_name FROM projects p
     JOIN users u ON u.id = p.owner_id
     WHERE p.owner_id = ? AND p.kind = 'github' AND p.github_repo LIKE ?`,
  ).all(ownerId, `%/${name}`).find((row) => String(row.github_repo).split("/")[1] === name);
}

async function createRepo(token, name, description) {
  let created;
  try {
    created = await gh(token, "POST", "/user/repos", {
      name,
      description,
      private: true,
      visibility: "private",
      auto_init: false,
    });
  } catch (err) {
    if (err.status !== 422) throw err;
    const me = await gh(token, "GET", "/user");
    const existing = await gh(token, "GET", `/repos/${me.login}/${encodeURIComponent(name)}`, null, true);
    if (!existing?.full_name) fail(409, "That repository name is already used. Pick another name.");
    created = existing;
  }
  if (created?.full_name) await grantMonitor(token, created.full_name);
  return created;
}

export function keptLocalFiles(localFiles, flags, incoming) {
  const incomingPaths = new Set(incoming.map((file) => file.path));
  return localFiles.filter((file) => {
    if (incomingPaths.has(file.path)) return false;
    if (isHiddenFile(file.path)) return true;
    const flag = flags.get(file.path);
    return Boolean(flag?.hidden || flag?.skip_github);
  });
}

export async function pullIfGithubNewer(db, project) {
  if (project.kind !== "github" || !project.open || !project.github_repo) return false;
  const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(project.owner_id);
  if (!owner?.github_token) return false;
  if (!pace(`pull:${project.id}`, 1, 5_000)) return false;
  const [login, repo] = String(project.github_repo).split("/");
  if (!login || !repo) return false;
  try {
    const sha = await remoteHead(owner.github_token, login, repo);
    if (!sha || sha === project.github_sha) return false;
    const files = await pullRepo(owner.github_token, login, repo);
    if (!files.length) return false;
    return applyPulledFiles(db, project, files, sha);
  } catch (err) {
    console.error("pull-newer", project.id, err.publicMessage || err.message);
    return false;
  }
}

export function applyPulledFiles(db, project, files, sha) {
  if (!files?.length) return false;
  const local = db.prepare("SELECT path, content FROM files WHERE project_id = ?").all(project.id);
  const merged = mergePulled(local, loadBases(db, project.id), files, flagMap(db, project.id));
  if (merged.refused) return false;
  snapshotFiles(db, project.id);
  replaceProjectFiles(db, project, merged.files, merged.taken, sha, new Date().toISOString(), false);
  return true;
}

function replaceProjectFiles(db, project, files, taken, sha, now, opening) {
  ensureRecovery(db);
  const takenSet = new Set(taken || []);
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM files WHERE project_id = ?").run(project.id);
    const insert = db.prepare("INSERT INTO files (project_id, path, content, updated_at) VALUES (?, ?, ?, ?)");
    for (const file of files) insert.run(project.id, file.path, String(file.content ?? ""), now);
    rememberBases(db, project.id, files.filter((file) => takenSet.has(file.path)));
    if (opening) {
      db.prepare("UPDATE projects SET open = 1, github_sha = ?, updated_at = ? WHERE id = ?").run(sha || project.github_sha || "", now, project.id);
    } else {
      db.prepare("UPDATE projects SET github_sha = ?, revision = revision + 1, updated_at = ? WHERE id = ?").run(
        sha || project.github_sha || "",
        now,
        project.id,
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

async function remoteHead(token, owner, repo) {
  const info = await gh(token, "GET", `/repos/${owner}/${repo}`, null, true);
  if (!info) return "";
  const branch = info.default_branch || "main";
  const ref = await gh(token, "GET", `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, null, true);
  return ref?.object?.sha || "";
}

async function pullRepo(token, owner, repo) {
  const info = await gh(token, "GET", `/repos/${owner}/${repo}`);
  const branch = info.default_branch || "main";
  const tree = await gh(token, "GET", `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, null, true);
  if (!tree?.tree) return [];
  const files = [];
  for (const item of tree.tree || []) {
    if (item.type !== "blob" || item.size > 200_000) continue;
    if (!/^[\w./-]{1,120}$/.test(item.path) || item.path.includes("..")) continue;
    const blob = await gh(token, "GET", `/repos/${owner}/${repo}/git/blobs/${item.sha}`);
    if (blob.encoding !== "base64") continue;
    const content = Buffer.from(blob.content || "", "base64").toString("utf8");
    if (content.includes("\u0000")) continue;
    files.push({ path: item.path, content });
    if (files.length >= 40) break;
  }
  return files;
}

async function commitFiles(token, owner, repo, files, message) {
  const info = await gh(token, "GET", `/repos/${owner}/${repo}`);
  const branch = info.default_branch || "main";
  let ref = await gh(token, "GET", `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, null, true);
  if (!ref?.object?.sha) {
    const first = files[0];
    await gh(token, "PUT", `/repos/${owner}/${repo}/contents/${encodePath(first.path)}`, {
      message,
      content: Buffer.from(String(first.content ?? ""), "utf8").toString("base64"),
      branch,
    });
    ref = await gh(token, "GET", `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  }
  const treeItems = [];
  for (const file of files) {
    const blob = await gh(token, "POST", `/repos/${owner}/${repo}/git/blobs`, {
      content: String(file.content ?? ""),
      encoding: "utf-8",
    });
    treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await gh(token, "POST", `/repos/${owner}/${repo}/git/trees`, { tree: treeItems });
  const commit = await gh(token, "POST", `/repos/${owner}/${repo}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [ref.object.sha],
  });
  await gh(token, "PATCH", `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
  return { sha: commit.sha, url: info.html_url || `https://github.com/${owner}/${repo}` };
}

async function gh(token, method, path, body, allowMissing = false) {
  const id = createHash("sha256").update(String(token)).digest("hex").slice(0, 16);
  if (!pace(`gh:${id}`, 180, 10 * 60 * 1000)) fail(429, "GitHub is being asked for too much. Wait a minute and try again.");
  if (method !== "GET" && !pace(`gh-write:${id}`, 120, 10 * 60 * 1000)) {
    fail(429, "GitHub writes are paused for a minute so this account stays in good standing.");
  }
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "teachforth-ide",
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if ((response.status === 404 || response.status === 409) && allowMissing) return null;
  if (!response.ok) {
    const message = String(data.message || "GitHub request failed").slice(0, 160);
    console.error("github", method, path.split("?")[0], response.status, message);
    const status = response.status === 401 ? 401 : response.status === 422 ? 422 : 502;
    fail(status, message === "Bad credentials" ? "Link GitHub again" : message);
  }
  return data;
}

function withMarker(files, code) {
  const marker = teachforthMarker(code);
  return [{ path: ".teachforth", content: marker }, ...files.filter((file) => file.path !== ".teachforth")];
}

function studentCode(db, userId) {
  const row = db.prepare("SELECT github_code FROM users WHERE id = ?").get(userId);
  if (row?.github_code) return row.github_code;
  const code = `tf_${randomBytes(8).toString("hex")}`;
  db.prepare("UPDATE users SET github_code = ? WHERE id = ?").run(code, userId);
  return code;
}

function attachGithub(db, userId, profile, token) {
  const taken = db.prepare("SELECT id FROM users WHERE github_id = ? AND id != ?").get(String(profile.id), userId);
  if (taken) fail(409, "That GitHub account is already a TeachForth student");
  const githubName = String(profile.name || "").trim().slice(0, 80);
  db.prepare(
    "UPDATE users SET github_login = ?, github_id = ?, github_token = ?, github_avatar = ?, name = CASE WHEN ? != '' THEN ? ELSE name END WHERE id = ?",
  ).run(profile.login, String(profile.id), token, profile.avatar_url || "", githubName, githubName, userId);
  studentCode(db, userId);
}

async function primaryEmail(token) {
  try {
    const emails = await gh(token, "GET", "/user/emails", null, true);
    const primary = Array.isArray(emails) ? emails.find((item) => item.primary && item.verified) : null;
    return primary?.email || "";
  } catch {
    return "";
  }
}

async function readMarker(token, fullName) {
  const data = await gh(token, "GET", `/repos/${fullName}/contents/.teachforth`, null, true);
  if (!data?.content) return "";
  return Buffer.from(String(data.content).replaceAll("\n", ""), "base64").toString("utf8");
}

function encodePath(path) {
  return String(path).split("/").map((part) => encodeURIComponent(part)).join("/");
}

function starter(language) {
  return starterList(language === "python" ? "python" : "web");
}

function setting(db, key) {
  return db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value || "";
}

function putSetting(db, key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

function githubStateCookie(state, req) {
  const bits = ["tf_github=" + state, "HttpOnly", "SameSite=Lax", "Path=/api/github", "Max-Age=600"];
  if (cookieSecure(req)) bits.push("Secure");
  return bits.join("; ");
}

function clearGithubCookie(req) {
  const bits = ["tf_github=", "HttpOnly", "SameSite=Lax", "Path=/api/github", "Max-Age=0"];
  if (cookieSecure(req)) bits.push("Secure");
  return bits.join("; ");
}

function cookieSecure(req) {
  return process.env.COOKIE_SECURE === "1" || req.headers["x-forwarded-proto"] === "https";
}

function sameSecret(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function rememberCookie(res, value) {
  const prev = res.getHeader("set-cookie");
  const list = !prev ? [] : Array.isArray(prev) ? prev : [String(prev)];
  res.setHeader("Set-Cookie", [...list, value]);
}

function go(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  throw err;
}
