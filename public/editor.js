import { applyBoard, openBoard } from "./board.js";
import { mergeText } from "./merge.js";

let session = null;
let editorState = null;
let cmEditor = null;
let saveGeneration = 0;
let treeSig = "";
let closing = false;

const PYTHON_WORDS = [
  "print", "input", "len", "range", "str", "int", "float", "list", "dict", "set", "tuple",
  "bool", "type", "open", "sum", "min", "max", "abs", "round", "enumerate", "zip", "map",
  "filter", "sorted", "reversed", "isinstance", "def", "return", "if", "elif", "else",
  "for", "while", "import", "from", "class", "try", "except", "with", "lambda", "True",
  "False", "None", "and", "or", "not", "in", "break", "continue", "pass", "append", "keys",
  "values", "items", "split", "join", "strip", "replace", "format",
];
const JS_WORDS = [
  "console", "log", "document", "querySelector", "querySelectorAll", "addEventListener",
  "function", "const", "let", "return", "if", "else", "for", "while", "class", "import",
  "export", "async", "await", "Math", "Array", "Object", "JSON", "parse", "stringify",
  "setTimeout", "fetch", "Promise", "map", "filter", "reduce", "forEach", "push", "pop",
  "length", "innerHTML", "textContent", "style", "preventDefault", "getElementById",
];

const ICON = {
  files: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h7v6H4zm9 0h7v6h-7zM4 13h7v6H4zm9 0h7v6h-7z"/></svg>`,
  teach: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 2 8l10 5 8-4v6h2V8zm-6 9.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.8l-6 3z"/></svg>`,
  lead: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6zm-1 13-3.5-3.5 1.4-1.4L11 12.2l4.1-4.1 1.4 1.4z"/></svg>`,
};
const CHEVRON = `<svg class="twist-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 4l4 4-4 4z"/></svg>`;
const LANG_ICON = {
  py: `<svg class="ficon" viewBox="0 0 32 32" aria-hidden="true"><path fill="#3776AB" d="M15.8 2.2c-4.6 0-4.4 2-4.4 2l.01 2.1h4.6v.6H8.6S4.8 6.6 4.8 12.6c0 6 3.4 5.8 3.4 5.8h2v-2s-.1-2.3 2.3-2.3h4.5s2.2.2 2.2-2.2V4.5s.1-2.3-3.4-2.3zm-2.5 2.1c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2-1.2-.5-1.2-1.2.5-1.2 1.2-1.2z"/><path fill="#FFD43B" d="M16.2 29.8c4.6 0 4.4-2 4.4-2l-.01-2.1h-4.6v-.6h7.4s3.8-.3 3.8-6.3-3.4-5.8-3.4-5.8h-2v2s.1 2.3-2.3 2.3h-4.5s-2.2-.2-2.2 2.2v7.2s-.1 2.3 3.5 2.3zm2.5-2.1c-.7 0-1.2-.5-1.2-1.2s.5-1.2 1.2-1.2 1.2.5 1.2 1.2-.5 1.2-1.2 1.2z"/></svg>`,
  html: `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><path fill="#E34F26" d="M1.4 1h13.2L13.3 14.2 8 15.6 2.7 14.2z"/><path fill="#F16529" d="M8 2.1v12.3l4.2-1.2 1.1-11.1z"/><path fill="#EBEBEB" d="M8 5.1H4.5l.2 1.8H8v1.5H3.4l.4 3.7L8 13.3V11.7l-2.2-.6.2-1.3H8z"/><path fill="#fff" d="M8 5.1v1.6h2.8l-.2 1.7H8v1.4h2.3l-.3 2.6L8 13.3V11.7l2-.5-.1-1.2H8V8.4h3.2l.3-3.3z"/></svg>`,
  htm: `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><path fill="#E34F26" d="M1.4 1h13.2L13.3 14.2 8 15.6 2.7 14.2z"/><path fill="#F16529" d="M8 2.1v12.3l4.2-1.2 1.1-11.1z"/><path fill="#EBEBEB" d="M8 5.1H4.5l.2 1.8H8v1.5H3.4l.4 3.7L8 13.3V11.7l-2.2-.6.2-1.3H8z"/><path fill="#fff" d="M8 5.1v1.6h2.8l-.2 1.7H8v1.4h2.3l-.3 2.6L8 13.3V11.7l2-.5-.1-1.2H8V8.4h3.2l.3-3.3z"/></svg>`,
  css: `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><path fill="#264DE4" d="M1.4 1h13.2L13.3 14.2 8 15.6 2.7 14.2z"/><path fill="#2965F1" d="M8 2.1v12.3l4.2-1.2 1.1-11.1z"/><path fill="#EBEBEB" d="M8 5.1H4.5l.2 1.8H8v1.5H3.5l.2 2.2h2.5l.2 1.5L8 13.3V11.7l-1.4-.4.1-.9H8z"/><path fill="#fff" d="M8 5.1v1.6h2.8l-.1 1.3H8v1.5h2.4l-.2 2.2L8 13.3V11.7l1.3-.3-.1-.9H8V8.4h3.3l.3-3.3z"/></svg>`,
  js: `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="#F7DF1E"/><text x="8" y="11.6" text-anchor="middle" font-size="7.4" font-family="Arial,sans-serif" font-weight="700" fill="#323330">JS</text></svg>`,
  mjs: `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="#F7DF1E"/><text x="8" y="11.6" text-anchor="middle" font-size="7.4" font-family="Arial,sans-serif" font-weight="700" fill="#323330">JS</text></svg>`,
};

window.addEventListener("pagehide", () => {
  if (closing || session?.me?.role !== "student" || editorState?.project?.kind !== "github") return;
  navigator.sendBeacon?.(
    `/api/projects/${editorState.id}/close`,
    new Blob([JSON.stringify({})], { type: "application/json" }),
  );
});

export async function openEditor({ app, id, me, api, esc }) {
  interrupt(true);
  session = { me, api, esc };
  closing = false;
  let opened;
  try {
    opened = await api(`/api/projects/${id}`);
  } catch (err) {
    app.innerHTML = `<div class="main"><p class="error">${esc(err.message)}</p><a href="#/">Back</a></div>`;
    return;
  }
  const files = (opened.files || []).filter((file) => !hidden(file.path));
  for (const file of files) {
    file.baseContent = file.content;
    file.baseRevision = opened.project.revision;
  }
  const first = files[0]?.path || "";
  editorState = {
    id,
    project: opened.project,
    files,
    collapsed: new Set(),
    opened: first ? [first] : [],
    active: first,
    dirty: false,
    boardDoc: null,
    remotes: new Map(),
    source: null,
    controls: opened.controls || {},
    seenForce: 0,
  };
  treeSig = "";
  const teacher = me.role !== "student";
  app.innerHTML = `<div class="ide">
    <header class="ide-titlebar">
      <a class="logo" href="#/"><img src="/logo.png" alt="">IDE</a>
      <span class="title">${esc(opened.project.title)}</span>
      <span class="spacer"></span>
      <span id="viewers"></span>
      <button id="run" title="Run the open file">▶</button>
      <button id="board-btn">Board</button>
      ${teacher && opened.project.ownerRole === "student" ? `<button id="guide-btn">Guide</button>` : ""}
      ${teacher ? `<button id="report-btn">Report</button>` : ""}
      <button id="export">Export</button>
      <button id="back">Back</button>
    </header>
    ${teacher ? `<div class="banner">You are in ${esc(opened.project.ownerName)}'s project. This visit is logged. A session lead can force a commit, and that name is saved in the message.</div>` : ""}
    ${!teacher && opened.project.kind === "github" ? `<div class="banner">Closing this project commits to your GitHub and removes the code from TeachForth.</div>` : ""}
    <div class="ide-body">
      <nav class="activity" aria-label="Views">
        <button class="on" data-view="files" title="Explorer" aria-label="Explorer">${ICON.files}</button>
        ${editorState.controls.teacher ? `<button data-view="teach" title="Teacher controls" aria-label="Teacher controls">${ICON.teach}</button>` : ""}
        ${editorState.controls.lead ? `<button data-view="lead" title="Session lead" aria-label="Session lead">${ICON.lead}</button>` : ""}
      </nav>
      <aside class="explorer">
        <div id="view-files">
          <div class="explorer-head"><span>Explorer</span><span class="explorer-actions"><button id="new-file" title="New file">+ File</button><button id="new-folder" title="New folder">+ Folder</button></span></div>
          <p class="explorer-project">${esc(opened.project.title)}</p>
          <div id="tree" data-folder=""></div>
        </div>
        <div id="view-teach" class="side-panel" hidden></div>
        <div id="view-lead" class="side-panel" hidden></div>
      </aside>
      <div class="editor-pane">
        <div class="tabs-files" id="file-tabs"></div>
        <div class="code-host">
          <div id="welcome" class="welcome">Open a file from the explorer, or make a new one.</div>
          <textarea id="code" class="fallback-editor" spellcheck="false"></textarea>
        </div>
      </div>
      <section class="preview-pane terminal-pane">
        <div class="pane-bar">
          <span>Terminal</span>
          <span class="spacer"></span>
          <span id="save-state">Saved</span>
          <button id="play" title="Run the open file">▶</button>
          <button id="open-window" hidden>Open</button>
          ${teacher ? `<button id="publish">Publish</button>` : ""}
        </div>
        <div id="term" class="term">
          <div id="term-log" role="log"></div>
          <form id="term-form" class="term-form" autocomplete="off">
            <span id="term-prompt" class="prompt"></span>
            <input id="term-input" spellcheck="false" autocapitalize="off" aria-label="Terminal command">
          </form>
        </div>
        <iframe id="runner" sandbox="allow-scripts allow-modals" title="Runner"></iframe>
      </section>
    </div>
    <footer class="statusbar"><span id="status-file">No file</span><span class="spacer"></span><span id="status-lang"></span></footer>
  </div>`;
  document.querySelector("#back").onclick = () => leaveProject();
  document.querySelector("#run").onclick = play;
  document.querySelector("#play").onclick = play;
  document.querySelector("#open-window").onclick = openPreview;
  if (teacher) document.querySelector("#publish").onclick = publishSite;
  document.querySelector("#export").onclick = () => { location.href = `/api/projects/${id}/export.zip`; };
  document.querySelector("#board-btn").onclick = () => openLiveBoard();
  document.querySelector("#new-file").onclick = () => askCreate(document.querySelector("#tree"), "", "notes.txt");
  document.querySelector("#new-folder").onclick = () => askCreate(document.querySelector("#tree"), "", "src", true);
  const tree = document.querySelector("#tree");
  tree.oncontextmenu = (event) => openTreeMenu(event);
  tree.ondragover = (event) => event.preventDefault();
  tree.ondrop = (event) => {
    if (event.target.closest("[data-folder]")) return;
    const from = event.dataTransfer.getData("text/plain");
    const name = from.split("/").pop();
    if (from && name && from !== name) movePath(from, name);
  };
  if (!document.body.dataset.treeMenu) {
    document.body.dataset.treeMenu = "1";
    document.addEventListener("click", () => {
      const menu = document.querySelector("#tree-menu");
      if (menu) menu.hidden = true;
    });
  }
  for (const button of document.querySelectorAll(".activity button")) {
    button.onclick = () => switchView(button.dataset.view);
  }
  if (teacher) document.querySelector("#report-btn").onclick = () => { location.hash = `#/person/${opened.project.ownerId}/reports`; };
  const guideBtn = document.querySelector("#guide-btn");
  if (guideBtn) guideBtn.onclick = () => toggleGuide();
  connectLive();
  renderExplorer();
  mountEditor();
  if (first) showActiveFile(false);
  else showWelcome();
  welcomeTerm();
  applyControls(editorState.controls);
  poll();
}

