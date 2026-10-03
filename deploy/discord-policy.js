import { createPublicKey, verify } from "node:crypto";

const SPKI = Buffer.from("302a300506032b6570032100", "hex");

export const COLOR = 0x7a1fa3;

export const COMMANDS = [
  { name: "help", description: "What you can do here" },
  {
    name: "login",
    description: "Register for the TeachForth helpdesk",
    options: [{ name: "code", description: "Code from the helpdesk, if you have one", type: 3, required: false }],
  },
  { name: "class", description: "See if class is on, and open the IDE" },
  {
    name: "link",
    description: "Connect this Discord account to TeachForth",
    options: [{ name: "code", description: "Code from the IDE account menu", type: 3, required: true }],
  },
  { name: "unlink", description: "Disconnect this Discord account" },
  { name: "me", description: "Your TeachForth account" },
  { name: "projects", description: "Open one of your projects" },
  {
    name: "share",
    description: "Share a project in this channel",
    options: [{ name: "name", description: "Project name", type: 3, required: true }],
  },
  { name: "live", description: "See who is paired right now" },
  {
    name: "find",
    description: "Find a student or teacher you can open",
    options: [{ name: "name", description: "Name", type: 3, required: true }],
  },
  {
    name: "home",
    description: "Send a student a private link to keep working",
    options: [
      { name: "student", description: "Student name", type: 3, required: true },
      { name: "project", description: "Project name", type: 3, required: true },
      { name: "hours", description: "How many hours the link lasts", type: 4, required: true },
    ],
  },
  {
    name: "power",
    description: "Start or stop class",
    options: [
      {
        name: "action",
        description: "What to do",
        type: 3,
        required: true,
        choices: [
          { name: "on", value: "on" },
          { name: "off", value: "off" },
          { name: "extend", value: "extend" },
        ],
      },
      { name: "minutes", description: "15 to 360, for on and extend", type: 4, required: false },
    ],
  },
  {
    name: "ask",
    description: "Message the teachers",
    dm_permission: true,
    options: [{ name: "message", description: "What you need", type: 3, required: true }],
  },
  {
    name: "desk",
    description: "Choose where student messages open",
    options: [
      {
        name: "action",
        description: "What to do",
        type: 3,
        required: true,
        choices: [
          { name: "here", value: "here" },
          { name: "off", value: "off" },
          { name: "status", value: "status" },
          { name: "logs", value: "logs" },
          { name: "age", value: "age" },
        ],
      },
      { name: "days", description: "Minimum Discord account age, for age", type: 4, required: false },
    ],
  },
  {
    name: "reply",
    description: "Write back to the student",
    options: [
      { name: "message", description: "What they should see", type: 3, required: true },
      { name: "anonymous", description: "Hide your name", type: 5, required: false },
    ],
  },
  {
    name: "note",
    description: "Leave a staff note the student does not see",
    options: [{ name: "message", description: "Note", type: 3, required: true }],
  },
  {
    name: "close",
    description: "Close this student thread",
    options: [
      { name: "message", description: "Closing note for the student", type: 3, required: false },
      { name: "in", description: "Delay, such as 30m or 2h", type: 3, required: false },
      { name: "silent", description: "Do not tell the student", type: 5, required: false },
    ],
  },
  {
    name: "snippet",
    description: "Save or send a short reply",
    options: [
      {
        name: "action",
        description: "What to do",
        type: 3,
        required: true,
        choices: [
          { name: "add", value: "add" },
          { name: "send", value: "send" },
          { name: "show", value: "show" },
          { name: "remove", value: "remove" },
          { name: "list", value: "list" },
        ],
      },
      { name: "name", description: "Short name", type: 3, required: false },
      { name: "text", description: "Reply text, for add", type: 3, required: false },
    ],
  },
  {
    name: "logs",
    description: "Read a past desk thread",
    options: [
      { name: "name", description: "Student or Discord name", type: 3, required: false },
      { name: "query", description: "Words to find", type: 3, required: false },
    ],
  },
  {
    name: "block",
    description: "Stop or allow desk messages from someone",
    options: [
      {
        name: "action",
        description: "What to do",
        type: 3,
        required: true,
        choices: [
          { name: "add", value: "add" },
          { name: "remove", value: "remove" },
        ],
      },
      { name: "user", description: "Discord account", type: 6, required: true },
      { name: "reason", description: "Why, for add", type: 3, required: false },
    ],
  },
  {
    name: "contact",
    description: "Open a desk thread with someone",
    options: [
      { name: "user", description: "Discord account", type: 6, required: true },
      { name: "message", description: "First message", type: 3, required: false },
    ],
  },
  {
    name: "claim",
    description: "Take or release this desk thread",
    options: [
      {
        name: "action",
        description: "What to do",
        type: 3,
        required: true,
        choices: [
          { name: "take", value: "take" },
          { name: "release", value: "release" },
        ],
      },
    ],
  },
  {
    name: "logins",
    description: "Choose where sign-ins show up",
    options: [
      {
        name: "action",
        description: "What to do",
        type: 3,
        required: true,
        choices: [
          { name: "here", value: "here" },
          { name: "off", value: "off" },
          { name: "status", value: "status" },
        ],
      },
    ],
  },
];

