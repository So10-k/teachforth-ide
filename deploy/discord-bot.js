import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import {
  COMMANDS,
  actorId,
  actorName,
  commandAllowed,
  helpText,
  optionValue,
  plain,
  shareCard,
  verifyDiscord,
} from "./discord-policy.js";
import { socketFor } from "./discord-ws.js";

const DATA = process.env.DATA_DIR || "/var/lib/teachforth-discord";
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8794);
const POWER_URL = process.env.POWER_URL || "http://127.0.0.1:8791";
const POWER_FILE = process.env.POWER_INTERNAL_FILE || join(DATA, "power-secret");
const CLASS_URL = (process.env.CLASS_URL || "http://74.248.20.108").replace(/\/$/, "");
const IDE_URL = (process.env.IDE_PUBLIC_URL || "https://74.248.20.108").replace(/\/$/, "");
const CONFIG_FILE = join(DATA, "config.json");
const ROLES_FILE = join(DATA, "roles.json");
const SECRET_FILE = join(DATA, "secret");
const hits = new Map();
const loginSeen = new Map();

mkdirSync(DATA, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, configured: configured() });
    }
    if (req.method === "GET" && url.pathname === "/setup") return setup(req, res);
    if (req.method === "POST" && url.pathname === "/event") return event(req, res);
    if (req.method === "POST" && url.pathname === "/interactions") return interaction(req, res);
    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, err.status || 500, { error: "Something went wrong" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TeachForth Helper on http://${HOST}:${PORT}`);
  register().catch(() => console.error("command register failed"));
  connectGateway();
});

async function interaction(req, res) {
  const raw = await readRaw(req);
  const config = loadConfig();
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  if (!verifyDiscord(config.publicKey, timestamp, raw, signature)) {
    return json(res, 401, { error: "Bad signature" });
  }
  const body = JSON.parse(raw);
  const payload = commandPayload(body);
  json(res, 200, payload.reply);
  if (payload.after) {
    const content = await payload.after();
    await followup(body.token, String(content).slice(0, 1800));
  }
}

function commandPayload(body) {
  const config = loadConfig();
  if (body.type === 1) return { reply: { type: 1 } };
  if (body.type !== 2) return { reply: { type: 4, data: { content: "That is not a command I know.", flags: 64 } } };
  if (config.guildId && body.guild_id !== config.guildId) {
    return { reply: { type: 4, data: { content: "Use this in the TeachForth server.", flags: 64 } } };
  }
  const name = body.data?.name || "";
  const id = actorId(body);
  if (!id || !pace(`cmd:${id}`, 8, 60_000)) {
    return { reply: { type: 4, data: { content: "Wait a minute and try again.", flags: 64 } } };
  }
  if (name === "ping") return { reply: { type: 4, data: { content: "TeachForth Helper is on.", flags: 64 } } };
  if (name === "help") return { reply: { type: 4, data: { content: helpText(cachedRole(id)), flags: 64 } } };
  return {
    reply: { type: 5, data: { flags: 64 } },
    after: () => run(name, body, id).catch(() => "Something went wrong."),
  };
}

async function run(name, body, id) {
  if (name === "status") return statusText(await power("GET", "/api/internal/status"));
  if (name === "link") return link(id, actorName(body), optionValue(body.data, "code"));
  const local = name === "power" || name === "logins";
  const role = local ? adminRole(id) : await liveRole(id);
  if (!local && role.off) return "The class server is off.";
  const current = local ? role : role.role;
  if (!commandAllowed(name, current)) {
    if (local) return "Only a linked admin can do that. Link once while the class server is on.";
    return current ? "You cannot do that." : "Link Discord first. Open the IDE, use the account menu, then /link.";
  }
  if (name === "unlink") return unlink(id);
  if (name === "whoami") return whoami(id);
  if (name === "github") return github(id);
  if (name === "projects") return projectList(id);
  if (name === "share") return share(id, body, optionValue(body.data, "name"));
  if (name === "live") return liveText(id);
  if (name === "lookup") return lookupText(id, optionValue(body.data, "name"));
  if (name === "chapters") return chapterText(id);
  if (name === "usage") return usageText(id);
  if (name === "power") return powerCommand(id, actorName(body), optionValue(body.data, "action"), optionValue(body.data, "minutes"));
  if (name === "logins") return logins(optionValue(body.data, "action"), body.channel_id);
  return "That is not a command I know.";
}

