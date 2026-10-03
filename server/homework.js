import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commitStudentProject, pace, projectMarker } from "./github.js";
import { commitFileList, isLeadPlus } from "./controls.js";
import { isHiddenFile } from "./templates.js";

const HOME_PUSH_URL = process.env.HOME_PUSH_URL || "https://samsprojects.xyz/teachforth-home/push";
const HOME_PUBLIC = (process.env.HOME_PUBLIC_URL || "https://samsprojects.xyz/teachforth-home/s").replace(/\/$/, "");
let tokenFile = process.env.HOME_TOKEN_FILE || "";

export function configureHome(dataDir) {
  if (!tokenFile) tokenFile = join(dataDir, "home-token");
}

export function ensureHome(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS home_links (
      project_id INTEGER PRIMARY KEY,
      token TEXT NOT NULL,
      url TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL
    );
  `);
}

export function homeView(db, projectId) {
  const row = db.prepare("SELECT url, expires_at FROM home_links WHERE project_id = ?").get(projectId);
  if (!row || row.expires_at <= new Date().toISOString()) return null;
  return { url: row.url, expiresAt: row.expires_at };
}

export async function createHomeLink(db, user, project, files, hours) {
  if (project.owner_role !== "student" || !isLeadPlus(db, user, project.owner_id)) {
    fail(403, "Only a session lead can do that");
  }
  if (project.kind !== "github" || !project.github_repo) fail(400, "This project is not linked to GitHub");
  const span = Math.round(Number(hours));
  if (!Number.isFinite(span) || span < 1 || span > 168) fail(400, "Pick 1 to 168 hours");
  if (!pace(`home:${project.id}`, 1, 30_000)) fail(429, "A home link was just made. Wait a few seconds.");
  const secret = homeSecret();
  if (!secret) fail(503, "Home links are not configured");
  const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(project.owner_id);
  if (!owner?.github_token) fail(400, "The student has not linked GitHub");
  const who = user.github_login || user.email || user.name;
  await commitStudentProject(db, user, project, files, {
    force: true,
    keep: true,
    message: `TeachForth home link by ${who}`,
  });
  const fresh = db.prepare("SELECT path, content FROM files WHERE project_id = ?").all(project.id);
  const bundle = commitFileList(db, project.id, fresh).filter((file) => !isHiddenFile(file.path));
  const id = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + span * 60 * 60 * 1000).toISOString();
  const old = db.prepare("SELECT token FROM home_links WHERE project_id = ?").get(project.id);
  if (old?.token) {
    await pushHome("DELETE", `?id=${encodeURIComponent(old.token)}`, null, secret).catch(() => {});
  }
  await pushHome("POST", "", {
    id,
    projectId: project.id,
    title: project.title,
    language: project.language,
    githubRepo: project.github_repo,
    githubUrl: project.github_url || "",
    expiresAt,
    token: owner.github_token,
    marker: projectMarker(db, owner.id),
    files: bundle.map((file) => ({ path: file.path, content: file.content })),
  }, secret);
  const url = `${HOME_PUBLIC}/${id}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO home_links (project_id, token, url, expires_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       token = excluded.token, url = excluded.url, expires_at = excluded.expires_at,
       created_by = excluded.created_by, created_at = excluded.created_at`,
  ).run(project.id, id, url, expiresAt, user.id, now);
  return { url, expiresAt };
}

export async function endHomeLink(db, user, project) {
  if (project.owner_role !== "student" || !isLeadPlus(db, user, project.owner_id)) {
    fail(403, "Only a session lead can do that");
  }
  const row = db.prepare("SELECT token FROM home_links WHERE project_id = ?").get(project.id);
  if (!row) return { ok: true };
  const secret = homeSecret();
  if (!secret) fail(503, "Home links are not configured");
  await pushHome("DELETE", `?id=${encodeURIComponent(row.token)}`, null, secret);
  db.prepare("DELETE FROM home_links WHERE project_id = ?").run(project.id);
  return { ok: true };
}

export async function endAllHomeLinks(db) {
  const rows = db.prepare("SELECT project_id, token FROM home_links").all();
  if (!rows.length) return { ended: 0, failed: 0 };
  const secret = homeSecret();
  if (!secret) return { ended: 0, failed: rows.length };
  let ended = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await pushHome("DELETE", `?id=${encodeURIComponent(row.token)}`, null, secret);
      db.prepare("DELETE FROM home_links WHERE project_id = ?").run(row.project_id);
      ended += 1;
    } catch {
      failed += 1;
    }
  }
  return { ended, failed };
}

function homeSecret() {
  if (process.env.HOME_PUSH_TOKEN) return process.env.HOME_PUSH_TOKEN.trim();
  if (!tokenFile || !existsSync(tokenFile)) return "";
  return readFileSync(tokenFile, "utf8").trim();
}

async function pushHome(method, search, body, secret) {
  let response;
  try {
    response = await fetch(`${HOME_PUSH_URL}${search}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-teachforth-token": secret,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    fail(502, "The home host did not answer");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) fail(502, String(data.error || "The home host did not accept the link").slice(0, 160));
  return data;
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  throw err;
}
