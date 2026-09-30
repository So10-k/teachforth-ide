import { renderPortal } from "./portal.js";
import { openEditor } from "./editor.js";

const app = document.querySelector("#app");
const POWER_URL = "https://samsprojects.xyz/teachforth-power/";
let me = null;
let cmEditor = null;
let editorState = null;
let catalogData = null;
let courseId = null;

const GLOBE = `<svg class="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3z"/></svg>`;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (opts.raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    err.content = data.content;
    err.revision = data.revision;
    throw err;
  }
  return data;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function ago(iso) {
  const then = Date.parse(iso);
  if (!then) return "";
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `Modified ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `Modified ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `Modified ${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.max(1, Math.round(days / 30));
  return `Modified ${months} month${months === 1 ? "" : "s"} ago`;
}

async function boot() {
  const data = await api("/api/me");
  me = data.user;
  window.addEventListener("hashchange", render);
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    }
  });
  render();
}

function section() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/project/")) return "project";
  if (hash.startsWith("#/person/")) return "person";
  if (hash.startsWith("#/people")) return "people";
  if (hash.startsWith("#/folder/") || hash.startsWith("#/student/")) return "person";
  if (hash.startsWith("#/chapter/")) return "chapter";
  if (hash.startsWith("#/chapters")) return "chapters";
  if (hash.startsWith("#/students")) return "students";
  if (hash.startsWith("#/accounts") || hash.startsWith("#/studio")) return "accounts";
  if (hash.startsWith("#/sandbox")) return "sandbox";
  if (hash.startsWith("#/center")) return "center";
  if (hash.startsWith("#/roster")) return "roster";
  if (hash.startsWith("#/github")) return "github";
  return "home";
}

async function render() {
  closePop();
  if (!me) return loginView();
  if (section() === "project") return openEditor({ app, id: Number(location.hash.split("/")[2]), me, api, esc });
  app.innerHTML = shell(section());
  bindShell();
  const main = document.querySelector("#main");
  try {
    await renderPortal({ section: section(), main, me, api, esc, ago, powerUrl: POWER_URL });
  } catch (err) {
    main.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

function shell(active) {
  const initial = esc((me.name || "?").slice(0, 1).toUpperCase());
  return `<div class="shell">
    <header class="topbar">
      <a class="logo" href="#/"><img src="/logo.png" alt="">IDE</a>
      <div class="top-actions">
        <button id="search-btn">Search <kbd>⌘K</kbd></button>
        <button id="help-btn">Help</button>
        <button class="avatar" id="account-btn" title="${esc(me.name)}">${initial}</button>
      </div>
    </header>
    <div class="shell-body">
      <aside class="side">
        <p class="side-label">Portal</p>
        <a class="${active === "home" ? "on" : ""}" href="#/">Home</a>
        ${me.role === "student" ? `<a class="${active === "github" ? "on" : ""}" href="#/github">GitHub</a>` : ""}
        ${me.role !== "student" ? `<a class="${active === "center" ? "on" : ""}" href="#/center">Center</a>` : ""}
        ${me.role === "teacher" ? `<a class="${active === "sandbox" ? "on" : ""}" href="#/sandbox">Sandbox</a>` : ""}
        ${me.role !== "student" ? `<a class="${active === "people" ? "on" : ""}" href="#/people">People</a>` : ""}
        ${me.role !== "student" ? `<a class="${active === "students" ? "on" : ""}" href="#/students">Students</a>` : ""}
        ${me.role === "admin" || me.role === "chapter_lead" ? `<a class="${active === "chapters" ? "on" : ""}" href="#/chapters">Chapters</a><a class="${active === "roster" ? "on" : ""}" href="#/roster">Pairing</a>` : ""}
        ${me.role === "admin" ? `<a class="${active === "accounts" ? "on" : ""}" href="#/accounts">Accounts</a>` : ""}
      </aside>
      <main class="main" id="main"></main>
    </div>
  </div>`;
}

function bindShell() {
  document.querySelector("#search-btn").onclick = openSearch;
  document.querySelector("#help-btn").onclick = openHelp;
  document.querySelector("#account-btn").onclick = openAccount;
}

function loginView() {
  app.innerHTML = `<div class="login-wrap"><form class="login-card" id="login">
    <img src="/logo.png" alt="" style="height:28px;width:auto">
    <h1>IDE</h1>
    <p class="muted">Sign in with the account a teacher made for you. After you connect GitHub, that account is this one.</p>
    <label>Email <input id="email" autocomplete="username"></label>
    <label>Password <input id="password" type="password" autocomplete="current-password"></label>
    <p class="error" id="err"></p>
    <button class="btn" id="signin">Sign in</button>
    <a class="btn-ghost" href="/api/github/login">Sign in with GitHub</a>
  </form></div>`;
  const githubError = new URLSearchParams(location.search).get("github");
  if (githubError) document.querySelector("#err").textContent = "That GitHub account is not a TeachForth student yet. Sign in with email once, then connect GitHub.";
  document.querySelector("#login").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: { email: email.value, password: password.value },
      });
      me = data.user;
      location.hash = "#/";
      render();
    } catch (err) {
      errEl.textContent = err.message;
    }
  };
  const email = document.querySelector("#email");
  const password = document.querySelector("#password");
  const errEl = document.querySelector("#err");
}

async function loadCatalog() {
  catalogData = await api("/api/catalog");
  if (!courseId || !catalogData.courses.some((course) => course.id === courseId)) {
    courseId = catalogData.courses[0]?.id || null;
  }
  return catalogData;
}

async function lessonsView() {
  const main = document.querySelector("#main");
  main.innerHTML = `<h1>Lessons</h1><p class="muted">Loading…</p>`;
  const data = await loadCatalog();
  const courses = data.courses;
  const lessons = data.lessons.filter((lesson) => lesson.courseId === courseId);
  const units = [];
  for (const lesson of lessons) {
    let unit = units.find((item) => item.name === lesson.unit);
    if (!unit) {
      unit = { name: lesson.unit, lessons: [] };
      units.push(unit);
    }
    unit.lessons.push(lesson);
  }
  main.innerHTML = `<h1>Lessons</h1>
    <div class="tabs">${courses.map((course) => `<button class="${course.id === courseId ? "on" : ""}" data-course="${course.id}">${esc(course.name)}</button>`).join("") || `<span class="muted">No class yet.</span>`}</div>
    ${units.map((unit) => `<h2 class="unit">${esc(unit.name)}</h2>${unit.lessons.map(lessonCard).join("")}`).join("") || `<p class="muted">This class has no lessons yet.</p>`}`;
  for (const button of main.querySelectorAll("[data-course]")) {
    button.onclick = () => {
      courseId = Number(button.dataset.course);
      lessonsView();
    };
  }
  for (const button of main.querySelectorAll("[data-lesson]")) {
    button.onclick = () => openLesson(Number(button.dataset.lesson));
  }
}

function lessonCard(lesson) {
  return `<button class="lesson" data-lesson="${lesson.id}">
    <strong>${GLOBE}${esc(lesson.title)}</strong>
    <span class="when">${esc(ago(lesson.updatedAt))}</span>
  </button>`;
}

async function openLesson(id) {
  const data = await api(`/api/lessons/${id}/open`, { method: "POST", body: {} });
  location.hash = `#/project/${data.projectId}`;
}

