import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isStaff } from "./org.js";

const HELPER = (process.env.TEACHFORTH_HELPER_URL || "https://teachforthhelp.samsprojects.xyz").replace(/\/$/, "");
const TOPICS = [
  ["ide", "IDE", "The editor, files, or running code"],
  ["github", "GitHub", "GitHub, commits, or a repository"],
  ["class", "Class", "Joining class or the live session"],
  ["account", "Account", "Sign-in, roles, or your profile"],
  ["homework", "Homework", "An assignment or a lesson"],
  ["general", "Something else", "A question that does not fit"],
];
const TOPIC_IDS = new Set(TOPICS.map((item) => item[0]));
const remoteQualifications = new Map();

export function chatRoute(ctx, path) {
  if (!path.startsWith("/api/chat")) return false;
  if (ctx.req.method !== "POST") ctx.fail(404, "Not found");
  return handle(ctx, path);
}

async function handle(ctx, path) {
  const { db, user, requireUser, send, fail } = ctx;
  requireUser(user);
  ensureTables(db);
  const body = await ctx.readJson(ctx.req);
  if (path === "/api/chat/session") hydrateQualifications(db, user);
  else await attachRemoteQualifications(db, user);
  const route = {
    "/api/chat/session": session,
    "/api/chat/thread": threadView,
    "/api/chat/open": openThread,
    "/api/chat/send": sendMessage,
    "/api/chat/close": closeThread,
    "/api/chat/diagnostics": diagnostics,
    "/api/chat/walk": walk,
    "/api/chat/qualify": qualify,
  }[path];
  if (!route) fail(404, "Not found");
  send(ctx.res, 200, await route(db, user, body, fail));
}

function session(db, user) {
  return payload(db, user, latestThread(db, user.id));
}

function threadView(db, user, body, fail) {
  const thread = loadThread(db, body.channelId);
  if (!thread || !canSee(db, user, thread)) fail(404, "That conversation is not open.");
  return { ok: true, conversation: conversation(db, user, thread) };
}

async function openThread(db, user, body, fail) {
  const topic = TOPIC_IDS.has(body.topic) ? body.topic : "general";
  const message = clip(body.message || body.text, 1800);
  if (!message) fail(400, "Write a message first.");
  const consent = body.consent === true;
  const details = consent ? cleanDiagnostics(body.diagnostics) : null;
  const now = new Date().toISOString();
  let thread = db.prepare("SELECT * FROM chat_threads WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1").get(user.id);
  if (!thread) {
    const created = db.prepare(
      `INSERT INTO chat_threads (user_id, topic, status, consent, pending, diagnostics, created_at, updated_at)
       VALUES (?, ?, 'open', ?, ?, ?, ?, ?)`,
    ).run(user.id, topic, consent ? 1 : 0, consent ? 0 : 1, details ? JSON.stringify(details) : "", now, now);
    thread = loadThread(db, created.lastInsertRowid);
    addMessage(db, thread, "TeachForth", "card", "This chat is open. A qualified teacher can see it.", []);
  } else {
    db.prepare("UPDATE chat_threads SET topic = ?, consent = ?, diagnostics = ?, updated_at = ? WHERE id = ?").run(
      topic, consent ? 1 : 0, details ? JSON.stringify(details) : "", now, thread.id,
    );
    thread = loadThread(db, thread.id);
  }
  addMessage(db, thread, user.name, "student", message, []);
  if (details) {
    addMessage(db, thread, "TeachForth", "note", "Device details", [{ title: "Device details", body: formatDiagnostics(details), tone: "good" }]);
    addMessage(db, thread, "TeachForth", "card", "You shared device details with your teacher. Cookie values were not sent.", []);
  }
  await mirror(user, "/widget/open", { topic, message, consent, diagnostics: details, name: user.name }, thread, db);
  return payload(db, user, loadThread(db, thread.id));
}

async function sendMessage(db, user, body, fail) {
  const text = clip(body.text || body.message, 1800);
  if (!text) fail(400, "Write a message first.");
  let thread = body.channelId ? loadThread(db, body.channelId) : latestThread(db, user.id);
  if (thread && !canSee(db, user, thread)) fail(404, "That conversation is not open.");
  if (!thread || thread.status !== "open") {
    if (isStaff(user) && body.channelId) fail(404, "That conversation is closed.");
    return openThread(db, user, { ...body, message: text }, fail);
  }
  if (/^[./]/.test(text)) {
    const cards = await runCommand(db, user, thread, text);
    addMessage(db, thread, "TeachForth", "card", cards[0]?.title || "Command", cards);
    return { ok: true, cards, conversation: conversation(db, user, loadThread(db, thread.id)) };
  }
  const side = thread.user_id === user.id ? "student" : "staff";
  addMessage(db, thread, user.name, side, text, []);
  await mirror(user, "/widget/send", { text, channelId: thread.discord_channel || "" }, thread, db);
  return payload(db, user, loadThread(db, thread.id));
}