async function leaveProject() {
  document.querySelector("#teach-guide")?.remove();
  interrupt(true);
  const back = editorState?.project?.kind === "sandbox" ? "#/sandbox" : "#/";
  if (session?.me?.role === "student" && editorState?.project?.kind === "github") {
    try {
      closing = true;
      await flush();
      await session.api(`/api/projects/${editorState.id}/close`, { method: "POST", body: {} });
    } catch (err) {
      closing = false;
      setSaveState(err.message, /link github/i.test(err.message) ? "/api/github/connect" : "");
      return;
    }
  }
  editorState?.source?.close();
  location.hash = back;
}

function takeServerFiles(files, revision) {
  const old = new Map(editorState.files.map((file) => [file.path, file]));
  editorState.files = files.filter((file) => !hidden(file.path)).map((file) => {
    const prev = old.get(file.path);
    return { ...file, baseContent: prev?.baseContent ?? file.content, baseRevision: revision };
  });
  editorState.project.revision = revision;
}

function visibleFiles() {
  return editorState.files.filter((file) => !hidden(file.path));
}

function hidden(path) {
  return path === ".teachforth" || String(path || "").endsWith("/.teachforth");
}

function renderExplorer() {
  const files = visibleFiles();
  const sig = `${files.map((file) => `${file.path}:${file.locked ? 1 : 0}${file.hidden ? 1 : 0}${file.skipGithub ? 1 : 0}`).join("|")}|${editorState.opened.join(",")}|${editorState.active}|${[...(editorState.collapsed || [])].sort().join(",")}`;
  const tree = document.querySelector("#tree");
  const tabs = document.querySelector("#file-tabs");
  if (!tree || !tabs) return;
  if (sig !== treeSig && !naming) {
    treeSig = sig;
    tree.innerHTML = files.length ? treeHtml(files) : `<p class="muted tree-empty">No files yet.</p>`;
    tabs.innerHTML = editorState.opened.map((path) =>
      `<button class="tab ${path === editorState.active ? "active" : ""}" data-tab="${esc(path)}">${fileIcon(path)}<span>${esc(path.split("/").pop())}</span><i data-close="${esc(path)}" title="Close">×</i></button>`,
    ).join("");
  } else {
    for (const button of tabs.querySelectorAll("[data-tab]")) {
      button.classList.toggle("active", button.dataset.tab === editorState.active);
    }
    for (const row of tree.querySelectorAll("[data-path]")) {
      row.classList.toggle("active", row.dataset.path === editorState.active);
    }
  }
  bindTree(tree, tabs);
  const status = document.querySelector("#status-file");
  const lang = document.querySelector("#status-lang");
  if (status) status.textContent = editorState.active || "No file open";
  if (lang) lang.textContent = languageLabel(editorState.active);
  const welcome = document.querySelector("#welcome");
  if (welcome) welcome.hidden = Boolean(editorState.active);
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
  return nodeHtml(root, 0);
}

function nodeHtml(node, depth, prefix = "") {
  let html = "";
  const collapsed = editorState.collapsed || new Set();
  for (const [name, child] of node.dirs) {
    const folder = prefix ? `${prefix}/${name}` : name;
    const open = !collapsed.has(folder);
    html += `<div class="tree-row folder ${open ? "open" : ""}" data-folder="${esc(folder)}" style="--depth:${depth}" title="${esc(folder)}">
      <button class="twist" data-twist="${esc(folder)}" type="button" aria-label="Toggle ${esc(name)}">${CHEVRON}</button>
      ${folderIcon(open)}
      <span class="tname">${esc(name)}</span>
      <button class="add" data-add="${esc(folder)}" type="button" title="New file">+</button>
    </div>${open ? nodeHtml(child, depth + 1, folder) : ""}`;
  }
  for (const path of node.files) {
    const file = editorState.files.find((item) => item.path === path);
    const badges = [file?.locked ? "Locked" : "", file?.hidden ? "Hidden" : "", file?.skipGithub ? "Off GitHub" : ""].filter(Boolean);
    html += `<div class="tree-row file-row ${path === editorState.active ? "active" : ""}" draggable="true" data-path="${esc(path)}" style="--depth:${depth}" title="${esc(path)}">
      <span class="twist"></span>${fileIcon(path)}<span class="tname">${esc(path.split("/").pop())}</span>${badges.map((mark) => `<span class="badge">${esc(mark)}</span>`).join("")}
    </div>`;
  }
  return html;
}

function cssAttr(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function fileIcon(path) {
  const ext = String(path).split(".").pop().toLowerCase();
  if (LANG_ICON[ext]) return LANG_ICON[ext];
  const color = { java: "#e07a1f", c: "#8a8a8a", h: "#8a8a8a", cpp: "#e24a8d", cc: "#e24a8d", json: "#f1e05a", md: "#6a9fb5", txt: "#cccccc" }[ext] || "#858585";
  return `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><path fill="${color}" d="M3 1h7l3 3v11H3z"/><path fill="#1e1e1e" d="M10 1v3h3"/></svg>`;
}

function folderIcon(open) {
  return `<svg class="ficon" viewBox="0 0 16 16" aria-hidden="true"><path fill="#dcb67a" d="${open ? "M1 4h5l1 2h8v8H1z" : "M1 3h5l1 2h8v2H1zm0 4h14v7H1z"}"/></svg>`;
}

function toggleFolder(folder) {
  if (!editorState.collapsed) editorState.collapsed = new Set();
  if (editorState.collapsed.has(folder)) editorState.collapsed.delete(folder);
  else editorState.collapsed.add(folder);
  treeSig = "";
  renderExplorer();
}

function openTreeMenu(event) {
  const row = event.target.closest("[data-path], [data-folder]");
  event.preventDefault();
  event.stopPropagation();
  const path = row?.dataset.path || "";
  const folder = path ? path.split("/").slice(0, -1).join("/") : (row?.dataset.folder || "");
  const items = [];
  if (path) {
    items.push(
      { id: "open", label: "Open", path },
      { id: "rename", label: "Rename", path },
      { id: "delete", label: "Delete", path },
      { id: "copy", label: "Copy Path", path },
    );
  }
  items.push(
    { id: "new-file", label: "New File", folder },
    { id: "new-folder", label: "New Folder", folder },
  );
  let menu = document.querySelector("#tree-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "tree-menu";
    menu.className = "tree-menu";
    document.body.appendChild(menu);
  }
  menu.innerHTML = items.map((item) => `<button type="button" data-act="${item.id}">${esc(item.label)}</button>`).join("");
  menu.hidden = false;
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 180)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 40 - items.length * 28)}px`;
  menu.onclick = (click) => {
    click.stopPropagation();
    const act = click.target.dataset.act;
    menu.hidden = true;
    if (act === "open") openPath(path);
    if (act === "rename") renamePath(path);
    if (act === "delete") deletePath(path);
    if (act === "copy") navigator.clipboard?.writeText(path).catch(() => {});
    if (act === "new-file") askCreate(row || document.querySelector("#tree"), folder, "file.txt");
    if (act === "new-folder") askCreate(row || document.querySelector("#tree"), folder, "folder", true);
  };
}

let naming = false;

function askCreate(parent, folder, placeholder, asFolder = false) {
  if (!parent || naming) return;
  if (folder && editorState.collapsed?.has(folder)) {
    editorState.collapsed.delete(folder);
    treeSig = "";
    renderExplorer();
  }
  const anchor = folder ? document.querySelector(`#tree [data-folder="${cssAttr(folder)}"]`) : parent;
  if (!anchor) return;
  naming = true;
  const row = document.createElement("form");
  row.className = "inline-create";
  row.style.setProperty("--depth", String(folder ? folder.split("/").length : 0));
  row.innerHTML = `<input aria-label="Name" placeholder="${esc(placeholder)}"><button type="submit">Add</button>`;
  if (anchor.dataset?.folder || anchor.dataset?.path) anchor.after(row);
  else anchor.prepend(row);
  const input = row.querySelector("input");
  input.focus();
  const finish = () => { naming = false; row.remove(); };
  row.onsubmit = (event) => {
    event.preventDefault();
    const name = input.value.trim().replace(/^\/+|\/+$/g, "");
    finish();
    if (!name) return;
    const path = folder ? `${folder}/${name}` : name;
    createPath(asFolder ? `${path}/untitled.txt` : path).catch((err) => setSaveState(err.message));
  };
  input.onkeydown = (event) => { if (event.key === "Escape") finish(); };
  input.onblur = () => setTimeout(finish, 150);
}