async function sandboxView() {
  const data = await loadCatalog();
  const main = document.querySelector("#main");
  main.innerHTML = `<div class="row" style="justify-content:space-between"><h1>Sandbox</h1><button class="btn" id="new-box">New sandbox</button></div>
    <p class="muted">A blank project. Not a lesson. Yours to break.</p>
    ${data.sandboxes.map((project) => `<button class="lesson" data-id="${project.id}"><strong>${GLOBE}${esc(project.title)}</strong><span class="when">${esc(ago(project.updatedAt))}</span></button>`).join("") || `<p class="muted">No sandbox yet. Make one and start typing.</p>`}`;
  document.querySelector("#new-box").onclick = async () => {
    const title = prompt("Project name", "Sandbox") || "Sandbox";
    const language = confirm("OK for a web page. Cancel for Python.") ? "web" : "python";
    const made = await api("/api/sandbox", { method: "POST", body: { title, language } });
    location.hash = `#/project/${made.project.id}`;
  };
  for (const button of main.querySelectorAll("[data-id]")) {
    button.onclick = () => {
      location.hash = `#/project/${button.dataset.id}`;
    };
  }
}

async function studentsView() {
  const main = document.querySelector("#main");
  const [{ students }, { projects }] = await Promise.all([api("/api/students"), api("/api/projects")]);
  main.innerHTML = `<h1>Students</h1>
    <p class="muted">You can open work only for students paired with you in a live block. Opening a project is logged.</p>
    ${students.map((student) => {
      const theirs = projects.filter((project) => project.ownerId === student.id);
      return `<section class="panel"><h2>${esc(student.name)}</h2><p class="muted">${esc(student.email)}</p>
        ${theirs.map((project) => `<button class="lesson" data-id="${project.id}"><strong>${esc(project.title)}</strong><span class="when">${esc(ago(project.updatedAt))}</span></button>`).join("") || `<p class="muted">No saved work yet.</p>`}
      </section>`;
    }).join("") || `<p class="muted">No students assigned yet. An admin does that in Studio.</p>`}`;
  for (const button of main.querySelectorAll("[data-id]")) {
    button.onclick = () => {
      location.hash = `#/project/${button.dataset.id}`;
    };
  }
}

