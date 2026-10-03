import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { canAccessProject, canSeeStudent, canViewProfile, isStaff } from "./org.js";
import { pace } from "./github.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_MS = 10 * 60 * 1000;

export function discordRoute(ctx, path) {
  if (!path.startsWith("/api/discord")) return false;
  const { req } = ctx;
  if (path === "/api/discord/claim" && req.method === "POST") return claim(ctx);
  if (path === "/api/discord/unlink" && req.method === "POST") return botUnlink(ctx);
  if (path === "/api/discord/profile" && req.method === "GET") return profile(ctx);
  if (path === "/api/discord/live" && req.method === "GET") return live(ctx);
  if (path === "/api/discord/lookup" && req.method === "GET") return lookup(ctx);
  if (path === "/api/discord/projects" && req.method === "GET") return projects(ctx);
  if (path === "/api/discord/share" && req.method === "GET") return share(ctx);
  if (path === "/api/discord/chapters" && req.method === "GET") return chapters(ctx);
  if (path === "/api/discord/usage" && req.method === "GET") return usage(ctx);
  if (path === "/api/discord/me" && req.method === "GET") return me(ctx);
  if (path === "/api/discord/me" && req.method === "DELETE") return unlinkMe(ctx);
  if (path === "/api/discord/code" && req.method === "POST") return makeCode(ctx);
  return false;
}

export function notifyDiscord(event) {
  const secret = readSecret();
  const url = process.env.DISCORD_EVENT_URL ?? "https://samsprojects.xyz/teachforth-discord/event";
  if (!secret || !url) return;
  const payload = publicEvent(event);
  if (!payload) return;
  const body = JSON.stringify(payload);
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-teachforth-discord": secret },
    body,
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}

function makeCode(ctx) {
  const { db, user, requireUser, send, fail } = ctx;
  requireUser(user);
  if (!pace(`discord-code:${user.id}`, 3, 10 * 60_000)) fail(429, "Wait a few minutes before making another code.");
  const code = newCode();
  const expires = new Date(Date.now() + CODE_MS).toISOString();
  db.prepare(
    `INSERT INTO discord_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at`,
  ).run(user.id, hashCode(code), expires);
  send(ctx.res, 200, { code, expiresAt: expires });
}

function me(ctx) {
  const { db, user, requireUser, send } = ctx;
  requireUser(user);
  const row = db.prepare("SELECT discord_id, discord_name FROM users WHERE id = ?").get(user.id);
  send(ctx.res, 200, { linked: Boolean(row?.discord_id), name: row?.discord_name || "" });
}

function unlinkMe(ctx) {
  const { db, user, requireUser, send, audit } = ctx;
  requireUser(user);
  const row = db.prepare("SELECT discord_id FROM users WHERE id = ?").get(user.id);
  clearLink(db, user.id);
  if (row?.discord_id) notifyDiscord({ type: "unlink", discordId: row.discord_id });
  audit(user, "discord.unlink", null, "");
  send(ctx.res, 200, { ok: true });
}

async function claim(ctx) {
  const { db, send, fail } = ctx;
  requireSecret(ctx);
  if (!pace("discord-claim", 20, 60_000)) fail(429, "Wait a minute.");
  const body = await ctx.readJson(ctx.req);
  const code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z2-9]/g, "");
  const discordId = snowflake(body.discordId);
  const discordName = plain(body.discordName, 32);
  if (!/^[A-Z2-9]{8}$/.test(code) || !discordId) fail(400, "That code is not valid");
  const row = db.prepare("SELECT user_id, expires_at FROM discord_codes WHERE code_hash = ?").get(hashCode(code));
  if (!row || Date.parse(row.expires_at) < Date.now()) fail(400, "That code expired. Make a new one in the IDE.");
  const taken = db.prepare("SELECT id FROM users WHERE discord_id = ? AND id != ?").get(discordId, row.user_id);
  if (taken) fail(409, "That Discord account is already linked to someone else.");
  db.prepare("UPDATE users SET discord_id = ?, discord_name = ? WHERE id = ?").run(discordId, discordName, row.user_id);
  db.prepare("DELETE FROM discord_codes WHERE user_id = ?").run(row.user_id);
  const user = db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(row.user_id);
  ctx.audit(user, "discord.link", null, discordId);
  send(ctx.res, 200, { name: user.name, role: user.role, discordId });
}

async function botUnlink(ctx) {
  const { db, send, fail } = ctx;
  requireSecret(ctx);
  const body = await ctx.readJson(ctx.req);
  const discordId = snowflake(body.discordId);
  if (!discordId) fail(400, "That Discord account is not valid");
  const user = db.prepare("SELECT id, role FROM users WHERE discord_id = ?").get(discordId);
  if (user) clearLink(db, user.id);
  send(ctx.res, 200, { ok: true });
}

function profile(ctx) {
  const user = linkedUser(ctx);
  ctx.send(ctx.res, 200, {
    name: user.name,
    role: user.role,
    githubLinked: Boolean(user.github_token),
    githubLogin: user.github_token ? user.github_login || "" : "",
  });
}

