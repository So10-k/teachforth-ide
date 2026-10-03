import { spawn } from "node:child_process";
import { existsSync, lstatSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_DOMAINS = 12;
const HELPER = process.env.TF_DOMAINS_BIN || "/usr/local/lib/teachforth/tf-domains";

export function normalizeDomain(raw) {
  let value = String(raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!value || value.length > 253) return "";
  if (/[:/?#\s@]/.test(value) || value.includes("..") || value.startsWith(".") || value.endsWith(".")) return "";
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(value)) return "";
  if (value === "localhost" || value.endsWith(".localhost") || value.endsWith(".local") || value.endsWith(".internal")) return "";
  return value;
}

export function listDomains(db) {
  return db.prepare(
    "SELECT domain, nginx, cert, detail, created_at AS createdAt FROM authorized_domains ORDER BY domain",
  ).all();
}

export async function addDomain(db, user, raw, dataDir, fail, pace) {
  const domain = normalizeDomain(raw);
  if (!domain) fail(400, "Enter a domain name like ide.school.edu");
  if (!pace(`domains:${user.id}`, 3, 60_000)) fail(429, "Wait a minute before adding another domain.");
  const count = db.prepare("SELECT COUNT(*) AS n FROM authorized_domains").get().n;
  const exists = db.prepare("SELECT domain FROM authorized_domains WHERE domain = ?").get(domain);
  if (!exists && count >= MAX_DOMAINS) fail(400, "Twelve domains is the limit.");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO authorized_domains (domain, added_by, created_at, nginx, cert, detail)
     VALUES (?, ?, ?, 'pending', 'none', '')
     ON CONFLICT(domain) DO UPDATE SET detail = ''`,
  ).run(domain, user.id, now);
  await applyDomains(db, dataDir);
  return listDomains(db);
}

export async function reapplyDomains(db, user, dataDir, fail, pace) {
  if (!pace(`domains:${user.id}`, 3, 60_000)) fail(429, "Wait a minute before applying domains again.");
  await applyDomains(db, dataDir);
  return listDomains(db);
}

export async function removeDomain(db, user, raw, dataDir, fail, pace) {
  const domain = normalizeDomain(raw);
  if (!domain) fail(400, "That domain name is not valid");
  if (!pace(`domains:${user.id}`, 3, 60_000)) fail(429, "Wait a minute before changing domains again.");
  db.prepare("DELETE FROM authorized_domains WHERE domain = ?").run(domain);
  await applyDomains(db, dataDir);
  return listDomains(db);
}

async function applyDomains(db, dataDir) {
  const domains = db.prepare("SELECT domain FROM authorized_domains ORDER BY domain").all().map((row) => row.domain);
  writeList(dataDir, domains);
  if (!existsSync(HELPER)) {
    db.prepare("UPDATE authorized_domains SET nginx = 'not-installed', cert = 'none', detail = ?").run(
      "The nginx helper is not installed on this server.",
    );
    return;
  }
  const result = await runHelper();
  if (!result.ok) {
    db.prepare("UPDATE authorized_domains SET nginx = 'failed', detail = ?").run(result.error || "nginx was not changed");
    return;
  }
  const byName = new Map(result.rows.map((row) => [row.domain, row]));
  for (const domain of domains) {
    const row = byName.get(domain) || { nginx: "applied", cert: "none", detail: "" };
    db.prepare("UPDATE authorized_domains SET nginx = ?, cert = ?, detail = ? WHERE domain = ?").run(
      row.nginx || "applied",
      row.cert || "none",
      (row.detail || "").slice(0, 240),
      domain,
    );
  }
}

function writeList(dataDir, domains) {
  const path = join(dataDir, "domains.txt");
  const tmp = `${path}.tmp`;
  for (const file of [path, tmp]) {
    try {
      if (lstatSync(file).isSymbolicLink()) unlinkSync(file);
    } catch {
      // missing is fine
    }
  }
  writeFileSync(tmp, `${domains.join("\n")}${domains.length ? "\n" : ""}`, { mode: 0o644 });
  renameSync(tmp, path);
}

function runHelper() {
  return new Promise((resolve) => {
    const child = spawn("sudo", ["-n", HELPER], { timeout: 300_000 });
    let out = "";
    let err = "";
    child.stdout.on("data", (buf) => { out += buf; });
    child.stderr.on("data", (buf) => { err += buf; });
    child.on("error", () => resolve({ ok: false, error: "Could not run the nginx helper." }));
    child.on("close", (code) => {
      const rows = out.trim().split("\n").filter(Boolean).map(parseStatus).filter(Boolean);
      if (code === 0) return resolve({ ok: true, rows });
      resolve({ ok: false, error: (err || out || "nginx was not changed").trim().slice(0, 240) });
    });
  });
}

function parseStatus(line) {
  const match = /^([a-z0-9.-]+)\t(applied|failed|not-installed)\t(none|issued|pending|unavailable)\t([\s\S]*)$/.exec(line);
  if (!match) return null;
  return { domain: match[1], nginx: match[2], cert: match[3], detail: match[4] };
}