async function centerView() {
  const main = document.querySelector("#main");
  const data = await api("/api/center");
  const live = data.blocks.filter((block) => block.status === "live");
  main.innerHTML = `<h1>Control center</h1>
    <p class="muted">Students with a teacher in a live block. Opening a folder is logged.</p>
    ${live.map((block) => `<section class="panel"><h2>${esc(block.name)}</h2><p class="muted">${esc(block.chapterName)} · lead ${esc(block.leadName || "unassigned")}</p>
      <div class="cards">${block.students.map((student) => `<article class="card">
        <h3>${esc(student.name)}</h3>
        <p>with ${esc(student.teacherName)}</p>
        <p class="${student.focus ? "live-dot" : "muted"}">${student.focus ? `In ${esc(student.focus.file || "a file")}` : esc(student.latest?.title || "No project yet")}</p>
        <button class="btn" data-folder="${student.id}">Open folder</button>
        ${student.latest ? `<button class="btn-ghost" data-id="${student.latest.id}">Open code</button>` : ""}
      </article>`).join("") || `<p class="muted">No pairs yet. The chapter lead adds them in Roster.</p>`}
      </div></section>`).join("") || `<p class="muted">No live block. Start one from the console or roster.</p>`}`;
  bindFolderButtons(main);
}

async function rosterView() {
  const main = document.querySelector("#main");
  const [{ blocks }, { people }] = await Promise.all([api("/api/blocks"), api("/api/people")]);
  const teachers = people.filter((person) => person.role === "teacher");
  const students = people.filter((person) => person.role === "student");
  const open = blocks.filter((block) => block.status !== "ended");
  main.innerHTML = `<h1>Roster</h1>
    <p class="muted">Pair a teacher with a student for this block. A teacher only sees students you pair.</p>
    ${open.map((block) => `<section class="panel"><h2>${esc(block.name)} · ${esc(block.status)}</h2>
      <p class="muted">${esc(block.chapterName)}</p>
      <div class="row">
        <select data-teacher="${block.id}">${teachers.map((person) => `<option value="${person.id}">${esc(person.name)}</option>`).join("")}</select>
        <select data-student="${block.id}">${students.map((person) => `<option value="${person.id}">${esc(person.name)}</option>`).join("")}</select>
        <button class="btn" data-pair="${block.id}">Pair</button>
        ${block.status !== "live" ? `<button class="btn-ghost" data-live="${block.id}">Start session</button>` : `<button class="btn-ghost" data-end="${block.id}">End session</button>`}
      </div>
      ${(block.pairs || []).map((pair) => `<div class="row"><span>${esc(pair.teacher_name)} → ${esc(pair.student_name)}</span><button class="btn-ghost" data-unpair="${block.id}" data-student-id="${pair.student_id}">Remove</button></div>`).join("")}
    </section>`).join("") || `<p class="muted">No open block. An admin creates the chapter and block in Console.</p>`}`;
  for (const button of main.querySelectorAll("[data-pair]")) {
    button.onclick = async () => {
      const id = button.dataset.pair;
      const teacherId = Number(main.querySelector(`[data-teacher="${id}"]`)?.value || 0);
      const studentId = Number(main.querySelector(`[data-student="${id}"]`)?.value || 0);
      if (!teacherId || !studentId) return;
      await api(`/api/blocks/${id}/pairs`, {
        method: "POST",
        body: {
          teacherId,
          studentId,
        },
      });
      rosterView();
    };
  }
  for (const button of main.querySelectorAll("[data-unpair]")) {
    button.onclick = async () => {
      await api(`/api/blocks/${button.dataset.unpair}/pairs`, {
        method: "DELETE",
        body: { studentId: Number(button.dataset.studentId) },
      });
      rosterView();
    };
  }
  for (const button of main.querySelectorAll("[data-live]")) {
    button.onclick = async () => {
      await api(`/api/blocks/${button.dataset.live}/status`, { method: "POST", body: { status: "live" } });
      rosterView();
    };
  }
  for (const button of main.querySelectorAll("[data-end]")) {
    button.onclick = async () => {
      await api(`/api/blocks/${button.dataset.end}/status`, { method: "POST", body: { status: "ended" } });
      rosterView();
    };
  }
}