async function link(id, name, code) {
  if (!pace(`link:${id}`, 5, 10 * 60_000)) return "Wait a few minutes before trying another code.";
  const result = await classSend("POST", "/api/discord/claim", { code, discordId: id, discordName: name });
  if (result.status === 0) return "The class server is off. An admin can start it from the power panel, or with /power after they have linked once.";
  if (result.status !== 200) return plain(result.data.error || "That code did not work.", 180);
  remember(id, result.data.role);
  return `Linked as ${plain(result.data.name, 80)} (${plain(result.data.role, 20).replaceAll("_", " ")}).`;
}

async function unlink(id) {
  const result = await classSend("POST", "/api/discord/unlink", { discordId: id });
  if (result.status === 0) return "The class server is off, so the link could not be removed.";
  forget(id);
  return "Discord is unlinked.";
}

async function whoami(id) {
  const result = await classGet(`/api/discord/profile?discordId=${id}`);
  if (result.status !== 200) return classError(result);
  remember(id, result.data.role);
  return `${plain(result.data.name, 80)} · ${plain(result.data.role, 20).replaceAll("_", " ")}`;
}

async function github(id) {
  const result = await classGet(`/api/discord/profile?discordId=${id}`);
  if (result.status !== 200) return classError(result);
  remember(id, result.data.role);
  return result.data.githubLinked ? `GitHub is connected as @${plain(result.data.githubLogin, 40)}.` : "GitHub is not connected. Connect it from the IDE before saving a project.";
}

async function projectList(id) {
  const result = await classGet(`/api/discord/projects?discordId=${id}`);
  if (result.status !== 200) return classError(result);
  const rows = result.data.projects || [];
  if (!rows.length) return "No projects yet.";
  return rows.map((project) => `${plain(project.title, 60)} · ${plain(project.language, 16)}`).join("\n");
}

async function share(id, body, name) {
  const result = await classGet(`/api/discord/share?discordId=${id}&name=${encodeURIComponent(String(name || ""))}`);
  if (result.status !== 200) return classError(result);
  const matches = result.data.matches || [];
  if (!matches.length) return "No project you can open matches that.";
  if (matches.length > 1) return `More than one match:\n${matches.map((project) => plain(project.title, 60)).join("\n")}`;
  const project = matches[0];
  const url = `${IDE_URL}/#/project/${Number(project.id)}`;
  const posted = await discord(`channels/${body.channel_id}/messages`, {
    content: shareCard({ title: project.title, language: project.language, owner: project.owner, url }),
  });
  if (!posted.ok) return "I could not post in this channel.";
  return `Posted a sign-in link for ${plain(project.title, 60)}. No code was included.`;
}

async function liveText(id) {
  const result = await classGet(`/api/discord/live?discordId=${id}`);
  if (result.status !== 200) return classError(result);
  const pairs = result.data.pairs || [];
  if (!pairs.length) return "Nothing is live.";
  return pairs.map((pair) => `${plain(pair.block, 40)}: ${plain(pair.teacher, 40)} with ${plain(pair.student, 40)}`).join("\n");
}

async function lookupText(id, name) {
  const result = await classGet(`/api/discord/lookup?discordId=${id}&q=${encodeURIComponent(String(name || ""))}`);
  if (result.status !== 200) return classError(result);
  const people = result.data.people || [];
  if (!people.length) return "No match you can open.";
  return people.map((person) => `${plain(person.name, 40)} — ${plain(person.role, 20).replaceAll("_", " ")}\n${plain(person.email, 80)}`).join("\n");
}

