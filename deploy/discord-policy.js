import { createPublicKey, verify } from "node:crypto";

const SPKI = Buffer.from("302a300506032b6570032100", "hex");

export const COMMANDS = [
  { name: "help", description: "Show TeachForth Helper commands" },
  { name: "ping", description: "Check that the helper is online" },
  { name: "status", description: "See if the class server is on" },
  {
    name: "link",
    description: "Link this Discord account to TeachForth",
    options: [{ name: "code", description: "Code from the IDE account menu", type: 3, required: true }],
  },
  { name: "unlink", description: "Unlink this Discord account" },
  { name: "whoami", description: "Show the linked TeachForth account" },
  { name: "github", description: "See whether GitHub is connected" },
  { name: "projects", description: "List your projects. No code is posted." },
  {
    name: "share",
    description: "Post a sign-in link for one project. No code is posted.",
    options: [{ name: "name", description: "Project title", type: 3, required: true }],
  },
  { name: "live", description: "Who is paired in a live session" },
  {
    name: "lookup",
    description: "Find a person you are allowed to open",
    options: [{ name: "name", description: "Name", type: 3, required: true }],
  },
  { name: "chapters", description: "List chapters" },
  { name: "usage", description: "Today's class server counts" },
  {
    name: "power",
    description: "Start or stop the class server",
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
    description: "Choose where sign-ins are posted",
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

const OPEN = new Set(["help", "ping", "status", "link"]);
const LINKED = new Set(["unlink", "whoami", "github", "projects", "share"]);
const STAFF = new Set(["live", "lookup", "chapters"]);
const ADMIN = new Set(["power", "logins", "usage"]);

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
    "TeachForth Helper",
    "/link code — use the code from the IDE account menu",
    "/status — is the class server on",
    "/ping — is this bot on",
    "/help — this list",
  ];
  if (role) {
    lines.push("/whoami — linked account", "/unlink — remove the link", "/github — GitHub connection", "/projects — your project titles", "/share name — post a sign-in link, not code");
  }
  if (role && role !== "student") lines.push("/live — current pairs", "/lookup name — a person you can open", "/chapters — chapter names");
  if (role === "admin") lines.push("/power action minutes — start, stop, or extend", "/logins here — post sign-ins in this channel", "/usage — today's counts");
  lines.push("Commands never post code, passwords, or tokens.");
  return lines.join("\n");
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
  return [
    plain(title, 80),
    `${plain(language, 24) || "project"} · ${plain(owner, 40)}`,
    String(url),
    "Sign in with your TeachForth account. This link does not skip login.",
  ].join("\n");
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