async function folderView(id) {
  const main = document.querySelector("#main");
  let data;
  try {
    data = await api(`/api/folders/${id}`);
  } catch (err) {
    main.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    return;
  }
  const staff = me.role !== "student";
  main.innerHTML = `<h1>${esc(data.student.name)}</h1>
    <p class="muted">${esc(data.student.email)} · folder</p>
    <h2 class="unit">Code</h2>
    ${data.projects.map((project) => `<button class="lesson" data-id="${project.id}"><strong>${esc(project.title)}</strong><span class="when">${esc(ago(project.updatedAt))}</span></button>`).join("") || `<p class="muted">No projects yet.</p>`}
    ${staff ? `<h2 class="unit">Session report</h2>
      <section class="panel">
        <p class="muted">Students never see this. The diff is their code since the previous report.</p>
        <textarea id="report-body" placeholder="What did you work on?"></textarea>
        <pre class="diff" id="diff">${esc(data.preview || "")}</pre>
        <button class="btn" id="save-report">Save report</button>
      </section>
      <h2 class="unit">Past reports</h2>
      ${(data.reports || []).map((report) => `<article class="panel"><strong>${esc(report.authorName)}</strong> <span class="muted">${esc(report.createdAt.replace("T", " ").slice(0, 16))} ${esc(report.blockName)}</span><p>${esc(report.body)}</p><pre class="diff">${esc(report.diff)}</pre></article>`).join("") || `<p class="muted">No reports yet.</p>`}` : ""}`;
  bindFolderButtons(main);
  if (staff) {
    document.querySelector("#save-report").onclick = async () => {
      await api(`/api/folders/${id}/reports`, { method: "POST", body: { body: document.querySelector("#report-body").value } });
      folderView(id);
    };
  }
}

function bindFolderButtons(main) {
  for (const button of main.querySelectorAll("[data-id]")) {
    button.onclick = () => { location.hash = `#/project/${button.dataset.id}`; };
  }
  for (const button of main.querySelectorAll("[data-folder]")) {
    button.onclick = () => { location.hash = `#/folder/${button.dataset.folder}`; };
  }
}