function live(ctx) {
  const user = linkedUser(ctx);
  if (!isStaff(user)) ctx.fail(403, "You cannot do that");
  const rows = ctx.db.prepare(
    `SELECT b.name AS block, t.name AS teacher, s.name AS student, s.id AS student_id
     FROM pairs p
     JOIN blocks b ON b.id = p.block_id
     JOIN users t ON t.id = p.teacher_id
     JOIN users s ON s.id = p.student_id
     WHERE b.status = 'live'
     ORDER BY b.name, s.name`,
  ).all().filter((row) => user.role === "admin" || canSeeStudent(ctx.db, user, row.student_id));
  ctx.send(ctx.res, 200, {
    pairs: rows.slice(0, 30).map((row) => ({ block: row.block, teacher: row.teacher, student: row.student })),
  });
}

function lookup(ctx) {
  const user = linkedUser(ctx);
  if (!isStaff(user)) ctx.fail(403, "You cannot do that");
  const q = safeLike(ctx.url?.searchParams.get("q") || "");
  if (q.length < 2) ctx.fail(400, "Type at least 2 letters");
  const rows = ctx.db.prepare(
    `SELECT id, name, email, role FROM users
     WHERE lower(name) LIKE ? OR lower(email) LIKE ?
     ORDER BY name LIMIT 20`,
  ).all(`%${q}%`, `%${q}%`);
  const people = rows.filter((row) => canOpenPerson(ctx.db, user, row)).slice(0, 5);
  ctx.send(ctx.res, 200, { people });
}

function projects(ctx) {
  const user = linkedUser(ctx);
  const rows = ctx.db.prepare(
    "SELECT id, title, language FROM projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 8",
  ).all(user.id);
  ctx.send(ctx.res, 200, { projects: rows });
}

function share(ctx) {
  const user = linkedUser(ctx);
  const q = safeLike(ctx.url?.searchParams.get("name") || "");
  if (q.length < 2) ctx.fail(400, "Type at least 2 letters of the project name");
  const rows = ctx.db.prepare(
    `SELECT p.id, p.title, p.language, p.kind, p.owner_id, u.name AS owner_name
     FROM projects p JOIN users u ON u.id = p.owner_id
     WHERE lower(p.title) LIKE ?
     ORDER BY p.updated_at DESC LIMIT 40`,
  ).all(`%${q}%`).filter((project) => canAccessProject(ctx.db, user, project)).slice(0, 5);
  ctx.send(ctx.res, 200, {
    matches: rows.map((project) => ({
      id: project.id,
      title: project.title,
      language: project.language,
      owner: project.owner_name,
    })),
  });
}

function chapters(ctx) {
  const user = linkedUser(ctx);
  if (!isStaff(user)) ctx.fail(403, "You cannot do that");
  const rows = ctx.db.prepare("SELECT name, place FROM chapters ORDER BY name LIMIT 20").all();
  ctx.send(ctx.res, 200, { chapters: rows });
}

function usage(ctx) {
  const user = linkedUser(ctx);
  if (user.role !== "admin") ctx.fail(403, "You cannot do that");
  const day = ctx.db.prepare("SELECT * FROM usage_days ORDER BY day DESC LIMIT 1").get() || {};
  ctx.send(ctx.res, 200, { day: day.day || "", requests: day.requests || 0, logins: day.logins || 0, editorOpens: day.editor_opens || 0 });
}

function linkedUser(ctx) {
  requireSecret(ctx);
  const discordId = snowflake(ctx.url?.searchParams.get("discordId"));
  if (!discordId) ctx.fail(400, "That Discord account is not valid");
  const user = ctx.db.prepare("SELECT * FROM users WHERE discord_id = ?").get(discordId);
  if (!user) ctx.fail(404, "This Discord account is not linked. Use /link with a code from the IDE.");
  return user;
}

function canOpenPerson(db, actor, person) {
  if (actor.role === "admin") return true;
  if (person.id === actor.id) return true;
  if (person.role !== "student") return isStaff(actor);
  return canViewProfile(db, actor, person.id) || canSeeStudent(db, actor, person.id);
}

function clearLink(db, userId) {
  db.prepare("UPDATE users SET discord_id = NULL, discord_name = '' WHERE id = ?").run(userId);
  db.prepare("DELETE FROM discord_codes WHERE user_id = ?").run(userId);
}

function requireSecret(ctx) {
  const secret = readSecret();
  const given = String(ctx.req.headers["x-teachforth-discord"] || "");
  if (!secret || !same(secret, given)) ctx.fail(401, "Sign in first");
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

function newCode() {
  return [...randomBytes(8)].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

function hashCode(code) {
  return createHash("sha256").update(code).digest("hex");
}

function snowflake(value) {
  const id = String(value || "");
  return /^\d{17,20}$/.test(id) ? id : "";
}

function plain(value, max) {
  return String(value || "").replace(/[\r\n\t]/g, " ").trim().slice(0, max);
}

function safeLike(value) {
  return String(value || "").trim().toLowerCase().replace(/[%_]/g, "").slice(0, 60);
}

function publicEvent(event) {
  if (!event || typeof event !== "object") return null;
  if (event.type === "login") {
    const role = ["admin", "chapter_lead", "teacher", "student"].includes(event.role) ? event.role : "student";
    return { type: "login", name: plain(event.name, 80), role };
  }
  if (event.type === "role" || event.type === "unlink") {
    const discordId = snowflake(event.discordId);
    if (!discordId) return null;
    return event.type === "role"
      ? { type: "role", discordId, role: String(event.role || "") }
      : { type: "unlink", discordId };
  }
  return null;
}
