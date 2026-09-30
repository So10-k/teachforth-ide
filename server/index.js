import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, utimesSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, bumpUsage } from "./db.js";
import { createHub, focus } from "./live.js";
import { canAccessProject, canSeeStudent, orgRoute, recordRevision, studentsFor as sessionStudents, ROLES } from "./org.js";
import { hashPassword, verifyPassword, newId, parseCookies, sessionCookie, clearCookie } from "./auth.js";
import { zipStore } from "./zip.js";
import { githubRoute, commitStudentProject, hydrateProject, visibleStudentProject, inspectProject, relinkProject, renameLinkedRepo, pace, studentMayOpen, pullIfGithubNewer } from "./github.js";
import { configureHome, createHomeLink, endHomeLink, ensureHome, homeView } from "./homework.js";
import { normalizeTemplate, projectLanguage, starterEntries, isHiddenFile } from "./templates.js";
import { publicSlug, publishedUrl, removeSite, siteFiles, writeSite } from "./publish.js";
import { endRun, pushLine, startRun, waitLine } from "./runtime.js";
import { ensureControls, fileViews, controlView, publicControl, studentWriteBlock, setFileFlag, setBoardControl, moveFlags, clearFlags, flagMap, isLeadPlus } from "./controls.js";
import { planSteps, startSandbox, readSandbox, writeSandboxStdin, stopSandbox } from "./sandbox.js";
import { mintPreview, previewProject, previewBody } from "./preview-site.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || join(ROOT, "data");
const DB_FILE = join(DATA_DIR, "teachforth.sqlite");
const IDLE_STAMP = process.env.IDLE_STAMP || "";
const HOST = process.env.HOST || "0.0.0.0";

const WEB = {
  "index.html": `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>My page</title>
</head>
<body>
  <h1>Hello from TeachForth</h1>
  <p>Edit this page, then press Run.</p>
</body>
</html>
`,
  "style.css": `body {
  font-family: "Source Sans 3", sans-serif;
  margin: 0;
  padding: 32px;
  color: #1c1620;
}
h1 { color: #a334cb; }
`,
  "script.js": `document.body.insertAdjacentHTML(
  "beforeend",
  "<p>script.js is running.</p>"
);
`,
};

