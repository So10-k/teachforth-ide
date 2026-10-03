import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import {
  COMMANDS,
  actorId,
  actorName,
  buttons,
  card,
  commandAllowed,
  helpText,
  languageLabel,
  messageData,
  optionValue,
  plain,
  roleLabel,
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
    const message = await payload.after();
    await followup(body.token, message);
  }
}

function commandPayload(body) {
  const config = loadConfig();
  if (body.type === 1) return { reply: { type: 1 } };
  if (body.type !== 2) return now(say("I don't know that one", "Try /class or /help."));
  if (config.guildId && body.guild_id !== config.guildId) {
    return now(say("Wrong server", "Use me in the TeachForth Discord."));
  }
  const name = body.data?.name || "";
  const id = actorId(body);
  if (!id || !pace(`cmd:${id}`, 8, 60_000)) return now(say("Slow down", "Give it a minute, then try again."));
  if (name === "help") return now(helpMessage(cachedRole(id)));
  return {
    reply: { type: 5, data: { flags: 64 } },
    after: () => run(name, body, id).catch(() => say("That got stuck", "Try again in a minute.")),
  };
}

async function run(name, body, id) {
  const command = { status: "class", ping: "class", whoami: "me", github: "me", lookup: "find" }[name] || name;
  if (command === "class") {
    const status = await power("GET", "/api/internal/status");
    const phase = status.data?.phase;
    const context = !status.ok || phase === "off" ? null : await classContext(id);
    return classCard(status, context);
  }
  if (command === "link") return link(id, actorName(body), optionValue(body.data, "code"));
  if (name === "chapters" || name === "usage") return say("That one's gone", "Try /class, /find, or /projects.");
  const local = command === "power" || command === "logins";
  const role = local ? { role: adminRole(id), off: false } : await liveRole(id);
  if (!local && role.off && command !== "power") {
    return say("Class is off", "I can still tell you if class is on with /class. Projects and people show up once it's running.");
  }
  const current = role.role;
  if (!commandAllowed(command, current)) {
    if (local) return say("Link an admin first", "Link once while class is on. After that, you can start it from here even when it's off.");
    return current ? say("That's not yours", "You can only open people and projects you're allowed to see.") : say("Link your account", "Open the IDE, grab a code from the account menu, then use /link.");
  }
  if (command === "unlink") return unlink(id);
  if (command === "me") return meCard(id);
  if (command === "projects") return projectList(id);
  if (command === "share") return share(id, body, optionValue(body.data, "name"));
  if (command === "live") return liveText(id);
  if (command === "find") return findText(id, optionValue(body.data, "name"));
  if (command === "home") return homeLink(id, optionValue(body.data, "student"), optionValue(body.data, "project"), optionValue(body.data, "hours"));
  if (command === "power") return powerCommand(id, actorName(body), optionValue(body.data, "action"), optionValue(body.data, "minutes"));
  if (command === "logins") return logins(optionValue(body.data, "action"), body.channel_id);
  return say("I don't know that one", "Try /class or /help.");
}

async function link(id, name, code) {
  if (!pace(`link:${id}`, 5, 10 * 60_000)) return say("Slow down", "Wait a few minutes before trying another code.");
  const result = await classSend("POST", "/api/discord/claim", { code, discordId: id, discordName: name });
  if (result.status === 0) return say("Class is off", "I can't link anyone until class is running. An admin can start it with /power.");
  if (result.status !== 200) return say("That code didn't work", "Make a new one from the account menu in the IDE. Codes last 10 minutes.");
  remember(id, result.data.role);
  const role = result.data.role;
  return say(`You're in, ${plain(result.data.name, 60)}`, role === "student"
    ? "This Discord account is your student login. Connect GitHub in the IDE if you haven't yet."
    : `You're linked as a ${roleLabel(role).toLowerCase()}. You can find students and see who's live from here.`, [
    { label: "Open IDE", url: IDE_URL },
  ]);
}

async function unlink(id) {
  const result = await classSend("POST", "/api/discord/unlink", { discordId: id });
  if (result.status === 0) return say("Class is off", "I can't remove the link until class is running.");
  forget(id);
  return say("Unlinked", "This Discord account isn't connected to TeachForth anymore.");
}

