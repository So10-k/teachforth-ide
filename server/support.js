import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isStaff } from "./org.js";
import { createOwnedRepo, pace, peekFiles } from "./github.js";
import { isHiddenFile, normalizeTemplate, starterEntries } from "./templates.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_MS = 15 * 60 * 1000;
const GRANT_MS = 8 * 60 * 60 * 1000;
const SECRET_RE = /(?:ghp_|github_pat_|sk-|xox[baprs]-)[A-Za-z0-9_-]+/g;

export async function supportRoute(ctx, path) {
  if (path === "/api/discord/support-code" && ctx.req.method === "POST") return makeSupportCode(ctx);
  if (path === "/api/discord/support/redeem" && ctx.req.method === "POST") return redeem(ctx);
  if (path === "/api/discord/support/projects" && (ctx.req.method === "GET" || ctx.req.method === "POST")) return listProjects(ctx);
  if (path === "/api/discord/support/reports" && (ctx.req.method === "GET" || ctx.req.method === "POST")) return listReports(ctx);
  if (path === "/api/discord/support/chapters" && (ctx.req.method === "GET" || ctx.req.method === "POST")) return listChapters(ctx);
  if (path === "/api/discord/support/project" && ctx.req.method === "GET") return viewProject(ctx);
  if (path === "/api/discord/support/project" && ctx.req.method === "POST") return projectPost(ctx);
  return false;
}

function makeSupportCode(ctx) {
  const { db, user, requireUser, send, fail } = ctx;
  requireUser(user);
  if (!pace(`support-code:${user.id}`, 3, 10 * 60_000)) fail(429, "Wait a few minutes before making another support code.");
  const code = [...randomBytes(8)].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
  const expires = new Date(Date.now() + CODE_MS).toISOString();
  db.prepare(
    `INSERT INTO support_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at`,
  ).run(user.id, hash(code), expires);
  send(ctx.res, 200, { code, expiresAt: expires });
}