function bindTree(tree, tabs) {
  for (const row of tree.querySelectorAll("[data-path]")) {
    row.onclick = () => openPath(row.dataset.path);
    row.ondragstart = (event) => {
      event.dataTransfer.setData("text/plain", row.dataset.path);
      event.dataTransfer.effectAllowed = "move";
    };
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
      askCreate(button.parentElement, button.dataset.add, "file.txt");
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
      const to = folder.dataset.folder ? `${folder.dataset.folder}/${name}` : name;
      if (from && to && from !== to) movePath(from, to);
    };
  }
  for (const button of tabs.querySelectorAll("[data-tab]")) {
    button.onclick = (event) => {
      if (event.target.dataset.close) return;
      openPath(button.dataset.tab);
    };
  }
  for (const button of tabs.querySelectorAll("[data-close]")) {
    button.onclick = (event) => {
      event.stopPropagation();
      closeTab(button.dataset.close);
    };
  }
}

async function openPath(path) {
  if (!path || path === editorState.active) return;
  await flush();
  if (!editorState.opened.includes(path)) editorState.opened.push(path);
  editorState.active = path;
  treeSig = "";
  renderExplorer();
  showActiveFile(true);
}

async function closeTab(path) {
  await flush();
  editorState.opened = editorState.opened.filter((item) => item !== path);
  if (editorState.active === path) editorState.active = editorState.opened.at(-1) || "";
  treeSig = "";
  renderExplorer();
  if (editorState.active) showActiveFile(true);
  else showWelcome();
}

async function createPath(path) {
  if (!path) return;
  const data = await session.api(`/api/projects/${editorState.id}/files`, { method: "POST", body: { path } });
  takeServerFiles(data.files, data.revision);
  if (!editorState.opened.includes(path)) editorState.opened.push(path);
  editorState.active = path;
  treeSig = "";
  renderExplorer();
  showActiveFile(true);
}

async function renamePath(from) {
  const row = document.querySelector(`[data-path="${CSS.escape(from)}"]`);
  if (!row || naming) return;
  naming = true;
  const input = document.createElement("input");
  input.value = from;
  input.className = "inline-name";
  row.replaceChildren(input);
  input.focus();
  input.select();
  const finish = () => { naming = false; treeSig = ""; renderExplorer(); };
  input.onkeydown = async (event) => {
    if (event.key === "Escape") return finish();
    if (event.key !== "Enter") return;
    event.preventDefault();
    const to = input.value.trim();
    naming = false;
    if (!to || to === from) return finish();
    await movePath(from, to);
  };
  input.onblur = () => setTimeout(() => { if (naming) finish(); }, 150);
}

async function movePath(from, to) {
  await flush();
  const data = await session.api(`/api/projects/${editorState.id}/rename`, { method: "POST", body: { from, to } });
  takeServerFiles(data.files, data.revision);
  editorState.opened = editorState.opened.map((path) => path === from ? to : path);
  if (editorState.active === from) editorState.active = to;
  treeSig = "";
  renderExplorer();
}

async function deletePath(path) {
  if (!confirm(`Delete ${path}?`)) return;
  await flush();
  const data = await session.api(`/api/projects/${editorState.id}/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  takeServerFiles(data.files, data.revision);
  editorState.opened = editorState.opened.filter((item) => item !== path);
  if (editorState.active === path) editorState.active = editorState.opened.at(-1) || "";
  treeSig = "";
  renderExplorer();
  if (editorState.active) showActiveFile(true);
  else showWelcome();
}

function mountEditor() {
  const area = document.querySelector("#code");
  area.value = activeFile()?.content || "";
  area.addEventListener("input", markDirty);
  area.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      flush();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "/") {
      event.preventDefault();
      toggleComment();
    }
  });
  if (!window.CodeMirror) {
    area.focus();
    return;
  }
  cmEditor = window.CodeMirror.fromTextArea(area, {
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    mode: modeOf(editorState.active),
    autoCloseBrackets: true,
    autoCloseTags: true,
    matchBrackets: true,
    extraKeys: {
      "Ctrl-Enter": () => run(),
      "Cmd-Enter": () => run(),
      "Ctrl-S": () => flush(),
      "Cmd-S": () => flush(),
      "Ctrl-/": () => toggleComment(),
      "Cmd-/": () => toggleComment(),
      "Ctrl-Space": "autocomplete",
      "Alt-Space": "autocomplete",
      Tab: (cm) => {
        if (cm.state.completionActive) return window.CodeMirror.Pass;
        cm.execCommand("indentMore");
      },
    },
    hintOptions: { hint: complete, completeSingle: false, closeOnUnfocus: true },
  });
  cmEditor.on("change", (_cm, change) => {
    if (!change || change.origin === "setValue") return;
    if (cmEditor.getValue() === (activeFile()?.content || "")) return;
    markDirty();
  });
  cmEditor.on("inputRead", (_cm, change) => {
    if (!change || change.origin !== "+input" || cmEditor.state.completionActive) return;
    const typed = change.text.join("");
    if (typed === "<" || /[\w.]$/.test(typed)) {
      const token = cmEditor.getTokenAt(cmEditor.getCursor());
      if (/\b(?:comment|string)\b/.test(token.type || "") && typed !== "<") return;
      cmEditor.showHint({ hint: complete, completeSingle: false });
    }
  });
  cmEditor.on("cursorActivity", sendCursor);
  cmEditor.setSize("100%", "100%");
  requestAnimationFrame(() => cmEditor.refresh());
}

function showActiveFile(focus) {
  const value = activeFile()?.content || "";
  if (cmEditor) {
    cmEditor.setOption("mode", modeOf(editorState.active));
    cmEditor.setOption("readOnly", fileLocked());
    writeEditor(value, false);
    if (focus) cmEditor.focus();
  } else {
    const area = document.querySelector("#code");
    if (area) {
      area.value = value;
      area.readOnly = fileLocked();
      if (focus) area.focus();
    }
  }
  editorState.dirty = false;
  const welcome = document.querySelector("#welcome");
  if (welcome) welcome.hidden = true;
}

function showWelcome() {
  if (cmEditor) {
    writeEditor("", false);
    cmEditor.setOption("readOnly", true);
  }
  const welcome = document.querySelector("#welcome");
  if (welcome) welcome.hidden = false;
  editorState.dirty = false;
}

function writeEditor(value, keepCursor) {
  if (!cmEditor) {
    const area = document.querySelector("#code");
    if (!area || area.value === value) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    area.value = value;
    if (keepCursor) {
      area.selectionStart = Math.min(start, value.length);
      area.selectionEnd = Math.min(end, value.length);
    }
    return;
  }
  if (cmEditor.getValue() === value) return;
  const selections = cmEditor.listSelections();
  const scroll = cmEditor.getScrollInfo();
  const focused = cmEditor.hasFocus();
  cmEditor.operation(() => {
    cmEditor.setValue(value);
    if (keepCursor) {
      const maxLine = Math.max(0, cmEditor.lineCount() - 1);
      cmEditor.setSelections(selections.map((sel) => ({
        anchor: clampPos(sel.anchor, maxLine),
        head: clampPos(sel.head, maxLine),
      })));
      cmEditor.scrollTo(scroll.left, scroll.top);
    }
  });
  if (keepCursor && focused) cmEditor.focus();
}

function clampPos(pos, maxLine) {
  const line = Math.max(0, Math.min(pos?.line || 0, maxLine));
  const text = cmEditor.getLine(line) || "";
  return { line, ch: Math.max(0, Math.min(pos?.ch || 0, text.length)) };
}

function commentStyle(path) {
  const name = String(path || "").toLowerCase();
  if (/\.(html?|xml|svg|md)$/.test(name)) return { kind: "wrap", open: "<!--", close: "-->" };
  if (name.endsWith(".css")) return { kind: "wrap", open: "/*", close: "*/" };
  if (/\.(java|c|h|cpp|cc|cxx|hpp|js|mjs|json|ts|tsx)$/.test(name)) return { kind: "line", mark: "//" };
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
    if (!rest.startsWith(style.mark)) return text;
    rest = rest.slice(style.mark.length);
    if (rest.startsWith(" ")) rest = rest.slice(1);
    return indent + rest;
  }
  if (rest.startsWith(style.open)) rest = rest.slice(style.open.length).replace(/^ /, "");
  if (rest.endsWith(style.close)) rest = rest.slice(0, -style.close.length).replace(/ $/, "");
  return indent + rest;
}

function toggleComment() {
  if (!editorState?.active) return;
  const style = commentStyle(editorState.active);
  if (cmEditor) toggleCmComment(cmEditor, style);
  else toggleAreaComment(style);
  markDirty();
}

function selectionLines(anchor, head) {
  let from = Math.min(anchor.line, head.line);
  let to = Math.max(anchor.line, head.line);
  const end = anchor.line > head.line ? anchor : head;
  if (from !== to && end.ch === 0) to -= 1;
  return [from, Math.max(from, to)];
}

function toggleCmComment(cm, style) {
  const lines = [...new Set(cm.listSelections().flatMap((sel) => {
    const [from, to] = selectionLines(sel.anchor, sel.head);
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }))].sort((a, b) => a - b);
  if (!lines.length) return;
  const texts = lines.map((line) => cm.getLine(line) || "");
  const content = texts.filter((text) => text.trim());
  const uncomment = content.length > 0 && content.every((text) => isLineCommented(text, style));
  cm.operation(() => {
    for (const line of lines) {
      const text = cm.getLine(line) || "";
      const next = uncomment ? (text.trim() ? uncommentLine(text, style) : text) : commentLine(text, style);
      if (next !== text) cm.replaceRange(next, { line, ch: 0 }, { line, ch: text.length });
    }
  });
}

function toggleAreaComment(style) {
  const area = document.querySelector("#code");
  if (!area) return;
  const value = area.value;
  const start = area.selectionStart || 0;
  const end = area.selectionEnd || 0;
  const lines = value.split("\n");
  const from = value.slice(0, start).split("\n").length - 1;
  let to = value.slice(0, end).split("\n").length - 1;
  if (start !== end && end > 0 && value[end - 1] === "\n") to -= 1;
  to = Math.max(from, to);
  const chosen = lines.slice(from, to + 1);
  const content = chosen.filter((text) => text.trim());
  const uncomment = content.length > 0 && content.every((text) => isLineCommented(text, style));
  for (let line = from; line <= to; line += 1) {
    lines[line] = uncomment ? (lines[line].trim() ? uncommentLine(lines[line], style) : lines[line]) : commentLine(lines[line], style);
  }
  area.value = lines.join("\n");
  const newStart = lines.slice(0, from).join("\n").length + (from ? 1 : 0);
  area.selectionStart = newStart;
  area.selectionEnd = lines.slice(0, to + 1).join("\n").length;
}

function modeOf(path) {
  if (path?.endsWith(".py")) return "python";
  if (path?.endsWith(".css")) return "css";
  if (path?.endsWith(".js") || path?.endsWith(".mjs")) return "javascript";
  if (path?.endsWith(".html") || path?.endsWith(".htm")) return "htmlmixed";
  if (path?.endsWith(".md")) return "markdown";
  if (path?.endsWith(".json")) return { name: "javascript", json: true };
  if (path?.endsWith(".java")) return "text/x-java";
  if (path?.endsWith(".c") || path?.endsWith(".h")) return "text/x-csrc";
  if (path?.endsWith(".cpp") || path?.endsWith(".cc") || path?.endsWith(".cxx") || path?.endsWith(".hpp")) return "text/x-c++src";
  return "text/plain";
}

function languageLabel(path) {
  if (!path) return "";
  if (path.endsWith(".py")) return "Python";
  if (path.endsWith(".js")) return "JavaScript";
  if (path.endsWith(".java")) return "Java";
  if (path.endsWith(".c") || path.endsWith(".h")) return "C";
  if (path.endsWith(".cpp") || path.endsWith(".cc") || path.endsWith(".cxx") || path.endsWith(".hpp")) return "C++";
  if (path.endsWith(".html")) return "HTML";
  if (path.endsWith(".css")) return "CSS";
  if (path.endsWith(".md")) return "Markdown";
  return "Plain text";
}

function activeFile() {
  return editorState?.files.find((file) => file.path === editorState.active);
}

function currentContent() {
  return cmEditor ? cmEditor.getValue() : (document.querySelector("#code")?.value || "");
}

function markDirty() {
  if (!editorState || !activeFile()) return;
  editorState.dirty = true;
  saveGeneration += 1;
  setSaveState("Editing");
  scheduleSave();
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { flush().catch(() => {}); }, 250);
}

async function flush(attempt = 0) {
  if (!editorState?.dirty) return;
  if (editorState.saving && attempt === 0) {
    scheduleSave();
    return;
  }
  const file = activeFile();
  if (!file) return;
  const content = currentContent();
  const gen = ++saveGeneration;
  const path = file.path;
  const baseRevision = file.baseRevision ?? editorState.project.revision;
  editorState.saving = true;
  setSaveState("Saving");
  try {
    const data = await session.api(`/api/projects/${editorState.id}/files`, {
      method: "PUT",
      body: { path, content, baseRevision },
    });
    if (!editorState) return;
    editorState.project.revision = data.revision;
    file.content = content;
    file.baseContent = content;
    file.baseRevision = data.revision;
    if (saveGeneration !== gen || currentContent() !== content) {
      editorState.dirty = true;
      scheduleSave();
      return;
    }
    editorState.dirty = false;
    setSaveState("Saved");
  } catch (err) {
    if (!editorState) return;
    if (err.status === 409 && typeof err.content === "string" && attempt < 2) {
      const merged = mergeText(file.baseContent ?? "", content, err.content);
      file.baseContent = err.content;
      file.baseRevision = err.revision ?? file.baseRevision;
      if (err.revision) editorState.project.revision = err.revision;
      file.content = merged;
      if (editorState.active === path) writeEditor(merged, true);
      editorState.dirty = true;
      editorState.saving = false;
      await flush(attempt + 1);
      return;
    }
    editorState.dirty = true;
    setSaveState(err.message);
  } finally {
    if (editorState) editorState.saving = false;
  }
}

async function poll() {
  const token = editorState;
  while (editorState === token && location.hash === `#/project/${token.id}`) {
    await sleep(2000);
    if (editorState !== token) return;
    try {
      const state = await session.api(`/api/projects/${token.id}/state?revision=${token.project.revision}&boardRevision=${token.project.boardRevision}`);
      paintViewers(state.viewers);
      if (state.files) adoptFiles(state.files, state.revision);
      if (state.controls) applyControls(state.controls);
      if (state.board) {
        token.boardDoc = state.board.slides ? state.board : { slides: [{ id: "s1", title: "Slide 1", strokes: [] }], index: 0 };
        token.project.boardRevision = state.boardRevision;
        applyBoard(token.boardDoc);
      }
    } catch {
      // Keep typing if a poll fails.
    }
  }
}