async function meCard(id) {
  const result = await classGet(`/api/discord/profile?discordId=${id}`);
  if (result.status !== 200) return fromApi(result);
  remember(id, result.data.role);
  const row = result.data;
  const github = row.githubLinked ? `GitHub @${plain(row.githubLogin, 32)}` : "GitHub isn't connected yet";
  const count = Number(row.projectCount || 0);
  return say(row.name, `${roleLabel(row.role)}. ${github}.`, [
    { label: "Open IDE", url: IDE_URL },
    { label: "My page", url: personUrl(row.id) },
  ], [{ name: "Projects", value: count ? `${count} saved` : "None yet", inline: true }]);
}

async function projectList(id) {
  const result = await classGet(`/api/discord/projects?discordId=${id}`);
  if (result.status !== 200) return fromApi(result);
  const rows = result.data.projects || [];
  if (!rows.length) return say("No projects yet", "Start one in the IDE. It'll show up here once it has a name.", [{ label: "Open IDE", url: IDE_URL }]);
  return {
    embeds: [card({
      title: "Your projects",
      description: "The last few you touched. Open one.",
      fields: rows.slice(0, 5).map((project) => ({
        name: project.title,
        value: `${languageLabel(project.language)} · ${ago(project.updatedAt)}`,
        inline: true,
      })),
      footer: "TeachForth",
    })],
    components: buttons(rows.slice(0, 5).map((project) => ({ label: project.title, url: projectUrl(project.id) }))),
    ephemeral: true,
  };
}

async function share(id, body, name) {
  const result = await classGet(`/api/discord/share?discordId=${id}&name=${encodeURIComponent(String(name || ""))}`);
  if (result.status !== 200) return fromApi(result, "No project by that name");
  const matches = result.data.matches || [];
  if (!matches.length) return say("Nothing matched", "Try a longer piece of the project name.");
  if (matches.length > 1) {
    return {
      embeds: [card({
        title: "Which project?",
        description: "A few match. Open one, or use the full name and I'll post it here.",
        footer: "TeachForth",
      })],
      components: buttons(matches.slice(0, 5).map((project) => ({ label: project.title, url: projectUrl(project.id) }))),
      ephemeral: true,
    };
  }
  const project = matches[0];
  const url = projectUrl(project.id);
  const row = buttons([{ label: "Open project", url }]);
  const posted = await discord(`channels/${body.channel_id}/messages`, {
    embeds: [shareCard({ title: project.title, language: project.language, owner: project.owner, url })],
    ...(row.length ? { components: row } : {}),
  });
  if (!posted.ok) return say("I can't post here", "I need permission to send messages in this channel.");
  return say("Shared", `${plain(project.title, 60)} is in the channel. People still have to sign in.`);
}

async function liveText(id) {
  const result = await classGet(`/api/discord/live?discordId=${id}`);
  if (result.status !== 200) return fromApi(result);
  const pairs = result.data.pairs || [];
  if (!pairs.length) return say("Nobody's live", "When a block starts, the pairs show up here.", [{ label: "Open IDE", url: IDE_URL }]);
  return {
    embeds: [card({
      title: "Live right now",
      description: pairs.length === 1 ? `${plain(pairs[0].teacher, 40)} is with ${plain(pairs[0].student, 40)}.` : "These blocks are going.",
      fields: pairs.slice(0, 8).map((pair) => ({ name: pair.block || "Block", value: `${plain(pair.teacher, 40)} with ${plain(pair.student, 40)}` })),
      footer: "TeachForth",
    })],
    components: buttons(pairs.slice(0, 5).map((pair) => ({ label: pair.student, url: personUrl(pair.studentId) }))),
    ephemeral: true,
  };
}

async function findText(id, name) {
  const result = await classGet(`/api/discord/lookup?discordId=${id}&q=${encodeURIComponent(String(name || ""))}`);
  if (result.status !== 200) return fromApi(result, "Couldn't find them");
  const people = result.data.people || [];
  if (!people.length) return say("Couldn't find them", "No one by that name that you can open.");
  if (people.length === 1) {
    const person = people[0];
    const fields = [{ name: "Role", value: roleLabel(person.role), inline: true }];
    if (person.githubLogin) fields.push({ name: "GitHub", value: `@${plain(person.githubLogin, 32)}`, inline: true });
    if (person.email) fields.push({ name: "Email", value: plain(person.email, 80) });
    return say(person.name, "Open their page to see past work.", [{ label: "Open page", url: personUrl(person.id) }], fields);
  }
  return {
    embeds: [card({
      title: "A few people match",
      description: "Open the one you meant.",
      fields: people.slice(0, 5).map((person) => ({ name: person.name, value: roleLabel(person.role), inline: true })),
      footer: "TeachForth",
    })],
    components: buttons(people.slice(0, 5).map((person) => ({ label: person.name, url: personUrl(person.id) }))),
    ephemeral: true,
  };
}

