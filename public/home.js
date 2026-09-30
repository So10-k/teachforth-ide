const base = document.body.dataset.base || "";
const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h7v6H4zm9 0h7v6h-7zM4 13h7v6H4zm9 0h7v6h-7z"/></svg>`;
const CHEVRON = `<svg class="twist-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 4l4 4-4 4z"/></svg>`;
const LANG_ICON = {
  py: `<svg class="ficon" viewBox="0 0 32 32" aria-hidden="true"><path fill="#3776AB" d="M15.8 2.2c-4.6 0-4.4 2-4.4 2l.01 2.1h4.6v.6H8.6S4.8 6.6 4.8 12.6c0 6 3.4 5.8 3.4 5.8h2v-2s-.1-2.3 2.3-2.3h4.5s2.2.2 2.2-2.2V4.5s.1-2.3-3.4-2.3zm-2.5 2.1c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2-1.2-.5-1.2-1.2.5-1.2 1.2-1.2z"/><path fill="#FFD43B" d="M16.2 29.8c4.6 0 4.4-2 4.4-2l-.01-2.1h-4.6v-.6h7.4s3.8-.3 3.8-6.3-3.4-5.8-3.4-5.8h-2v2s.1 2.3-2.3 2.3h-4.5s-2.2-.2-2.2 2.2v7.2s-.1 2.3 3.5 2.3zm2.5-2.1c-.7 0-1.2-.5-1.2-1.2s.5-1.2 1.2-1.2 1.2.5 1.2 1.2-.5 1.2-1.2 1.2z"/></svg>`,
  html: `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><path fill="#E34F26" d="M1.4 1h13.2L13.3 14.2 8 15.6 2.7 14.2z"/><path fill="#F16529" d="M8 2.1v12.3l4.2-1.2 1.1-11.1z"/><path fill="#EBEBEB" d="M8 5.1H4.5l.2 1.8H8v1.5H3.4l.4 3.7L8 13.3V11.7l-2.2-.6.2-1.3H8z"/><path fill="#fff" d="M8 5.1v1.6h2.8l-.2 1.7H8v1.4h2.3l-.3 2.6L8 13.3V11.7l2-.5-.1-1.2H8V8.4h3.2l.3-3.3z"/></svg>`,
  css: `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><path fill="#264DE4" d="M1.4 1h13.2L13.3 14.2 8 15.6 2.7 14.2z"/><path fill="#2965F1" d="M8 2.1v12.3l4.2-1.2 1.1-11.1z"/><path fill="#EBEBEB" d="M8 5.1H4.5l.2 1.8H8v1.5H3.5l.2 2.2h2.5l.2 1.5L8 13.3V11.7l-1.4-.4.1-.9H8z"/><path fill="#fff" d="M8 5.1v1.6h2.8l-.1 1.3H8v1.5h2.4l-.2 2.2L8 13.3V11.7l1.3-.3-.1-.9H8V8.4h3.3l.3-3.3z"/></svg>`,
  js: `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="#F7DF1E"/><text x="8" y="11.6" text-anchor="middle" font-size="7.4" font-family="Arial,sans-serif" font-weight="700" fill="#323330">JS</text></svg>`,
};

const state = { title: "", language: "web", expiresAt: "", files: [], opened: [], active: "", collapsed: new Set(), saveTimer: 0 };
let cm = null;
let naming = false;
let treeSig = "";

const app = document.querySelector("#app");

boot().catch((err) => {
  app.innerHTML = `<p class="error" style="padding:24px">${esc(err.message)}</p>`;
});

async function boot() {
  const hand = await api("/api/handoff");
  if (hand.redirect) {
    location.href = hand.redirect;
    return;
  }
  const data = await api("/api/state");
  state.title = data.title;
  state.language = data.language || "web";
  state.expiresAt = data.expiresAt;
  state.files = data.files || [];
  state.active = state.files[0]?.path || "";
  if (state.active) state.opened = [state.active];
  paint();
  setInterval(watchClass, 45_000);
}

