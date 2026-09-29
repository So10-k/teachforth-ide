import { applyBoard, openBoard } from "./board.js";

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
  const first = files[0]?.path || "";
  editorState = {
    id,
    project: opened.project,
    files,
    opened: first ? [first] : [],
    active: first,
    dirty: false,
    boardDoc: null,
    remotes: new Map(),
    source: null,
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
      ${teacher ? `<button id="report-btn">Report</button>` : ""}
      <button id="export">Export</button>
      <button id="back">Back</button>
    </header>
    ${teacher ? `<div class="banner">You are in ${esc(opened.project.ownerName)}'s project. This visit is logged. Only the student can commit it to GitHub.</div>` : ""}
    ${!teacher && opened.project.kind === "github" ? `<div class="banner">Closing this project commits to your GitHub and removes the code from TeachForth.</div>` : ""}
    <div class="ide-body">
      <nav class="activity" aria-label="Views"><button class="on" title="Explorer">Files</button></nav>
      <aside class="explorer">
        <div class="explorer-head"><span>Explorer</span><span class="explorer-actions"><button id="new-file" title="New file">+ File</button><button id="new-folder" title="New folder">+ Folder</button></span></div>
        <p class="explorer-project">${esc(opened.project.title)}</p>
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
        <iframe id="runner" sandbox="allow-scripts" title="Runner"></iframe>
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
  document.querySelector("#new-file").onclick = () => createPath(prompt("File name, like notes.txt or src/app.js"));
  document.querySelector("#new-folder").onclick = () => {
    const name = prompt("Folder name, like src");
    if (name) createPath(`${name.replace(/\/+$/, "")}/untitled.txt`);
  };
  if (teacher) document.querySelector("#report-btn").onclick = () => { location.hash = `#/person/${opened.project.ownerId}`; };
  connectLive();
  renderExplorer();
  mountEditor();
  if (first) showActiveFile(false);
  else showWelcome();
  welcomeTerm();
  poll();
}

async function leaveProject() {
  interrupt(true);
  const back = editorState?.project?.kind === "sandbox" ? "#/sandbox" : "#/";
  if (session?.me?.role === "student" && editorState?.project?.kind === "github") {
    try {
      closing = true;
      await flush();
      await session.api(`/api/projects/${editorState.id}/close`, { method: "POST", body: {} });
    } catch (err) {
      closing = false;
      setSaveState(err.message);
      return;
    }
  }
  editorState?.source?.close();
  location.hash = back;
}

function visibleFiles() {
  return editorState.files.filter((file) => !hidden(file.path));
}

function hidden(path) {
  return path === ".teachforth" || String(path || "").endsWith("/.teachforth");
}