async function studioView() {
  const main = document.querySelector("#main");
  const [{ users }, { chapters }, { blocks }, catalog] = await Promise.all([
    api("/api/users"),
    api("/api/chapters"),
    api("/api/blocks"),
    loadCatalog(),
  ]);
  const leads = users.filter((user) => user.role === "chapter_lead");
  const leadTeachers = users.filter((user) => user.role === "lead_teacher");
  main.innerHTML = `<h1>Console</h1>
    <p class="muted">Accounts, chapters, blocks, and lessons. Pairing for a live block is in Roster. <a href="${POWER_URL}">Start or stop the IDE server</a></p>
    <section class="panel"><h2>New account</h2><div class="row">
      <input id="name" placeholder="Name">
      <input id="email" placeholder="Email">
      <select id="role">
        <option value="student">Student</option>
        <option value="teacher">Teacher</option>
        <option value="lead_teacher">Lead teacher</option>
        <option value="chapter_lead">Chapter lead</option>
        <option value="admin">Admin</option>
      </select>
      <input id="password" placeholder="Password, 8+ characters">
      <button class="btn" id="create-user">Create</button>
    </div><p class="error" id="err"></p>
    <table><tbody>${users.map((user) => `<tr><td>${esc(user.name)}</td><td>${esc(user.email)}</td><td>${esc(user.role)}</td></tr>`).join("")}</tbody></table>
    </section>
    <section class="panel"><h2>Chapter</h2><div class="row"><input id="chapter-name" placeholder="Chapter name"><input id="chapter-place" placeholder="City or country"><button class="btn" id="add-chapter">Create chapter</button></div>
      ${chapters.map((chapter) => `<p>${esc(chapter.name)} · ${esc(chapter.place || "")}</p>`).join("")}
      <div class="row">
        <select id="staff-chapter">${chapters.map((chapter) => `<option value="${chapter.id}">${esc(chapter.name)}</option>`).join("")}</select>
        <select id="staff-user">${leads.map((user) => `<option value="${user.id}">${esc(user.name)}</option>`).join("")}</select>
        <button class="btn" id="add-staff">Assign chapter lead</button>
      </div>
    </section>
    <section class="panel"><h2>Block</h2><div class="row">
      <select id="block-chapter">${chapters.map((chapter) => `<option value="${chapter.id}">${esc(chapter.name)}</option>`).join("")}</select>
      <input id="block-name" placeholder="Saturday block">
      <select id="block-lead">${leadTeachers.map((user) => `<option value="${user.id}">${esc(user.name)}</option>`).join("")}</select>
      <button class="btn" id="add-block">Book block</button>
    </div>
      ${blocks.map((block) => `<div class="row"><span>${esc(block.name)} · ${esc(block.status)} · ${esc(block.chapterName)}</span>
        ${block.status !== "live" ? `<button class="btn-ghost" data-live="${block.id}">Start</button>` : `<button class="btn-ghost" data-end="${block.id}">End</button>`}
      </div>`).join("")}
    </section>
    <section class="panel"><h2>Lesson</h2><div class="row">
      <select id="lesson-course">${catalog.courses.map((course) => `<option value="${course.id}">${esc(course.name)}</option>`).join("")}</select>
      <input id="lesson-unit" placeholder="Unit" value="Lessons">
      <input id="lesson-title" placeholder="Lesson title">
      <select id="lesson-lang"><option value="web">Web</option><option value="python">Python</option></select>
      <button class="btn" id="add-lesson">Add lesson</button>
    </div>
    <div class="row"><input id="course-name" placeholder="New class name"><button class="btn" id="add-course">Create class</button></div>
    </section>`;
  document.querySelector("#add-course").onclick = async () => {
    await api("/api/courses", { method: "POST", body: { name: document.querySelector("#course-name").value } });
    studioView();
  };
  document.querySelector("#add-lesson").onclick = async () => {
    await api("/api/lessons", {
      method: "POST",
      body: {
        courseId: Number(document.querySelector("#lesson-course").value),
        unit: document.querySelector("#lesson-unit").value,
        title: document.querySelector("#lesson-title").value,
        language: document.querySelector("#lesson-lang").value,
      },
    });
    studioView();
  };
  document.querySelector("#add-chapter").onclick = async () => {
    await api("/api/chapters", { method: "POST", body: { name: document.querySelector("#chapter-name").value, place: document.querySelector("#chapter-place").value } });
    studioView();
  };
  document.querySelector("#add-staff").onclick = async () => {
    const id = document.querySelector("#staff-chapter").value;
    if (!id) return;
    await api(`/api/chapters/${id}/staff`, { method: "POST", body: { userId: Number(document.querySelector("#staff-user").value) } });
    studioView();
  };
  document.querySelector("#add-block").onclick = async () => {
    await api("/api/blocks", {
      method: "POST",
      body: {
        chapterId: Number(document.querySelector("#block-chapter").value),
        name: document.querySelector("#block-name").value,
        leadTeacherId: Number(document.querySelector("#block-lead").value),
      },
    });
    studioView();
  };
  for (const button of main.querySelectorAll("[data-live]")) {
    button.onclick = async () => {
      await api(`/api/blocks/${button.dataset.live}/status`, { method: "POST", body: { status: "live" } });
      studioView();
    };
  }
  for (const button of main.querySelectorAll("[data-end]")) {
    button.onclick = async () => {
      await api(`/api/blocks/${button.dataset.end}/status`, { method: "POST", body: { status: "ended" } });
      studioView();
    };
  };
  document.querySelector("#create-user").onclick = async () => {
    try {
      await api("/api/users", {
        method: "POST",
        body: {
          name: document.querySelector("#name").value,
          email: document.querySelector("#email").value,
          role: document.querySelector("#role").value,
          password: document.querySelector("#password").value,
        },
      });
      studioView();
    } catch (err) {
      document.querySelector("#err").textContent = err.message;
    }
  };
}

