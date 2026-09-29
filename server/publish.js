import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { isHiddenFile } from "./templates.js";

const ALLOWED = new Set([".html", ".css", ".js", ".mjs", ".json", ".svg", ".txt", ".md"]);
const SLUG = /^p\d+-[a-z0-9-]{1,40}$/;

export function publicSlug(project) {
  const title = String(project.title || "project")
    .toLowerCase()
    .replace(/\{teachforth\}\s*/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "project";
  return `p${Number(project.id)}-${title}`;
}

export function siteFiles(rows) {
  const files = {};
  let total = 0;
  for (const row of rows || []) {
    const path = cleanPath(row.path);
    if (!path || isHiddenFile(path)) continue;
    const dot = path.lastIndexOf(".");
    const ext = dot >= 0 ? path.slice(dot).toLowerCase() : "";
    if (!ALLOWED.has(ext)) continue;
    const content = String(row.content ?? "");
    total += content.length;
    if (total > 800_000) return { ok: false, error: "The site is too large to publish" };
    files[path] = content;
    if (Object.keys(files).length > 80) return { ok: false, error: "Too many files to publish" };
  }
  if (!files["index.html"]) {
    return { ok: false, error: "Add index.html before publishing. Only a static page is published." };
  }
  return { ok: true, files };
}

export function publishedUrl(slug) {
  const base = String(process.env.PUBLISH_PUBLIC_URL || "https://teachforthprojects.samsprojects.xyz").replace(/\/$/, "");
  return `${base}/${slug}/`;
}

export function writeSite(root, slug, files) {
  assertSlug(slug);
  const dest = join(root, slug);
  const tmp = join(root, `.${slug}.tmp`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const [path, content] of Object.entries(files || {})) {
    const clean = cleanPath(path);
    if (!clean) continue;
    const file = join(tmp, clean);
    if (file !== tmp && !file.startsWith(`${tmp}/`)) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, String(content));
  }
  rmSync(dest, { recursive: true, force: true });
  renameSync(tmp, dest);
}

export function removeSite(root, slug) {
  assertSlug(slug);
  rmSync(join(root, slug), { recursive: true, force: true });
}

function assertSlug(slug) {
  if (!SLUG.test(String(slug || ""))) {
    const err = new Error("Bad publish name");
    err.status = 400;
    err.publicMessage = "Bad publish name";
    throw err;
  }
}

function cleanPath(path) {
  const raw = String(path || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!raw || raw.includes("..") || raw.includes("\0")) return "";
  const normal = normalize(raw).replaceAll("\\", "/");
  if (!normal || normal === "." || normal.startsWith("../") || normal === ".." || normal.startsWith("/")) return "";
  return normal;
}