function paintViewers(viewers) {
  const el = document.querySelector("#viewers");
  if (!el || !session) return;
  const others = (viewers || []).filter((viewer) => viewer.id !== session.me.id);
  el.textContent = others.map((viewer) => `${viewer.name} is here`).join(" ");
}

function setSaveState(text, href) {
  const el = document.querySelector("#save-state");
  if (!el) return;
  el.replaceChildren(document.createTextNode(text || ""));
  if (!href) return;
  const link = document.createElement("a");
  link.href = href;
  link.textContent = "Link GitHub";
  el.append(link);
}

let runGen = 0;
let activeRun = null;
let inputMode = "shell";
let pendingOut = "";
let pendingKind = "";
let waitingInput = false;
let runOutput = "";
let pyWorker = null;
let ccWorker = null;
let javaWorker = null;
let jsListener = null;
let termHistory = [];
let historyIndex = 0;
let historyDraft = "";

const PYTHON_REPL = `import traceback
while True:
    try:
        line = input(">>> ")
    except EOFError:
        break
    if line.strip() in ("exit", "exit()", "quit", "quit()"):
        break
    try:
        exec(compile(line, "<stdin>", "single"))
    except Exception:
        traceback.print_exc()
`;

function welcomeTerm() {
  const form = document.querySelector("#term-form");
  const input = document.querySelector("#term-input");
  if (form && !form.dataset.bound) {
    form.dataset.bound = "1";
    form.addEventListener("submit", onTermSubmit);
    input.addEventListener("keydown", onTermKey);
    document.querySelector("#term").addEventListener("click", (event) => {
      if (event.target !== input) input.focus();
    });
  }
  setShellPrompt();
  termLine("Type a command, or press ▶ to run the open file.", "muted");
  termLine("Python, Java, C, C++, and Node run in a sandbox on the server.", "muted");
}

function fileLocked() {
  const file = activeFile();
  return Boolean(file?.locked && session?.me?.role === "student");
}

function switchView(name) {
  for (const button of document.querySelectorAll(".activity button")) {
    button.classList.toggle("on", button.dataset.view === name);
  }
  const files = document.querySelector("#view-files");
  const teach = document.querySelector("#view-teach");
  const lead = document.querySelector("#view-lead");
  if (files) files.hidden = name !== "files";
  if (teach) teach.hidden = name !== "teach";
  if (lead) lead.hidden = name !== "lead";
  if (name === "teach") paintTeach();
  if (name === "lead") paintLead();
}

function paintTeach() {
  const box = document.querySelector("#view-teach");
  if (!box || !editorState) return;
  const files = visibleFiles();
  const selected = files.some((file) => file.path === editorState.active) ? editorState.active : (files[0]?.path || "");
  const file = files.find((item) => item.path === selected);
  const card = (id, title, text, on) => `<div class="control-card"><div><strong>${title}</strong><p>${text}</p></div><input id="${id}" type="checkbox" aria-label="${title}" ${on ? "checked" : ""}></div>`;
  box.innerHTML = `<div class="explorer-head"><span>Teach</span></div>
    <label class="teach-pick">File this applies to<select id="teach-file">${files.map((item) => `<option ${item.path === selected ? "selected" : ""}>${esc(item.path)}</option>`).join("")}</select></label>
    ${card("lock-file", "Lock typing", "The student can read this file, but cannot change it.", file?.locked)}
    ${card("hide-file", "Hide from student", "Use this for answers. The student does not see the file.", file?.hidden)}
    ${card("skip-file", "Keep off GitHub", "This file stays in the lesson and is not committed.", file?.skipGithub || file?.hidden)}
    ${card("force-board", "Force the whiteboard", "Opens the board on the student's screen.", editorState.controls?.forceBoard)}
    ${card("lock-draw", "Lock student drawing", "The student can see the board, but cannot draw or type on it.", editorState.controls?.lockDraw)}`;
  const pick = box.querySelector("#teach-file");
  if (pick) pick.onchange = () => { editorState.active = pick.value; paintTeach(); };
  const flag = (id, key) => {
    const input = box.querySelector(id);
    if (!input || !pick?.value) return;
    input.onchange = () => setFileControl(pick.value, { [key]: input.checked }).catch((err) => setSaveState(err.message));
  };
  flag("#lock-file", "locked");
  flag("#hide-file", "hidden");
  flag("#skip-file", "skipGithub");
  box.querySelector("#force-board").onchange = (event) => setBoardControl({ forceBoard: event.target.checked });
  box.querySelector("#lock-draw").onchange = (event) => setBoardControl({ lockDraw: event.target.checked });
}