async function closeThread(db, user, body, fail) {
  const thread = body.channelId ? loadThread(db, body.channelId) : latestThread(db, user.id);
  if (!thread || !canSee(db, user, thread)) fail(404, "That conversation is not open.");
  if (thread.user_id !== user.id && !isStaff(user)) fail(403, "You cannot close that.");
  if (thread.status === "open") {
    const now = new Date().toISOString();
    db.prepare("UPDATE chat_threads SET status = 'closed', updated_at = ? WHERE id = ?").run(now, thread.id);
    addMessage(db, thread, "TeachForth", "card", "This conversation is closed. Send a new message anytime.", []);
    await mirror(user, "/widget/close", { channelId: thread.discord_channel || "" }, thread, db);
  }
  return payload(db, user, loadThread(db, thread.id));
}

async function diagnostics(db, user, body, fail) {
  const thread = body.channelId ? loadThread(db, body.channelId) : latestThread(db, user.id);
  if (!thread || !canSee(db, user, thread)) fail(404, "Send a message first.");
  if (!body.consent) {
    db.prepare("UPDATE chat_threads SET pending = 0, consent = 0, updated_at = ? WHERE id = ?").run(new Date().toISOString(), thread.id);
    addMessage(db, thread, "TeachForth", "card", "You did not share device details.", []);
    return payload(db, user, loadThread(db, thread.id));
  }
  const details = cleanDiagnostics(body.diagnostics);
  if (!details) fail(400, "Those details were not usable.");
  db.prepare("UPDATE chat_threads SET pending = 0, consent = 1, diagnostics = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(details), new Date().toISOString(), thread.id,
  );
  addMessage(db, thread, "TeachForth", "note", "Device details", [{ title: "Device details", body: formatDiagnostics(details), tone: "good" }]);
  addMessage(db, thread, "TeachForth", "card", "You shared device details with your teacher. Cookie values were not sent.", []);
  await mirror(user, "/widget/diagnostics", { consent: true, diagnostics: details }, thread, db);
  return payload(db, user, loadThread(db, thread.id));
}

function walk(db, user, body, fail) {
  const thread = body.channelId ? loadThread(db, body.channelId) : latestThread(db, user.id);
  if (!thread || !canSee(db, user, thread)) fail(404, "That conversation is not open.");
  const picked = clip(body.action, 48).replace(/^step:/, "") || "next";
  addMessage(db, thread, user.name, thread.user_id === user.id ? "student" : "staff", `Chose ${picked}`, []);
  const cards = [{ title: "Got it", body: "Your teacher can see that choice.", tone: "good" }];
  addMessage(db, thread, "TeachForth", "card", "Got it", cards);
  return { ok: true, cards };
}

async function qualify(db, user, body, fail) {
  if (user.role === "student") fail(403, "That is for a teacher.");
  const action = clip(body.action, 16).toLowerCase() || "list";
  const topic = clip(body.topic, 20).toLowerCase();
  if (action === "list") {
    const rows = db.prepare(
      "SELECT u.name, q.topic FROM chat_qualifications q JOIN users u ON u.id = q.user_id ORDER BY u.name, q.topic",
    ).all();
    return {
      ok: true,
      cards: [{ title: "Qualifications", body: rows.length ? rows.map((row) => `${row.name}: ${label(row.topic)}`).join("\n") : "Nobody has one yet.", tone: "info" }],
      qualifications: mine(db, user.id),
    };
  }
  if (!["add", "remove"].includes(action) || !["chapter_lead", "admin"].includes(user.role)) {
    fail(403, "Adding a qualification is for a chapter lead or an admin.");
  }
  if (!TOPIC_IDS.has(topic)) fail(400, "Use ide, github, class, account, homework, or general.");
  const target = findUser(db, body.targetId);
  if (!target || !isStaff(target)) fail(404, "Pick a teacher, chapter lead, or admin.");
  if (action === "add") db.prepare("INSERT OR IGNORE INTO chat_qualifications (user_id, topic) VALUES (?, ?)").run(target.id, topic);
  else db.prepare("DELETE FROM chat_qualifications WHERE user_id = ? AND topic = ?").run(target.id, topic);
  if (target.discord_id) {
    remoteQualifications.delete(String(target.discord_id));
    await mirror(user, "/widget/qualify", { action, targetId: String(target.discord_id), topic }, null, db);
  }
  return {
    ok: true,
    cards: [{ title: "Qualification", body: `${target.name} ${action === "add" ? "can see" : "no longer sees"} ${label(topic)} chats.`, tone: "good" }],
    qualifications: mine(db, user.id),
  };
}

