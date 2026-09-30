import { randomBytes } from "node:crypto";
import { isHiddenFile } from "./templates.js";

const tokens = new Map();
const TTL = 6 * 60 * 60 * 1000;
const TYPES = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
};

export function mintPreview(projectId) {
  const token = randomBytes(24).toString("hex");
  tokens.set(token, { projectId, exp: Date.now() + TTL });
  return token;
}

export function previewProject(token) {
  const row = tokens.get(token);
  if (!row || row.exp < Date.now()) {
    tokens.delete(token);
    return 0;
  }
  return row.projectId;
}

export function previewBody(files, path, token) {
  const visible = (files || []).filter((file) => !isHiddenFile(file.path) && !file.hidden);
  const wanted = path || "index.html";
  const file = visible.find((item) => item.path === wanted);
  if (!file) return null;
  const ext = wanted.split(".").pop().toLowerCase();
  let body = String(file.content ?? "");
  if (ext === "html") {
    body = rewriteHtml(body, token, {
      script: visible.some((item) => item.path === "script.js"),
      style: visible.some((item) => item.path === "style.css"),
    });
  }
  return { body, type: TYPES[ext] || "text/plain; charset=utf-8" };
}

export function rewriteHtml(html, token, extras = false) {
  const hasScript = extras === true || extras?.script;
  const hasStyle = extras?.style;
  const base = `/preview-site/${token}/`;
  let page = String(html).replace(/\b(src|href)\s*=\s*(["'])\/(?!\/)([^"']*)\2/gi, (all, attr, quote, path) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return all;
    return `${attr}=${quote}${base}${path.replace(/^\/+/, "")}${quote}`;
  });
  if (hasStyle && !/<link\b[^>]*href\s*=\s*["'][^"']*style\.css/i.test(page)) {
    const tag = `<link rel="stylesheet" href="${base}style.css">`;
    page = page.includes("</head>") ? page.replace("</head>", `${tag}</head>`) : `${tag}${page}`;
  }
  if (hasScript && !/<script\b[^>]*\bsrc\s*=/i.test(page)) {
    const tag = `<script src="${base}script.js"></script>`;
    page = page.includes("</body>") ? page.replace("</body>", `${tag}</body>`) : `${page}${tag}`;
  }
  return page;
}