async function setFileControl(path, patch) {
  const data = await session.api(`/api/projects/${editorState.id}/controls`, { method: "PATCH", body: { path, ...patch } });
  takeServerFiles(data.files, data.revision);
  editorState.controls = { ...editorState.controls, ...data.controls };
  treeSig = "";
  renderExplorer();
  paintTeach();
}

async function setBoardControl(patch) {
  const data = await session.api(`/api/projects/${editorState.id}/controls`, { method: "PATCH", body: patch });
  applyControls(data.controls);
}

async function paintLead() {
  const box = document.querySelector("#view-lead");
  if (!box || !editorState) return;
  box.innerHTML = `<div class="explorer-head"><span>Lead</span></div><p class="muted">Checking GitHub…</p>`;
  let data = { issues: ["Could not check GitHub."], githubRepo: editorState.project.githubRepo || "" };
  try { data = await session.api(`/api/projects/${editorState.id}/lead`); } catch (err) { data.issues = [err.message]; }
  box.innerHTML = `<div class="explorer-head"><span>Lead</span></div>
    <p>${esc(data.githubRepo || "No repository")}</p>
    <p class="muted">${esc(data.githubUrl || "")}</p>
    ${(data.issues || []).map((issue) => `<p class="error">${esc(issue)}</p>`).join("") || `<p class="muted">No mismatch found.</p>`}
    <button id="force-commit" type="button">Force commit</button>
    <label>Project name<input id="lead-title" value="${esc(editorState.project.title)}"></label>
    <label><input id="rename-repo" type="checkbox"> Rename the GitHub repository too</label>
    <button id="save-title" type="button">Save name</button>
    <label>GitHub repo<input id="lead-repo" placeholder="student/TeachForth-name" value="${esc(data.githubRepo || "")}"></label>
    <button id="save-repo" type="button">Relink</button>`;
  box.querySelector("#force-commit").onclick = async () => {
    try {
      const saved = await session.api(`/api/projects/${editorState.id}/commit`, { method: "POST", body: {} });
      setSaveState(`Committed ${saved.sha?.slice(0, 7) || ""}`);
      paintLead();
    } catch (err) { setSaveState(err.message); }
  };
  box.querySelector("#save-title").onclick = () => saveLead({
    title: box.querySelector("#lead-title").value,
    renameRepo: box.querySelector("#rename-repo").checked,
  });
  box.querySelector("#save-repo").onclick = () => saveLead({ githubRepo: box.querySelector("#lead-repo").value });
}

async function saveLead(body) {
  try {
    const data = await session.api(`/api/projects/${editorState.id}/admin`, { method: "PATCH", body });
    if (data.project) editorState.project = { ...editorState.project, ...data.project };
    const title = document.querySelector(".ide-titlebar .title");
    if (title) title.textContent = editorState.project.title;
    setSaveState("Saved");
    paintLead();
  } catch (err) { setSaveState(err.message); }
}

function applyControls(controls) {
  if (!editorState || !controls) return;
  editorState.controls = { ...editorState.controls, ...controls };
  if (cmEditor) cmEditor.setOption("readOnly", fileLocked() || !editorState.active);
  const area = document.querySelector("#code");
  if (area) area.readOnly = fileLocked();
  if (controls.forceBoard && controls.forceSeq && controls.forceSeq !== editorState.seenForce && session?.me?.role === "student") {
    editorState.seenForce = controls.forceSeq;
    openLiveBoard();
  }
}

async function runServer(kind, path) {
  let file = path || "";
  if (file) {
    const found = resolveFile(file);
    if (found.error) {
      termLine(found.error, "err");
      return;
    }
    file = found.path;
  }
  const runKind = kind === "c" && /\.(cpp|cc|cxx)$/.test(file) ? "cpp" : kind;
  let started;
  try {
    started = await session.api(`/api/projects/${editorState.id}/exec`, { method: "POST", body: { kind: runKind, file } });
  } catch (err) {
    termLine(err.message || "Could not start", "err");
    return;
  }
  if (!editorState) return;
  const gen = runGen;
  activeRun = { id: started.runId, gen, kind: runKind, offset: 0 };
  pendingOut = "";
  pendingKind = "";
  runOutput = "";
  inputMode = "program";
  setRunning(true);
  const input = document.querySelector("#term-input");
  if (input) input.placeholder = "running… type input and press Enter";
  pollRun();
}

async function pollRun() {
  const run = activeRun;
  if (!run || run.gen !== runGen) return;
  try {
    const data = await session.api(`/api/runtime/output?run=${encodeURIComponent(run.id)}&offset=${run.offset || 0}`);
    if (!activeRun || activeRun.gen !== run.gen) return;
    if (data.text) appendOut(data.text, "");
    run.offset = data.offset;
    if (!data.done && pendingOut) {
      const span = document.querySelector("#term-prompt");
      if (span) {
        span.className = "live";
        span.textContent = pendingOut;
      }
    }
    if (data.done) {
      flushPending();
      termLine(data.exit ? `exited ${data.exit}` : "exited", data.exit ? "err" : "muted");
      finishRun();
      return;
    }
  } catch (err) {
    if (activeRun?.gen === run.gen) {
      termLine(err.message || "Lost the program", "err");
      finishRun();
    }
    return;
  }
  setTimeout(pollRun, 200);
}

async function play() {
  if (activeRun) {
    interrupt();
    return;
  }
  await flush();
  if (!editorState) return;
  const plan = planRun(editorState.active || "");
  commitShellLine(plan.cmd);
  await dispatch(plan);
}

function planRun(path) {
  const pkg = fileContent("package.json");
  if (path.endsWith(".py")) return { kind: "python", cmd: `python ${path}`, file: path };
  if (path.endsWith(".c")) return { kind: "c", cmd: `gcc ${path} && ./a.out`, file: path };
  if (path.endsWith(".cpp") || path.endsWith(".cc") || path.endsWith(".cxx")) return { kind: "c", cmd: `g++ ${path} && ./a.out`, file: path };
  if (path.endsWith(".java")) return { kind: "java", cmd: `java ${path}`, file: path };
  if (!path.endsWith(".html") && editorState.project.language === "python" && !fileContent("index.html")) {
    const py = visibleFiles().find((file) => file.path.endsWith(".py"));
    if (py) return { kind: "python", cmd: `python ${py.path}`, file: py.path };
  }
  if (path.endsWith(".js") && !fileContent("index.html")) return { kind: "node", cmd: `node ${path}`, file: path };
  if (path.endsWith(".md")) return { kind: "markdown", cmd: `teachforth preview ${path}`, file: path };
  if (path.endsWith(".html") || fileContent("index.html")) {
    const entry = path.endsWith(".html") ? path : "index.html";
    return { kind: "web", cmd: "teachforth serve --port 3000", entry };
  }
  if (pkg.includes('"next"')) return { kind: "next", cmd: "npm run dev" };
  return { kind: "none", cmd: path ? `teachforth run ${path}` : "teachforth run" };
}

function serveWeb(plan) {
  const url = previewUrl(plan.entry);
  termLine("Starting a browser preview. No port is opened on the VM.");
  termLine(`Ready  ${url}`);
  termLine("Only a signed-in person who can open this project can view it.", "muted");
  session.api(`/api/projects/${editorState.id}/run`, { method: "POST", body: { output: `serve ${url}` } }).catch(() => {});
}

function explainNext() {
  termLine("Next.js is not started on a server. TeachForth does not run student servers.", "err");
  termLine("Add index.html and press ▶ to open a private preview, or run a JavaScript file with node.", "muted");
}

function openPreview() {
  const plan = planRun(editorState?.active || "");
  const entry = plan.entry || "index.html";
  window.open(previewUrl(entry), "_blank", "noopener");
}

function previewUrl(entry) {
  return `${location.origin}/preview/${editorState.id}/?file=${encodeURIComponent(entry || "index.html")}`;
}

async function publishSite() {
  termCommand("teachforth publish");
  termLine("Copying the static page to the projects host…");
  try {
    const data = await session.api(`/api/projects/${editorState.id}/publish`, { method: "POST", body: {} });
    termLine(`Live  ${data.url}`);
    termLine("This page stays up when the IDE server is off.", "muted");
  } catch (err) {
    termLine(err.message, "err");
  }
}

function runJs(path, argv = []) {
  const found = resolveFile(path);
  if (!path || found.error || !found.path.endsWith(".js")) {
    termLine(found.error ? `node: ${found.error}` : "node: pass a .js file, like node main.js", "err");
    return;
  }
  const gen = runGen;
  activeRun = { id: null, gen, kind: "node" };
  runOutput = "";
  setRunning(true);
  const iframe = document.querySelector("#runner");
  const code = fileContent(found.path);
  const args = argv.length ? argv.map((item, index) => (index === 1 ? found.path : item)) : ["node", found.path];
  clearJsListener();
  jsListener = (event) => {
    if (gen !== runGen || event.source !== iframe.contentWindow) return;
    if (event.data?.type === "log") {
      runOutput += `${event.data.text ?? ""}\n`;
      termLine(String(event.data.text ?? ""));
    }
    if (event.data?.type === "err") {
      runOutput += `${event.data.text ?? ""}\n`;
      termLine(String(event.data.text ?? ""), "err");
    }
    if (event.data?.type === "ready") iframe.contentWindow?.postMessage({ type: "run", code, argv: args }, "*");
    if (event.data?.type === "done") {
      clearJsListener();
      termLine("exited", "muted");
      finishRun();
    }
  };
  window.addEventListener("message", jsListener);
  iframe.srcdoc = `<!DOCTYPE html><body><script>
    const send = (type, text) => parent.postMessage({ type, text }, "*");
    self.process = { argv: ["node"] };
    for (const name of ["log", "info", "warn", "error"]) {
      console[name] = (...args) => send(name === "error" ? "err" : "log", args.map((item) => {
        try { return typeof item === "string" ? item : JSON.stringify(item); }
        catch { return String(item); }
      }).join(" "));
    }
    window.addEventListener("error", (event) => send("err", event.message || "Error"));
    window.addEventListener("message", (event) => {
      if (event.data?.type !== "run") return;
      try {
        self.process.argv = event.data.argv || ["node"];
        (0, eval)(event.data.code || "");
        send("done", "");
      }
      catch (err) { send("err", err && err.message ? err.message : String(err)); send("done", ""); }
    });
    send("ready", "");
  <\/script></body>`;
}