const PYTHON = {
  "main.py": `print("Hello from TeachForth")
name = "student"
print(f"Welcome, {name}")
`,
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

const loginAttempts = new Map();
const presence = new Map();
const hub = createHub();

const db = openDatabase(DB_FILE);
ensureControls(db);
configureHome(DATA_DIR);
ensureHome(db);
seed();
ensureLibrary();
if (IDLE_STAMP) touch(IDLE_STAMP);

const server = createServer(async (req, res) => {
  try {
    if (IDLE_STAMP) touch(IDLE_STAMP);
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname.startsWith("/preview-site/")) {
      return servePreviewSite(res, url);
    }
    if (req.method === "GET" && /^\/preview\/\d+\/?$/.test(url.pathname)) {
      return serveStatic("/preview.html", res);
    }
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      return serveStatic(url.pathname, res);
    }
    if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
    await route(req, res, url);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    send(res, status, { error: err.publicMessage || (status === 500 ? "Something went wrong" : err.message) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TeachForth IDE on http://${HOST}:${PORT}`);
});

setInterval(() => {
  if (hub.openCount() && IDLE_STAMP) touch(IDLE_STAMP);
  hub.ping();
}, 15_000);

function seed() {
  mkdirSync(DATA_DIR, { recursive: true });
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (count > 0) return;
  const now = new Date().toISOString();
  const email = (process.env.ADMIN_EMAIL || "admin@teachforth.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || newId().slice(0, 16);
  db.prepare(
    "INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, 'admin', ?, ?)",
  ).run(email, "TeachForth Admin", hashPassword(password), now);
  const passwordFile = join(DATA_DIR, "admin-password.txt");
  writeFileSync(passwordFile, `email=${email}\npassword=${password}\n`, { mode: 0o600 });
  console.log(`First admin written to ${passwordFile}`);
  if (process.env.SEED_DEMO === "1") seedDemo(now);
}

function seedDemo(now) {
  const teacher = insertUser("Avery Chen", "teacher@teachforth.local", "teacher", "teacher-demo", now);
  const student = insertUser("Jordan Lee", "student@teachforth.local", "student", "student-demo", now);
  const lead = insertUser("Lead Kim", "lead@teachforth.local", "teacher", "lead-demo-1", now);
  const chapterLead = insertUser("Chapter Sam", "chapter@teachforth.local", "chapter_lead", "chapter-demo-1", now);
  const chapterId = Number(db.prepare("INSERT INTO chapters (name, place, created_at) VALUES (?, ?, ?)").run("Demo chapter", "Nairobi", now).lastInsertRowid);
  db.prepare("INSERT INTO chapter_staff (chapter_id, user_id) VALUES (?, ?)").run(chapterId, chapterLead);
  const blockId = Number(
    db.prepare("INSERT INTO blocks (chapter_id, name, lead_teacher_id, status, starts_at, created_at) VALUES (?, ?, ?, 'live', ?, ?)").run(
      chapterId,
      "Demo block",
      lead,
      now,
      now,
    ).lastInsertRowid,
  );
  db.prepare("INSERT INTO pairs (block_id, teacher_id, student_id, created_at) VALUES (?, ?, ?, ?)").run(blockId, teacher, student, now);
  const member = db.prepare("INSERT OR IGNORE INTO chapter_members (chapter_id, user_id) VALUES (?, ?)");
  member.run(chapterId, student);
  member.run(chapterId, teacher);
  member.run(chapterId, lead);
  createProject(student, "Old sandbox", "web", now);
  const demoRepo = createProject(student, "{TeachForth} First page", "web", now, { kind: "github" });
  db.prepare("UPDATE projects SET github_repo = ?, github_url = ?, open = 1 WHERE id = ?").run(
    "student/TeachForth-first-page",
    "https://github.com/student/TeachForth-first-page",
    demoRepo,
  );
  console.log("Demo users: teacher@teachforth.local / teacher-demo, student@teachforth.local / student-demo");
}

function insertUser(name, email, role, password, now) {
  const result = db.prepare(
    "INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(email, name, role, hashPassword(password), now);
  return Number(result.lastInsertRowid);
}

function ensureLibrary() {
  const existing = db.prepare("SELECT id FROM courses WHERE library = 1 LIMIT 1").get();
  if (existing) return;
  const now = new Date().toISOString();
  const courseId = Number(
    db.prepare("INSERT INTO courses (name, library, created_at) VALUES (?, 1, ?)").run("Intro to code", now).lastInsertRowid,
  );
  const lessons = [
    ["Lessons", 30, "Reinforcing topics", "web", 1, {
      "index.html": "<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <title>Review</title>\n</head>\n<body>\n  <h1>Review</h1>\n  <p>Change this heading, then add a list of three things you learned.</p>\n</body>\n</html>\n",
      "style.css": "body { font-family: sans-serif; margin: 32px; }\nh1 { color: #3b6ef6; }\n",
      "script.js": "document.querySelector(\"h1\").title = \"Click Run to see the page\";\n",
    }],
    ["Final Project", 20, "Final project", "web", 1, {
      "index.html": "<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <title>Final project</title>\n</head>\n<body>\n  <h1>My project</h1>\n  <p>Build something you can explain to a teacher.</p>\n  <button id=\"go\">Click me</button>\n</body>\n</html>\n",
      "style.css": "body { font-family: sans-serif; margin: 32px; }\nbutton { background: #3b6ef6; color: white; border: 0; border-radius: 8px; padding: 8px 12px; }\n",
      "script.js": "document.querySelector(\"#go\").addEventListener(\"click\", () => {\n  document.querySelector(\"h1\").textContent = \"You clicked it\";\n});\n",
    }],
    ["2. Python", 10, "2.01 - Print and variables", "python", 1, {
      "main.py": "name = \"student\"\nprint(\"Hello from TeachForth\")\nprint(f\"Welcome, {name}\")\n",
    }],
    ["1. The web", 0, "1.01 - Your first page", "web", 1, {
      "index.html": "<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <title>My page</title>\n</head>\n<body>\n  <h1>Hello</h1>\n  <p>Edit this page, then press Run.</p>\n</body>\n</html>\n",
      "style.css": "body { font-family: sans-serif; margin: 32px; }\nh1 { color: #3b6ef6; }\n",
      "script.js": "document.body.insertAdjacentHTML(\"beforeend\", \"<p>script.js is running.</p>\");\n",
    }],
  ];
  const insertLesson = db.prepare(
    `INSERT INTO lessons (course_id, unit, unit_order, title, language, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFile = db.prepare("INSERT INTO lesson_files (lesson_id, path, content) VALUES (?, ?, ?)");
  for (const [unit, unitOrder, title, language, position, files] of lessons) {
    const lessonId = Number(insertLesson.run(courseId, unit, unitOrder, title, language, position, now, now).lastInsertRowid);
    for (const [path, content] of Object.entries(files)) insertFile.run(lessonId, path, content);
  }
}

function catalog(res, user, url) {
  requireUser(user);
  const courses = visibleCourses(user);
  const ids = courses.map((course) => course.id);
  let lessons = [];
  if (ids.length) {
    const marks = ids.map(() => "?").join(",");
    lessons = db.prepare(
      `SELECT l.*, p.id AS project_id, COALESCE(p.updated_at, l.updated_at) AS touched_at
       FROM lessons l
       LEFT JOIN projects p ON p.lesson_id = l.id AND p.owner_id = ?
       WHERE l.course_id IN (${marks})
       ORDER BY l.unit_order DESC, l.position, l.title`,
    ).all(user.id, ...ids);
  }
  const sandboxes = db.prepare(
    `SELECT p.*, u.name AS owner_name FROM projects p
     JOIN users u ON u.id = p.owner_id
     WHERE p.owner_id = ? AND (p.kind = 'sandbox' OR p.lesson_id IS NULL)
     ORDER BY p.updated_at DESC`,
  ).all(user.id);
  send(res, 200, {
    courses: courses.map((course) => ({ id: course.id, name: course.name, library: Boolean(course.library) })),
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      courseId: lesson.course_id,
      unit: lesson.unit,
      title: lesson.title,
      language: lesson.language,
      projectId: lesson.project_id || null,
      updatedAt: lesson.touched_at,
    })),
    sandboxes: sandboxes.map((row) => projectView(row, user)),
  });
}

function visibleCourses(user) {
  if (user.role === "admin") return db.prepare("SELECT * FROM courses ORDER BY name").all();
  return db.prepare(
    `SELECT DISTINCT c.* FROM courses c
     LEFT JOIN course_members m ON m.course_id = c.id AND m.user_id = ?
     WHERE c.library = 1 OR m.user_id IS NOT NULL
     ORDER BY c.name`,
  ).all(user.id);
}

function assertCanSeeCourse(user, courseId) {
  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
  if (!course) fail(404, "Class not found");
  if (user.role === "admin" || course.library) return course;
  const member = db.prepare("SELECT 1 AS ok FROM course_members WHERE course_id = ? AND user_id = ?").get(courseId, user.id);
  if (!member) fail(403, "You are not in that class");
  return course;
}

async function createCourse(req, res, user) {
  requireUser(user);
  if (user.role === "student") fail(403, "Only a teacher or admin can make a class");
  const body = await readJson(req);
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) fail(400, "Class name is required");
  const now = new Date().toISOString();
  const id = Number(db.prepare("INSERT INTO courses (name, library, created_at) VALUES (?, 0, ?)").run(name, now).lastInsertRowid);
  db.prepare("INSERT OR IGNORE INTO course_members (course_id, user_id) VALUES (?, ?)").run(id, user.id);
  audit(user, "create_course", null, name);
  send(res, 201, { course: { id, name } });
}

async function enrollCourse(req, res, user, courseId) {
  requireRole(user, "admin");
  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
  if (!course) fail(404, "Class not found");
  const body = await readJson(req);
  const person = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(body.userId));
  if (!person) fail(400, "Pick a person");
  db.prepare("INSERT OR IGNORE INTO course_members (course_id, user_id) VALUES (?, ?)").run(courseId, person.id);
  audit(user, "enroll", null, `${person.email} -> ${course.name}`);
  send(res, 200, { ok: true });
}

async function createLesson(req, res, user) {
  requireUser(user);
  if (user.role === "student") fail(403, "Only a teacher or admin can add a lesson");
  const body = await readJson(req);
  const course = assertCanSeeCourse(user, Number(body.courseId));
  const title = String(body.title || "").trim().slice(0, 80);
  const unit = String(body.unit || "Lessons").trim().slice(0, 80) || "Lessons";
  const language = body.language === "python" ? "python" : "web";
  if (!title) fail(400, "Lesson title is required");
  const now = new Date().toISOString();
  const lessonId = Number(
    db.prepare(
      `INSERT INTO lessons (course_id, unit, unit_order, title, language, position, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, 1, ?, ?)`,
    ).run(course.id, unit, title, language, now, now).lastInsertRowid,
  );
  const files = language === "python" ? PYTHON : WEB;
  const insert = db.prepare("INSERT INTO lesson_files (lesson_id, path, content) VALUES (?, ?, ?)");
  for (const [path, content] of Object.entries(files)) insert.run(lessonId, path, content);
  audit(user, "create_lesson", null, title);
  send(res, 201, { lesson: { id: lessonId, title, unit, language } });
}

async function openLesson(req, res, user, lessonId) {
  requireUser(user);
  const body = await readJson(req);
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(lessonId);
  if (!lesson) fail(404, "Lesson not found");
  assertCanSeeCourse(user, lesson.course_id);
  let ownerId = user.id;
  if (body.ownerId && user.role !== "student") {
    assertCanSeeStudent(user, Number(body.ownerId));
    ownerId = Number(body.ownerId);
  }
  let project = db.prepare("SELECT id FROM projects WHERE owner_id = ? AND lesson_id = ?").get(ownerId, lessonId);
  if (!project) {
    const rows = db.prepare("SELECT path, content FROM lesson_files WHERE lesson_id = ?").all(lessonId);
    const files = {};
    for (const row of rows) files[row.path] = row.content;
    const id = createProject(ownerId, lesson.title, lesson.language, new Date().toISOString(), {
      lessonId,
      kind: "lesson",
      files,
    });
    project = { id };
  }
  send(res, 200, { projectId: project.id });
}

async function createSandbox(req, res, user) {
  requireUser(user);
  const body = await readJson(req);
  const title = String(body.title || "Sandbox").trim().slice(0, 80) || "Sandbox";
  const template = normalizeTemplate(body.language || body.template);
  let ownerId = user.id;
  if (body.ownerId && Number(body.ownerId) !== user.id) {
    if (user.role !== "admin") fail(403, "Only an admin can make a sandbox for someone else");
    const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(body.ownerId));
    if (!owner || owner.role === "student") fail(400, "Sandboxes belong to staff, not students");
    ownerId = owner.id;
  } else if (user.role !== "teacher" && user.role !== "admin") {
    fail(403, "Sandbox is where teachers keep their own code");
  }
  const id = createProject(ownerId, title, projectLanguage(template), new Date().toISOString(), { kind: "sandbox", template });
  audit(user, "create_project", id, title);
  send(res, 201, { project: projectView(loadProject(id), user) });
}

function createProject(ownerId, title, language, now = new Date().toISOString(), extra = {}) {
  const template = extra.template || (language === "python" ? "python" : "web");
  const stored = projectLanguage(template);
  const result = db.prepare(
    `INSERT INTO projects (owner_id, title, language, created_at, updated_at, lesson_id, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(ownerId, title, stored, now, now, extra.lessonId || null, extra.kind || "sandbox");
  const id = Number(result.lastInsertRowid);
  const files = extra.files || starterEntries(template);
  const insert = db.prepare(
    "INSERT INTO files (project_id, path, content, updated_at) VALUES (?, ?, ?, ?)",
  );
  for (const [path, content] of Object.entries(files)) insert.run(id, path, content, now);
  return id;
}

async function route(req, res, url) {
  const user = currentUser(req);
  if (user && url.pathname.startsWith("/api/") && url.pathname !== "/api/health") {
    bumpUsage(db, "requests");
  }
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/health") {
    return send(res, 200, { ok: true, demo: process.env.SEED_DEMO === "1" });
  }
  if (req.method === "POST" && path === "/api/login") return login(req, res);
  if (req.method === "POST" && path === "/api/logout") return logout(req, res);
  if (req.method === "GET" && path === "/api/me") return send(res, 200, { user: publicUser(user) });
  if (path === "/api/runtime/runs" && req.method === "POST") {
    requireUser(user);
    return send(res, 201, { runId: startRun(user.id) });
  }
  const runtimeRun = path.match(/^\/api\/runtime\/runs\/([a-f0-9]+)$/);
  if (runtimeRun && req.method === "DELETE") {
    requireUser(user);
    endRun(runtimeRun[1], user.id);
    stopSandbox(runtimeRun[1], user.id);
    return send(res, 200, { ok: true });
  }
  if (path === "/api/runtime/output" && req.method === "GET") {
    requireUser(user);
    const data = readSandbox(url.searchParams.get("run"), user.id, url.searchParams.get("offset"));
    if (!data) fail(404, "That program is not running");
    return send(res, 200, data);
  }
  if (path === "/api/runtime/stdin" && req.method === "POST") {
    requireUser(user);
    const body = await readJson(req);
    const run = String(body.run || "");
    if (!writeSandboxStdin(run, user.id, body.line) && !pushLine(run, user.id, body.line)) {
      fail(404, "That program is not waiting");
    }
    return send(res, 200, { ok: true });
  }
  if (path === "/api/runtime/stdin" && req.method === "GET") return runtimeStdin(res, user, url);
  if (req.method === "POST" && path === "/api/me/password") {
    requireUser(user);
    const body = await readJson(req);
    requirePassword(body.password);
    if (!verifyPassword(body.current || "", user.password_hash)) fail(401, "Current password is wrong");
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(body.password), user.id);
    return send(res, 200, { ok: true });
  }

  if (path === "/api/users" && req.method === "GET") {
    requireRole(user, "admin");
    return send(res, 200, { users: db.prepare("SELECT id, email, name, role, created_at FROM users ORDER BY role, name").all() });
  }
  if (path === "/api/users" && req.method === "POST") return createUser(req, res, user);
  const userMatch = path.match(/^\/api\/users\/(\d+)$/);
  if (userMatch && req.method === "PATCH") return updateUser(req, res, user, Number(userMatch[1]));
  if (userMatch && req.method === "DELETE") return deleteUser(res, user, Number(userMatch[1]));
  const passwordMatch = path.match(/^\/api\/users\/(\d+)\/password$/);
  if (passwordMatch && req.method === "POST") return resetPassword(req, res, user, Number(passwordMatch[1]));

  if (path === "/api/assignments" && req.method === "GET") {
    requireRole(user, "admin");
    return send(res, 200, { assignments: listAssignments() });
  }
  if (path === "/api/assignments" && req.method === "POST") return assign(req, res, user);
  if (path === "/api/assignments" && req.method === "DELETE") return unassign(req, res, user);

  if (path === "/api/students" && req.method === "GET") return send(res, 200, { students: sessionStudents(db, user) });
  if (await githubRoute({
    db, req, res, user, send, fail, readJson, audit, requireUser, projectView,
    startSession: (target, userId) => startSession(target, req, userId),
  }, path) !== false) return;
  if (await orgRoute({ db, req, res, user, send, fail, readJson, audit, requireUser, projectView }, path) !== false) return;
  if (path === "/api/usage" && req.method === "GET") {
    requireRole(user, "admin");
    return send(res, 200, {
      days: db.prepare("SELECT * FROM usage_days ORDER BY day DESC LIMIT 14").all(),
    });
  }
  if (path === "/api/audit" && req.method === "GET") {
    requireRole(user, "admin");
    return send(res, 200, { audit: recentAudit() });
  }

  if (path === "/api/catalog" && req.method === "GET") return catalog(res, user, url);
  if (path === "/api/courses" && req.method === "POST") return createCourse(req, res, user);
  if (path === "/api/lessons" && req.method === "POST") return createLesson(req, res, user);
  const lessonOpen = path.match(/^\/api\/lessons\/(\d+)\/open$/);
  if (lessonOpen && req.method === "POST") return openLesson(req, res, user, Number(lessonOpen[1]));
  const enroll = path.match(/^\/api\/courses\/(\d+)\/members$/);
  if (enroll && req.method === "POST") return enrollCourse(req, res, user, Number(enroll[1]));
  if (path === "/api/sandbox" && req.method === "POST") return createSandbox(req, res, user);

  if (path === "/api/projects" && req.method === "GET") return listProjects(res, user, url);
  if (path === "/api/projects" && req.method === "POST") return postProject(req, res, user);

  const projectMatch = path.match(/^\/api\/projects\/(\d+)(\/.*)?$/);
  if (projectMatch) return projectRoute(req, res, url, user, Number(projectMatch[1]), projectMatch[2] || "");
  fail(404, "Not found");
}

async function projectRoute(req, res, url, user, id, rest) {
  let project = loadProject(id);
  if (!project) fail(404, "Project not found");
  assertCanAccess(user, project);
  if (user.role === "student" && project.kind === "github") await studentMayOpen(user, project);
  if (project.kind === "github" && !project.open && rest !== "/close") {
    await hydrateProject(db, project);
    project = loadProject(id);
  }
  if (req.method === "GET" && rest === "/events") return liveEvents(req, res, user, id);
  if (req.method === "POST" && rest === "/live") return liveSignal(req, res, user, id);
  if (req.method === "POST" && rest === "/board/stroke") return boardStroke(req, res, user, project);
  if (req.method === "GET" && rest === "") {
    if (project.kind === "github" && project.open) {
      if (await pullIfGithubNewer(db, project)) project = loadProject(id);
    }
    audit(user, "open_project", project.id, project.title);
    bumpUsage(db, "editor_opens");
    notePresence(project.id, user);
    return send(res, 200, {
      project: projectView(project, user),
      files: editorFiles(id, user),
      viewers: viewersOf(id),
      controls: controlView(db, user, project),
    });
  }
  if (req.method === "GET" && rest === "/state") return projectState(res, url, user, id);
  if (req.method === "PUT" && rest === "/files") return saveFile(req, res, user, project);
  if (req.method === "POST" && rest === "/rename") return renameFile(req, res, user, project);
  if (req.method === "POST" && rest === "/files") return addFile(req, res, user, project);
  if (req.method === "DELETE" && rest === "/files") return removeFile(res, user, project, url);
  if (req.method === "PUT" && rest === "/notes") return saveNotes(req, res, user, project);
  if (req.method === "PUT" && rest === "/board") return saveBoard(req, res, user, project);
  if (req.method === "POST" && rest === "/run") return saveRun(req, res, user, project);
  if (req.method === "POST" && rest === "/exec") return execProject(req, res, user, project);
  if (req.method === "POST" && rest === "/preview") return send(res, 200, { token: mintPreview(project.id) });
  if (req.method === "PATCH" && rest === "/controls") return patchControls(req, res, user, project);
  if (req.method === "GET" && rest === "/lead") return leadStatus(res, user, project);
  if (req.method === "POST" && rest === "/commit") return forceCommit(res, user, project);
  if (req.method === "POST" && rest === "/home") return makeHomeLink(req, res, user, project);
  if (req.method === "DELETE" && rest === "/home") return stopHomeLink(res, user, project);
  if (req.method === "PATCH" && rest === "/admin") return adminProject(req, res, user, project);
  if (req.method === "POST" && rest === "/publish") return publishProject(res, user, project);
  if (req.method === "DELETE" && rest === "/publish") return unpublishProject(res, user, project);
  if (req.method === "POST" && rest === "/presence") {
    notePresence(id, user);
    return send(res, 200, { viewers: viewersOf(id) });
  }
  if (req.method === "GET" && rest === "/export.zip") return exportZip(res, user, project);
  if (req.method === "POST" && rest === "/github") return pushGithub(res, user, project);
  if (req.method === "POST" && rest === "/close") return closeProject(res, user, project);
  if (req.method === "DELETE" && rest === "") return deleteProject(res, user, project);
  fail(404, "Not found");
}

function login(req, res) {
  return readJson(req).then((body) => {
    const email = String(body.email || "").trim().toLowerCase();
    const ip = req.socket.remoteAddress || "local";
    const key = `${ip}:${email}`;
    const now = Date.now();
    const bucket = (loginAttempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (bucket.length >= 8) fail(429, "Too many tries. Wait a few minutes.");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !verifyPassword(String(body.password || ""), user.password_hash)) {
      bucket.push(now);
      loginAttempts.set(key, bucket);
      fail(401, "Email or password is wrong");
    }
    loginAttempts.delete(key);
    startSession(res, req, user.id);
    audit(user, "login", null, "");
    send(res, 200, { user: publicUser(user) });
  });
}

function startSession(res, req, userId) {
  const id = newId();
  const created = new Date();
  const expires = new Date(created.getTime() + 14 * 24 * 60 * 60 * 1000);
  db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    id,
    userId,
    created.toISOString(),
    expires.toISOString(),
  );
  bumpUsage(db, "logins");
  res.setHeader("Set-Cookie", sessionCookie(id, secure(req)));
  return id;
}

function logout(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.tf_session) db.prepare("DELETE FROM sessions WHERE id = ?").run(cookies.tf_session);
  res.setHeader("Set-Cookie", clearCookie(secure(req)));
  send(res, 200, { ok: true });
}

async function createUser(req, res, actor) {
  requireRole(actor, "admin");
  const body = await readJson(req);
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const role = body.role;
  if (!name || !email.includes("@")) fail(400, "Name and email are required");
  if (!ROLES.includes(role)) fail(400, "Role must be admin, chapter lead, teacher, or student");
  requirePassword(body.password);
  try {
    const id = insertUser(name, email, role, body.password, new Date().toISOString());
    audit(actor, "create_user", null, `${role} ${email}`);
    send(res, 201, { user: { id, name, email, role } });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) fail(409, "That email is already in use");
    throw err;
  }
}

async function updateUser(req, res, actor, id) {
  requireRole(actor, "admin");
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!target) fail(404, "Person not found");
  const body = await readJson(req);
  const role = body.role || target.role;
  if (!ROLES.includes(role)) fail(400, "Pick a role");
  if (target.role === "admin" && role !== "admin") {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
    if (admins <= 1) fail(400, "Keep at least one admin");
  }
  const name = String(body.name || target.name).trim().slice(0, 80);
  const email = String(body.email || target.email).trim().toLowerCase();
  if (!name || !email.includes("@")) fail(400, "Name and email are required");
  try {
    db.prepare("UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?").run(name, email, role, id);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) fail(409, "That email is already in use");
    throw err;
  }
  audit(actor, "update_user", null, `${id} ${role}`);
  send(res, 200, { user: { id, name, email, role } });
}