async function chapterText(id) {
  const result = await classGet(`/api/discord/chapters?discordId=${id}`);
  if (result.status !== 200) return classError(result);
  const rows = result.data.chapters || [];
  if (!rows.length) return "No chapters yet.";
  return rows.map((chapter) => `${plain(chapter.name, 40)}${chapter.place ? ` · ${plain(chapter.place, 40)}` : ""}`).join("\n");
}

async function usageText(id) {
  const result = await classGet(`/api/discord/usage?discordId=${id}`);
  if (result.status !== 200) return classError(result);
  const row = result.data;
  return `${row.day || "No usage yet"}\nRequests ${row.requests || 0}\nSign-ins ${row.logins || 0}\nEditor opens ${row.editorOpens || 0}`;
}

async function powerCommand(id, name, action, minutes) {
  if (!pace(`power:${id}`, 2, 10 * 60_000)) return "Wait a few minutes before changing power again.";
  if (action === "off") {
    const result = await power("POST", "/api/internal/stop", {});
    if (!result.ok) return "The class server did not stop. Check the power panel.";
    await note(`${name} turned the class server off.`);
    return "Stopping the class server.";
  }
  const span = Number(minutes);
  if (!Number.isInteger(span) || span < 15 || span > 360) return "Add minutes from 15 to 360.";
  const path = action === "extend" ? "/api/internal/extend" : "/api/internal/start";
  const result = await power("POST", path, { minutes: span });
  if (!result.ok) return plain(result.data.error || "The class server did not change. Check the power panel.", 180);
  await note(`${name} set the class server ${action} for ${span} minutes.`);
  return statusText(result);
}

function logins(action, channelId) {
  const config = loadConfig();
  if (action === "status") return config.loginChannelId ? "Sign-ins are posted in the saved channel." : "Sign-ins are not posted yet. Use /logins here in the channel you want.";
  config.loginChannelId = action === "here" && /^\d{17,20}$/.test(String(channelId || "")) ? String(channelId) : "";
  saveConfig(config);
  return config.loginChannelId ? "Sign-ins will be posted in this channel. Names and roles only." : "Sign-in posts are off.";
}

async function event(req, res) {
  if (!sameSecret(String(req.headers["x-teachforth-discord"] || ""))) return json(res, 401, { error: "Sign in first" });
  if (!pace("events", 30, 60_000)) return json(res, 429, { error: "Slow down" });
  const body = await readJson(req);
  if (body.type === "login") {
    const key = `${plain(body.name, 80)}:${body.role}`;
    const last = loginSeen.get(key) || 0;
    if (Date.now() - last > 5 * 60_000) {
      loginSeen.set(key, Date.now());
      await note(`${plain(body.name, 80)} signed in as ${plain(body.role, 20).replaceAll("_", " ")}.`);
    }
  } else if (body.type === "unlink") forget(String(body.discordId || ""));
  else if (body.type === "role") remember(String(body.discordId || ""), body.role);
  else if (body.type === "guild") {
    const guildId = String(body.guildId || "").trim();
    if (guildId && !/^\d{17,20}$/.test(guildId)) return json(res, 400, { error: "That server ID is not valid" });
    const config = loadConfig();
    config.guildId = guildId;
    saveConfig(config);
    json(res, 200, { ok: true, guildId });
    register().catch(() => console.error("command register failed"));
    return;
  }
  json(res, 200, { ok: true });
}

function setup(req, res) {
  if (!sameSecret(String(req.headers["x-teachforth-discord"] || ""))) return json(res, 401, { error: "Sign in first" });
  const config = loadConfig();
  json(res, 200, { guildId: config.guildId, configured: configured() });
}