function previewMarkdown(path) {
  const text = fileContent(path);
  termLine(text || "(empty)", text ? "" : "muted");
}

async function runPython(path, argv = []) {
  let code = PYTHON_REPL;
  let args = ["python"];
  if (path) {
    const found = resolveFile(path);
    if (found.error || !found.path.endsWith(".py")) {
      termLine(found.error ? `python: ${found.error}` : "python: pass a .py file", "err");
      return;
    }
    code = fileContent(found.path);
    args = ["python", found.path, ...argv];
  } else {
    termLine("Python prompt. exit() or Ctrl+C to leave.", "muted");
  }
  let started;
  try {
    started = await session.api("/api/runtime/runs", { method: "POST", body: {} });
  } catch (err) {
    termLine(err.message || "Could not start Python", "err");
    return;
  }
  if (!editorState) return;
  const gen = runGen;
  activeRun = { id: started.runId, gen, kind: "python" };
  pendingOut = "";
  pendingKind = "";
  runOutput = "";
  setRunning(true);
  const worker = ensureWorker();
  worker.postMessage({ type: "run", runId: started.runId, code, argv: args, gen });
}

async function runNative(kind, path) {
  const found = resolveFile(path);
  const ok = kind === "java" ? found.path?.endsWith(".java") : /\.(c|cpp|cc|cxx)$/.test(found.path || "");
  if (!path || found.error || !ok) {
    const tool = kind === "java" ? "java" : "gcc";
    termLine(found.error ? `${tool}: ${found.error}` : `${tool}: pass a source file`, "err");
    return;
  }
  let started;
  try {
    started = await session.api("/api/runtime/runs", { method: "POST", body: {} });
  } catch (err) {
    termLine(err.message || "Could not start", "err");
    return;
  }
  if (!editorState) return;
  const gen = runGen;
  activeRun = { id: started.runId, gen, kind };
  pendingOut = "";
  pendingKind = "";
  runOutput = "";
  setRunning(true);
  termLine("Running in your browser. Nothing is compiled on the server.", "muted");
  const worker = kind === "java" ? ensureJavaWorker() : ensureCcWorker();
  worker.postMessage({ type: "run", runId: started.runId, code: fileContent(found.path), gen });
}

function ensureCcWorker() {
  if (ccWorker) return ccWorker;
  ccWorker = new Worker("/cc-worker.js", { type: "module" });
  ccWorker.onmessage = onWorkerMessage;
  ccWorker.onerror = (event) => {
    termLine(event.message || "C/C++ failed to start", "err");
    ccWorker?.terminate();
    ccWorker = null;
    finishRun();
  };
  return ccWorker;
}

function ensureJavaWorker() {
  if (javaWorker) return javaWorker;
  javaWorker = new Worker("/java-worker.js", { type: "module" });
  javaWorker.onmessage = onWorkerMessage;
  javaWorker.onerror = (event) => {
    termLine(event.message || "Java failed to start", "err");
    javaWorker?.terminate();
    javaWorker = null;
    finishRun();
  };
  return javaWorker;
}

function ensureWorker() {
  if (pyWorker) return pyWorker;
  pyWorker = new Worker("/py-worker.js", { type: "module" });
  pyWorker.onmessage = onWorkerMessage;
  pyWorker.onerror = (event) => {
    termLine(event.message || "Python failed to start", "err");
    pyWorker?.terminate();
    pyWorker = null;
    finishRun();
  };
  return pyWorker;
}

function onWorkerMessage(event) {
  const msg = event.data || {};
  if (!activeRun || activeRun.gen !== runGen || !["python", "c", "java"].includes(activeRun.kind)) return;
  if (msg.type === "loading") termLine("Loading Python…", "muted");
  if (msg.type === "out") appendOut(msg.text, msg.kind || "");
  if (msg.type === "stdin") showProgramPrompt();
  if (msg.type === "done") {
    flushPending();
    if (!runOutput.trim()) termLine("(no output)", "muted");
    termLine("exited", "muted");
    finishRun();
  }
  if (msg.type === "error") {
    flushPending();
    termLine(msg.text || "Program error", "err");
    if (activeRun.kind === "c" || activeRun.kind === "java") {
      termLine("This runs in your browser, not on the server. It covers teaching programs, not every library.", "muted");
    }
    finishRun();
  }
}

function appendOut(text, kind) {
  runOutput += text;
  const parts = String(text).split("\n");
  parts.forEach((part, index) => {
    if (pendingOut && kind && pendingKind && kind !== pendingKind) flushPending();
    pendingKind = kind || pendingKind;
    pendingOut += part;
    if (index < parts.length - 1) flushPending();
  });
}

function flushPending() {
  if (!pendingOut) {
    pendingKind = "";
    return;
  }
  termLine(pendingOut, pendingKind);
  pendingOut = "";
  pendingKind = "";
}

function showProgramPrompt() {
  waitingInput = true;
  inputMode = "program";
  const span = document.querySelector("#term-prompt");
  const input = document.querySelector("#term-input");
  if (!span || !input) return;
  if (pendingOut.length > 120) flushPending();
  span.className = "live";
  span.textContent = pendingOut;
  pendingOut = "";
  pendingKind = "";
  input.placeholder = span.textContent ? "" : "program is waiting for input";
  input.focus();
}

async function onTermSubmit(event) {
  event.preventDefault();
  const input = document.querySelector("#term-input");
  const line = input.value;
  input.value = "";
  historyDraft = "";
  if (activeRun?.id && inputMode === "program") {
    waitingInput = false;
    const prefix = document.querySelector("#term-prompt").textContent || "";
    termLine(prefix + line);
    document.querySelector("#term-prompt").textContent = "";
    pendingOut = "";
    input.placeholder = "running…";
    try {
      await session.api("/api/runtime/stdin", { method: "POST", body: { run: activeRun.id, line } });
    } catch (err) {
      termLine(err.message, "err");
    }
    return;
  }
  const command = line.trim();
  if (!command) return;
  termHistory.push(command);
  historyIndex = termHistory.length;
  commitShellLine(command);
  if (activeRun) {
    termLine("A program is running. Press Ctrl+C or ■ to stop it.", "muted");
    return;
  }
  await dispatch(parseCommand(command));
}

function onTermKey(event) {
  if (event.key === "c" && event.ctrlKey) {
    event.preventDefault();
    if (activeRun) interrupt();
    else event.currentTarget.value = "";
    return;
  }
  if (event.key === "l" && event.ctrlKey) {
    event.preventDefault();
    clearTerm();
    return;
  }
  if (event.key === "Tab" && inputMode === "shell") {
    event.preventDefault();
    completeTerm(event.currentTarget);
    return;
  }
  if (inputMode !== "shell" || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
  if (!termHistory.length) return;
  event.preventDefault();
  if (event.key === "ArrowUp") {
    if (historyIndex === termHistory.length) historyDraft = event.currentTarget.value;
    historyIndex = Math.max(0, historyIndex - 1);
    event.currentTarget.value = termHistory[historyIndex];
  } else {
    historyIndex = Math.min(termHistory.length, historyIndex + 1);
    event.currentTarget.value = historyIndex === termHistory.length ? historyDraft : termHistory[historyIndex];
  }
}

function parseCommand(line) {
  const args = splitArgs(line);
  const cmd = (args[0] || "").toLowerCase();
  if (cmd === "help") return { kind: "help" };
  if (cmd === "clear") return { kind: "clear" };
  if (cmd === "pwd") return { kind: "pwd" };
  if (cmd === "ls" || cmd === "dir") return { kind: "ls" };
  if (cmd === "cat") return { kind: "cat", file: args.slice(1).join(" ") };
  if (cmd === "python" || cmd === "python3") return { kind: "python", file: args[1] || "", argv: args.slice(2), cmd: line };
  if (cmd === "node") return { kind: "node", file: args[1] || "", argv: args.slice(2), cmd: line };
  if (cmd === "gcc" || cmd === "clang") return { kind: "c", file: args.find((arg) => arg.endsWith(".c")) || "", cmd: line };
  if (cmd === "g++" || cmd === "clang++") return { kind: "c", file: args.find((arg) => /\.(cpp|cc|cxx)$/.test(arg)) || "", cmd: line };
  if (cmd === "java" || cmd === "javac") return { kind: "java", file: args.find((arg) => arg.endsWith(".java")) || "", cmd: line };
  if (cmd === "teachforth" && args[1] === "serve") return { kind: "web", entry: "index.html", cmd: line };
  return { kind: "unknown", cmd: args[0] || line };
}

function splitArgs(line) {
  const args = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(line))) args.push(match[1] ?? match[2] ?? match[3]);
  return args;
}