function paint() {
  const when = state.expiresAt ? new Date(state.expiresAt).toLocaleString() : "";
  const web = state.language === "web" || state.files.some((file) => /\.html?$/.test(file.path));
  app.innerHTML = `<div class="ide">
    <header class="ide-titlebar">
      <a class="logo" href="${esc(base)}/"><img src="${esc(asset("logo.png"))}" alt="">IDE</a>
      <span class="title">${esc(state.title)}</span>
      <span class="spacer"></span>
      ${web ? `<button id="preview" type="button">Preview</button>` : ""}
      <button id="save-commit" type="button">Save &amp; Commit</button>
    </header>
    <div class="banner">Home work until ${esc(when)}. This page does not share a live class. Save &amp; Commit puts the code on GitHub.</div>
    <div class="ide-body">
      <nav class="activity" aria-label="Views"><button class="on" title="Explorer" aria-label="Explorer">${ICON}</button></nav>
      <aside class="explorer">
        <div class="explorer-head"><span>Explorer</span><span class="explorer-actions"><button id="new-file" title="New file" type="button">+ File</button><button id="new-folder" title="New folder" type="button">+ Folder</button></span></div>
        <p class="explorer-project">${esc(state.title)}</p>
        <div id="tree"></div>
      </aside>
      <div class="editor-pane">
        <div class="tabs-files" id="file-tabs"></div>
        <div class="code-host">
          <div id="welcome" class="welcome">Open a file from the explorer, or make a new one.</div>
          <textarea id="code" class="fallback-editor" spellcheck="false"></textarea>
        </div>
      </div>
      <section class="preview-pane terminal-pane">
        <div class="pane-bar"><span>${web ? "Preview" : "Home"}</span><span class="spacer"></span><span id="save-state">Saved</span></div>
        <iframe id="runner" sandbox="allow-scripts allow-modals" title="Preview" hidden></iframe>
        <p id="home-note" class="muted" style="padding:12px">${web ? "Preview runs this page in a sandbox. Python, Java, and C run during class." : "Python, Java, and C run during class. Save & Commit keeps this work on GitHub."}</p>
      </section>
    </div>
    <footer class="statusbar"><span id="status-file">No file</span><span class="spacer"></span><span id="status-lang"></span></footer>
  </div>`;
  document.querySelector("#save-commit").onclick = () => commit().catch((err) => setSave(err.message));
  document.querySelector("#new-file").onclick = () => askCreate("", "notes.txt", false);
  document.querySelector("#new-folder").onclick = () => askCreate("", "src", true);
  const preview = document.querySelector("#preview");
  if (preview) preview.onclick = showPreview;
  const tree = document.querySelector("#tree");
  tree.oncontextmenu = openMenu;
  tree.ondragover = (event) => event.preventDefault();
  tree.ondrop = (event) => {
    if (event.target.closest("[data-folder]")) return;
    const from = event.dataTransfer.getData("text/plain");
    const name = from.split("/").pop();
    if (from && name && from !== name) movePath(from, name);
  };
  document.addEventListener("click", hideMenu);
  renderTree();
  openCurrent();
}

function renderTree() {
  const tree = document.querySelector("#tree");
  const tabs = document.querySelector("#file-tabs");
  if (!tree || !tabs) return;
  const sig = `${state.files.map((file) => file.path).join("|")}|${state.opened.join(",")}|${state.active}|${[...state.collapsed].sort().join(",")}`;
  if (sig !== treeSig && !naming) {
    treeSig = sig;
    tree.innerHTML = state.files.length ? treeHtml(state.files) : `<p class="muted tree-empty">No files yet.</p>`;
    tabs.innerHTML = state.opened.map((path) =>
      `<button class="tab ${path === state.active ? "active" : ""}" data-tab="${esc(path)}">${fileIcon(path)}<span>${esc(path.split("/").pop())}</span><i data-close="${esc(path)}" title="Close">×</i></button>`,
    ).join("");
  }
  bindTree();
  const status = document.querySelector("#status-file");
  const lang = document.querySelector("#status-lang");
  if (status) status.textContent = state.active || "No file open";
  if (lang) lang.textContent = languageLabel(state.active);
  const welcome = document.querySelector("#welcome");
  if (welcome) welcome.hidden = Boolean(state.active);
}