async function note(content) {
  const channel = loadConfig().loginChannelId;
  if (!channel) return;
  await discord(`channels/${channel}/messages`, { content: content.slice(0, 300) });
}

function statusText(result) {
  if (!result.ok) return "Power status is unavailable.";
  const state = result.data;
  const when = state.deadline ? String(state.deadline).replace("T", " ").slice(0, 16) + " UTC" : "No timer set.";
  if (state.phase === "on" || state.running) return `Class server is on.\n${when}`;
  if (state.phase === "starting") return `Class server is starting.\n${when}`;
  if (state.phase === "stopping") return "Class server is stopping.";
  return "Class server is off.";
}

function classError(result) {
  if (result.status === 0) return "The class server is off.";
  return plain(result.data.error || "That did not work.", 180);
}

async function liveRole(id) {
  const result = await classGet(`/api/discord/profile?discordId=${id}`);
  if (result.status === 0) return { role: cachedRole(id), off: true };
  if (result.status !== 200) return { role: "", off: false };
  remember(id, result.data.role);
  return { role: result.data.role, off: false };
}

function adminRole(id) {
  return cachedRole(id) === "admin" ? "admin" : "";
}

function cachedRole(id) {
  return readRoles()[id] || "";
}

function remember(id, role) {
  if (!/^\d{17,20}$/.test(id)) return;
  const roles = readRoles();
  if (["admin", "chapter_lead", "lead_teacher", "teacher", "student"].includes(role)) roles[id] = role;
  else delete roles[id];
  writeFileSync(ROLES_FILE, `${JSON.stringify(roles)}\n`, { mode: 0o600 });
}

function forget(id) {
  remember(id, "");
}

function readRoles() {
  try {
    const rows = JSON.parse(readFileSync(ROLES_FILE, "utf8"));
    return rows && typeof rows === "object" && !Array.isArray(rows) ? rows : {};
  } catch {
    return {};
  }
}

async function classGet(path) {
  return classSend("GET", path);
}