async function dispatch(plan) {
  const open = document.querySelector("#open-window");
  if (open) open.hidden = plan.kind !== "web";
  if (plan.kind === "help") {
    termLine("python [file]      run a Python file, or open a prompt");
    termLine("node <file>        run a JavaScript file");
    termLine("gcc <file>         compile and run a C file on the server");
    termLine("g++ <file>         compile and run a C++ file on the server");
    termLine("java <file>        compile and run a Java file on the server");
    termLine("ls                 list project files");
    termLine("cat <file>         print a file");
    termLine("teachforth serve   open the private preview");
    termLine("clear              clear this screen");
    termLine("Ctrl+C stops a program. A Python input() reads the bottom line.");
    return;
  }
  if (plan.kind === "clear") return clearTerm();
  if (plan.kind === "pwd") return termLine(`~/${editorState?.project?.title || "project"}`);
  if (plan.kind === "ls") return listFiles();
  if (plan.kind === "cat") return catFile(plan.file);
  if (plan.kind === "unknown") {
    termLine(`${plan.cmd}: command not found`, "err");
    termLine("Type help for the commands this terminal can run.", "muted");
    return;
  }
  if (plan.kind === "python") return runServer("python", plan.file);
  if (plan.kind === "c") return runServer("c", plan.file);
  if (plan.kind === "java") return runServer("java", plan.file);
  if (plan.kind === "node") return runServer("node", plan.file);
  if (plan.kind === "markdown") return previewMarkdown(plan.file);
  if (plan.kind === "web") return serveWeb(plan);
  if (plan.kind === "next") return explainNext();
  termLine(plan.note || "Nothing to run.", "muted");
}

function listFiles() {
  const files = visibleFiles();
  if (!files.length) termLine("(no files)", "muted");
  for (const file of files) termLine(file.path);
}

function catFile(name) {
  const found = resolveFile(name);
  if (!name || found.error) {
    termLine(`cat: ${found.error || "pass a file"}`, "err");
    return;
  }
  termLine(fileContent(found.path) || "(empty)", fileContent(found.path) ? "" : "muted");
}

function resolveFile(name) {
  if (!name || !editorState) return { error: "no such file" };
  const wanted = String(name).replace(/^\.\//, "");
  const files = editorState.files.filter((file) => !hidden(file.path));
  const exact = files.find((file) => file.path === wanted);
  if (exact) return { path: exact.path };
  const matches = files.filter((file) => file.path.endsWith(`/${wanted}`));
  if (matches.length === 1) return { path: matches[0].path };
  if (matches.length > 1) return { error: `${wanted} matches more than one file` };
  return { error: `${wanted}: no such file` };
}

function completeTerm(input) {
  const parts = splitArgs(input.value);
  const prefix = parts.at(-1) || "";
  const matches = visibleFiles()
    .map((file) => file.path)
    .filter((path) => path.startsWith(prefix) || path.split("/").pop().startsWith(prefix));
  if (matches.length === 1) {
    const next = input.value.replace(/\S*$/, matches[0]);
    input.value = `${next} `;
    return;
  }
  if (matches.length > 1) {
    commitShellLine(input.value);
    for (const path of matches.slice(0, 20)) termLine(path);
  }
}

function commitShellLine(command) {
  const log = document.querySelector("#term-log");
  if (!log) return;
  const row = document.createElement("div");
  row.className = "term-line cmd";
  const prompt = document.createElement("span");
  prompt.className = "prompt";
  prompt.textContent = termPrompt();
  const code = document.createElement("span");
  code.textContent = command;
  row.append(prompt, code);
  log.appendChild(row);
  trimLog();
  scrollTerm();
}

function termCommand(cmd) {
  commitShellLine(cmd);
}

function termLine(text, kind = "") {
  const log = document.querySelector("#term-log");
  if (!log) return;
  const line = document.createElement("div");
  line.className = `term-line ${kind}`.trim();
  line.textContent = text;
  log.appendChild(line);
  trimLog();
  scrollTerm();
}

function clearTerm() {
  document.querySelector("#term-log")?.replaceChildren();
}

function trimLog() {
  const log = document.querySelector("#term-log");
  while (log && log.childElementCount > 400) log.firstChild.remove();
}

function scrollTerm() {
  const log = document.querySelector("#term-log");
  if (log) log.scrollTop = log.scrollHeight;
}

function setShellPrompt() {
  inputMode = "shell";
  waitingInput = false;
  const span = document.querySelector("#term-prompt");
  const input = document.querySelector("#term-input");
  if (!span) return;
  span.className = "prompt";
  span.textContent = termPrompt();
  if (input) input.placeholder = "type a command";
}

function setRunning(on) {
  for (const id of ["#play", "#run"]) {
    const button = document.querySelector(id);
    if (!button) continue;
    button.textContent = on ? "■" : "▶";
    button.title = on ? "Stop" : "Run the open file";
  }
}

function interrupt(silent = false) {
  const was = activeRun;
  runGen += 1;
  activeRun = null;
  pendingOut = "";
  pendingKind = "";
  clearJsListener();
  const iframe = document.querySelector("#runner");
  if (iframe) iframe.srcdoc = "";
  for (const worker of [pyWorker, ccWorker, javaWorker]) worker?.terminate();
  pyWorker = ccWorker = javaWorker = null;
  if (was?.id) session?.api?.(`/api/runtime/runs/${was.id}`, { method: "DELETE" }).catch(() => {});
  setRunning(false);
  setShellPrompt();
  if (!silent && was) termLine("^C", "muted");
}

function clearJsListener() {
  if (!jsListener) return;
  window.removeEventListener("message", jsListener);
  jsListener = null;
}

function finishRun() {
  const run = activeRun;
  const output = runOutput;
  activeRun = null;
  pendingOut = "";
  pendingKind = "";
  runOutput = "";
  setRunning(false);
  setShellPrompt();
  if (run?.id) session?.api?.(`/api/runtime/runs/${run.id}`, { method: "DELETE" }).catch(() => {});
  if (run && editorState) {
    session.api(`/api/projects/${editorState.id}/run`, {
      method: "POST",
      body: { output: output.trim() || "(no output)" },
    }).catch(() => {});
  }
}

function termPrompt() {
  const name = String(session?.me?.name || "student").split(" ")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "") || "student";
  return `${name}@teachforth:~$ `;
}

function fileContent(path) {
  return editorState.files.find((file) => file.path === path)?.content || "";
}

function complete(cm) {
  try {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    const mode = innerModeName(cm, token);
    if (/\b(?:comment|string)\b/.test(token.type || "") && mode !== "html" && mode !== "xml") return null;
    if ((mode === "html" || mode === "xml") && window.CodeMirror.hint.html) {
      const html = window.CodeMirror.hint.html(cm);
      if (html?.list?.length) return html;
    }
    if (mode === "javascript" && window.CodeMirror.hint.javascript) {
      const js = window.CodeMirror.hint.javascript(cm);
      if (js?.list?.length) return js;
    }
    if (mode === "css" && window.CodeMirror.hint.css) {
      const css = window.CodeMirror.hint.css(cm);
      if (css?.list?.length) return css;
    }
    const words = mode === "python" ? PYTHON_WORDS : mode === "javascript" ? JS_WORDS : [];
    return fromList(cm, words);
  } catch {
    return null;
  }
}

function fromList(cm, words) {
  const cursor = cm.getCursor();
  const token = cm.getTokenAt(cursor);
  const prefix = /^[\w$]+$/.test(token.string || "") ? token.string : "";
  const start = prefix ? token.start : cursor.ch;
  const buffer = wordsInBuffer(cm);
  const list = [...new Set([...words, ...buffer])]
    .filter((word) => word.toLowerCase().startsWith(prefix.toLowerCase()) && word !== prefix)
    .slice(0, 50);
  if (!list.length) return null;
  return { list, from: window.CodeMirror.Pos(cursor.line, start), to: window.CodeMirror.Pos(cursor.line, cursor.ch) };
}

function wordsInBuffer(cm) {
  const found = cm.getValue().match(/[A-Za-z_][\w$]{2,}/g) || [];
  return [...new Set(found)].slice(0, 80);
}

function innerModeName(cm, token) {
  const inner = window.CodeMirror.innerMode(cm.getMode(), token.state);
  return inner.mode?.helperType || inner.mode?.name || cm.getMode().name;
}

async function openLiveBoard() {
  if (!editorState.boardDoc) {
    const state = await session.api(`/api/projects/${editorState.id}/state?revision=${editorState.project.revision}&boardRevision=0`);
    editorState.boardDoc = state.board?.slides
      ? state.board
      : { slides: [{ id: "s1", title: "Slide 1", strokes: [] }], index: 0 };
  }
  openBoard({
    state: editorState,
    api: session.api,
    canDraw: () => !(editorState.controls?.lockDraw && session.me.role === "student"),
    publish: (body) => session.api(`/api/projects/${editorState.id}/board/stroke`, { method: "POST", body }).then((data) => {
      editorState.boardDoc = data.board;
      applyBoard(data.board);
    }),
  });
}

function connectLive() {
  const token = editorState;
  const source = new EventSource(`/api/projects/${token.id}/events`);
  token.source = source;
  source.addEventListener("cursor", (event) => paintRemote(JSON.parse(event.data)));
  source.addEventListener("file", (event) => applyRemoteFile(JSON.parse(event.data)));
  source.addEventListener("control", (event) => applyControls(JSON.parse(event.data)));
  source.addEventListener("board", (event) => {
    const data = JSON.parse(event.data);
    if (data.authorId === session.me.id) return;
    token.boardDoc = data.board;
    applyBoard(data.board);
  });
  window.addEventListener("hashchange", () => source.close(), { once: true });
}

let cursorTimer = null;
function sendCursor() {
  if (!editorState || !cmEditor) return;
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => {
    const cursor = cmEditor.getCursor();
    const sel = cmEditor.listSelections()[0];
    session.api(`/api/projects/${editorState.id}/live`, {
      method: "POST",
      body: { file: editorState.active, line: cursor.line, ch: cursor.ch, anchor: sel?.anchor, head: sel?.head },
    }).catch(() => {});
  }, 60);
}