const OPEN = new Set(["help", "class", "link", "ping", "status", "ask", "login"]);
const LINKED = new Set(["unlink", "me", "whoami", "github", "projects", "share"]);
const STAFF = new Set(["live", "find", "lookup", "home", "reply", "note", "close", "snippet", "logs", "block", "contact", "claim"]);
const ADMIN = new Set(["power", "logins", "desk"]);

export function commandAllowed(name, role) {
  if (OPEN.has(name)) return true;
  if (!role) return false;
  if (LINKED.has(name)) return true;
  if (STAFF.has(name)) return role !== "student";
  if (ADMIN.has(name)) return role === "admin";
  return false;
}

export function helpText(role) {
  const lines = [
    "Ask if class is on with /class, open your work with /projects, or share a project in the channel with /share.",
    "Connect this account first: grab a code from the IDE account menu, then /link. Teachers register for the helpdesk with /login.",
  ];
  lines.splice(1, 0, "Message the teachers with /ask, or just send me a direct message.");
  if (role && role !== "student") {
    lines.push("You can see who's live, find a student, and send someone a private home link.");
    lines.push("In a desk thread, type to write back. /note stays private, /close ends it, and /logs reads old ones.");
  }
  if (role === "admin") lines.push("You can start class with /power, pick a sign-in channel with /logins, and open the desk with /desk here.");
  return lines.join(" ");
}

export function roleLabel(role) {
  return {
    admin: "Admin",
    chapter_lead: "Chapter lead",
    lead_teacher: "Session lead",
    teacher: "Teacher",
    student: "Student",
  }[role] || "TeachForth";
}

export function languageLabel(language) {
  if (language === "python") return "Python";
  if (language === "web") return "Web";
  return "Project";
}

export function card({ title, description, fields, footer, url, timestamp }) {
  const embed = { color: COLOR };
  if (title) embed.title = plain(title, 200);
  if (description) embed.description = String(description).slice(0, 1800);
  if (url && safeUrl(url)) embed.url = url;
  if (fields?.length) {
    embed.fields = fields.slice(0, 12).map((field) => ({
      name: plain(field.name, 80) || "Note",
      value: String(field.value || "—").slice(0, 200),
      inline: Boolean(field.inline),
    }));
  }
  if (footer) embed.footer = { text: plain(footer, 80) };
  if (timestamp) embed.timestamp = timestamp;
  return embed;
}

export function buttons(links) {
  const components = [];
  for (const link of links || []) {
    const url = String(link?.url || "");
    if (!safeUrl(url)) continue;
    components.push({ type: 2, style: 5, label: plain(link.label, 40) || "Open", url });
    if (components.length === 5) break;
  }
  return components.length ? [{ type: 1, components }] : [];
}

export function safeUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && String(url).length <= 500;
  } catch {
    return false;
  }
}

export function messageData(message) {
  const item = typeof message === "string" ? { embeds: [card({ description: message })] } : message || {};
  const data = {};
  if (item.content) data.content = String(item.content).slice(0, 1800);
  if (item.embeds?.length) data.embeds = item.embeds.slice(0, 4);
  if (item.components?.length) data.components = item.components.slice(0, 5);
  if (item.ephemeral !== false) data.flags = 64;
  return data;
}

export function optionValue(data, name) {
  const option = (data?.options || []).find((item) => item.name === name);
  return option ? option.value : undefined;
}

export function actorId(body) {
  const id = body?.member?.user?.id || body?.user?.id || "";
  return /^\d{17,20}$/.test(id) ? id : "";
}

export function actorName(body) {
  const user = body?.member?.user || body?.user || {};
  return plain(user.global_name || user.username || "Discord user", 32);
}

export function plain(value, max = 80) {
  return String(value ?? "").replace(/[`@<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function shareCard({ title, language, owner, url }) {
  const who = plain(owner, 40);
  const kind = languageLabel(language);
  return card({
    title,
    url,
    description: who ? `${who} · ${kind}. Sign in to open it.` : `${kind}. Sign in to open it.`,
    footer: "TeachForth",
  });
}

export function discordKey(hex) {
  const raw = Buffer.from(String(hex || ""), "hex");
  if (raw.length !== 32) return null;
  return createPublicKey({ key: Buffer.concat([SPKI, raw]), format: "der", type: "spki" });
}

export function verifyDiscord(publicKeyHex, timestamp, body, signatureHex) {
  const key = discordKey(publicKeyHex);
  if (!key) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const signature = Buffer.from(String(signatureHex || ""), "hex");
  if (signature.length !== 64) return false;
  try {
    return verify(null, Buffer.from(String(timestamp) + String(body)), key, signature);
  } catch {
    return false;
  }
}