function treeHtml(files) {
  const root = { dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push(file.path);
  }
  return nodeHtml(root, 0, "");
}

function nodeHtml(node, depth, prefix) {
  let html = "";
  for (const [name, child] of node.dirs) {
    const folder = prefix ? `${prefix}/${name}` : name;
    const open = !state.collapsed.has(folder);
    html += `<div class="tree-row folder ${open ? "open" : ""}" data-folder="${esc(folder)}" style="--depth:${depth}">
      <button class="twist" data-twist="${esc(folder)}" type="button" aria-label="Toggle ${esc(name)}">${CHEVRON}</button>
      ${folderIcon(open)}<span class="tname">${esc(name)}</span>
      <button class="add" data-add="${esc(folder)}" type="button" title="New file">+</button>
    </div>${open ? nodeHtml(child, depth + 1, folder) : ""}`;
  }
  for (const path of node.files) {
    html += `<div class="tree-row file-row ${path === state.active ? "active" : ""}" draggable="true" data-path="${esc(path)}" style="--depth:${depth}">
      <span class="twist"></span>${fileIcon(path)}<span class="tname">${esc(path.split("/").pop())}</span>
    </div>`;
  }
  return html;
}

function bindTree() {
  const tree = document.querySelector("#tree");
  const tabs = document.querySelector("#file-tabs");
  if (!tree || !tabs) return;
  for (const row of tree.querySelectorAll("[data-path]")) {
    row.onclick = () => openPath(row.dataset.path);
    row.ondragstart = (event) => event.dataTransfer.setData("text/plain", row.dataset.path);
  }
  for (const button of tree.querySelectorAll("[data-twist]")) {
    button.onclick = (event) => {
      event.stopPropagation();
      toggleFolder(button.dataset.twist);
    };
  }
  for (const button of tree.querySelectorAll("[data-add]")) {
    button.onclick = (event) => {
      event.stopPropagation();
      askCreate(button.dataset.add, "file.txt", false);
    };
  }
  for (const folder of tree.querySelectorAll("[data-folder]")) {
    folder.onclick = (event) => {
      if (event.target.closest("button")) return;
      toggleFolder(folder.dataset.folder);
    };
    folder.ondragover = (event) => {
      event.preventDefault();
      event.stopPropagation();
      folder.classList.add("drop");
    };
    folder.ondragleave = () => folder.classList.remove("drop");
    folder.ondrop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      folder.classList.remove("drop");
      const from = event.dataTransfer.getData("text/plain");
      const name = from.split("/").pop();
      if (from && name) movePath(from, `${folder.dataset.folder}/${name}`);
    };
  }
  for (const tab of tabs.querySelectorAll("[data-tab]")) tab.onclick = () => openPath(tab.dataset.tab);
  for (const close of tabs.querySelectorAll("[data-close]")) {
    close.onclick = (event) => {
      event.stopPropagation();
      closePath(close.dataset.close);
    };
  }
}

function openCurrent() {
  const area = document.querySelector("#code");
  if (!area) return;
  const file = state.files.find((item) => item.path === state.active);
  area.value = file?.content || "";
  if (!window.CodeMirror) {
    area.oninput = () => scheduleSave();
    return;
  }
  if (cm) cm.toTextArea();
  cm = window.CodeMirror.fromTextArea(area, {
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    mode: modeOf(state.active),
    autoCloseBrackets: true,
    autoCloseTags: true,
    extraKeys: {
      "Ctrl-S": () => flush().catch((err) => setSave(err.message)),
      "Cmd-S": () => flush().catch((err) => setSave(err.message)),
      "Ctrl-/": () => toggleComment(),
      "Cmd-/": () => toggleComment(),
    },
  });
  cm.on("change", () => scheduleSave());
}