function paintRemote(cursor) {
  if (!editorState || cursor.id === session.me.id || !cmEditor) return;
  if (cursor.line >= cmEditor.lineCount()) return;
  const old = editorState.remotes.get(cursor.id);
  old?.mark?.clear();
  old?.sel?.clear();
  if (cursor.file !== editorState.active) {
    editorState.remotes.set(cursor.id, { cursor });
    return;
  }
  const widget = document.createElement("span");
  widget.className = "remote-caret";
  widget.style.borderColor = cursor.color;
  widget.dataset.name = cursor.name;
  widget.style.setProperty("--c", cursor.color);
  const mark = cmEditor.setBookmark({ line: cursor.line, ch: cursor.ch }, { widget });
  let sel = null;
  if (cursor.anchor && cursor.head && (cursor.anchor.line !== cursor.head.line || cursor.anchor.ch !== cursor.head.ch)) {
    sel = cmEditor.markText(cursor.anchor, cursor.head, { className: "remote-sel", css: `background:${cursor.color}33` });
  }
  editorState.remotes.set(cursor.id, { mark, sel, cursor });
}

function adoptFiles(nextFiles, revision) {
  if (!editorState) return;
  const old = new Map(editorState.files.map((file) => [file.path, file]));
  editorState.files = nextFiles.filter((file) => !hidden(file.path)).map((file) => {
    const prev = old.get(file.path);
    const isActive = file.path === editorState.active;
    const localText = isActive ? currentContent() : (prev?.content ?? file.content);
    const dirty = isActive && (editorState.dirty || editorState.saving || localText !== (prev?.content ?? file.content));
    const base = prev?.baseContent ?? prev?.content ?? file.content;
    const merged = dirty ? mergeText(base, localText, file.content) : file.content;
    return { ...file, content: merged, baseContent: file.content, baseRevision: revision };
  });
  editorState.project.revision = revision;
  if (editorState.active && !editorState.files.some((file) => file.path === editorState.active)) {
    editorState.opened = editorState.opened.filter((path) => editorState.files.some((file) => file.path === path));
    editorState.active = editorState.opened.at(-1) || "";
    if (editorState.active) writeEditor(fileContent(editorState.active), true);
    else showWelcome();
  } else if (editorState.active) {
    const active = editorState.files.find((file) => file.path === editorState.active);
    const shown = currentContent();
    if (active && active.content !== shown) writeEditor(active.content, true);
    if (active && active.content !== active.baseContent) {
      editorState.dirty = true;
      scheduleSave();
    }
  }
  treeSig = "";
  renderExplorer();
}

function applyRemoteFile(file) {
  if (!editorState || file.authorId === session.me.id || hidden(file.path)) return;
  const local = editorState.files.find((item) => item.path === file.path);
  const isActive = file.path === editorState.active;
  const localText = isActive ? currentContent() : (local?.content ?? file.content);
  const dirty = isActive && (editorState.dirty || editorState.saving || localText !== (local?.content ?? ""));
  const base = local?.baseContent ?? local?.content ?? file.content;
  const next = dirty ? mergeText(base, localText, file.content) : file.content;
  if (local) {
    local.content = next;
    local.baseContent = file.content;
    local.baseRevision = file.revision;
  } else {
    editorState.files.push({ path: file.path, content: next, baseContent: file.content, baseRevision: file.revision });
  }
  editorState.project.revision = file.revision;
  if (isActive && next !== localText) writeEditor(next, true);
  if (isActive && next !== file.content) {
    editorState.dirty = true;
    scheduleSave();
  }
  treeSig = "";
  renderExplorer();
}

async function toggleGuide() {
  const existing = document.querySelector("#teach-guide");
  if (existing) {
    existing.remove();
    return;
  }
  if (!editorState || !session) return;
  const projectId = editorState.id;
  const panel = document.createElement("section");
  panel.id = "teach-guide";
  panel.className = "teach-guide";
  panel.innerHTML = `<header><strong>Teaching guide</strong><span class="spacer"></span><button type="button" id="guide-close">Hide</button></header><div class="guide-body"><p>Loading…</p></div>`;
  document.querySelector(".ide")?.append(panel);
  bindGuideDrag(panel);
  panel.querySelector("#guide-close").onclick = () => panel.remove();
  try {
    const data = await session.api(`/api/projects/${projectId}/guide`);
    if (!panel.isConnected || editorState?.id !== projectId) return;
    renderGuide(panel, data, projectId);
  } catch (err) {
    if (panel.isConnected) panel.querySelector(".guide-body").textContent = err.message;
  }
}

function bindGuideDrag(panel) {
  const header = panel.querySelector("header");
  let drag = null;
  header.onpointerdown = (event) => {
    if (event.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    header.setPointerCapture(event.pointerId);
  };
  header.onpointermove = (event) => {
    if (!drag) return;
    panel.style.left = `${Math.max(0, event.clientX - drag.x)}px`;
    panel.style.top = `${Math.max(0, event.clientY - drag.y)}px`;
    panel.style.right = "auto";
  };
  header.onpointerup = () => { drag = null; };
}

function renderGuide(panel, data, projectId) {
  const modules = (data.units || []).flatMap((unit) => (unit.modules || []).map((mod) => ({ ...mod, unit: unit.title })));
  const body = panel.querySelector(".guide-body");
  body.innerHTML = `<input id="guide-search" placeholder="Search modules" aria-label="Search modules">
    <select id="guide-module"></select>
    <div class="guide-tools">
      <button type="button" data-lang="python">Python</button>
      <button type="button" data-lang="java">Java</button>
      <button type="button" data-lang="c">C</button>
      <button type="button" id="guide-copy">Copy</button>
      <button type="button" id="guide-hide">Hide solution</button>
    </div>
    <label>Course <select id="guide-course">${(data.enrollments || []).map((course) => `<option value="${esc(course)}">${esc(course)}</option>`).join("") || `<option value="">No course assigned</option>`}</select></label>
    <button type="button" id="guide-link">Link to this project</button>
    <p id="guide-link-state"></p>
    <div id="guide-notes"></div>
    <pre id="guide-code"></pre>
    <p class="error" id="guide-err"></p>`;
  const select = body.querySelector("#guide-module");
  const search = body.querySelector("#guide-search");
  const course = body.querySelector("#guide-course");
  if (data.suggested && [...course.options].some((option) => option.value === data.suggested)) course.value = data.suggested;
  let lang = data.suggested || "python";
  let detail = null;
  let hidden = false;
  const fill = () => {
    const q = search.value.trim().toLowerCase();
    const current = select.value;
    select.innerHTML = modules.filter((mod) => !q || mod.title.toLowerCase().includes(q) || mod.unit.toLowerCase().includes(q))
      .map((mod) => `<option value="${esc(mod.id)}">${esc(mod.unit)} · ${esc(mod.title)}</option>`).join("");
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  };
  const paint = () => {
    const notes = body.querySelector("#guide-notes");
    const code = body.querySelector("#guide-code");
    const linked = (data.linked || []).some((row) => row.moduleId === select.value && row.course === course.value);
    body.querySelector("#guide-link").textContent = linked ? "Unlink" : "Link to this project";
    body.querySelector("#guide-link-state").textContent = (data.linked || []).filter((row) => row.moduleId === select.value).map((row) => `${row.title} · ${row.course}`).join(", ");
    if (!detail) {
      notes.textContent = "";
      code.textContent = "";
      return;
    }
    const teach = detail.teach || {};
    notes.innerHTML = `<p><strong>${esc(detail.title)}</strong></p><p>${esc(teach.goal || "")}</p><p>${esc(teach.say || "")}</p><ol>${(teach.steps || []).map((step) => `<li>${esc(step)}</li>`).join("")}</ol><p>${esc(teach.watch || "")}</p><p>${esc(teach.done || "")}</p>`;
    code.hidden = hidden;
    code.textContent = hidden ? "" : (detail.code?.[lang] || "");
  };
  const load = async () => {
    body.querySelector("#guide-err").textContent = "";
    try {
      detail = await session.api(`/api/curriculum/${select.value}`);
      if (!panel.isConnected) return;
      paint();
    } catch (err) {
      body.querySelector("#guide-err").textContent = err.message;
    }
  };
  fill();
  search.oninput = () => {
    const before = select.value;
    fill();
    if (select.value !== before) load();
  };
  select.onchange = () => load();
  course.onchange = () => paint();
  for (const button of body.querySelectorAll("[data-lang]")) {
    button.onclick = () => {
      lang = button.dataset.lang;
      paint();
    };
  }
  body.querySelector("#guide-hide").onclick = () => {
    hidden = !hidden;
    body.querySelector("#guide-hide").textContent = hidden ? "Show solution" : "Hide solution";
    paint();
  };
  body.querySelector("#guide-copy").onclick = async () => {
    const text = detail?.code?.[lang] || "";
    try {
      await navigator.clipboard.writeText(text);
      body.querySelector("#guide-err").textContent = "Copied.";
    } catch {
      body.querySelector("#guide-err").textContent = "Copy failed.";
    }
  };
  body.querySelector("#guide-link").onclick = async () => {
    const err = body.querySelector("#guide-err");
    const moduleId = select.value;
    const chosen = course.value;
    if (!chosen) {
      err.textContent = "Assign a course on the student profile first.";
      return;
    }
    const linked = (data.linked || []).some((row) => row.moduleId === moduleId && row.course === chosen);
    try {
      const result = linked
        ? await session.api(`/api/projects/${projectId}/modules/${moduleId}?course=${encodeURIComponent(chosen)}`, { method: "DELETE" })
        : await session.api(`/api/projects/${projectId}/modules`, { method: "POST", body: { moduleId, course: chosen } });
      data.linked = result.linked || [];
      err.textContent = "";
      paint();
    } catch (error) {
      err.textContent = error.message;
    }
  };
  if (select.value) load();
}

function esc(value) {
  return session?.esc ? session.esc(value) : String(value ?? "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