async function homeLink(id, student, project, hours) {
  if (!pace(`home:${id}`, 3, 10 * 60_000)) return say("Slow down", "Wait a few minutes before making another home link.");
  const span = Number(hours);
  if (!Number.isInteger(span) || span < 1 || span > 168) return say("How long?", "Tell me a length between 1 and 168 hours.");
  const result = await classSend("POST", `/api/discord/home?discordId=${id}`, {
    student: String(student || ""),
    project: String(project || ""),
    hours: span,
  }, 25000);
  if (result.status !== 200) return fromApi(result, "Couldn't send them home");
  if (result.data.choices?.length) {
    return say("Which one?", result.data.choices.map((item) => plain(item, 60)).join("\n"));
  }
  const url = String(result.data.url || "");
  const title = plain(result.data.title, 60);
  const who = plain(result.data.student, 40);
  const row = buttons([{ label: "Open your project", url }]);
  const sent = await dm(result.data.discordId, {
    embeds: [card({
      title: "You can work from home",
      description: `${title || "Your project"} is open until the time below. This link is just for you.`,
      timestamp: stamp(result.data.expiresAt),
      footer: "TeachForth",
    })],
    ...(row.length ? { components: row } : {}),
  });
  if (sent) return say(`Sent to ${who}`, `${title} is open until the time below. I messaged them the link.`, [], [], stamp(result.data.expiresAt));
  return say(`${who} can work from home`, `I couldn't message them, so send this yourself. Don't put it in a public channel.\n${url}`, [
    { label: "Open home IDE", url },
  ], [], stamp(result.data.expiresAt));
}

async function powerCommand(id, name, action, minutes) {
  if (!pace(`power:${id}`, 2, 10 * 60_000)) return say("Slow down", "Wait a few minutes before changing power again.");
  if (action === "off") {
    const result = await power("POST", "/api/internal/stop", {});
    if (!result.ok) return say("It didn't stop", "Check the power panel.");
    await note("Class is shutting down", `${plain(name, 40)} turned it off.`);
    return classCard(result);
  }
  const span = Number(minutes);
  if (!Number.isInteger(span) || span < 15 || span > 360) return say("How long?", "Add a length from 15 to 360 minutes. For example, /power on 90.");
  const path = action === "extend" ? "/api/internal/extend" : "/api/internal/start";
  const result = await power("POST", path, { minutes: span });
  if (!result.ok) return say("Class didn't change", plain(result.data.error || "Check the power panel.", 180));
  await note(action === "extend" ? "Class was extended" : "Class is starting", `${plain(name, 40)} set it for ${span} minutes.`);
  return classCard(result);
}

