import { createPublicKey, verify } from "node:crypto";

const SPKI = Buffer.from("302a300506032b6570032100", "hex");

export const COLOR = 0x7a1fa3;

export const COMMANDS = [
  { name: "help", description: "What you can do here" },
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

const OPEN = new Set(["help", "class", "link", "ping", "status"]);
const LINKED = new Set(["unlink", "me", "whoami", "github", "projects", "share"]);
const STAFF = new Set(["live", "find", "lookup", "home"]);
const ADMIN = new Set(["power", "logins"]);

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
    "Connect this account first: grab a code from the IDE account menu, then /link.",
  ];
  if (role && role !== "student") lines.push("You can see who's live, find a student, and send someone a private home link.");
  if (role === "admin") lines.push("You can start class with /power, and pick a sign-in channel with /logins.");
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