function renderExplorer() {
  const files = visibleFiles();
  const sig = `${files.map((file) => file.path).join("|")}|${editorState.opened.join(",")}|${editorState.active}`;
  const tree = document.querySelector("#tree");
  const tabs = document.querySelector("#file-tabs");
  if (!tree || !tabs) return;
  if (sig !== treeSig) {
    treeSig = sig;
    tree.innerHTML = files.length ? treeHtml(files) : `<p class="muted tree-empty">No files yet.</p>`;
    tabs.innerHTML = editorState.opened.map((path) =>
      `<button class="tab ${path === editorState.active ? "active" : ""}" data-tab="${esc(path)}"><span>${esc(path.split("/").pop())}</span><i data-close="${esc(path)}" title="Close">×</i></button>`,
    ).join("");
  } else {
    for (const button of tabs.querySelectorAll("[data-tab]")) {
      button.classList.toggle("active", button.dataset.tab === editorState.active);
    }
    for (const button of tree.querySelectorAll("[data-open]")) {
      button.classList.toggle("active", button.dataset.open === editorState.active);
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

function nodeHtml(node, depth) {
  let html = "";
  for (const [name, child] of node.dirs) {
    html += `<div class="folder" style="padding-left:${depth * 12}px">${esc(name)}</div>${nodeHtml(child, depth + 1)}`;
  }
  for (const path of node.files) {
    html += `<div class="file-row ${path === editorState.active ? "active" : ""}" style="padding-left:${depth * 12}px">
      <button data-open="${esc(path)}">${esc(path.split("/").pop())}</button>
      <button data-rename="${esc(path)}" title="Rename">Rename</button>
      <button data-delete="${esc(path)}" title="Delete">Delete</button>
    </div>`;
  }
  return html;
}

function bindTree(tree, tabs) {
  for (const button of tree.querySelectorAll("[data-open]")) {
    button.onclick = () => openPath(button.dataset.open);
  }
  for (const button of tree.querySelectorAll("[data-rename]")) {
    button.onclick = (event) => {
      event.stopPropagation();
      renamePath(button.dataset.rename);
    };
  }
  for (const button of tree.querySelectorAll("[data-delete]")) {
    button.onclick = (event) => {
      event.stopPropagation();
      deletePath(button.dataset.delete);
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
  editorState.files = data.files;
  editorState.project.revision = data.revision;
  if (!editorState.opened.includes(path)) editorState.opened.push(path);
  editorState.active = path;
  treeSig = "";
  renderExplorer();
  showActiveFile(true);
}

async function renamePath(from) {
  const to = prompt("New name", from);
  if (!to || to === from) return;
  await flush();
  const data = await session.api(`/api/projects/${editorState.id}/rename`, { method: "POST", body: { from, to } });
  editorState.files = data.files;
  editorState.project.revision = data.revision;
  editorState.opened = editorState.opened.map((path) => path === from ? to : path);
  if (editorState.active === from) editorState.active = to;
  treeSig = "";
  renderExplorer();
}

async function deletePath(path) {
  if (!confirm(`Delete ${path}?`)) return;
  await flush();
  const data = await session.api(`/api/projects/${editorState.id}/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  editorState.files = data.files;
  editorState.project.revision = data.revision;
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
    cmEditor.setOption("readOnly", false);
    writeEditor(value, false);
    if (focus) cmEditor.focus();
  } else {
    const area = document.querySelector("#code");
    if (area) {
      area.value = value;
      area.readOnly = false;
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

function modeOf(path) {
  if (path?.endsWith(".py")) return "python";
  if (path?.endsWith(".css")) return "css";
  if (path?.endsWith(".js") || path?.endsWith(".mjs")) return "javascript";
  if (path?.endsWith(".html") || path?.endsWith(".htm")) return "htmlmixed";
  if (path?.endsWith(".md")) return "markdown";
  if (path?.endsWith(".json")) return { name: "javascript", json: true };
  return "text/plain";
}

function languageLabel(path) {
  if (!path) return "";
  if (path.endsWith(".py")) return "Python";
  if (path.endsWith(".js")) return "JavaScript";
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

async function flush() {
  if (!editorState?.dirty) return;
  const file = activeFile();
  if (!file) return;
  const content = currentContent();
  const gen = ++saveGeneration;
  const path = file.path;
  file.content = content;
  editorState.dirty = false;
  setSaveState("Saving");
  try {
    const data = await session.api(`/api/projects/${editorState.id}/files`, {
      method: "PUT",
      body: { path, content },
    });
    if (!editorState) return;
    editorState.project.revision = data.revision;
    if (saveGeneration !== gen) {
      editorState.dirty = true;
      return;
    }
    setSaveState("Saved");
  } catch (err) {
    if (editorState) {
      editorState.dirty = true;
      setSaveState(err.message);
    }
    throw err;
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
      if (state.files && !token.dirty) {
        const next = state.files.find((file) => file.path === token.active);
        const same = !token.active || (next && next.content === currentContent());
        token.files = state.files.filter((file) => !hidden(file.path));
        token.project.revision = state.revision;
        if (!same && next) writeEditor(next.content, true);
        renderExplorer();
      }
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

function setSaveState(text) {
  const el = document.querySelector("#save-state");
  if (el) el.textContent = text;
}

let runGen = 0;
let activeRun = null;
let inputMode = "shell";
let pendingOut = "";
let pendingKind = "";
let waitingInput = false;
let runOutput = "";
let pyWorker = null;
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
  termLine("help lists commands. Ctrl+C stops a program. input() reads this line.", "muted");
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
  if (!activeRun || activeRun.gen !== runGen || activeRun.kind !== "python") return;
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
    termLine(msg.text || "Python error", "err");
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
  if (waitingInput && activeRun?.id) {
    waitingInput = false;
    const prefix = document.querySelector("#term-prompt").textContent || "";
    termLine(prefix + line);
    document.querySelector("#term-prompt").textContent = "";
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
  if (plan.kind === "python") return runPython(plan.file, plan.argv || []);
  if (plan.kind === "node") return runJs(plan.file, ["node", plan.file, ...(plan.argv || [])]);
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
  if (pyWorker) {
    pyWorker.terminate();
    pyWorker = null;
  }
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

function applyRemoteFile(file) {
  if (!editorState || file.authorId === session.me.id || hidden(file.path)) return;
  const local = editorState.files.find((item) => item.path === file.path);
  if (local) local.content = file.content;
  else editorState.files.push({ path: file.path, content: file.content });
  editorState.project.revision = file.revision;
  if (file.path === editorState.active && !editorState.dirty) writeEditor(file.content, true);
  treeSig = "";
  renderExplorer();
}

function esc(value) {
  return session?.esc ? session.esc(value) : String(value ?? "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