async function resetPassword(req, res, actor, id) {
  requireRole(actor, "admin");
  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!target) fail(404, "Person not found");
  const body = await readJson(req);
  requirePassword(body.password);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(body.password), id);
  audit(actor, "reset_password", null, String(id));
  send(res, 200, { ok: true });
}

function deleteUser(res, actor, id) {
  requireRole(actor, "admin");
  if (actor.id === id) fail(400, "You cannot delete your own account");
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!target) fail(404, "Person not found");
  if (target.role === "admin") {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
    if (admins <= 1) fail(400, "Keep at least one admin");
  }
  const projectIds = db.prepare("SELECT id FROM projects WHERE owner_id = ?").all(id).map((row) => row.id);
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE blocks SET lead_teacher_id = NULL WHERE lead_teacher_id = ?").run(id);
    db.prepare("UPDATE reports SET author_id = ? WHERE author_id = ?").run(actor.id, id);
    for (const projectId of projectIds) db.prepare("DELETE FROM file_revisions WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM projects WHERE owner_id = ?").run(id);
    db.prepare("DELETE FROM github_states WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  audit(actor, "delete_user", null, `${target.email} local projects removed; GitHub repos stay`);
  send(res, 200, { ok: true, githubKept: Boolean(target.github_login) });
}

async function assign(req, res, actor) {
  requireRole(actor, "admin");
  const body = await readJson(req);
  const teacher = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(body.teacherId));
  const student = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(body.studentId));
  if (!teacher || teacher.role !== "teacher") fail(400, "Pick a teacher");
  if (!student || student.role !== "student") fail(400, "Pick a student");
  db.prepare("INSERT OR IGNORE INTO assignments (teacher_id, student_id, created_at) VALUES (?, ?, ?)").run(
    teacher.id,
    student.id,
    new Date().toISOString(),
  );
  audit(actor, "assign", null, `${teacher.email} -> ${student.email}`);
  send(res, 200, { assignments: listAssignments() });
}