async function editorView(id) {
  let opened;
  try {
    opened = await api(`/api/projects/${id}`);
  } catch (err) {
    app.innerHTML = `<div class="main"><p class="error">${esc(err.message)}</p><a href="#/">Back</a></div>`;
    return;
  }
  editorState = {
    id,
    project: opened.project,
    files: opened.files,
    active: opened.files[0]?.path,
    dirty: false,
    boardDoc: null,
    remotes: new Map(),
    source: null,
  };
  const teacher = me.role !== "student";
  app.innerHTML = `<div class="ide">
    <header class="ide-top">
      <a class="logo" href="#/"><img src="/logo.png" alt="">IDE</a>
      <span class="title">${esc(opened.project.title)}</span>
      <span class="spacer"></span>
      <span id="viewers"></span>
      <button class="run" id="run">Run</button>
      <button id="board-btn">Board</button>
      ${teacher ? `<button id="report-btn">Report</button>` : ""}
      <button id="export">Export</button>
      <button id="back">Back</button>
    </header>
    ${teacher ? `<div class="banner">You are in ${esc(opened.project.ownerName)}'s project. This visit is logged. Only the student can commit it to GitHub.</div>` : ""}
    ${!teacher && opened.project.kind === "github" ? `<div class="banner">Closing this project commits to your GitHub and removes the code from TeachForth.</div>` : ""}
    <div class="ide-body">
      <aside class="files" id="files"></aside>
      <div class="editor-pane">
        <div class="tabs-files" id="file-tabs"></div>
        <div class="code-host"><textarea id="code" class="fallback-editor" spellcheck="false"></textarea></div>
      </div>
      <section class="preview-pane">
        <div class="pane-bar"><span id="pane-label">Preview</span><span id="save-state">Saved</span></div>
        <iframe id="preview" sandbox="allow-scripts" title="Preview"></iframe>
        <pre id="output" hidden></pre>
      </section>
    </div>
  </div>`;
  document.querySelector("#back").onclick = () => leaveProject();
  document.querySelector("#run").onclick = run;
  document.querySelector("#export").onclick = () => {
    location.href = `/api/projects/${id}/export.zip`;
  };
  document.querySelector("#board-btn").onclick = () => openLiveBoard();
  if (teacher) document.querySelector("#report-btn").onclick = () => { location.hash = `#/folder/${opened.project.ownerId}`; };
  connectLive();
  renderFiles();
  mountEditor();
  if (opened.project.language === "python") showOutput(opened.project.lastOutput || "Press Run.");
  else runWeb(false);
  poll();
}

async function leaveProject() {
  const back = editorState?.project?.kind === "sandbox" ? "#/sandbox" : "#/";
  if (me?.role === "student" && editorState?.project?.kind === "github") {
    try {
      await flush();
      await api(`/api/projects/${editorState.id}/close`, { method: "POST", body: {} });
    } catch (err) {
      setSaveState(err.message);
      return;
    }
  }
  location.hash = back;
}


function renderFiles() {
  const host = document.querySelector("#files");
  const tabs = document.querySelector("#file-tabs");
  const buttons = editorState.files.map((file) =>
    `<button class="${file.path === editorState.active ? "active" : ""}" data-path="${esc(file.path)}">${esc(file.path)}</button>`,
  ).join("");
  host.innerHTML = buttons + `<button id="add-file">+ File</button>`;
  tabs.innerHTML = buttons;
  for (const button of document.querySelectorAll("[data-path]")) {
    button.onclick = async () => {
      await flush();
      editorState.active = button.dataset.path;
      renderFiles();
      showActiveFile();
    };
  }
  document.querySelector("#add-file").onclick = async () => {
    const path = prompt("File name, like notes.txt");
    if (!path) return;
    const data = await api(`/api/projects/${editorState.id}/files`, { method: "POST", body: { path } });
    editorState.files = data.files;
    editorState.project.revision = data.revision;
    editorState.active = path;
    renderFiles();
    showActiveFile();
  };
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
    if (event.key === "Tab") {
      event.preventDefault();
      const start = area.selectionStart;
      area.setRangeText("  ", start, area.selectionEnd, "end");
      markDirty();
    }
  });
  if (window.CodeMirror) {
    cmEditor = window.CodeMirror.fromTextArea(area, {
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      mode: modeOf(editorState.active),
      extraKeys: {
        "Ctrl-Enter": () => run(),
        "Cmd-Enter": () => run(),
        "Ctrl-S": () => flush(),
        "Cmd-S": () => flush(),
        Tab: (cm) => cm.execCommand("indentMore"),
      },
    });
    cmEditor.on("change", () => {
      if (cmEditor.getValue() === (activeFile()?.content || "")) return;
      markDirty();
    });
    cmEditor.on("cursorActivity", sendCursor);
    cmEditor.setSize("100%", "100%");
    requestAnimationFrame(() => {
      cmEditor.refresh();
      cmEditor.focus();
    });
  } else {
    area.focus();
  }
}

function modeOf(path) {
  if (path?.endsWith(".py")) return "python";
  if (path?.endsWith(".css")) return "css";
  if (path?.endsWith(".js")) return "javascript";
  if (path?.endsWith(".html")) return "htmlmixed";
  return editorState.project.language === "python" ? "python" : "htmlmixed";
}

function showActiveFile() {
  const value = activeFile()?.content || "";
  if (cmEditor) {
    cmEditor.setOption("mode", modeOf(editorState.active));
    cmEditor.setValue(value);
    cmEditor.focus();
  } else {
    const area = document.querySelector("#code");
    area.value = value;
    area.focus();
  }
  editorState.dirty = false;
}

function activeFile() {
  return editorState.files.find((file) => file.path === editorState.active);
}

function currentContent() {
  return cmEditor ? cmEditor.getValue() : document.querySelector("#code").value;
}