function openPath(path) {
  flush().catch(() => {});
  state.active = path;
  if (!state.opened.includes(path)) state.opened.push(path);
  treeSig = "";
  renderTree();
  openCurrent();
}

function closePath(path) {
  state.opened = state.opened.filter((item) => item !== path);
  if (state.active === path) state.active = state.opened.at(-1) || "";
  treeSig = "";
  renderTree();
  openCurrent();
}

function scheduleSave() {
  setSave("Editing…");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => flush().catch((err) => setSave(err.message)), 800);
}

async function flush() {
  if (!state.active) return;
  const content = cm ? cm.getValue() : document.querySelector("#code")?.value || "";
  const file = state.files.find((item) => item.path === state.active);
  if (file && file.content === content) return;
  if (file) file.content = content;
  await api("/api/file", { method: "PUT", body: { path: state.active, content } });
  setSave("Saved");
}

async function commit() {
  const button = document.querySelector("#save-commit");
  if (button) button.disabled = true;
  try {
    await flush();
    setSave("Committing…");
    const saved = await api("/api/commit", { method: "POST", body: {} });
    setSave(`Committed ${saved.sha?.slice(0, 7) || ""}`);
    if (saved.redirect) location.href = saved.redirect;
  } finally {
    if (button) button.disabled = false;
  }
}

async function watchClass() {
  try {
    const hand = await api("/api/handoff");
    if (hand.redirect) location.href = hand.redirect;
  } catch (err) {
    setSave(err.message);
  }
}

function showPreview() {
  const frame = document.querySelector("#runner");
  const note = document.querySelector("#home-note");
  if (!frame) return;
  frame.hidden = false;
  if (note) note.hidden = true;
  frame.src = `${base}/preview/`;
}

function askCreate(folder, placeholder, asFolder) {
  if (naming) return;
  if (folder && state.collapsed.has(folder)) {
    state.collapsed.delete(folder);
    treeSig = "";
    renderTree();
  }
  const anchor = folder ? document.querySelector(`#tree [data-folder="${cssAttr(folder)}"]`) : document.querySelector("#tree");
  if (!anchor) return;
  naming = true;
  const row = document.createElement("form");
  row.className = "inline-create";
  row.innerHTML = `<input aria-label="Name" placeholder="${esc(placeholder)}"><button type="submit">Add</button>`;
  if (anchor.dataset?.folder) anchor.after(row);
  else anchor.prepend(row);
  const input = row.querySelector("input");
  input.focus();
  const finish = () => {
    naming = false;
    row.remove();
  };
  row.onsubmit = (event) => {
    event.preventDefault();
    const name = input.value.trim().replace(/^\/+|\/+$/g, "");
    finish();
    if (!name) return;
    const path = folder ? `${folder}/${name}` : name;
    createPath(asFolder ? `${path}/untitled.txt` : path).catch((err) => setSave(err.message));
  };
  input.onkeydown = (event) => { if (event.key === "Escape") finish(); };
  input.onblur = () => setTimeout(finish, 150);
}

async function createPath(path) {
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (!clean || state.files.some((file) => file.path === clean)) return;
  await api("/api/file", { method: "POST", body: { path: clean, content: "" } });
  state.files.push({ path: clean, content: "" });
  state.files.sort((a, b) => a.path.localeCompare(b.path));
  openPath(clean);
  setSave("Saved");
}