async function unassign(req, res, actor) {
  requireRole(actor, "admin");
  const body = await readJson(req);
  db.prepare("DELETE FROM assignments WHERE teacher_id = ? AND student_id = ?").run(
    Number(body.teacherId),
    Number(body.studentId),
  );
  audit(actor, "unassign", null, `${body.teacherId} - ${body.studentId}`);
  send(res, 200, { assignments: listAssignments() });
}

function listProjects(res, user, url) {
  requireUser(user);
  const studentId = Number(url.searchParams.get("studentId") || 0);
  let ownerId = user.id;
  if (user.role === "student") {
    ownerId = user.id;
  } else if (studentId) {
    assertCanSeeStudent(user, studentId);
    ownerId = studentId;
  } else if (user.role !== "student") {
    const ids = sessionStudents(db, user).map((student) => student.id);
    if (!ids.length) return send(res, 200, { projects: [] });
    const marks = ids.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT p.*, u.name AS owner_name FROM projects p
       JOIN users u ON u.id = p.owner_id
       WHERE p.owner_id IN (${marks})
       ORDER BY p.updated_at DESC`,
    ).all(...ids);
    return send(res, 200, { projects: rows.filter(visibleStudentProject).map((row) => projectView(row, user)) });
  } else {
    const rows = db.prepare(
      `SELECT p.*, u.name AS owner_name FROM projects p
       JOIN users u ON u.id = p.owner_id
       ORDER BY p.updated_at DESC`,
    ).all();
    return send(res, 200, { projects: rows.filter(visibleStudentProject).map((row) => projectView(row, user)) });
  }
  const rows = db.prepare(
    `SELECT p.*, u.name AS owner_name FROM projects p
     JOIN users u ON u.id = p.owner_id
     WHERE p.owner_id = ?
     ORDER BY p.updated_at DESC`,
  ).all(ownerId);
  const visible = user.role === "student" || studentId ? rows.filter(visibleStudentProject) : rows;
  send(res, 200, { projects: visible.map((row) => projectView(row, user)) });
}

async function postProject(req, res, user) {
  requireUser(user);
  const body = await readJson(req);
  const title = String(body.title || "").trim();
  const language = body.language === "python" ? "python" : "web";
  if (!title) fail(400, "Title is required");
  if (user.role === "student") fail(400, "Create a GitHub repository from your profile. TeachForth does not keep student code unless a project is open.");
  let ownerId = user.id;
  if (user.role !== "student") {
    ownerId = Number(body.ownerId || 0);
    assertCanSeeStudent(user, ownerId);
  }
  const id = createProject(ownerId, title.slice(0, 80), language);
  audit(user, "create_project", id, title);
  send(res, 201, { project: projectView(loadProject(id), user) });
}

function projectState(res, url, user, id) {
  const project = loadProject(id);
  const revision = Number(url.searchParams.get("revision") || 0);
  const boardRevision = Number(url.searchParams.get("boardRevision") || 0);
  const payload = {
    revision: project.revision,
    boardRevision: project.board_revision,
    notes: "",
    lastOutput: project.last_output,
    updatedAt: project.updated_at,
    viewers: viewersOf(id),
  };
  if (revision !== project.revision) payload.files = editorFiles(id, user);
  if (boardRevision !== project.board_revision) payload.board = hub.board(id) || normalizeBoard(project.board || "[]");
  payload.controls = controlView(db, user, project);
  send(res, 200, payload);
}

async function saveFile(req, res, user, project) {
  const body = await readJson(req);
  if (project.kind === "github" && !project.open) fail(409, "This project is closed. Open it again.");
  const path = cleanPath(body.path);
  if (isHiddenFile(path)) fail(400, "That file stays with the project");
  const block = studentWriteBlock(db, user, project, path);
  if (block === "missing") fail(404, "File not found");
  if (block === "locked") fail(403, "That file is locked");
  const content = String(body.content ?? "");
  if (content.length > 200_000) fail(413, "That file is too large for this pilot");
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT id, content FROM files WHERE project_id = ? AND path = ?").get(project.id, path);
  if (!existing) fail(404, "File not found");
  db.exec("BEGIN IMMEDIATE");
  try {
    const fresh = db.prepare("SELECT revision FROM projects WHERE id = ?").get(project.id);
    if (body.baseRevision !== undefined && Number(body.baseRevision) !== fresh.revision) {
      const current = db.prepare("SELECT content FROM files WHERE project_id = ? AND path = ?").get(project.id, path);
      db.exec("ROLLBACK");
      return send(res, 409, {
        error: "Someone else saved this file",
        content: current?.content ?? "",
        revision: fresh.revision,
      });
    }
    db.prepare("UPDATE files SET content = ?, updated_at = ? WHERE project_id = ? AND path = ?").run(content, now, project.id, path);
    db.prepare("UPDATE projects SET revision = revision + 1, updated_at = ? WHERE id = ?").run(now, project.id);
    recordRevision(db, project.id, path, content, user.id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  const saved = loadProject(project.id);
  audit(user, "save_file", project.id, path);
  hub.publish(project.id, "file", { path, content, revision: saved.revision, authorId: user.id });
  send(res, 200, { revision: saved.revision, updatedAt: saved.updated_at });
}

async function addFile(req, res, user, project) {
  const body = await readJson(req);
  const path = cleanPath(body.path);
  if (isHiddenFile(path)) fail(400, "That file stays with the project");
  if (studentWriteBlock(db, user, project, path) === "missing") fail(404, "File not found");
  const now = new Date().toISOString();
  try {
    db.prepare("INSERT INTO files (project_id, path, content, updated_at) VALUES (?, ?, '', ?)").run(project.id, path, now);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) fail(409, "That file already exists");
    throw err;
  }
  db.prepare("UPDATE projects SET revision = revision + 1, updated_at = ? WHERE id = ?").run(now, project.id);
  audit(user, "add_file", project.id, path);
  send(res, 201, { files: editorFiles(project.id, user), revision: loadProject(project.id).revision });
}

async function renameFile(req, res, user, project) {
  const body = await readJson(req);
  const from = cleanPath(body.from);
  const to = cleanPath(body.to);
  if (isHiddenFile(from) || isHiddenFile(to)) fail(400, "That file stays with the project");
  if (studentWriteBlock(db, user, project, from) === "locked") fail(403, "That file is locked");
  if (studentWriteBlock(db, user, project, from) === "missing" || studentWriteBlock(db, user, project, to) === "missing") {
    fail(404, "File not found");
  }
  if (from === to) return send(res, 200, { files: editorFiles(project.id, user), revision: project.revision });
  const existing = db.prepare("SELECT id FROM files WHERE project_id = ? AND path = ?").get(project.id, from);
  if (!existing) fail(404, "File not found");
  const clash = db.prepare("SELECT id FROM files WHERE project_id = ? AND path = ?").get(project.id, to);
  if (clash) fail(409, "That name is already used");
  const now = new Date().toISOString();
  db.prepare("UPDATE files SET path = ?, updated_at = ? WHERE project_id = ? AND path = ?").run(to, now, project.id, from);
  db.prepare("UPDATE file_revisions SET path = ? WHERE project_id = ? AND path = ?").run(to, project.id, from);
  moveFlags(db, project.id, from, to);
  db.prepare("UPDATE projects SET revision = revision + 1, updated_at = ? WHERE id = ?").run(now, project.id);
  audit(user, "rename_file", project.id, `${from} -> ${to}`);
  send(res, 200, { files: editorFiles(project.id, user), revision: loadProject(project.id).revision });
}

function removeFile(res, user, project, url) {
  const path = cleanPath(url.searchParams.get("path"));
  if (isHiddenFile(path)) fail(400, "That file stays with the project");
  const block = studentWriteBlock(db, user, project, path);
  if (block === "missing") fail(404, "File not found");
  if (block === "locked") fail(403, "That file is locked");
  const existing = db.prepare("SELECT id FROM files WHERE project_id = ? AND path = ?").get(project.id, path);
  if (!existing) fail(404, "File not found");
  db.prepare("DELETE FROM files WHERE project_id = ? AND path = ?").run(project.id, path);
  db.prepare("DELETE FROM file_revisions WHERE project_id = ? AND path = ?").run(project.id, path);
  clearFlags(db, project.id, path);
  const now = new Date().toISOString();
  db.prepare("UPDATE projects SET revision = revision + 1, updated_at = ? WHERE id = ?").run(now, project.id);
  audit(user, "delete_file", project.id, path);
  send(res, 200, { files: editorFiles(project.id, user), revision: loadProject(project.id).revision });
}

async function saveNotes(req, res, user, project) {
  if (user.role === "student") fail(403, "Notes are for teachers");
  const body = await readJson(req);
  const notes = String(body.notes ?? "").slice(0, 8000);
  const now = new Date().toISOString();
  db.prepare("UPDATE projects SET notes = ?, updated_at = ? WHERE id = ?").run(notes, now, project.id);
  audit(user, "save_notes", project.id, "");
  send(res, 200, { notes, updatedAt: now });
}

async function saveBoard(req, res, user, project) {
  const body = await readJson(req);
  const doc = normalizeBoard(body.slides ? body : { strokes: body.strokes });
  hub.rememberBoard(project.id, doc);
  persistBoard(project.id, doc);
  hub.publish(project.id, "board", { board: doc, authorId: user.id });
  send(res, 200, { boardRevision: loadProject(project.id).board_revision, board: doc });
}

async function boardStroke(req, res, user, project) {
  const body = await readJson(req);
  if (user.role === "student" && publicControl(db, project.id).lockDraw) fail(403, "The teacher locked the board");
  const doc = hub.board(project.id) || normalizeBoard(JSON.parse(loadProject(project.id).board || "[]"));
  const slide = doc.slides.find((item) => item.id === body.slideId) || doc.slides[doc.index] || doc.slides[0];
  if (!slide) fail(400, "No slide");
  if (body.action === "add-slide") {
    doc.slides.push({ id: newId().slice(0, 8), title: `Slide ${doc.slides.length + 1}`, strokes: [] });
    doc.index = doc.slides.length - 1;
  } else if (body.action === "select") {
    doc.index = Math.max(0, Math.min(doc.slides.length - 1, Number(body.index) || 0));
  } else if (body.action === "delete-slide") {
    if (doc.slides.length > 1) doc.slides.splice(doc.index, 1);
    doc.index = Math.max(0, Math.min(doc.index, doc.slides.length - 1));
  } else if (body.action === "clear") {
    slide.strokes = [];
  } else if (body.action === "delete-stroke") {
    const strokeId = String(body.strokeId || "");
    slide.strokes = slide.strokes.filter((item) => item.id !== strokeId);
  } else if (body.stroke) {
    const stroke = cleanStroke(body.stroke);
    if (!stroke) return send(res, 413, { error: "That image is too large" });
    const at = slide.strokes.findIndex((item) => item.id === stroke.id);
    if (at >= 0) slide.strokes[at] = stroke;
    else slide.strokes.push(stroke);
    if (slide.strokes.length > 800) slide.strokes.splice(0, slide.strokes.length - 800);
  }
  hub.rememberBoard(project.id, doc);
  persistBoard(project.id, doc);
  hub.publish(project.id, "board", { board: doc, authorId: user.id });
  send(res, 200, { board: doc });
}

function persistBoard(projectId, doc) {
  const encoded = JSON.stringify(doc);
  if (encoded.length > 800_000) fail(413, "The board is too full. Clear a slide and try again.");
  const now = new Date().toISOString();
  db.prepare("UPDATE projects SET board = ?, board_revision = board_revision + 1, updated_at = ? WHERE id = ?").run(
    encoded,
    now,
    projectId,
  );
}

function normalizeBoard(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw || "[]"); } catch { data = []; }
  }
  if (Array.isArray(data)) return { slides: [{ id: "s1", title: "Slide 1", strokes: data }], index: 0 };
  if (Array.isArray(data?.strokes) && !data.slides) {
    return { slides: [{ id: "s1", title: "Slide 1", strokes: data.strokes }], index: 0 };
  }
  const slides = Array.isArray(data?.slides) && data.slides.length
    ? data.slides.slice(0, 24).map((slide, index) => ({
      id: String(slide.id || `s${index + 1}`).slice(0, 16),
      title: String(slide.title || `Slide ${index + 1}`).slice(0, 40),
      strokes: Array.isArray(slide.strokes) ? slide.strokes.slice(-800).map(cleanStroke).filter(Boolean) : [],
    }))
    : [{ id: "s1", title: "Slide 1", strokes: [] }];
  return { slides, index: Math.max(0, Math.min(slides.length - 1, Number(data?.index) || 0)) };
}

function cleanStroke(stroke) {
  const tool = ["pen", "marker", "highlighter", "eraser", "text", "image"].includes(stroke?.tool) ? stroke.tool : "pen";
  const base = {
    id: String(stroke?.id || newId()).slice(0, 24),
    tool,
    color: /^#[0-9a-fA-F]{6}$/.test(stroke?.color || "") ? stroke.color : "#3b6ef6",
    size: Math.max(1, Math.min(48, Number(stroke?.size) || 3)),
  };
  if (tool === "text") {
    return {
      ...base,
      points: [],
      x: unit(stroke?.x),
      y: unit(stroke?.y),
      w: Math.max(0.08, Math.min(0.8, Number(stroke?.w) || 0.28)),
      h: Math.max(0.04, Math.min(0.5, Number(stroke?.h) || 0.08)),
      text: String(stroke?.text || "").slice(0, 4000),
    };
  }
  if (tool === "image") {
    const src = String(stroke?.src || "");
    if (!src.startsWith("data:image/") || src.length > 180000) return null;
    return {
      ...base,
      points: [],
      x: unit(stroke?.x),
      y: unit(stroke?.y),
      w: Math.max(0.08, Math.min(0.9, Number(stroke?.w) || 0.32)),
      h: Math.max(0.08, Math.min(0.9, Number(stroke?.h) || 0.24)),
      src,
    };
  }
  const points = Array.isArray(stroke?.points) ? stroke.points.slice(-600).map((pt) => ({
    x: unit(pt.x),
    y: unit(pt.y),
  })) : [];
  return { ...base, points };
}

function unit(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function liveEvents(req, res, user, id) {
  const project = loadProject(id);
  if (!project) fail(404, "Project not found");
  assertCanAccess(user, project);
  notePresence(id, user);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write("retry: 2000\n\n");
  hub.subscribe(id, res);
  res.write(`event: hello\ndata: ${JSON.stringify({ viewers: viewersOf(id) })}\n\n`);
}

async function liveSignal(req, res, user, id) {
  const project = loadProject(id);
  if (!project) fail(404, "Project not found");
  assertCanAccess(user, project);
  const body = await readJson(req);
  const cursor = {
    id: user.id,
    name: user.name,
    role: user.role,
    file: String(body.file || "").slice(0, 120),
    line: Number(body.line) || 0,
    ch: Number(body.ch) || 0,
    anchor: body.anchor || null,
    head: body.head || null,
    color: ["#3b6ef6", "#e24a8d", "#1aa37a", "#e07a1f", "#7a4de0", "#d13b3b"][user.id % 6],
  };
  notePresence(id, user, cursor.file);
  focus.set(user.id, { projectId: id, file: cursor.file, at: Date.now() });
  hub.publish(id, "cursor", cursor);
  send(res, 200, { ok: true });
}

async function publishProject(res, user, project) {
  if (user.role === "student") fail(403, "Only a teacher can publish a project");
  if (!pace(`publish:${project.id}`, 1, 15_000)) fail(429, "That site was just published. Wait a few seconds.");
  const site = siteFiles(shareableFiles(project.id));
  if (!site.ok) fail(400, site.error);
  const slug = publicSlug(project);
  const url = await pushSite(slug, site.files);
  audit(user, "publish", project.id, url);
  send(res, 200, { url, slug });
}

async function unpublishProject(res, user, project) {
  if (user.role === "student") fail(403, "Only a teacher can unpublish a project");
  const slug = publicSlug(project);
  await removePublished(slug);
  audit(user, "unpublish", project.id, slug);
  send(res, 200, { ok: true, slug });
}

async function pushSite(slug, files) {
  const url = process.env.PUBLISH_URL;
  if (url) {
    const token = publishToken();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-teachforth-token": token,
      },
      body: JSON.stringify({ slug, files }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) fail(502, data.error || "The projects host did not accept the site");
    return data.url || publishedUrl(slug);
  }
  if (process.env.PUBLISH_DIR) {
    writeSite(process.env.PUBLISH_DIR, slug, files);
    return publishedUrl(slug);
  }
  fail(503, "Publishing is not configured on this server");
}

async function removePublished(slug) {
  const url = process.env.PUBLISH_URL;
  if (url) {
    const response = await fetch(`${url}?slug=${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: { "x-teachforth-token": publishToken() },
    });
    if (!response.ok) fail(502, "The projects host did not remove the site");
    return;
  }
  if (process.env.PUBLISH_DIR) {
    removeSite(process.env.PUBLISH_DIR, slug);
    return;
  }
  fail(503, "Publishing is not configured on this server");
}