function markDirty() {
  editorState.dirty = true;
  setSaveState("Editing");
  scheduleSave();
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

async function flush() {
  if (!editorState?.dirty) return;
  const file = activeFile();
  if (!file) return;
  file.content = currentContent();
  setSaveState("Saving");
  const data = await api(`/api/projects/${editorState.id}/files`, {
    method: "PUT",
    body: { path: file.path, content: file.content },
  });
  editorState.project.revision = data.revision;
  editorState.dirty = false;
  setSaveState("Saved");
}

async function poll() {
  const token = editorState;
  while (editorState === token && location.hash === `#/project/${token.id}`) {
    await sleep(2000);
    if (editorState !== token) return;
    try {
      const state = await api(`/api/projects/${token.id}/state?revision=${token.project.revision}&boardRevision=${token.project.boardRevision}`);
      paintViewers(state.viewers);
      if (state.files && !token.dirty) {
        token.files = state.files;
        token.project.revision = state.revision;
        showActiveFile();
        renderFiles();
      }
      if (state.board) {
        token.boardDoc = state.board.slides ? state.board : { slides: [{ id: "s1", title: "Slide 1", strokes: [] }], index: 0 };
        token.project.boardRevision = state.boardRevision;
        applyBoard(token.boardDoc);
      }
    } catch {
      // Keep the editor usable if a poll fails.
    }
  }
}

function paintViewers(viewers) {
  const el = document.querySelector("#viewers");
  if (!el) return;
  const others = (viewers || []).filter((viewer) => viewer.id !== me.id);
  el.textContent = others.map((viewer) => `${viewer.name} is here`).join(" ");
}

function setSaveState(text) {
  const el = document.querySelector("#save-state");
  if (el) el.textContent = text;
}

async function run() {
  await flush();
  if (editorState.project.language === "python") await runPython();
  else runWeb(true);
}

function runWeb(store) {
  document.querySelector("#preview").hidden = false;
  document.querySelector("#output").hidden = true;
  document.querySelector("#pane-label").textContent = "Preview";
  const html = fileContent("index.html") || "<!DOCTYPE html><body><p>Add index.html</p></body>";
  const css = fileContent("style.css");
  const js = fileContent("script.js");
  const doc = html.includes("</head>")
    ? html.replace("</head>", `<style>${css}</style></head>`).replace("</body>", `<script>${js}<\/script></body>`)
    : `<!DOCTYPE html><head><style>${css}</style></head><body>${html}<script>${js}<\/script></body>`;
  document.querySelector("#preview").srcdoc = doc;
  if (store) api(`/api/projects/${editorState.id}/run`, { method: "POST", body: { output: "Preview updated" } }).catch(() => {});
}

async function runPython() {
  document.querySelector("#preview").hidden = true;
  const output = document.querySelector("#output");
  output.hidden = false;
  document.querySelector("#pane-label").textContent = "Output";
  output.textContent = "Loading Python…";
  try {
    const pyodide = await loadPyodide();
    let text = "";
    pyodide.setStdout({ batched: (line) => { text += `${line}\n`; } });
    pyodide.setStderr({ batched: (line) => { text += `${line}\n`; } });
    await pyodide.runPythonAsync(fileContent("main.py") || currentContent());
    output.textContent = text || "(no output)";
    await api(`/api/projects/${editorState.id}/run`, { method: "POST", body: { output: output.textContent } });
  } catch (err) {
    output.textContent = err.message || String(err);
  }
}

function showOutput(text) {
  document.querySelector("#preview").hidden = true;
  const output = document.querySelector("#output");
  output.hidden = false;
  output.textContent = text;
  document.querySelector("#pane-label").textContent = "Output";
}

function fileContent(path) {
  return editorState.files.find((file) => file.path === path)?.content || "";
}

function openNotes() {
  closeDrawer();
  const drawer = document.createElement("aside");
  drawer.className = "drawer";
  drawer.innerHTML = `<div class="row" style="justify-content:space-between"><h2>Notes for the next teacher</h2><button class="btn-ghost" id="close-drawer">Close</button></div>
    <textarea id="notes">${esc(editorState.project.notes)}</textarea>
    <button class="btn" id="save-notes">Save notes</button>`;
  document.body.appendChild(drawer);
  document.querySelector("#close-drawer").onclick = closeDrawer;
  document.querySelector("#save-notes").onclick = async () => {
    const data = await api(`/api/projects/${editorState.id}/notes`, {
      method: "PUT",
      body: { notes: document.querySelector("#notes").value },
    });
    editorState.project.notes = data.notes;
    closeDrawer();
  };
}

function closeDrawer() {
  document.querySelector(".drawer")?.remove();
}

function openSearch() {
  if (!me) return;
  closePop();
  const data = catalogData;
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<input id="q" placeholder="Search lessons and sandbox" autofocus><div id="hits"></div>`;
  document.body.append(backdrop, modal);
  backdrop.onclick = closePop;
  const input = modal.querySelector("#q");
  const paint = () => {
    const q = input.value.trim().toLowerCase();
    const lessons = (data?.lessons || []).filter((lesson) => lesson.title.toLowerCase().includes(q)).slice(0, 8);
    const boxes = (data?.sandboxes || []).filter((project) => project.title.toLowerCase().includes(q)).slice(0, 5);
    modal.querySelector("#hits").innerHTML = [
      ...lessons.map((lesson) => `<button class="hit" data-lesson="${lesson.id}">${esc(lesson.title)}</button>`),
      ...boxes.map((project) => `<button class="hit" data-id="${project.id}">${esc(project.title)}</button>`),
    ].join("") || `<p class="muted">Nothing matches.</p>`;
    for (const button of modal.querySelectorAll("[data-lesson]")) {
      button.onclick = () => openLesson(Number(button.dataset.lesson));
    }
    for (const button of modal.querySelectorAll("[data-id]")) {
      button.onclick = () => {
        location.hash = `#/project/${button.dataset.id}`;
      };
    }
  };
  input.oninput = paint;
  input.focus();
  if (!data) loadCatalog().then(paint);
  else paint();
}