function logins(action, channelId) {
  const config = loadConfig();
  if (action === "status") {
    return config.loginChannelId
      ? say("Sign-ins are on", "They show up in the saved channel. Names and roles only.")
      : say("Sign-ins are off", "Use /logins here in the channel you want.");
  }
  config.loginChannelId = action === "here" && /^\d{17,20}$/.test(String(channelId || "")) ? String(channelId) : "";
  saveConfig(config);
  return config.loginChannelId
    ? say("Sign-ins will show up here", "Names and roles only. No emails, no code.")
    : say("Sign-in posts are off", "I won't post them until you pick a channel.");
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
      await note(`${plain(body.name, 80)} signed in`, roleLabel(body.role));
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

async function note(title, description) {
  const channel = loadConfig().loginChannelId;
  if (!channel) return;
  await discord(`channels/${channel}/messages`, {
    embeds: [card({ title, description, footer: "TeachForth" })],
  });
}

async function classContext(id) {
  if (!cachedRole(id)) return null;
  const result = await classGet(`/api/discord/class?discordId=${id}`);
  if (result.status !== 200) return null;
  remember(id, result.data.role);
  return result.data;
}

function classCard(result, context) {
  if (!result?.ok) return say("I can't see class", "The power panel didn't answer. Try again in a minute.");
  const state = result.data || {};
  const phase = state.phase || (state.running ? "on" : "off");
  const when = stamp(state.deadline);
  let title = "Class is off";
  let description = "Nothing's running. An admin can start it with /power.";
  if (phase === "on" || state.running) {
    title = "Class is on";
    description = when ? "Jump in whenever. It turns off at the time below." : "Jump in whenever.";
  } else if (phase === "starting") {
    title = "Class is starting";
    description = when ? "Give it a minute. It stays up until the time below." : "Give it a minute.";
  } else if (phase === "stopping") {
    title = "Class is shutting down";
    description = "Finish what you're on. It won't be up much longer.";
  }
  const fields = [];
  if (context?.pair) {
    const mine = context.role === "student" ? context.pair.teacher : context.pair.student;
    fields.push({ name: "You're with", value: `${plain(mine, 40)} · ${plain(context.pair.block, 40)}` });
  }
  const others = (context?.pairs || []).filter((pair) => pair.studentId !== context?.pair?.studentId).slice(0, 6);
  if (others.length) {
    fields.push({
      name: "Also live",
      value: others.map((pair) => `${plain(pair.teacher, 24)} with ${plain(pair.student, 24)}`).join("\n"),
    });
  }
  const links = [];
  if (phase === "on" || phase === "starting" || state.running) links.push({ label: "Open IDE", url: IDE_URL });
  if (context?.pair && context.role !== "student") links.push({ label: context.pair.student, url: personUrl(context.pair.studentId) });
  return say(title, description, links, fields, phase === "off" ? "" : when);
}

function now(message) {
  return { reply: { type: 4, data: messageData(message) } };
}

function say(title, description, links = [], fields = [], timestamp = "") {
  return {
    embeds: [card({ title, description, fields, footer: "TeachForth", timestamp: timestamp || undefined })],
    components: buttons(links),
    ephemeral: true,
  };
}

function helpMessage(role) {
  return say("Here's what I can do", helpText(role), [{ label: "Open IDE", url: IDE_URL }]);
}

function fromApi(result, title = "That didn't work") {
  if (result.status === 0) return say("Class is off", "I can't see that until class is running. An admin can start it with /power.");
  if (result.status === 404 && /not linked/i.test(result.data?.error || "")) {
    return say("Link your account", "Open the IDE, grab a code from the account menu, then use /link.");
  }
  return say(title, plain(result.data?.error || "Try again in a minute.", 180));
}

function projectUrl(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? `${IDE_URL}/#/project/${n}` : "";
}

function personUrl(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? `${IDE_URL}/#/person/${n}` : "";
}

function ago(iso) {
  const then = Date.parse(iso || "");
  if (!Number.isFinite(then)) return "saved";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function stamp(iso) {
  const then = Date.parse(iso || "");
  return Number.isFinite(then) ? new Date(then).toISOString() : "";
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

async function classSend(method, path, body, timeout = 4000) {
  const secret = readSecret();
  if (!secret) return { status: 0, data: { error: "The class server is off." } };
  try {
    const res = await fetch(`${CLASS_URL}${path}`, {
      method,
      headers: { "x-teachforth-discord": secret, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
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
  if (!token) return { ok: false, data: {} };
  const res = await fetch(`https://discord.com/api/v10/${path}`, {
    method: "POST",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

async function dm(userId, payload) {
  if (!/^\d{17,20}$/.test(String(userId || ""))) return false;
  const channel = await discord("users/@me/channels", { recipient_id: String(userId) });
  const channelId = String(channel.data?.id || "");
  if (!channel.ok || !/^\d{17,20}$/.test(channelId)) return false;
  const sent = await discord(`channels/${channelId}/messages`, payload);
  return sent.ok;
}

async function followup(token, message) {
  const config = loadConfig();
  if (!config.token || !config.applicationId || !token) return;
  await fetch(`https://discord.com/api/v10/webhooks/${config.applicationId}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { authorization: `Bot ${config.token}`, "content-type": "application/json" },
    body: JSON.stringify(messageData(message)),
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
  const message = await payload.after();
  await followup(body.token, message);
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}