function publishToken() {
  if (process.env.PUBLISH_TOKEN) return process.env.PUBLISH_TOKEN.trim();
  const file = process.env.PUBLISH_TOKEN_FILE;
  if (file && existsSync(file)) return readFileSync(file, "utf8").trim();
  return "";
}

async function saveRun(req, res, user, project) {
  const body = await readJson(req);
  const output = String(body.output ?? "").slice(0, 20_000);
  const now = new Date().toISOString();
  db.prepare("UPDATE projects SET last_output = ?, updated_at = ? WHERE id = ?").run(output, now, project.id);
  audit(user, "run", project.id, project.language);
  send(res, 200, { lastOutput: output });
}

function exportZip(res, user, project) {
  const flags = flagMap(db, project.id);
  const files = filesOf(project.id).filter((file) => {
    if (isHiddenFile(file.path)) return false;
    return user.role !== "student" || !flags.get(file.path)?.hidden;
  });
  const zip = zipStore(files);
  audit(user, "export", project.id, project.title);
  res.writeHead(200, {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="teachforth-${project.id}.zip"`,
    "content-length": zip.length,
  });
  res.end(zip);
}

async function pushGithub(res, user, project) {
  return closeProject(res, user, project);
}

async function closeProject(res, user, project) {
  if (project.kind !== "github") fail(400, "Only a GitHub project commits when it is closed");
  const result = await commitStudentProject(db, user, project, filesOf(project.id));
  audit(user, "github_commit", project.id, result.sha);
  send(res, 200, result);
}

function deleteProject(res, user, project) {
  if (user.role !== "admin" && project.owner_id !== user.id) fail(403, "Only an admin can delete someone else's project");
  if (user.role === "student" && project.owner_id !== user.id) fail(403, "Not your project");
  db.prepare("DELETE FROM projects WHERE id = ?").run(project.id);
  audit(user, "delete_project", project.id, project.title);
  send(res, 200, { ok: true });
}

function studentsFor(user) {
  requireUser(user);
  return sessionStudents(db, user);
}

function listAssignments() {
  return db.prepare(
    `SELECT a.teacher_id, a.student_id, a.created_at,
            t.name AS teacher_name, s.name AS student_name
     FROM assignments a
     JOIN users t ON t.id = a.teacher_id
     JOIN users s ON s.id = a.student_id
     ORDER BY t.name, s.name`,
  ).all();
}

function recentAudit() {
  return db.prepare(
    `SELECT a.id, a.action, a.project_id, a.detail, a.created_at, u.name AS actor, u.role AS actor_role
     FROM audit a
     LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.id DESC
     LIMIT 40`,
  ).all();
}

function assertCanAccess(user, project) {
  requireUser(user);
  if (!canAccessProject(db, user, project)) fail(403, "You are not assigned to this student in a live session");
}

function assertCanSeeStudent(user, studentId) {
  requireUser(user);
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(studentId);
  if (!student) fail(404, "Student not found");
  if (!canSeeStudent(db, user, studentId)) fail(403, "You are not assigned to this student in a live session");
}

function isAssigned(teacherId, studentId) {
  return Boolean(
    db.prepare("SELECT 1 AS ok FROM assignments WHERE teacher_id = ? AND student_id = ?").get(teacherId, studentId),
  );
}

function loadProject(id) {
  return db.prepare(
    `SELECT p.*, u.name AS owner_name, u.role AS owner_role FROM projects p
     JOIN users u ON u.id = p.owner_id
     WHERE p.id = ?`,
  ).get(id);
}

function filesOf(projectId) {
  return db.prepare("SELECT path, content, updated_at FROM files WHERE project_id = ? ORDER BY path").all(projectId);
}

function editorFiles(projectId, user) {
  return fileViews(db, projectId, user || { role: "student" });
}

function shareableFiles(projectId) {
  const flags = flagMap(db, projectId);
  return filesOf(projectId).filter((file) => !flags.get(file.path)?.hidden);
}

function servePreviewSite(res, url) {
  const match = url.pathname.match(/^\/preview-site\/([a-f0-9]{48})\/?(.*)$/);
  if (!match) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  const projectId = previewProject(match[1]);
  if (!projectId) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Preview expired");
    return;
  }
  const flags = flagMap(db, projectId);
  const files = filesOf(projectId).map((file) => ({ ...file, hidden: Boolean(flags.get(file.path)?.hidden) }));
  let path = decodeURIComponent(match[2] || "index.html");
  if (!path || path.endsWith("/")) path = `${path}index.html`;
  if (!/^[\w./-]{1,120}$/.test(path) || path.includes("..")) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  const found = previewBody(files, path, match[1]);
  if (!found) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "content-type": found.type,
    "content-security-policy": "sandbox allow-scripts allow-modals",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
  });
  res.end(found.body);
}

async function execProject(req, res, user, project) {
  const body = await readJson(req);
  const file = body.file ? cleanPath(body.file) : "";
  const kind = String(body.kind || "");
  const flags = flagMap(db, project.id);
  if (file && user.role === "student" && flags.get(file)?.hidden) fail(404, "File not found");
  const files = filesOf(project.id).map((item) => ({ ...item, hidden: Boolean(flags.get(item.path)?.hidden) }));
  const planned = planSteps(kind, file, files.find((item) => item.path === file)?.content || "");
  if (!planned) fail(400, "That file cannot be run");
  const runId = startSandbox({ userId: user.id, files, steps: planned.steps });
  audit(user, "run", project.id, kind || file);
  send(res, 201, { runId });
}

async function patchControls(req, res, user, project) {
  if (user.role === "student" || project.owner_role !== "student") fail(403, "These controls are for a student's project");
  const body = await readJson(req);
  if (body.path) {
    const path = cleanPath(body.path);
    if (isHiddenFile(path)) fail(400, "That file stays with the project");
    const existing = db.prepare("SELECT id FROM files WHERE project_id = ? AND path = ?").get(project.id, path);
    if (!existing) fail(404, "File not found");
    setFileFlag(db, project.id, path, body);
    const now = new Date().toISOString();
    db.prepare("UPDATE projects SET revision = revision + 1, updated_at = ? WHERE id = ?").run(now, project.id);
    audit(user, "file_control", project.id, path);
    const view = controlView(db, user, project);
    hub.publish(project.id, "control", publicControl(db, project.id));
    return send(res, 200, { files: editorFiles(project.id, user), controls: view, revision: loadProject(project.id).revision });
  }
  if (body.forceBoard !== undefined || body.lockDraw !== undefined) {
    setBoardControl(db, project.id, body);
    const view = controlView(db, user, project);
    hub.publish(project.id, "control", publicControl(db, project.id));
    audit(user, "board_control", project.id, "");
    return send(res, 200, { controls: view });
  }
  fail(400, "Nothing to change");
}

function assertLead(user, project) {
  if (project.owner_role !== "student" || !isLeadPlus(db, user, project.owner_id)) {
    fail(403, "Only a session lead can do that");
  }
}

async function leadStatus(res, user, project) {
  assertLead(user, project);
  const status = await inspectProject(db, project);
  status.home = homeView(db, project.id);
  send(res, 200, status);
}

async function makeHomeLink(req, res, user, project) {
  const body = await readJson(req);
  const result = await createHomeLink(db, user, project, filesOf(project.id), body.hours);
  audit(user, "home_link", project.id, result.expiresAt);
  send(res, 200, result);
}

async function stopHomeLink(res, user, project) {
  const result = await endHomeLink(db, user, project);
  audit(user, "home_end", project.id, "");
  send(res, 200, result);
}

async function forceCommit(res, user, project) {
  assertLead(user, project);
  if (project.kind !== "github") fail(400, "This project is not linked to GitHub");
  const who = user.github_login || user.email || user.name;
  const result = await commitStudentProject(db, user, project, filesOf(project.id), {
    force: true,
    keep: true,
    message: `TeachForth save by ${who}`,
  });
  audit(user, "force_commit", project.id, `${who} ${result.sha}`);
  send(res, 200, result);
}

async function adminProject(req, res, user, project) {
  assertLead(user, project);
  const body = await readJson(req);
  const result = {};
  if (body.githubRepo) Object.assign(result, await relinkProject(db, project, body.githubRepo));
  if (body.title) {
    const title = String(body.title).trim().slice(0, 80);
    if (!title) fail(400, "Name the project");
    if (body.renameRepo) Object.assign(result, await renameLinkedRepo(db, loadProject(project.id), title));
    else {
      db.prepare("UPDATE projects SET title = ?, updated_at = ? WHERE id = ?").run(title, new Date().toISOString(), project.id);
      result.title = title;
    }
  }
  audit(user, "project_admin", project.id, result.githubRepo || result.title || "");
  send(res, 200, { project: projectView(loadProject(project.id), user), ...result });
}

function projectView(project, user) {
  return {
    id: project.id,
    ownerId: project.owner_id,
    ownerName: project.owner_name,
    ownerRole: project.owner_role || "",
    title: project.title,
    language: project.language,
    notes: "",
    lessonId: project.lesson_id || null,
    kind: project.kind || "sandbox",
    revision: project.revision,
    boardRevision: project.board_revision,
    lastOutput: project.last_output,
    githubUrl: project.github_url,
    githubRepo: project.github_repo || "",
    open: project.open !== 0,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

function currentUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies.tf_session) return null;
  const row = db.prepare(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
  ).get(cookies.tf_session, new Date().toISOString());
  return row || null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    githubLogin: user.github_login || "",
    githubAvatar: user.github_avatar || "",
    githubLinked: Boolean(user.github_token),
  };
}

function notePresence(projectId, user, file = "") {
  if (!presence.has(projectId)) presence.set(projectId, new Map());
  presence.get(projectId).set(user.id, { name: user.name, role: user.role, file, at: Date.now() });
}

function viewersOf(projectId) {
  const map = presence.get(projectId);
  if (!map) return [];
  const now = Date.now();
  const viewers = [];
  for (const [id, viewer] of map) {
    if (now - viewer.at > 20_000) map.delete(id);
    else viewers.push({ id, name: viewer.name, role: viewer.role, file: viewer.file || "" });
  }
  return viewers;
}

function audit(user, action, projectId, detail) {
  db.prepare(
    "INSERT INTO audit (actor_id, action, project_id, detail, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(user?.id ?? null, action, projectId, detail || "", new Date().toISOString());
}

async function runtimeStdin(res, user, url) {
  requireUser(user);
  const result = await waitLine(url.searchParams.get("run") || "", user.id);
  if (!result) fail(404, "That program is not waiting");
  if (result.pending) {
    res.writeHead(204, { "cache-control": "no-store" });
    res.end();
    return;
  }
  send(res, 200, result.eof ? { eof: true } : { line: result.line });
}

function requireUser(user) {
  if (!user) fail(401, "Sign in first");
}

function requireRole(user, role) {
  requireUser(user);
  if (user.role !== role) fail(403, "You cannot do that");
}

function requirePassword(password) {
  if (typeof password !== "string" || password.length < 8) fail(400, "Password must be at least 8 characters");
}

function cleanPath(path) {
  const value = String(path || "").trim();
  if (!/^[\w./-]{1,120}$/.test(value) || value.includes("..") || value.startsWith("/")) {
    fail(400, "Use a simple file name like index.html or src/main.py");
  }
  return value;
}

function repoName(project) {
  const owner = db.prepare("SELECT name FROM users WHERE id = ?").get(project.owner_id).name;
  const slug = `${owner}-${project.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `tf-${slug || "project"}-${project.id}`;
}

async function ensureRepo(token, owner, repo) {
  const exists = await github(token, "GET", `/repos/${owner}/${repo}`);
  if (exists.ok) return;
  const created = await github(token, "POST", `/orgs/${owner}/repos`, {
    name: repo,
    private: true,
    description: "TeachForth IDE student project",
    auto_init: false,
  });
  if (created.ok) return;
  const userRepo = await github(token, "POST", "/user/repos", {
    name: repo,
    private: true,
    description: "TeachForth IDE student project",
  });
  if (!userRepo.ok) fail(502, "GitHub would not create the repo");
}

async function putGithubFile(token, owner, repo, path, content) {
  const current = await github(token, "GET", `/repos/${owner}/${repo}/contents/${encodePath(path)}`);
  const body = {
    message: `Update ${path} from TeachForth IDE`,
    content: Buffer.from(content, "utf8").toString("base64"),
  };
  if (current.ok && current.json?.sha) body.sha = current.json.sha;
  const saved = await github(token, "PUT", `/repos/${owner}/${repo}/contents/${encodePath(path)}`, body);
  if (!saved.ok) fail(502, `GitHub rejected ${path}`);
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function github(token, method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "teachforth-ide",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, json };
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    fail(403, "Bad origin");
  }
  if (host !== req.headers.host) fail(403, "Bad origin");
}

function secure(req) {
  return process.env.COOKIE_SECURE === "1" || req.headers["x-forwarded-proto"] === "https";
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(Object.assign(new Error("Payload too large"), { status: 413, publicMessage: "Payload too large" }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Bad JSON"), { status: 400, publicMessage: "Bad JSON" }));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(payload);
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  throw err;
}

function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = normalize(join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  const body = readFileSync(file);
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] || "application/octet-stream",
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function touch(file) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    if (!existsSync(file)) writeFileSync(file, "");
    const now = new Date();
    utimesSync(file, now, now);
  } catch {
    // Idle shutdown is best-effort. Never fail a request because of it.
  }
}