async function runCommand(db, user, thread, text) {
  const raw = text.replace(/^[./]/, "").trim();
  const name = raw.split(/\s+/)[0]?.toLowerCase() || "help";
  const rest = raw.slice(name.length).trim();
  const rank = rankOf(user);
  if (name === "help") {
    return [{ title: "Commands", body: commandsFor(rank).map((item) => `.${item.name} ${item.usage} — ${item.help}`.trim()).join("\n"), tone: "info" }];
  }
  if (name === "queue") {
    const groups = inbox(db, user);
    if (!groups.length) return [{ title: "Queue", body: "No open chats you can see.", tone: "info" }];
    return groups.map((group) => ({ title: group.label, body: group.tickets.map((item) => `${item.name} · ${item.preview || "No preview"}`).join("\n"), tone: "info" }));
  }
  if (name === "qualification") {
    const [action, target, topic] = rest.split(/\s+/);
    try {
      return (await qualify(db, user, { action: action || "list", targetId: target || "", topic: topic || "" }, boom)).cards;
    } catch (err) {
      return [{ title: "Qualification", body: err.publicMessage || err.message, tone: "warn" }];
    }
  }
  if (rank === "student") return [{ title: "Not allowed", body: "That is for a teacher.", tone: "warn" }];
  if (name === "note") {
    if (!rest) return [{ title: "Note", body: "Write the note after .note", tone: "warn" }];
    addMessage(db, thread, user.name, "note", rest, []);
    return [{ title: "Note saved", body: "The student does not see this.", tone: "info" }];
  }
  if (name === "reply" || name === "areply") {
    if (!rest) return [{ title: "Reply", body: "Write the message after .reply", tone: "warn" }];
    addMessage(db, thread, name === "areply" ? "TeachForth" : user.name, "staff", rest, []);
    return [{ title: "Sent", body: rest, tone: "good" }];
  }
  if (name === "close") {
    db.prepare("UPDATE chat_threads SET status = 'closed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), thread.id);
    addMessage(db, thread, "TeachForth", "card", "This conversation is closed. Send a new message anytime.", []);
    await mirror(user, "/widget/close", { channelId: thread.discord_channel || "" }, thread, db);
    return [{ title: "Closed", body: "This conversation is closed.", tone: "good" }];
  }
  if (name === "roles" || name === "refetch") {
    if (!user.discord_id) return [{ title: "Link Discord", body: "Link Discord from your profile, then run .roles.", tone: "warn" }];
    const everyone = /^(all|everyone)$/i.test(rest);
    if (everyone && user.role !== "admin") return [{ title: "Not allowed", body: "Refreshing everyone is for an admin.", tone: "warn" }];
    const mirrored = await mirror(user, "/widget/roles", { everyone }, thread, db);
    return mirrored?.cards || [{ title: "Roles", body: "The desk did not answer. Try .roles in Discord.", tone: "warn" }];
  }
  if (name === "claim") {
    db.prepare("UPDATE chat_threads SET claimed_by = ?, updated_at = ? WHERE id = ?").run(user.id, new Date().toISOString(), thread.id);
    return [{ title: "Claimed", body: `${user.name} has this chat.`, tone: "good" }];
  }
  if (name === "diagnostic") {
    db.prepare("UPDATE chat_threads SET pending = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), thread.id);
    addMessage(db, thread, "TeachForth", "card", "Your teacher asked to see this browser and device. Cookie values are not sent.", []);
    return [{ title: "Asked", body: "They can allow device details in this chat.", tone: "info" }];
  }
  if (user.discord_id && thread.discord_channel) {
    const mirrored = await mirror(user, "/widget/send", { text, channelId: thread.discord_channel }, thread, db);
    if (mirrored?.cards) return mirrored.cards;
  }
  return [{ title: "Saved here", body: "Your teacher can see that in this chat.", tone: "info" }];
}

function boom(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  throw error;
}

function payload(db, user, thread) {
  const rank = rankOf(user);
  const staff = rank !== "student";
  const body = {
    ok: true,
    name: user.name || "there",
    staff,
    rank,
    topics: TOPICS.map(([id, title, blurb]) => ({ id, label: title, blurb })),
    qualifications: staff ? mine(db, user.id) : [],
    commands: commandsFor(rank),
    conversation: conversation(db, user, thread),
  };
  if (staff) body.inbox = inbox(db, user);
  return body;
}

function conversation(db, user, thread) {
  if (!thread) return { open: false, channelId: "", topic: "", label: "", pendingDiagnostic: false, messages: [] };
  return {
    open: thread.status === "open",
    channelId: String(thread.id),
    topic: thread.topic,
    label: label(thread.topic),
    pendingDiagnostic: Boolean(thread.pending) && (thread.user_id === user.id || isStaff(user)),
    messages: messages(db, thread.id, isStaff(user)),
  };
}

function inbox(db, user) {
  const groups = new Map(TOPICS.map(([id, title]) => [id, { id, label: title, tickets: [] }]));
  for (const thread of db.prepare("SELECT * FROM chat_threads WHERE status = 'open' ORDER BY updated_at DESC LIMIT 40").all()) {
    if (!canSee(db, user, thread)) continue;
    const owner = db.prepare("SELECT name FROM users WHERE id = ?").get(thread.user_id);
    const last = db.prepare("SELECT body FROM chat_messages WHERE thread_id = ? AND side != 'note' ORDER BY id DESC LIMIT 1").get(thread.id);
    (groups.get(thread.topic) || groups.get("general")).tickets.push({
      channelId: String(thread.id),
      name: owner?.name || "Student",
      topic: thread.topic,
      label: label(thread.topic),
      preview: clip(last?.body || "", 120),
    });
  }
  return [...groups.values()].filter((group) => group.tickets.length);
}

function canSee(db, user, thread) {
  if (!thread) return false;
  if (thread.user_id === user.id) return true;
  if (!isStaff(user)) return false;
  if (user.role === "admin") return true;
  if (topicsFor(db, user).has(thread.topic)) return true;
  return user.role === "chapter_lead" && !topicCovered(db, thread.topic);
}

function topicsFor(db, user) {
  return user.topics instanceof Set ? user.topics : new Set(mine(db, user.id));
}

function topicCovered(db, topic) {
  return Boolean(db.prepare("SELECT 1 FROM chat_qualifications WHERE topic = ? LIMIT 1").get(topic));
}

function hydrateQualifications(db, user) {
  user.topics = new Set(mine(db, user.id));
  if (!user.discord_id || !isStaff(user)) return;
  const key = String(user.discord_id);
  const hit = remoteQualifications.get(key);
  if (hit && hit.until > Date.now()) {
    for (const topic of hit.topics) user.topics.add(topic);
    return;
  }
  if (hit && hit.pending) return;
  remoteQualifications.set(key, { until: 0, topics: hit?.topics || [], pending: true });
  attachRemoteQualifications(db, user).catch(() => {
    const current = remoteQualifications.get(key);
    if (current) current.pending = false;
  });
}

async function attachRemoteQualifications(db, user) {
  user.topics = new Set(mine(db, user.id));
  if (!user.discord_id || !isStaff(user)) return;
  const key = String(user.discord_id);
  const hit = remoteQualifications.get(key);
  if (hit && hit.until > Date.now() && !hit.pending) {
    for (const topic of hit.topics) user.topics.add(topic);
    return;
  }
  const data = await mirror(user, "/widget/qualify", { action: "list" }, null, db, 1200);
  const topics = data?.qualifications || hit?.topics || [];
  remoteQualifications.set(key, { until: Date.now() + 60_000, topics, pending: false });
  for (const topic of topics) user.topics.add(topic);
}

function messages(db, threadId, staff) {
  return db.prepare("SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY id DESC LIMIT 60").all(threadId).reverse()
    .filter((item) => staff || item.side !== "note")
    .map((item) => ({
      id: item.id,
      channelId: String(threadId),
      author: item.author_name,
      side: item.side,
      text: item.body,
      cards: parseCards(item.cards),
      at: item.created_at,
    }));
}

function addMessage(db, thread, author, side, text, cards) {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO chat_messages (thread_id, author_name, side, body, cards, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    thread.id, clip(author, 80) || "TeachForth", side, clip(text, 2000), JSON.stringify(cards || []), now,
  );
  db.prepare("UPDATE chat_threads SET updated_at = ? WHERE id = ?").run(now, thread.id);
}

function latestThread(db, userId) {
  return db.prepare("SELECT * FROM chat_threads WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId) || null;
}

function loadThread(db, id) {
  const threadId = Number(id);
  if (!Number.isInteger(threadId) || threadId <= 0) return null;
  return db.prepare("SELECT * FROM chat_threads WHERE id = ?").get(threadId) || null;
}

function findUser(db, value) {
  const text = clip(value, 80);
  if (/^\d+$/.test(text)) return db.prepare("SELECT * FROM users WHERE id = ?").get(Number(text));
  return db.prepare("SELECT * FROM users WHERE lower(email) = lower(?) OR lower(name) = lower(?)").get(text, text);
}

function mine(db, userId) {
  return db.prepare("SELECT topic FROM chat_qualifications WHERE user_id = ?").all(userId).map((row) => row.topic);
}

function rankOf(user) {
  if (user.role === "admin") return "admin";
  if (user.role === "chapter_lead") return "chapter";
  if (user.role === "teacher" || user.role === "lead_teacher") return "teacher";
  return "student";
}

function commandsFor(rank) {
  const rows = [
    ["help", "student", "Commands you can run in this chat.", ""],
    ["roles", "student", "Refresh your Discord role from the website.", "[all]"],
    ["reply", "teacher", "Send this to the student.", "<message>"],
    ["note", "teacher", "Staff note. The student does not see it.", "<message>"],
    ["close", "teacher", "Close this chat.", ""],
    ["claim", "teacher", "Take this chat.", ""],
    ["diagnostic", "teacher", "Ask them to share browser and device details.", ""],
    ["queue", "teacher", "Open chats you can see.", ""],
    ["qualification list", "teacher", "List qualifications.", ""],
    ["qualification add", "chapter lead", "Give a staff member a qualification.", "<name> <topic>"],
    ["qualification remove", "chapter lead", "Take a qualification away.", "<name> <topic>"],
  ];
  const have = { student: 0, teacher: 1, chapter: 2, admin: 3 }[rank] || 0;
  return rows
    .filter((item) => have >= (item[1] === "chapter lead" ? 2 : item[1] === "teacher" ? 1 : 0))
    .map(([name, level, help, usage]) => ({ name, level, help, usage }));
}

function label(topic) {
  return TOPICS.find((item) => item[0] === topic)?.[1] || "Help";
}

async function mirror(user, path, extra, thread, db, timeout = 8000) {
  if (!user.discord_id) return null;
  const secret = readSecret();
  if (!secret) return null;
  try {
    const response = await fetch(`${HELPER}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-teachforth-discord": secret },
      body: JSON.stringify({ discordId: String(user.discord_id), name: user.name || "", role: user.role || "student", ...extra }),
      signal: AbortSignal.timeout(timeout),
    });
    const data = await response.json().catch(() => ({}));
    const channelId = data?.conversation?.channelId;
    if (channelId && thread && !thread.discord_channel) {
      db.prepare("UPDATE chat_threads SET discord_channel = ? WHERE id = ?").run(String(channelId), thread.id);
    }
    return response.ok ? data : null;
  } catch {
    return null;
  }
}

function ensureTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      topic TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'open',
      consent INTEGER NOT NULL DEFAULT 0,
      pending INTEGER NOT NULL DEFAULT 0,
      diagnostics TEXT NOT NULL DEFAULT '',
      discord_channel TEXT NOT NULL DEFAULT '',
      claimed_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY,
      thread_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      side TEXT NOT NULL,
      body TEXT NOT NULL,
      cards TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_qualifications (
      user_id INTEGER NOT NULL,
      topic TEXT NOT NULL,
      PRIMARY KEY (user_id, topic)
    );
  `);
}

function parseCards(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  return Object.keys(out).length ? out : null;
}

function formatDiagnostics(info) {
  const yes = (value) => (value ? "yes" : "no");
  return [
    info.browser && `Browser: ${info.browser}`,
    info.platform && `Device: ${info.platform}`,
    info.language && `Language: ${info.language}`,
    info.timezone && `Timezone: ${info.timezone}`,
    info.screen && `Screen: ${info.screen}`,
    info.viewport && `Viewport: ${info.viewport}`,
    "cookiesEnabled" in info && `Cookies enabled: ${yes(info.cookiesEnabled)}`,
    "online" in info && `Online: ${yes(info.online)}`,
  ].filter(Boolean).join("\n");
}

function readSecret() {
  const file = process.env.DISCORD_SECRET_FILE || join(process.env.DATA_DIR || "", "discord-secret");
  if (!file || !existsSync(file)) return "";
  return readFileSync(file, "utf8").trim();
}
