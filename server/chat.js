import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const HELPER = (process.env.TEACHFORTH_HELPER_URL || "https://teachforthhelp.samsprojects.xyz").replace(/\/$/, "");

export function chatRoute(ctx, path) {
  if (!path.startsWith("/api/chat")) return false;
  if (ctx.req.method !== "POST") {
    ctx.fail(404, "Not found");
  }
  return handle(ctx, path);
}

async function handle(ctx, path) {
  const { user, requireUser, send, fail } = ctx;
  requireUser(user);
  if (!user.discord_id) fail(400, "Link Discord in your profile first.");
  const route = {
    "/api/chat/session": "/widget/session",
    "/api/chat/thread": "/widget/thread",
    "/api/chat/open": "/widget/open",
    "/api/chat/send": "/widget/send",
    "/api/chat/diagnostics": "/widget/diagnostics",
    "/api/chat/walk": "/widget/walk",
    "/api/chat/qualify": "/widget/qualify",
  }[path];
  if (!route) fail(404, "Not found");
  if (path === "/api/chat/qualify" && user.role === "student") fail(403, "That is for a teacher.");
  const body = await ctx.readJson(ctx.req);
  const secret = readSecret();
  if (!secret) fail(503, "Chat is not configured.");
  const payload = {
    discordId: String(user.discord_id),
    name: clip(user.name, 80),
    role: clip(user.role, 32),
    topic: clip(body.topic, 20).toLowerCase(),
    message: clip(body.message, 1800),
    text: clip(body.text, 1800),
    consent: body.consent === true,
    diagnostics: body.consent === true ? cleanDiagnostics(body.diagnostics) : null,
    channelId: clip(body.channelId, 24),
    action: clip(body.action, 48),
    targetId: clip(body.targetId, 24),
  };
  let response;
  try {
    response = await fetch(`${HELPER}${route}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-teachforth-discord": secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    fail(502, "The helpdesk did not answer. You can still message the TeachForth bot in Discord.");
  }
  const data = await response.json().catch(() => ({}));
  send(ctx.res, response.status, data && typeof data === "object" ? data : { error: "The helpdesk sent a bad reply." });
}

function clip(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanDiagnostics(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = JSON.stringify(raw).toLowerCase();
  if (text.includes("document.cookie") || text.includes("password") || text.includes("github_pat_")) return null;
  const out = {};
  for (const key of ["browser", "platform", "language", "timezone", "screen", "viewport", "userAgent"]) {
    const value = clip(raw[key], key === "userAgent" ? 180 : 48);
    if (value && !/cookie\s*[:=]/i.test(value)) out[key] = value;
  }
  for (const key of ["cookiesEnabled", "online", "touch", "doNotTrack"]) {
    if (typeof raw[key] === "boolean") out[key] = raw[key];
  }
  for (const key of ["cores", "memoryGb"]) {
    const number = Number(raw[key]);
    if (Number.isInteger(number) && number > 0 && number < 128) out[key] = number;
  }
  if (Array.isArray(raw.languages)) {
    out.languages = raw.languages.map((item) => clip(item, 24)).filter(Boolean).slice(0, 4);
  }
  return Object.keys(out).length ? out : null;
}

function readSecret() {
  const file = process.env.DISCORD_SECRET_FILE || join(process.env.DATA_DIR || "", "discord-secret");
  if (!file || !existsSync(file)) return "";
  return readFileSync(file, "utf8").trim();
}