function openHelp() {
  closePop();
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<h2>Help</h2>
    <p>Students keep code in their own GitHub repositories. TeachForth only stores a project while it is open.</p>
    <p>Teachers keep personal code in Sandbox. They cannot push a student's repository.</p>
    <p>In the editor, type immediately. Ctrl+S or ⌘S saves. Ctrl+Enter or ⌘Enter runs. Back commits a student project.</p>
    <p>Board is a shared whiteboard. Cursors show live while you type.</p>
    <button class="btn" id="close-pop">Close</button>`;
  document.body.append(backdrop, modal);
  backdrop.onclick = closePop;
  modal.querySelector("#close-pop").onclick = closePop;
}

async function openLiveBoard() {
  if (!editorState.boardDoc) {
    const state = await api(`/api/projects/${editorState.id}/state?revision=${editorState.project.revision}&boardRevision=0`);
    editorState.boardDoc = state.board?.slides
      ? state.board
      : { slides: [{ id: "s1", title: "Slide 1", strokes: [] }], index: 0 };
  }
  openBoard({
    state: editorState,
    api,
    publish: (body) => api(`/api/projects/${editorState.id}/board/stroke`, { method: "POST", body }).then((data) => {
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
    if (data.authorId === me.id) return;
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
    api(`/api/projects/${editorState.id}/live`, {
      method: "POST",
      body: {
        file: editorState.active,
        line: cursor.line,
        ch: cursor.ch,
        anchor: sel?.anchor,
        head: sel?.head,
      },
    }).catch(() => {});
  }, 60);
}

function paintRemote(cursor) {
  if (!editorState || cursor.id === me.id || !cmEditor) return;
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
  if (!editorState || file.authorId === me.id) return;
  const local = editorState.files.find((item) => item.path === file.path);
  if (local) local.content = file.content;
  editorState.project.revision = file.revision;
  if (file.path === editorState.active && !editorState.dirty && cmEditor) {
    const cursor = cmEditor.getCursor();
    cmEditor.setValue(file.content);
    cmEditor.setCursor(cursor);
  }
  setSaveState(`${file.path} updated`);
}

function openAccount() {
  closePop();
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.innerHTML = `<p style="padding:8px 10px;margin:0"><strong>${esc(me.name)}</strong><br><span class="muted">${esc(me.role.replaceAll("_", " "))}</span></p>
    <a class="menu-link" href="#/person/${me.id}">My page</a>
    ${me.role === "admin" ? `<a class="menu-link" href="${POWER_URL}">Power panel</a>` : ""}
    <button id="signout">Sign out</button>`;
  document.body.append(backdrop, menu);
  backdrop.onclick = closePop;
  menu.querySelector("#signout").onclick = async () => {
    await api("/api/logout", { method: "POST", body: {} });
    me = null;
    location.hash = "#/";
    render();
  };
}

function closePop() {
  document.querySelector(".backdrop")?.remove();
  document.querySelector(".modal")?.remove();
  document.querySelector(".menu")?.remove();
}

let pyodidePromise = null;
function loadPyodide() {
  pyodidePromise ??= import("https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.mjs").then((mod) =>
    mod.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/" }),
  );
  return pyodidePromise;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

boot();