async function movePath(from, to) {
  if (!from || !to || from === to) return;
  await api("/api/rename", { method: "POST", body: { from, to } });
  const file = state.files.find((item) => item.path === from);
  if (file) file.path = to;
  state.opened = state.opened.map((item) => item === from ? to : item);
  if (state.active === from) state.active = to;
  treeSig = "";
  renderTree();
  setSave("Saved");
}

async function deletePath(path) {
  await api(`/api/file?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  state.files = state.files.filter((file) => file.path !== path);
  closePath(path);
  setSave("Saved");
}

function openMenu(event) {
  const row = event.target.closest("[data-path], [data-folder]");
  event.preventDefault();
  const path = row?.dataset.path || "";
  const folder = path ? path.split("/").slice(0, -1).join("/") : (row?.dataset.folder || "");
  let menu = document.querySelector("#tree-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "tree-menu";
    menu.className = "tree-menu";
    document.body.appendChild(menu);
  }
  const items = [];
  if (path) items.push(["open", "Open"], ["rename", "Rename"], ["delete", "Delete"]);
  items.push(["new-file", "New File"], ["new-folder", "New Folder"]);
  menu.innerHTML = items.map(([id, label]) => `<button type="button" data-act="${id}">${label}</button>`).join("");
  menu.hidden = false;
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 180)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 160)}px`;
  menu.onclick = (click) => {
    click.stopPropagation();
    const act = click.target.dataset.act;
    menu.hidden = true;
    if (act === "open") openPath(path);
    if (act === "rename") renamePath(path);
    if (act === "delete") deletePath(path).catch((err) => setSave(err.message));
    if (act === "new-file") askCreate(folder, "file.txt", false);
    if (act === "new-folder") askCreate(folder, "folder", true);
  };
}

function renamePath(path) {
  const name = path.split("/").pop();
  const folder = path.split("/").slice(0, -1).join("/");
  const row = document.querySelector(`#tree [data-path="${cssAttr(path)}"]`);
  if (!row || naming) return;
  naming = true;
  const form = document.createElement("form");
  form.className = "inline-create";
  form.innerHTML = `<input aria-label="Rename" value="${esc(name)}"><button type="submit">Rename</button>`;
  row.replaceWith(form);
  const input = form.querySelector("input");
  input.focus();
  const finish = () => {
    naming = false;
    treeSig = "";
    renderTree();
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    const next = input.value.trim().replace(/^\/+|\/+$/g, "");
    finish();
    if (!next || next === name) return;
    movePath(path, folder ? `${folder}/${next}` : next).catch((err) => setSave(err.message));
  };
  input.onkeydown = (event) => { if (event.key === "Escape") finish(); };
}

function hideMenu() {
  const menu = document.querySelector("#tree-menu");
  if (menu) menu.hidden = true;
}

function toggleFolder(folder) {
  if (state.collapsed.has(folder)) state.collapsed.delete(folder);
  else state.collapsed.add(folder);
  treeSig = "";
  renderTree();
}

function toggleComment() {
  if (!cm || !state.active) return;
  const style = commentStyle(state.active);
  const from = Math.min(cm.getCursor("from").line, cm.getCursor("to").line);
  const to = Math.max(cm.getCursor("from").line, cm.getCursor("to").line);
  const lines = [];
  for (let line = from; line <= to; line++) lines.push(cm.getLine(line));
  const on = lines.some((text) => text.trim()) && lines.filter((text) => text.trim()).every((text) => isLineCommented(text, style));
  cm.operation(() => {
    for (let line = from; line <= to; line++) {
      const text = cm.getLine(line);
      cm.replaceRange(on ? uncommentLine(text, style) : commentLine(text, style), { line, ch: 0 }, { line, ch: text.length });
    }
  });
}

function commentStyle(path) {
  const name = String(path || "").toLowerCase();
  if (/\.(html?|xml|svg|md)$/.test(name)) return { kind: "wrap", open: "<!--", close: "-->" };
  if (name.endsWith(".css")) return { kind: "wrap", open: "/*", close: "*/" };
  if (/\.(java|c|h|cpp|cc|cxx|hpp|js|mjs|json)$/.test(name)) return { kind: "line", mark: "//" };
  return { kind: "line", mark: "#" };
}

function isLineCommented(text, style) {
  const body = text.trim();
  if (!body) return false;
  if (style.kind === "line") return body.startsWith(style.mark);
  return body.startsWith(style.open) && body.endsWith(style.close);
}

function commentLine(text, style) {
  const indent = text.match(/^\s*/)[0];
  const rest = text.slice(indent.length);
  if (style.kind === "line") return rest ? `${indent}${style.mark} ${rest}` : `${indent}${style.mark}`;
  return rest ? `${indent}${style.open} ${rest} ${style.close}` : `${indent}${style.open} ${style.close}`;
}

function uncommentLine(text, style) {
  const indent = text.match(/^\s*/)[0];
  let rest = text.slice(indent.length);
  if (style.kind === "line") {
    rest = rest.startsWith(`${style.mark} `) ? rest.slice(style.mark.length + 1) : rest.slice(style.mark.length);
  } else if (rest.startsWith(style.open) && rest.endsWith(style.close)) {
    rest = rest.slice(style.open.length, rest.length - style.close.length).trim();
  }
  return `${indent}${rest}`;
}

function modeOf(path) {
  if (path?.endsWith(".py")) return "python";
  if (path?.endsWith(".css")) return "css";
  if (path?.endsWith(".js") || path?.endsWith(".mjs")) return "javascript";
  if (path?.endsWith(".html") || path?.endsWith(".htm")) return "htmlmixed";
  if (path?.endsWith(".java")) return "text/x-java";
  if (path?.endsWith(".c") || path?.endsWith(".h")) return "text/x-csrc";
  if (path?.endsWith(".cpp") || path?.endsWith(".cc") || path?.endsWith(".hpp")) return "text/x-c++src";
  return "text/plain";
}

function languageLabel(path) {
  if (!path) return "";
  if (path.endsWith(".py")) return "Python";
  if (path.endsWith(".js")) return "JavaScript";
  if (path.endsWith(".html") || path.endsWith(".htm")) return "HTML";
  if (path.endsWith(".css")) return "CSS";
  if (path.endsWith(".java")) return "Java";
  if (path.endsWith(".c") || path.endsWith(".h")) return "C";
  if (path.endsWith(".cpp") || path.endsWith(".cc")) return "C++";
  return "Text";
}

function fileIcon(path) {
  const ext = String(path).split(".").pop().toLowerCase();
  if (ext === "html" || ext === "htm") return LANG_ICON.html;
  if (ext === "css") return LANG_ICON.css;
  if (ext === "js" || ext === "mjs") return LANG_ICON.js;
  if (ext === "py") return LANG_ICON.py;
  const color = { java: "#e07a1f", c: "#8a8a8a", h: "#8a8a8a", cpp: "#e24a8d", cc: "#e24a8d", json: "#f1e05a", md: "#6a9fb5", txt: "#cccccc" }[ext] || "#858585";
  return `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><path fill="${color}" d="M3 1h7l3 3v11H3z"/><path fill="#1e1e1e" d="M10 1v3h3"/></svg>`;
}

function folderIcon(open) {
  return `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><path fill="#dcb67a" d="${open ? "M1 4h5l1 2h8v8H1z" : "M1 3h5l1 2h8v2H1zm0 4h14v7H1z"}"/></svg>`;
}

function asset(name) {
  const prefix = base.replace(/\/s\/[a-f0-9]{48}$/, "");
  return `${prefix}/assets/${name}`;
}

function setSave(text) {
  const node = document.querySelector("#save-state");
  if (node) node.textContent = text;
}

async function api(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 410) throw new Error(data.error || "This home link has ended.");
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function cssAttr(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