async function classSend(method, path, body) {
  const secret = readSecret();
  if (!secret) return { status: 0, data: { error: "The class server is off." } };
  try {
    const res = await fetch(`${CLASS_URL}${path}`, {
      method,
      headers: { "x-teachforth-discord": secret, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(4000),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  } catch {
    return { status: 0, data: { error: "The class server is off." } };
  }
}

async function power(method, path, body) {
  const secret = readFile(POWER_FILE);
  if (!secret) return { ok: false, data: {} };
  try {
    const res = await fetch(`${POWER_URL}${path}`, {
      method,
      headers: { authorization: `Bearer ${secret}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: {} };
  }
}

async function discord(path, body) {
  const token = loadConfig().token;
  if (!token) return { ok: false };
  const res = await fetch(`https://discord.com/api/v10/${path}`, {
    method: "POST",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return { ok: res.ok, status: res.status };
}

async function followup(token, content) {
  const config = loadConfig();
  if (!config.token || !config.applicationId || !token) return;
  await fetch(`https://discord.com/api/v10/webhooks/${config.applicationId}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { authorization: `Bot ${config.token}`, "content-type": "application/json" },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

async function register() {
  const config = loadConfig();
  if (!config.token || !config.applicationId) return;
  if (config.guildId) {
    await putCommands(`/applications/${config.applicationId}/guilds/${config.guildId}/commands`, COMMANDS);
    await putCommands(`/applications/${config.applicationId}/commands`, []);
    return;
  }
  await putCommands(`/applications/${config.applicationId}/commands`, COMMANDS);
}

async function putCommands(path, commands) {
  const config = loadConfig();
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method: "PUT",
    headers: { authorization: `Bot ${config.token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(8000),
  });
  console.log("commands", res.status);
}

function configured() {
  const config = loadConfig();
  return Boolean(config.token && config.publicKey && config.applicationId);
}

function loadConfig() {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    return {
      token: String(parsed.token || ""),
      publicKey: String(parsed.publicKey || ""),
      applicationId: String(parsed.applicationId || ""),
      guildId: String(parsed.guildId || ""),
      loginChannelId: String(parsed.loginChannelId || ""),
    };
  } catch {
    return { token: "", publicKey: "", applicationId: "", guildId: "", loginChannelId: "" };
  }
}

function saveConfig(config) {
  writeFileSync(CONFIG_FILE, `${JSON.stringify(config)}\n`, { mode: 0o600 });
}

function sameSecret(given) {
  const secret = readSecret();
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function readSecret() {
  return readFile(SECRET_FILE);
}

function readFile(file) {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

function pace(key, limit, windowMs) {
  const now = Date.now();
  const prev = (hits.get(key) || []).filter((at) => now - at < windowMs);
  if (prev.length >= limit) return false;
  prev.push(now);
  hits.set(key, prev);
  return true;
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65536) {
        req.destroy();
        reject(Object.assign(new Error("too big"), { status: 413 }));
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readJson(req) {
  return readRaw(req).then((raw) => JSON.parse(raw || "{}"));
}

let gatewayStop = false;
let gatewayLive = false;
let gatewayTries = 0;
let gatewayTimer;

function connectGateway() {
  const config = loadConfig();
  if (gatewayStop || gatewayLive || !config.token) return;
  gatewayLive = true;
  let ws;
  try {
    ws = socketFor("wss://gateway.discord.gg/?v=10&encoding=json");
  } catch {
    gatewayLive = false;
    scheduleGateway();
    return;
  }
  let heartbeat;
  let firstBeat;
  let seq = null;
  const stopBeat = () => {
    clearTimeout(firstBeat);
    clearInterval(heartbeat);
    heartbeat = null;
  };
  ws.addEventListener("message", (event) => {
    let packet;
    try {
      packet = JSON.parse(event.data);
    } catch {
      return;
    }
    if (packet.s != null) seq = packet.s;
    if (packet.op === 10) {
      stopBeat();
      gatewayTries = 0;
      const beat = () => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ op: 1, d: seq }));
      };
      const wait = Math.max(1000, Math.floor(Number(packet.d?.heartbeat_interval || 45000) * Math.random()));
      firstBeat = setTimeout(() => {
        beat();
        heartbeat = setInterval(beat, Number(packet.d?.heartbeat_interval || 45000));
      }, wait);
      ws.send(JSON.stringify({
        op: 2,
        d: {
          token: config.token,
          intents: 1,
          properties: { os: "linux", browser: "teachforth", device: "teachforth" },
        },
      }));
    } else if (packet.op === 0 && packet.t === "READY") {
      console.log("discord gateway ready");
    } else if (packet.op === 0 && packet.t === "INTERACTION_CREATE") {
      gatewayCommand(packet.d).catch(() => {});
    } else if (packet.op === 7 || packet.op === 9) {
      ws.close();
    }
  });
  ws.addEventListener("close", (event) => {
    stopBeat();
    gatewayLive = false;
    const code = Number(event.code || 0);
    if (code === 4004 || (code >= 4010 && code <= 4014)) {
      gatewayStop = true;
      console.error("discord login failed");
      return;
    }
    gatewayTries += 1;
    if (gatewayTries > 8) {
      gatewayStop = true;
      console.error("discord gateway stopped");
      return;
    }
    scheduleGateway();
  });
  ws.addEventListener("error", () => ws.close());
}

function scheduleGateway() {
  clearTimeout(gatewayTimer);
  gatewayTimer = setTimeout(connectGateway, Math.min(60_000, 5000 * Math.max(1, gatewayTries)));
}

async function gatewayCommand(body) {
  const payload = commandPayload(body);
  const res = await fetch(`https://discord.com/api/v10/interactions/${body.id}/${body.token}/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload.reply),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok || !payload.after) return;
  const content = await payload.after();
  await followup(body.token, String(content).slice(0, 1800));
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}
