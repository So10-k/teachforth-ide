import { displayTitle, githubScope, isTeachforthRepo, keptLocalFiles, parseTeachforthCode, pace, repoNameFor, repoNeedsPrivate, teachforthMarker, visibleStudentProject } from "./github.js";
import { safeRel } from "../deploy/home-server.js";
import { planSteps } from "./sandbox.js";
import { rewriteHtml } from "./preview-site.js";
import { runJava } from "../public/java-lang.js";
import { publicSlug, siteFiles } from "./publish.js";
import { mergeText } from "../public/merge.js";
import { request as httpRequest } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { normalizeDomain } from "./domains.js";
import { commandAllowed, helpText, shareCard, verifyDiscord } from "../deploy/discord-policy.js";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "teachforth-"));
writeFileSync(join(dir, "discord-secret"), "selftest-discord-secret\n", { mode: 0o600 });
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
    TF_DOMAINS_BIN: "/tmp/teachforth-domains-missing",
    DISCORD_SECRET_FILE: join(dir, "discord-secret"),
    DISCORD_EVENT_URL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
child.stdout.on("data", (buf) => { logs += buf; });
child.stderr.on("data", (buf) => { logs += buf; });

const base = `http://127.0.0.1:${port}`;
const homeDir = mkdtempSync(join(tmpdir(), "tf-home-"));
writeFileSync(join(homeDir, "token"), "selftest-home-token\n");
const homePort = 8794;
const homeBase = `http://127.0.0.1:${homePort}`;
let homeLogs = "";
const homeChild = spawn(process.execPath, ["deploy/home-server.js"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(homePort),
    HOST: "127.0.0.1",
    HOME_DIR: homeDir,
    STATIC_DIR: join(new URL("..", import.meta.url).pathname, "public"),
    PUBLIC_PREFIX: "",
    HOME_TOKEN_FILE: join(homeDir, "token"),
    IDE_HEALTH_URL: "http://127.0.0.1:1/api/health",
    IDE_PUBLIC_URL: "http://127.0.0.1:1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
homeChild.stdout.on("data", (buf) => { homeLogs += buf; });
homeChild.stderr.on("data", (buf) => { homeLogs += buf; });

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
const javaPlan = planSteps("java", "Main.java", 'public class Main { public static void main(String[] args) { System.out.println("hi".trim()); } }');
assert(javaPlan.steps[0][0] === "javac" && javaPlan.steps[1][0] === "java" && javaPlan.steps[1].at(-1) === "Main" && javaPlan.steps[1].includes("-Xmx128m"), "java plan uses the real compiler");
assert(planSteps("c", "main.c").steps[0][0] === "gcc" && planSteps("cpp", "main.cpp").steps[0][0] === "g++", "c and c++ plans");
const rewritten = rewriteHtml('<a href="/about.html"></a><script src="script.js"></script>', "abc", { script: true, style: true });
assert(rewritten.includes("/preview-site/abc/about.html") && rewritten.includes('src="script.js"') && rewritten.includes("style.css"), "preview rewrites root links and keeps script.js");
assert(mergeText("abc", "abXc", "abc") === "abXc", "local edit survives an unchanged remote");
assert(mergeText("abc", "abc", "abYc") === "abYc", "remote edit applies when local is unchanged");
assert(mergeText("hello", "hello Sam", "hello!") === "hello Sam!", "non-overlapping edits both survive");
assert(mergeText("cat", "dog", "rat") === "dog", "overlapping remote edit does not wipe local typing");
assert(pace("selftest-create", 1, 60_000) === true && pace("selftest-create", 1, 60_000) === false, "repeated repository creates are paced");
const kept = keptLocalFiles(
  [{ path: "answers.txt", content: "secret" }, { path: "index.html", content: "old" }, { path: ".teachforth", content: "code" }],
  new Map([["answers.txt", { hidden: 1, skip_github: 0 }]]),
  [{ path: "index.html", content: "new" }],
);
assert(kept.some((file) => file.path === "answers.txt") && kept.some((file) => file.path === ".teachforth") && !kept.some((file) => file.path === "index.html"), "a class pull keeps hidden files");
let badHomePath = false;
try { safeRel("../meta.json"); } catch { badHomePath = true; }
assert(safeRel("src/index.html") === "src/index.html" && badHomePath, "home paths stay inside the session");
assert(repoNeedsPrivate({ private: false }) === true && repoNeedsPrivate({ private: true }) === false, "only a public repository is blocked");
assert(githubScope().includes("repo") && githubScope().includes("delete_repo"), "private repositories and visibility changes stay in scope");

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
  const studentPathway = await send(`/api/folders/${students.students[0].id}/pathway`, { cookie: student.cookie, ok: false });
  assert(studentPathway.status === 403, "student pathway is hidden");
  const studentCatalog = await send("/api/curriculum", { cookie: student.cookie, ok: false });
  assert(studentCatalog.status === 403, "student curriculum is hidden");
  const studentGuide = await send(`/api/projects/${opened.project.id}/guide`, { cookie: student.cookie, ok: false });
  assert(studentGuide.status === 403, "student cannot open the guide");
  const curriculum = await send("/api/curriculum", { cookie: teacher.cookie });
  const moduleCount = curriculum.units.reduce((sum, unit) => sum + unit.modules.length, 0);
  assert(moduleCount === 87, "curriculum has 87 modules");
  assert(curriculum.units.some((unit) => unit.modules.some((mod) => mod.title === "Socket 101 (C)")), "c socket module title");
  const assigned = await send(`/api/folders/${students.students[0].id}/courses`, {
    method: "POST",
    cookie: teacher.cookie,
    body: { courses: ["python", "java"] },
  });
  assert(assigned.courses.includes("python") && assigned.courses.includes("java"), "courses assigned");
  const deniedCourses = await send(`/api/folders/${students.students[0].id}/courses`, {
    method: "POST",
    cookie: student.cookie,
    body: { courses: ["c"] },
    ok: false,
  });
  assert(deniedCourses.status === 403, "student cannot assign courses");
  const linked = await send(`/api/projects/${opened.project.id}/modules`, {
    method: "POST",
    cookie: teacher.cookie,
    body: { moduleId: "hello-world", course: "python" },
  });
  assert(linked.linked.some((row) => row.moduleId === "hello-world"), "module linked to project");
  const beforeMark = await send(`/api/folders/${students.students[0].id}/pathway`, { cookie: teacher.cookie });
  const linkedModule = beforeMark.pathways.find((board) => board.course === "python").units
    .flatMap((unit) => unit.modules).find((mod) => mod.id === "hello-world");
  assert(linkedModule.status === "linked", "pathway shows a link before a mark");
  const marked = await send(`/api/folders/${students.students[0].id}/reports`, {
    method: "POST",
    cookie: teacher.cookie,
    body: {
      body: "Mastered hello world.",
      skills: [{ moduleId: "hello-world", course: "python", level: "mastered", projectId: opened.project.id }],
    },
  });
  assert(marked.report.skills[0].level === "mastered", "report stores mastery");
  assert(marked.report.skills[0].projectTitle, "report snapshots the project");
  const afterMark = await send(`/api/folders/${students.students[0].id}/pathway`, { cookie: teacher.cookie });
  const mastered = afterMark.pathways.find((board) => board.course === "python").units
    .flatMap((unit) => unit.modules).find((mod) => mod.id === "hello-world");
  assert(mastered.status === "mastered", "pathway shows mastery");
  assert(mastered.projects.some((project) => project.title === marked.report.skills[0].projectTitle), "pathway links the project");
  const guide = await send(`/api/projects/${opened.project.id}/guide`, { cookie: teacher.cookie });
  const detail = await send("/api/curriculum/hello-world", { cookie: teacher.cookie });
  assert(detail.teach.steps.length && detail.code.python && detail.code.java && detail.code.c, "guide has notes and three languages");
  assert(guide.linked.some((row) => row.moduleId === "hello-world"), "guide lists the linked module");
  const stillHidden = await send(`/api/folders/${student.user.id}`, { cookie: student.cookie });
  assert(!stillHidden.reports && !stillHidden.pathway, "student folder still hides reports");
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
  const tempChapter = await send("/api/chapters", {
    method: "POST",
    cookie: admin.cookie,
    body: { name: "Temp chapter", place: "Nowhere" },
  });
  const tempBlock = await send("/api/blocks", {
    method: "POST",
    cookie: admin.cookie,
    body: { chapterId: tempChapter.chapter.id, name: "Temp block" },
  });
  const deniedDelete = await send(`/api/chapters/${tempChapter.chapter.id}`, {
    method: "DELETE",
    cookie: student.cookie,
    ok: false,
  });
  assert(deniedDelete.status === 403, "student cannot delete a chapter");
  await send(`/api/blocks/${tempBlock.block.id}`, { method: "DELETE", cookie: admin.cookie });
  const afterBlock = await send(`/api/chapters/${tempChapter.chapter.id}`, { cookie: admin.cookie });
  assert(afterBlock.blocks.length === 0, "block delete removes the block");
  await send(`/api/chapters/${tempChapter.chapter.id}`, { method: "DELETE", cookie: admin.cookie });
  const missingChapter = await send(`/api/chapters/${tempChapter.chapter.id}`, { cookie: admin.cookie, ok: false });
  assert(missingChapter.status === 404, "deleted chapter is gone");
  const kept = await send("/api/chapters", { cookie: admin.cookie });
  assert(kept.chapters.some((row) => row.id === chapter.chapters[0].id), "other chapters stay");
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
  const javaBox = await send("/api/sandbox", {
    method: "POST",
    cookie: teacher.cookie,
    body: { title: "Java", language: "java" },
  });
  const openedJava = await send(`/api/projects/${javaBox.project.id}`, { cookie: teacher.cookie });
  assert(openedJava.files.some((file) => file.path === "Main.java"), "java template");
  let javaOut = "";
  runJava(openedJava.files.find((file) => file.path === "Main.java").content, { print(text) { javaOut += text; }, readLine() { return null; } });
  assert(javaOut.includes("Hello from TeachForth"), "java hello runs in the browser runner");
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
  assert(shell.status === 200 && shellText.includes('sandbox="allow-scripts allow-modals"') && !shellText.includes("allow-same-origin"), "preview shell stays sandboxed");
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

  const preview = await send(`/api/projects/${page.id}/preview`, { method: "POST", cookie: teacher.cookie, body: {} });
  const previewRes = await fetch(`${base}/preview-site/${preview.token}/index.html`);
  const previewHtml = await previewRes.text();
  assert(previewRes.headers.get("content-security-policy") === "sandbox allow-scripts allow-modals", "preview stays sandboxed");
  assert(previewHtml.includes("script.js") && !previewHtml.includes(".teachforth"), "preview can load script.js");
  const locked = await send(`/api/projects/${page.id}/controls`, {
    method: "PATCH",
    cookie: teacher.cookie,
    body: { path: "index.html", locked: true, hidden: true },
  });
  assert(locked.files.some((file) => file.path === "index.html" && file.hidden && file.locked), "teacher can hide and lock a file");
  const studentView = await send(`/api/projects/${page.id}`, { cookie: student.cookie });
  assert(!studentView.files.some((file) => file.path === "index.html"), "student cannot see a hidden file");
  assert(!studentView.controls.teacher && !studentView.controls.lead, "student has no control panels");
  const studentWrite = await send(`/api/projects/${page.id}/files`, {
    method: "PUT",
    cookie: student.cookie,
    body: { path: "index.html", content: "nope" },
    ok: false,
  });
  assert(studentWrite.status === 404, "hidden file is not revealed to the student");
  const teacherLead = await send(`/api/projects/${page.id}/lead`, { cookie: teacher.cookie, ok: false });
  assert(teacherLead.status === 403, "paired teacher is not a session lead");
  const leadView = await send(`/api/projects/${page.id}/lead`, { cookie: lead.cookie });
  assert(Array.isArray(leadView.issues), "lead can inspect the GitHub link");
  const teacherCommit = await send(`/api/projects/${page.id}/commit`, { method: "POST", cookie: teacher.cookie, ok: false });
  assert(teacherCommit.status === 403, "paired teacher cannot force a commit");
  const leadCommit = await send(`/api/projects/${page.id}/commit`, { method: "POST", cookie: lead.cookie, ok: false });
  assert(leadCommit.status === 400, "lead commit is allowed and stops at GitHub");
  const homeDenied = await send(`/api/projects/${page.id}/home`, { method: "POST", cookie: student.cookie, body: { hours: 2 }, ok: false });
  assert(homeDenied.status === 403, "student cannot mint a home link");
  const badHours = await send(`/api/projects/${page.id}/home`, { method: "POST", cookie: lead.cookie, body: { hours: 0 }, ok: false });
  assert(badHours.status === 400, "home hours are capped");
  const homeLead = await send(`/api/projects/${page.id}/home`, { method: "POST", cookie: lead.cookie, body: { hours: 2 }, ok: false });
  assert(homeLead.status === 503, "home link waits until the host is configured");
  await waitForHome();
  const homeSecret = "gho_selftest_secret";
  const pushed = await fetch(`${homeBase}/push`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-teachforth-token": "selftest-home-token" },
    body: JSON.stringify({
      id: "ab".repeat(24),
      projectId: 7,
      title: "Home",
      language: "web",
      githubRepo: "student/TeachForth-home",
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      token: homeSecret,
      marker: "tf_selftest",
      files: [{ path: "index.html", content: "<h1>Hi</h1><script src=\"/script.js\"></script>" }, { path: "script.js", content: "alert(1)" }],
    }),
  });
  assert(pushed.ok, "home host accepts a link");
  const homeDeniedPush = await fetch(`${homeBase}/push`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert(homeDeniedPush.status === 401, "home push requires the host token");
  const pageRes = await fetch(`${homeBase}/s/${"ab".repeat(24)}/`);
  const pageHtml = await pageRes.text();
  assert(pageRes.status === 200 && pageHtml.includes("home.js") && !pageHtml.includes(homeSecret), "home page hides the GitHub token");
  const stateRes = await fetch(`${homeBase}/s/${"ab".repeat(24)}/api/state`);
  const stateText = await stateRes.text();
  assert(stateRes.ok && stateText.includes("index.html") && !stateText.includes(homeSecret) && !stateText.includes("tf_selftest"), "home state hides the token and marker");
  const sneak = await rawHome(`/s/${"ab".repeat(24)}/preview/../meta.json`);
  assert(sneak === 400, "home preview rejects traversal");
  const homePreview = await fetch(`${homeBase}/s/${"ab".repeat(24)}/preview/`);
  const homePreviewHtml = await homePreview.text();
  assert(homePreview.headers.get("content-security-policy")?.includes("sandbox") && homePreviewHtml.includes('src="script.js"') && !homePreviewHtml.includes('src="/script.js"'), "home preview rewrites root links");
  const homeEnded = await fetch(`${homeBase}/push?id=${"ab".repeat(24)}`, { method: "DELETE", headers: { "x-teachforth-token": "selftest-home-token" } });
  assert(homeEnded.ok, "home link can be ended");
  const gone = await fetch(`${homeBase}/s/${"ab".repeat(24)}/api/state`);
  assert(gone.status === 410, "ended home link is gone");
  const expired = await fetch(`${homeBase}/push`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-teachforth-token": "selftest-home-token" },
    body: JSON.stringify({
      id: "cd".repeat(24),
      projectId: 8,
      title: "Old",
      githubRepo: "student/TeachForth-old",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      token: homeSecret,
      marker: "tf_old",
      files: [],
    }),
  });
  assert(expired.status === 400, "home host rejects an expired link");
  const hiddenPreview = await fetch(`${base}/preview-site/${preview.token}/index.html`);
  assert(hiddenPreview.status === 404, "hidden page is not served");
  const pyRun = await send(`/api/projects/${py.project.id}/exec`, {
    method: "POST",
    cookie: teacher.cookie,
    body: { kind: "python", file: "main.py" },
  });
  let pyText = "";
  for (let i = 0; i < 30 && !pyText.includes("Hello"); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const chunk = await send(`/api/runtime/output?run=${pyRun.runId}&offset=0`, { cookie: teacher.cookie });
    pyText = chunk.text || "";
    if (chunk.done) break;
  }
  assert(pyText.includes("Hello from TeachForth"), "python runs in the server sandbox");

  assert(normalizeDomain("IDE.School.edu") === "ide.school.edu", "domain names are lowercase hostnames");
  assert(!normalizeDomain("ide.school.edu; include /tmp/x") && !normalizeDomain("http://ide.school.edu") && !normalizeDomain("74.248.20.108") && !normalizeDomain("localhost"), "domain names reject schemes, ports, IPs, and injection");
  const domainList = join(dir, "render-domains.txt");
  writeFileSync(domainList, "ide.school.edu\n");
  const rendered = spawnSync("bash", ["deploy/tf-domains", "--render"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, TF_DOMAINS_LIST: domainList },
    encoding: "utf8",
  });
  assert(rendered.status === 0 && rendered.stdout.includes("server_name ide.school.edu;") && rendered.stdout.includes("proxy_pass http://127.0.0.1:8080;"), "domain vhost proxies the IDE");
  assert(!rendered.stdout.includes("listen 443") && !rendered.stdout.includes("$("), "render does not invent a certificate or a command");
  const evilList = join(dir, "evil-domains.txt");
  writeFileSync(evilList, "ide.school.edu; include /etc/nginx/evil.conf\n");
  const rejected = spawnSync("bash", ["deploy/tf-domains", "--render"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, TF_DOMAINS_LIST: evilList },
    encoding: "utf8",
  });
  assert(rejected.status !== 0 && !String(rejected.stdout).includes("include"), "domain helper rejects injection");
  const blocked = await send("/api/domains", { method: "POST", cookie: teacher.cookie, body: { domain: "ide.school.edu" }, ok: false });
  assert(blocked.status === 403, "only an admin can add a domain");
  const badDomain = await send("/api/domains", { method: "POST", cookie: admin.cookie, body: { domain: "ide.school.edu/admin" }, ok: false });
  assert(badDomain.status === 400, "a domain cannot include a path");
  const added = await send("/api/domains", { method: "POST", cookie: admin.cookie, body: { domain: "IDE.School.edu" } });
  assert(added.domains.length === 1 && added.domains[0].domain === "ide.school.edu" && added.domains[0].nginx === "not-installed", "a domain is saved without nginx");
  const again = await send("/api/domains", { method: "POST", cookie: admin.cookie, body: { domain: "ide.school.edu" } });
  assert(again.domains.length === 1, "adding the same domain does not duplicate it");
  assert(readFileSync(join(dir, "domains.txt"), "utf8") === "ide.school.edu\n", "the helper list is the saved name");
  const cleared = await send("/api/domains", { method: "DELETE", cookie: admin.cookie, body: { domain: "ide.school.edu" } });
  assert(cleared.domains.length === 0 && readFileSync(join(dir, "domains.txt"), "utf8") === "", "removing a domain clears the helper list");

  assert(commandAllowed("power", "admin") && !commandAllowed("power", "teacher") && !commandAllowed("live", "student") && commandAllowed("share", "student"), "discord command roles");
  assert(!helpText("student").includes("/power") && helpText("admin").includes("/logins"), "discord help follows the role");
  assert(!shareCard({ title: "Cards", language: "web", owner: "Sam", url: "https://74.248.20.108/#/project/1" }).includes("password"), "share card has no secrets");
  const keys = generateKeyPairSync("ed25519");
  const publicHex = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
  const signedBody = JSON.stringify({ type: 1 });
  const signedAt = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.from(signedAt + signedBody), keys.privateKey).toString("hex");
  assert(verifyDiscord(publicHex, signedAt, signedBody, signature), "discord signatures verify");
  assert(!verifyDiscord(publicHex, signedAt, signedBody, "00".repeat(64)) && !verifyDiscord(publicHex, "1", signedBody, signature), "discord signatures reject forgeries and old timestamps");
  const discordCode = await send("/api/discord/code", { method: "POST", cookie: admin.cookie, body: {} });
  assert(/^[A-Z2-9]{8}$/.test(discordCode.code), "discord link code");
  const secretHeader = { "content-type": "application/json", "x-teachforth-discord": "selftest-discord-secret" };
  const noSecret = await fetch(`${base}/api/discord/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: discordCode.code, discordId: "123456789012345678", discordName: "Admin" }),
  });
  assert(noSecret.status === 401, "discord claim needs the helper secret");
  const claimed = await fetch(`${base}/api/discord/claim`, {
    method: "POST",
    headers: secretHeader,
    body: JSON.stringify({ code: discordCode.code, discordId: "123456789012345678", discordName: "Admin" }),
  });
  const claimedBody = await claimed.json();
  assert(claimed.status === 200 && claimedBody.role === "admin", "discord code links the signed-in account");
  const studentCode = await send("/api/discord/code", { method: "POST", cookie: student.cookie, body: {} });
  const studentClaim = await fetch(`${base}/api/discord/claim`, {
    method: "POST",
    headers: secretHeader,
    body: JSON.stringify({ code: studentCode.code, discordId: "223456789012345678", discordName: "Student" }),
  });
  assert(studentClaim.status === 200, "student can link discord");
  const studentLive = await fetch(`${base}/api/discord/live?discordId=223456789012345678`, { headers: secretHeader });
  assert(studentLive.status === 403, "students cannot read live pairs from discord");
  const shared = await fetch(`${base}/api/discord/share?discordId=123456789012345678&name=hello`, { headers: secretHeader });
  const sharedBody = await shared.json();
  assert(shared.status === 200 && !JSON.stringify(sharedBody).includes("github_token") && !JSON.stringify(sharedBody).includes("password"), "discord share has no code or tokens");
  const badCode = await fetch(`${base}/api/discord/claim`, {
    method: "POST",
    headers: secretHeader,
    body: JSON.stringify({ code: "ABCD;rm", discordId: "323456789012345678", discordName: "Nope" }),
  });
  assert(badCode.status === 400, "discord rejects a bad code");

  console.log("selftest ok");
  console.log("outsider blocked", outsider.user.email);
} catch (err) {
  console.error(logs);
  console.error(homeLogs);
  console.error(err);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  homeChild.kill("SIGTERM");
  rmSync(dir, { recursive: true, force: true });
  rmSync(homeDir, { recursive: true, force: true });
}

function rawHome(path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port: homePort, path, method: "GET" }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForHome() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${homeBase}/health`);
      if (res.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("home host did not start\n" + homeLogs);
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