async function redeem(ctx) {
  const { db, send, fail } = ctx;
  requireSecret(ctx);
  if (!pace("support-redeem", 30, 60_000)) fail(429, "Wait a minute.");
  const body = await ctx.readJson(ctx.req);
  const code = cleanCode(body.code);
  const channelId = channel(body.channelId);
  const teacher = snowflake(body.teacherDiscordId);
  if (!code || !channelId) fail(400, "That support code is not valid");
  const row = db.prepare("SELECT user_id, expires_at FROM support_codes WHERE code_hash = ?").get(hash(code));
  if (!row || Date.parse(row.expires_at) < Date.now()) fail(400, "That code expired. Make a new support code in the profile. Link Discord is a different code.");
  db.prepare("DELETE FROM support_codes WHERE user_id = ?").run(row.user_id);
  const person = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
  if (!person) fail(404, "That account is gone");
  const token = randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + GRANT_MS).toISOString();
  db.prepare("DELETE FROM support_grants WHERE user_id = ? AND channel_id = ?").run(person.id, channelId);
  db.prepare(
    `INSERT INTO support_grants (token_hash, user_id, channel_id, teacher_discord_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(hash(token), person.id, channelId, teacher, expires, new Date().toISOString());
  const actor = staffByDiscord(db, teacher) || person;
  ctx.audit(actor, "support.consent", null, `channel ${channelId}`);
  send(ctx.res, 200, {
    grant: token,
    expiresAt: expires,
    person: publicPerson(person),
    projects: projectRows(db, person.id),
    chapters: chapterRows(db, person.id),
    reports: reportRows(db, person.id),
    pairs: pairRows(db, person.id),
  });
}

async function listProjects(ctx) {
  const person = await granted(ctx);
  ctx.send(ctx.res, 200, { person: publicPerson(person), projects: projectRows(ctx.db, person.id) });
}

async function listReports(ctx) {
  const person = await granted(ctx);
  ctx.audit(staffByDiscord(ctx.db, teacherOf(ctx)) || person, "support.reports", null, person.name);
  ctx.send(ctx.res, 200, { person: publicPerson(person), reports: reportRows(ctx.db, person.id) });
}

async function listChapters(ctx) {
  const person = await granted(ctx);
  ctx.send(ctx.res, 200, { person: publicPerson(person), chapters: chapterRows(ctx.db, person.id) });
}

async function projectPost(ctx) {
  requireSecret(ctx);
  const body = await ctx.readJson(ctx.req);
  ctx._support = body || {};
  if (Number(body?.id) > 0) return viewProject(ctx);
  return createProject(ctx);
}

async function viewProject(ctx) {
  const person = await granted(ctx);
  const id = Number(ctx._support?.id || ctx.url?.searchParams.get("id") || 0);
  const project = ownedProject(ctx, person, id);
  let peeked;
  try {
    peeked = await peekFiles(ctx.db, project);
  } catch {
    ctx.fail(502, "GitHub did not return those files. If the project is closed, have them open it in class.");
  }
  const actor = staffByDiscord(ctx.db, teacherOf(ctx)) || person;
  ctx.audit(actor, "support.view", project.id, `channel ${channel(ctx._support?.channelId || ctx.url?.searchParams.get("channelId"))}`);
  ctx.send(ctx.res, 200, {
    project: {
      id: project.id,
      title: project.title,
      language: project.language,
      open: Boolean(project.open),
      githubUrl: project.github_url || "",
      source: peeked.source,
    },
    files: (peeked.files || []).filter((file) => !isHiddenFile(file.path)).slice(0, 8).map((file) => ({
      path: String(file.path || "").slice(0, 120),
      content: scrub(file.content).slice(0, 4000),
      truncated: String(file.content || "").length > 4000,
    })),
  });
}

async function createProject(ctx) {
  requireSecret(ctx);
  const body = ctx._support || await ctx.readJson(ctx.req);
  ctx._support = body || {};
  const person = grantRow(ctx.db, body.grant, body.channelId);
  const title = String(body.title || "Blank").trim().slice(0, 80) || "Blank";
  const template = normalizeTemplate(body.template === "blank" ? "empty" : body.template || "empty");
  const actor = staffByDiscord(ctx.db, snowflake(body.teacherDiscordId)) || person;
  if (person.role === "student") {
    await createOwnedRepo({
      db: ctx.db,
      fail: ctx.fail,
      send: (_res, status, payload) => ctx.send(ctx.res, status, {
        reused: Boolean(payload?.reused),
        project: {
          id: payload?.project?.id,
          title: payload?.project?.title || title,
          language: payload?.project?.language || template,
          githubUrl: payload?.project?.githubUrl || "",
        },
      }),
      audit: ctx.audit,
      user: actor,
      projectView: (project) => ({
        id: project.id,
        title: project.title,
        language: project.language,
        githubUrl: project.github_url || "",
      }),
    }, person, { title, template, language: template });
    ctx.audit(actor, "support.create", null, `${title} channel ${channel(body.channelId)}`);
    return;
  }
  if (!isStaff(person)) ctx.fail(403, "That account cannot own a project");
  const now = new Date().toISOString();
  const id = Number(ctx.db.prepare(
    `INSERT INTO projects (owner_id, title, language, kind, open, created_at, updated_at)
     VALUES (?, ?, ?, 'sandbox', 1, ?, ?)`,
  ).run(person.id, title, template === "python" ? "python" : "web", now, now).lastInsertRowid);
  const insert = ctx.db.prepare("INSERT INTO files (project_id, path, content, updated_at) VALUES (?, ?, ?, ?)");
  for (const [path, content] of Object.entries(starterEntries(template))) {
    if (!isHiddenFile(path)) insert.run(id, path, content, now);
  }
  ctx.audit(actor, "support.create", id, title);
  ctx.send(ctx.res, 201, { project: { id, title, language: template, githubUrl: "" }, reused: false });
}

async function granted(ctx) {
  requireSecret(ctx);
  if (ctx._support) return grantRow(ctx.db, ctx._support.grant, ctx._support.channelId);
  if (ctx.req.method === "POST") {
    const body = await ctx.readJson(ctx.req);
    ctx._support = body || {};
    return grantRow(ctx.db, body?.grant, body?.channelId);
  }
  const params = ctx.url?.searchParams;
  return grantRow(ctx.db, params?.get("grant"), params?.get("channelId"));
}

function grantRow(db, token, channelId) {
  const key = String(token || "");
  const room = channel(channelId);
  if (key.length < 32 || !room) {
    const err = new Error("That support consent is missing");
    err.status = 401;
    err.publicMessage = err.message;
    throw err;
  }
  const row = db.prepare(
    `SELECT g.expires_at, u.* FROM support_grants g
     JOIN users u ON u.id = g.user_id
     WHERE g.token_hash = ? AND g.channel_id = ?`,
  ).get(hash(key), room);
  if (!row || Date.parse(row.expires_at) < Date.now()) {
    const err = new Error("That support code expired. Ask for a new one.");
    err.status = 401;
    err.publicMessage = err.message;
    throw err;
  }
  return row;
}

function ownedProject(ctx, person, id) {
  if (!Number.isInteger(id) || id < 1) ctx.fail(400, "Use a project ID from .projects");
  const project = ctx.db.prepare("SELECT * FROM projects WHERE id = ? AND owner_id = ?").get(id, person.id);
  if (!project) ctx.fail(404, "That project is not on this account");
  return project;
}

function projectRows(db, userId) {
  return db.prepare(
    `SELECT id, title, language, updated_at, open, github_url
     FROM projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 12`,
  ).all(userId).map((row) => ({
    id: row.id,
    title: row.title,
    language: row.language,
    updatedAt: row.updated_at,
    open: Boolean(row.open),
    githubUrl: row.github_url || "",
  }));
}

function reportRows(db, userId) {
  return db.prepare(
    `SELECT r.body, r.diff, r.created_at, u.name AS author, b.name AS block
     FROM reports r
     JOIN users u ON u.id = r.author_id
     LEFT JOIN blocks b ON b.id = r.block_id
     WHERE r.student_id = ?
     ORDER BY r.id DESC LIMIT 8`,
  ).all(userId).map((row) => ({
    author: row.author,
    block: row.block || "",
    body: scrub(row.body).slice(0, 500),
    diff: scrub(row.diff).slice(0, 500),
    createdAt: row.created_at,
  }));
}

function chapterRows(db, userId) {
  return db.prepare(
    `SELECT c.name, c.place FROM chapter_members m
     JOIN chapters c ON c.id = m.chapter_id
     WHERE m.user_id = ? ORDER BY c.name LIMIT 12`,
  ).all(userId).map((row) => ({ name: row.name, place: row.place || "" }));
}

function pairRows(db, userId) {
  return db.prepare(
    `SELECT b.name AS block, b.status, t.name AS teacher, s.name AS student
     FROM pairs p
     JOIN blocks b ON b.id = p.block_id
     JOIN users t ON t.id = p.teacher_id
     JOIN users s ON s.id = p.student_id
     WHERE p.student_id = ? OR p.teacher_id = ?
     ORDER BY p.created_at DESC LIMIT 6`,
  ).all(userId, userId).map((row) => ({
    block: row.block,
    status: row.status,
    teacher: row.teacher,
    student: row.student,
  }));
}

function publicPerson(person) {
  return {
    id: person.id,
    name: person.name,
    email: person.email || "",
    role: person.role,
    githubLinked: Boolean(person.github_token),
    githubLogin: person.github_token ? person.github_login || "" : "",
    discordName: person.discord_name || "",
  };
}

function staffByDiscord(db, discordId) {
  if (!discordId) return null;
  return db.prepare("SELECT * FROM users WHERE discord_id = ?").get(discordId) || null;
}

function teacherOf(ctx) {
  if (ctx._support) return snowflake(ctx._support.teacherDiscordId);
  return snowflake(ctx.url?.searchParams.get("teacherDiscordId"));
}

function requireSecret(ctx) {
  const given = String(ctx.req.headers["x-teachforth-discord"] || "");
  if (!readSecret() || !same(readSecret(), given)) ctx.fail(401, "Sign in first");
}

function readSecret() {
  const file = process.env.DISCORD_SECRET_FILE || join(process.env.DATA_DIR || "", "discord-secret");
  if (!file || !existsSync(file)) return "";
  return readFileSync(file, "utf8").trim();
}

function same(secret, given) {
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function cleanCode(value) {
  const code = String(value || "").trim().toUpperCase().replace(/[^A-Z2-9]/g, "");
  return /^[A-Z2-9]{8}$/.test(code) ? code : "";
}

function channel(value) {
  const id = String(value || "");
  return /^\d{17,20}$/.test(id) ? id : "";
}

function snowflake(value) {
  const id = String(value || "");
  return /^\d{17,20}$/.test(id) ? id : "";
}

function scrub(value) {
  return String(value || "").replace(SECRET_RE, "[removed]");
}
