import { displayTitle, isTeachforthRepo, parseTeachforthCode, repoNameFor, teachforthMarker, visibleStudentProject } from "./github.js";
import { publicSlug, siteFiles } from "./publish.js";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "teachforth-"));
const publishDir = join(dir, "published");
const port = 8799;
const child = spawn(process.execPath, ["server/index.js"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DATA_DIR: dir,
    PUBLISH_DIR: publishDir,
    ADMIN_EMAIL: "admin@teachforth.local",
    ADMIN_PASSWORD: "admin-pass-1",
    SEED_DEMO: "1",
    IDLE_STAMP: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
child.stdout.on("data", (buf) => { logs += buf; });
child.stderr.on("data", (buf) => { logs += buf; });

const base = `http://127.0.0.1:${port}`;

assert(isTeachforthRepo("TeachForth-cards") && !isTeachforthRepo("cards"), "repo prefix");
assert(repoNameFor("{TeachForth} Cards") === "TeachForth-cards", "repo slug");
assert(displayTitle("Cards") === "{TeachForth} Cards", "display prefix");
assert(parseTeachforthCode(teachforthMarker("tf_abc")) === "tf_abc", "marker code");
assert(visibleStudentProject({ kind: "github", github_repo: "a/TeachForth-cards", open: 0 }), "closed teachforth repo stays visible");
assert(!visibleStudentProject({ kind: "sandbox", github_repo: "", open: 1 }), "sandbox is not a student repo");
assert(visibleStudentProject({ kind: "github", github_repo: "a/today", open: 1 }), "open project can still be closed");
const snap = siteFiles([
  { path: ".teachforth", content: "secret" },
  { path: "../etc/passwd", content: "no" },
  { path: "app.py", content: "print(1)" },
  { path: "index.html", content: "<h1>Hi</h1>" },
]);
assert(snap.ok && snap.files["index.html"] && !snap.files[".teachforth"] && !snap.files["app.py"], "publish snapshot");
assert(publicSlug({ id: 4, title: "{TeachForth} Hello Page" }) === "p4-hello-page", "slug");

try {
  await waitForHealth();
  const admin = await login("admin@teachforth.local", "admin-pass-1");
  assert(admin.user.role === "admin", "admin role");
  const usage = await send("/api/usage", { cookie: admin.cookie });
  assert(usage.days.length === 1, "usage recorded");

  const teacher = await login("teacher@teachforth.local", "teacher-demo");
  const students = await send("/api/students", { cookie: teacher.cookie });
  assert(students.students.length === 1, "teacher sees assigned student");
  const projects = await send("/api/projects", { cookie: teacher.cookie });
  assert(projects.projects.length === 1, "teacher sees assigned project");

  const student = await login("student@teachforth.local", "student-demo");
  const own = await send("/api/projects", { cookie: student.cookie });
  assert(own.projects[0].notes === "", "student does not see teacher notes");

  const outsider = await send("/api/users", {
    method: "POST",
    cookie: admin.cookie,
    body: { name: "Other Teacher", email: "other@teachforth.local", role: "teacher", password: "other-pass-1" },
  });
  const other = await login("other@teachforth.local", "other-pass-1");
  const denied = await send(`/api/projects/${projects.projects[0].id}`, { cookie: other.cookie, ok: false });
  assert(denied.status === 403, "unassigned teacher is blocked");

  const opened = await send(`/api/projects/${projects.projects[0].id}`, { cookie: teacher.cookie });
  const saved = await send(`/api/projects/${opened.project.id}/files`, {
    method: "PUT",
    cookie: teacher.cookie,
    body: { path: "index.html", content: "<h1>changed</h1>" },
  });
  assert(saved.revision > opened.project.revision, "save bumps revision");
  const board = await send(`/api/projects/${opened.project.id}/board`, {
    method: "PUT",
    cookie: teacher.cookie,
    body: { strokes: [{ color: "#a334cb", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] },
  });
  assert(board.boardRevision >= 2, "board saved");

  const zipRes = await fetch(`${base}/api/projects/${opened.project.id}/export.zip`, {
    headers: { cookie: teacher.cookie },
  });
  assert(zipRes.status === 200, "export status");
  const bytes = Buffer.from(await zipRes.arrayBuffer());
  const { execFileSync } = await import("node:child_process");
  const zipPath = join(dir, "out.zip");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(zipPath, bytes);
  const listing = execFileSync("python3", ["-c", `import zipfile; z=zipfile.ZipFile(${JSON.stringify(zipPath)}); print("\\n".join(z.namelist())); print(z.read("index.html").decode())`], { encoding: "utf8" });
  assert(listing.includes("index.html"), "zip has index");
  assert(listing.includes("changed"), "zip has saved content");
  assert(!listing.includes("TEACHER-NOTES"), "zip does not include reports");

  const studentZip = await fetch(`${base}/api/projects/${opened.project.id}/export.zip`, {
    headers: { cookie: student.cookie },
  });
  const studentBytes = Buffer.from(await studentZip.arrayBuffer());
  writeFileSync(zipPath, studentBytes);
  const studentListing = execFileSync("python3", ["-c", `import zipfile; z=zipfile.ZipFile(${JSON.stringify(zipPath)}); print("\\n".join(z.namelist()))`], { encoding: "utf8" });
  assert(!studentListing.includes("TEACHER-NOTES"), "student zip hides notes");

  const ownFolder = await send(`/api/folders/${student.user.id}`, { cookie: student.cookie });
  assert(!ownFolder.reports, "student folder has no reports");
  const first = await send(`/api/folders/${students.students[0].id}/reports`, {
    method: "POST",
    cookie: teacher.cookie,
    body: { body: "Worked on the heading." },
  });
  assert(first.report.diff.includes("+") || first.report.diff.includes("No code"), "first report has a diff");
  await send(`/api/projects/${opened.project.id}/files`, {
    method: "PUT",
    cookie: teacher.cookie,
    body: { path: "index.html", content: "<h1>changed again</h1>\n<p>new line</p>" },
  });
  const second = await send(`/api/folders/${students.students[0].id}/reports`, {
    method: "POST",
    cookie: teacher.cookie,
    body: { body: "Added a paragraph." },
  });
  assert(second.report.diff.includes("+"), "second report shows added lines");
  assert(second.report.diff.includes("-"), "second report shows removed lines");
  const deniedReport = await send(`/api/folders/${students.students[0].id}/reports`, {
    method: "POST",
    cookie: student.cookie,
    body: { body: "nope" },
    ok: false,
  });
  assert(deniedReport.status === 403, "student cannot write a report");
  const lead = await login("lead@teachforth.local", "lead-demo-1");
  const center = await send("/api/center", { cookie: lead.cookie });
  assert(center.blocks.some((block) => block.students.some((row) => row.name === "Jordan Lee")), "lead sees the session");
  const otherFolder = await send(`/api/folders/${students.students[0].id}`, { cookie: other.cookie, ok: false });
  assert(otherFolder.status === 403, "unassigned teacher cannot open the folder");

  const sandboxDenied = await send("/api/sandbox", {
    method: "POST",
    cookie: student.cookie,
    body: { title: "Nope" },
    ok: false,
  });
  assert(sandboxDenied.status === 403, "student cannot make a sandbox");
  const directory = await send("/api/directory?q=jor", { cookie: admin.cookie });
  assert(directory.students.some((row) => row.name === "Jordan Lee"), "admin can search students");
  const chapter = await send("/api/chapters", { cookie: admin.cookie });
  const profile = await send(`/api/chapters/${chapter.chapters[0].id}`, { cookie: admin.cookie });
  assert(profile.members.some((row) => row.name === "Jordan Lee"), "chapter profile lists the student");
  const localProject = await send("/api/projects", {
    method: "POST",
    cookie: student.cookie,
    body: { title: "Local only" },
    ok: false,
  });
  assert(localProject.status === 400, "student cannot store a local project");

  const catalog = await send("/api/catalog", { cookie: student.cookie });
  assert(catalog.lessons.length >= 4, "library lessons exist");
  const openedLesson = await send(`/api/lessons/${catalog.lessons[0].id}/open`, {
    method: "POST",
    cookie: student.cookie,
    body: {},
  });
  assert(openedLesson.projectId > 0, "lesson opens a project");

  const box = await send("/api/sandbox", {
    method: "POST",
    cookie: teacher.cookie,
    body: { title: "Notes", language: "javascript" },
  });
  const openedBox = await send(`/api/projects/${box.project.id}`, { cookie: teacher.cookie });
  assert(openedBox.files.some((file) => file.path === "main.js"), "javascript template");
  assert(!openedBox.files.some((file) => file.path === ".teachforth"), "marker stays hidden");
  const renamed = await send(`/api/projects/${box.project.id}/rename`, {
    method: "POST",
    cookie: teacher.cookie,
    body: { from: "main.js", to: "src/app.js" },
  });
  assert(renamed.files.some((file) => file.path === "src/app.js"), "rename file");
  const removed = await send(`/api/projects/${box.project.id}/files?path=${encodeURIComponent("src/app.js")}`, {
    method: "DELETE",
    cookie: teacher.cookie,
  });
  assert(!removed.files.some((file) => file.path === "src/app.js"), "delete file");
  const hidden = await send(`/api/projects/${box.project.id}/files`, {
    method: "POST",
    cookie: teacher.cookie,
    body: { path: ".teachforth" },
    ok: false,
  });
  assert(hidden.status === 400, "marker cannot be added");

  const made = await send("/api/users", {
    method: "POST",
    cookie: admin.cookie,
    body: { name: "Temp", email: "temp@teachforth.local", role: "teacher", password: "temp-pass-1" },
  });
  const person = await send(`/api/people/${made.user.id}`, { cookie: admin.cookie });
  assert(person.canManage, "admin can manage a person");
  await send(`/api/users/${made.user.id}`, {
    method: "PATCH",
    cookie: admin.cookie,
    body: { role: "chapter_lead" },
  });
  await send(`/api/users/${made.user.id}/password`, {
    method: "POST",
    cookie: admin.cookie,
    body: { password: "reset-pass-1" },
  });
  await login("temp@teachforth.local", "reset-pass-1");
  const staffBox = await send("/api/sandbox", {
    method: "POST",
    cookie: admin.cookie,
    body: { title: "Staff box", language: "markdown", ownerId: made.user.id },
  });
  const openedStaff = await send(`/api/projects/${staffBox.project.id}`, { cookie: admin.cookie });
  assert(openedStaff.files.some((file) => file.path === "notes.md"), "admin opens a staff sandbox");
  await send(`/api/users/${made.user.id}`, { method: "DELETE", cookie: admin.cookie });
  const selfDelete = await send(`/api/users/${admin.user.id}`, { method: "DELETE", cookie: admin.cookie, ok: false });
  assert(selfDelete.status === 400, "admin cannot delete self");

  const page = projects.projects[0];
  const studentDenied = await send(`/api/projects/${page.id}/publish`, { method: "POST", cookie: student.cookie, ok: false });
  assert(studentDenied.status === 403, "student cannot publish");
  const published = await send(`/api/projects/${page.id}/publish`, { method: "POST", cookie: teacher.cookie });
  assert(published.slug === publicSlug({ id: page.id, title: page.title }), "publish slug");
  assert(published.url.endsWith(`/${published.slug}/`), "publish url");
  assert(readFileSync(join(publishDir, published.slug, "index.html"), "utf8").includes("<"), "published index");
  assert(!existsSync(join(publishDir, published.slug, ".teachforth")), "marker not published");
  await send(`/api/projects/${page.id}/publish`, { method: "DELETE", cookie: teacher.cookie });
  assert(!existsSync(join(publishDir, published.slug)), "unpublish removes the site");
  const py = await send("/api/sandbox", {
    method: "POST",
    cookie: teacher.cookie,
    body: { title: "Py notes", language: "python" },
  });
  const noPage = await send(`/api/projects/${py.project.id}/publish`, { method: "POST", cookie: teacher.cookie, ok: false });
  assert(noPage.status === 400, "python sandbox cannot publish");
  const shell = await fetch(`${base}/preview/${page.id}/`);
  const shellText = await shell.text();
  assert(shell.status === 200 && shellText.includes('sandbox="allow-scripts"'), "preview shell stays sandboxed");
  assert(!shellText.includes("Hello from TeachForth"), "preview shell has no student code");

  const anonRun = await send("/api/runtime/runs", { method: "POST", ok: false });
  assert(anonRun.status === 401, "terminal input requires login");
  const run = await send("/api/runtime/runs", { method: "POST", cookie: student.cookie });
  assert(/^[a-f0-9]{32}$/.test(run.runId), "runtime id");
  const waiting = fetch(`${base}/api/runtime/stdin?run=${run.runId}`, { headers: { cookie: student.cookie } });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await send("/api/runtime/stdin", { method: "POST", cookie: student.cookie, body: { run: run.runId, line: "sam" } });
  const answered = await (await waiting).json();
  assert(answered.line === "sam", "stdin line is relayed, not executed");
  const stolen = await send("/api/runtime/stdin", {
    method: "POST",
    cookie: teacher.cookie,
    body: { run: run.runId, line: "no" },
    ok: false,
  });
  assert(stolen.status === 404, "another person cannot type into the program");
  await send(`/api/runtime/runs/${run.runId}`, { method: "DELETE", cookie: student.cookie });
  const ended = await send(`/api/runtime/stdin?run=${run.runId}`, { cookie: student.cookie });
  assert(ended.eof === true, "stopped program gets end of input");

  console.log("selftest ok");
  console.log("outsider blocked", outsider.user.email);
} catch (err) {
  console.error(logs);
  console.error(err);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  rmSync(dir, { recursive: true, force: true });
}

async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("server did not start\n" + logs);
}

async function login(email, password) {
  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login failed for ${email}: ${data.error}`);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  return { ...data, cookie };
}

async function send(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method || "GET",
    headers: {
      cookie: opts.cookie || "",
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && opts.ok !== false) throw new Error(`${opts.method || "GET"} ${path} -> ${res.status} ${data.error || ""}`);
  return opts.ok === false ? { status: res.status, ...data } : data;
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}
