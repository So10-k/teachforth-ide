import { lineDiff } from "./diff.js";
import { visibleStudentProject, createOwnedRepo } from "./github.js";
import { focus } from "./live.js";
import { curriculumRoute, insertSkills, parseSkills, skillsForReports } from "./curriculum-api.js";

const ROLES = ["admin", "chapter_lead", "teacher", "student"];

export function isStaff(user) {
  return user && user.role !== "student";
}

export function canSeeStudent(db, user, studentId) {
  if (!user) return false;
  if (user.role === "student") return user.id === studentId;
  if (user.role === "admin") return Boolean(studentRow(db, studentId));
  return visibleStudentIds(db, user).includes(studentId);
}

export function canViewProfile(db, user, studentId) {
  if (!user) return false;
  if (user.role === "student") return user.id === studentId;
  if (user.role === "admin") return Boolean(studentRow(db, studentId));
  if (canSeeStudent(db, user, studentId)) return true;
  if (user.role === "chapter_lead") {
    return Boolean(db.prepare(
      `SELECT 1 AS ok FROM chapter_members m
       JOIN chapter_staff s ON s.chapter_id = m.chapter_id
       WHERE m.user_id = ? AND s.user_id = ?`,
    ).get(studentId, user.id));
  }
  return false;
}

export function canAccessProject(db, user, project) {
  if (!user || !project) return false;
  if (project.owner_id === user.id || user.role === "admin") return true;
  if (project.kind === "sandbox") return false;
  return canSeeStudent(db, user, project.owner_id);
}

export function visibleStudentIds(db, user) {
  if (!user || user.role === "student") return user?.role === "student" ? [user.id] : [];
  if (user.role === "admin") {
    return db.prepare("SELECT id FROM users WHERE role = 'student'").all().map((row) => row.id);
  }
  if (user.role === "teacher" || user.role === "lead_teacher") {
    return db.prepare(
      `SELECT DISTINCT p.student_id AS id FROM pairs p
       JOIN blocks b ON b.id = p.block_id
       WHERE b.status = 'live' AND (p.teacher_id = ? OR b.lead_teacher_id = ?)`,
    ).all(user.id, user.id).map((row) => row.id);
  }
  if (user.role === "chapter_lead") {
    return db.prepare(
      `SELECT DISTINCT p.student_id AS id FROM pairs p
       JOIN blocks b ON b.id = p.block_id
       JOIN chapter_staff s ON s.chapter_id = b.chapter_id
       WHERE s.user_id = ? AND b.status = 'live'`,
    ).all(user.id).map((row) => row.id);
  }
  return [];
}

export function studentsFor(db, user) {
  const ids = visibleStudentIds(db, user);
  if (!ids.length) return [];
  const marks = ids.map(() => "?").join(",");
  return db.prepare(
    `SELECT id, name, email FROM users WHERE id IN (${marks}) ORDER BY name`,
  ).all(...ids);
}

export function recordRevision(db, projectId, path, content, authorId) {
  const last = db.prepare(
    "SELECT id, content, created_at FROM file_revisions WHERE project_id = ? AND path = ? ORDER BY id DESC LIMIT 1",
  ).get(projectId, path);
  const now = new Date().toISOString();
  if (last && last.content === content) return;
  if (last && Date.now() - Date.parse(last.created_at) < 15_000) {
    db.prepare("UPDATE file_revisions SET content = ?, author_id = ?, created_at = ? WHERE id = ?").run(
      content,
      authorId,
      now,
      last.id,
    );
    return;
  }
  db.prepare(
    "INSERT INTO file_revisions (project_id, path, content, author_id, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(projectId, path, content, authorId, now);
}

export async function orgRoute(ctx, path) {
  const { db, req, res, user, send, fail, readJson, audit, requireUser } = ctx;
  requireUser(user);
  ctx.canViewProfile = canViewProfile;
  ctx.canAccessProject = canAccessProject;
  if (await curriculumRoute(ctx, path) !== false) return;
  if (path === "/api/chapters" && req.method === "GET") return send(res, 200, { chapters: listChapters(db, user) });
  if (path === "/api/chapters" && req.method === "POST") return createChapter(ctx);
  const staff = path.match(/^\/api\/chapters\/(\d+)\/staff$/);
  if (staff && req.method === "POST") return addStaff(ctx, Number(staff[1]));
  if (staff && req.method === "DELETE") return removeStaff(ctx, Number(staff[1]));
  if (path === "/api/blocks" && req.method === "GET") return send(res, 200, { blocks: listBlocks(db, user) });
  if (path === "/api/blocks" && req.method === "POST") return createBlock(ctx);
  const blockItem = path.match(/^\/api\/blocks\/(\d+)$/);
  if (blockItem && req.method === "DELETE") return deleteBlock(ctx, Number(blockItem[1]));
  const status = path.match(/^\/api\/blocks\/(\d+)\/status$/);
  if (status && req.method === "POST") return setBlockStatus(ctx, Number(status[1]));
  const pair = path.match(/^\/api\/blocks\/(\d+)\/pairs$/);
  if (pair && req.method === "POST") return addPair(ctx, Number(pair[1]));
  if (pair && req.method === "DELETE") return removePair(ctx, Number(pair[1]));
  if (path === "/api/center" && req.method === "GET") return send(res, 200, center(db, user));
  const folder = path.match(/^\/api\/folders\/(\d+)$/);
  if (folder && req.method === "GET") return send(res, 200, folderOf(db, user, Number(folder[1]), ctx.projectView));
  const report = path.match(/^\/api\/folders\/(\d+)\/reports$/);
  if (report && req.method === "POST") return createReport(ctx, Number(report[1]));
  if (path === "/api/people" && req.method === "GET") {
    if (!user || user.role === "student") fail(403, "You cannot do that");
    const scope = new URL(req.url, "http://localhost").searchParams.get("scope");
    if (scope === "manage") return send(res, 200, { people: manageablePeople(db, user) });
    if (!["admin", "chapter_lead"].includes(user.role)) fail(403, "You cannot do that");
    return send(res, 200, {
      people: db.prepare("SELECT id, name, email, role FROM users ORDER BY role, name").all(),
    });
  }
  const person = path.match(/^\/api\/people\/(\d+)$/);
  if (person && req.method === "GET") return send(res, 200, personProfile(db, user, Number(person[1])));
  const studentRepo = path.match(/^\/api\/folders\/(\d+)\/repos$/);
  if (studentRepo && req.method === "POST") return createStudentRepo(ctx, Number(studentRepo[1]));
  const chapter = path.match(/^\/api\/chapters\/(\d+)$/);
  if (chapter && req.method === "GET") return send(res, 200, chapterProfile(db, user, Number(chapter[1])));
  if (chapter && req.method === "DELETE") return deleteChapter(ctx, Number(chapter[1]));
  const members = path.match(/^\/api\/chapters\/(\d+)\/members$/);
  if (members && req.method === "POST") return addMember(ctx, Number(members[1]));
  if (members && req.method === "DELETE") return removeMember(ctx, Number(members[1]));
  const lead = path.match(/^\/api\/blocks\/(\d+)\/lead$/);
  if (lead && req.method === "POST") return setSessionLead(ctx, Number(lead[1]));
  if (path === "/api/directory" && req.method === "GET") {
    const q = new URL(req.url, "http://localhost").searchParams.get("q") || "";
    return send(res, 200, { students: directory(db, user, q) });
  }
  if (path === "/api/home" && req.method === "GET") return send(res, 200, homePayload(db, user));
  return false;
}

function studentRow(db, id) {
  return db.prepare("SELECT id, name, email, role FROM users WHERE id = ? AND role = 'student'").get(id);
}

function listChapters(db, user) {
  if (user.role === "admin") return db.prepare("SELECT * FROM chapters ORDER BY name").all();
  if (user.role !== "chapter_lead") return [];
  return db.prepare(
    `SELECT c.* FROM chapters c
     JOIN chapter_staff s ON s.chapter_id = c.id
     WHERE s.user_id = ? ORDER BY c.name`,
  ).all(user.id);
}

async function createChapter(ctx) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  if (user.role !== "admin") fail(403, "Only an admin can make a chapter");
  const body = await readJson(req);
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) fail(400, "Chapter name is required");
  const id = Number(
    db.prepare("INSERT INTO chapters (name, place, created_at) VALUES (?, ?, ?)").run(
      name,
      String(body.place || "").trim().slice(0, 80),
      new Date().toISOString(),
    ).lastInsertRowid,
  );
  audit(user, "create_chapter", null, name);
  send(res, 201, { chapter: { id, name } });
}

async function deleteChapter(ctx, chapterId) {
  const { db, res, user, send, fail, audit } = ctx;
  if (user.role !== "admin") fail(403, "Only an admin can delete a chapter");
  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId);
  if (!chapter) fail(404, "Chapter not found");
  db.prepare("DELETE FROM chapters WHERE id = ?").run(chapterId);
  audit(user, "delete_chapter", null, chapter.name);
  send(res, 200, { ok: true });
}

async function removeStaff(ctx, chapterId) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  if (user.role !== "admin") fail(403, "Only an admin can remove a chapter lead");
  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId);
  if (!chapter) fail(404, "Chapter not found");
  const body = await readJson(req);
  db.prepare("DELETE FROM chapter_staff WHERE chapter_id = ? AND user_id = ?").run(chapterId, Number(body.userId));
  audit(user, "chapter_unstaff", null, `${body.userId} - ${chapter.name}`);
  send(res, 200, { ok: true });
}

async function deleteBlock(ctx, blockId) {
  const { db, res, user, send, fail, audit } = ctx;
  const block = loadBlock(db, blockId);
  if (!block) fail(404, "Block not found");
  if (!canManageBlock(db, user, block)) fail(403, "You cannot delete this block");
  db.prepare("DELETE FROM blocks WHERE id = ?").run(blockId);
  audit(user, "delete_block", null, block.name);
  send(res, 200, { ok: true });
}

async function addStaff(ctx, chapterId) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  if (user.role !== "admin") fail(403, "Only an admin can assign chapter staff");
  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId);
  if (!chapter) fail(404, "Chapter not found");
  const body = await readJson(req);
  const person = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(body.userId));
  if (!person || person.role !== "chapter_lead") fail(400, "Pick a chapter lead");
  db.prepare("INSERT OR IGNORE INTO chapter_staff (chapter_id, user_id) VALUES (?, ?)").run(chapterId, person.id);
  audit(user, "chapter_staff", null, `${person.email} -> ${chapter.name}`);
  send(res, 200, { ok: true });
}

function listBlocks(db, user) {
  const rows = db.prepare(
    `SELECT b.*, c.name AS chapter_name, u.name AS lead_name
     FROM blocks b
     JOIN chapters c ON c.id = b.chapter_id
     LEFT JOIN users u ON u.id = b.lead_teacher_id
     ORDER BY b.id DESC`,
  ).all();
  return rows.filter((block) => canManageBlock(db, user, block) || canWatchBlock(db, user, block)).map((block) => ({
    ...publicBlock(block),
    pairs: pairsOf(db, block.id),
  }));
}

function publicBlock(block) {
  return {
    id: block.id,
    chapterId: block.chapter_id,
    chapterName: block.chapter_name,
    name: block.name,
    leadTeacherId: block.lead_teacher_id,
    leadName: block.lead_name || "",
    status: block.status,
    startsAt: block.starts_at,
    endsAt: block.ends_at,
  };
}

function pairsOf(db, blockId) {
  return db.prepare(
    `SELECT p.teacher_id, p.student_id, t.name AS teacher_name, s.name AS student_name
     FROM pairs p
     JOIN users t ON t.id = p.teacher_id
     JOIN users s ON s.id = p.student_id
     WHERE p.block_id = ?
     ORDER BY s.name`,
  ).all(blockId);
}

function canManageBlock(db, user, block) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "chapter_lead") return false;
  return Boolean(
    db.prepare("SELECT 1 AS ok FROM chapter_staff WHERE chapter_id = ? AND user_id = ?").get(block.chapter_id, user.id),
  );
}

function canWatchBlock(db, user, block) {
  if (block.status !== "live" && user.role !== "admin") return false;
  if (block.lead_teacher_id === user.id) return true;
  if (user.role === "teacher" || user.role === "lead_teacher") {
    return Boolean(db.prepare("SELECT 1 AS ok FROM pairs WHERE block_id = ? AND teacher_id = ?").get(block.id, user.id));
  }
  return canManageBlock(db, user, block);
}

async function createBlock(ctx) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  if (!["admin", "chapter_lead"].includes(user.role)) fail(403, "Only an admin or chapter lead can book a block");
  const body = await readJson(req);
  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(Number(body.chapterId));
  if (!chapter) fail(400, "Pick a chapter");
  if (user.role === "chapter_lead" && !canManageBlock(db, user, { chapter_id: chapter.id })) {
    fail(403, "That is not your chapter");
  }
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) fail(400, "Block name is required");
  const lead = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(body.leadTeacherId || 0));
  if (body.leadTeacherId && (!lead || !["teacher", "lead_teacher"].includes(lead.role))) {
    fail(400, "Pick a teacher to lead this session");
  }
  const id = Number(
    db.prepare(
      "INSERT INTO blocks (chapter_id, name, lead_teacher_id, created_at) VALUES (?, ?, ?, ?)",
    ).run(chapter.id, name, lead?.id || null, new Date().toISOString()).lastInsertRowid,
  );
  audit(user, "create_block", null, name);
  send(res, 201, { block: { id, name } });
}

async function setBlockStatus(ctx, blockId) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  const block = loadBlock(db, blockId);
  if (!block) fail(404, "Block not found");
  const leadCanStart = block.lead_teacher_id === user.id;
  if (!canManageBlock(db, user, block) && !leadCanStart) fail(403, "You cannot change this block");
  const body = await readJson(req);
  const status = body.status;
  if (!["live", "ended", "scheduled"].includes(status)) fail(400, "Status must be live, ended, or scheduled");
  const now = new Date().toISOString();
  if (status === "live") {
    db.prepare("UPDATE blocks SET status = 'ended', ends_at = ? WHERE chapter_id = ? AND status = 'live' AND id != ?").run(
      now,
      block.chapter_id,
      block.id,
    );
    db.prepare("UPDATE blocks SET status = 'live', starts_at = COALESCE(starts_at, ?), ends_at = NULL WHERE id = ?").run(now, block.id);
  } else if (status === "ended") {
    db.prepare("UPDATE blocks SET status = 'ended', ends_at = ? WHERE id = ?").run(now, block.id);
  } else {
    db.prepare("UPDATE blocks SET status = 'scheduled' WHERE id = ?").run(block.id);
  }
  audit(user, "block_status", null, `${block.name} ${status}`);
  send(res, 200, { ok: true });
}

async function addPair(ctx, blockId) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  const block = loadBlock(db, blockId);
  if (!block) fail(404, "Block not found");
  if (!canManageBlock(db, user, block)) fail(403, "Only the chapter lead or admin pairs teachers");
  if (block.status === "ended") fail(400, "That block has ended");
  const body = await readJson(req);
  const teacher = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(body.teacherId));
  const student = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(body.studentId));
  if (!teacher || teacher.role !== "teacher") fail(400, "Pick a teacher");
  if (!student || student.role !== "student") fail(400, "Pick a student");
  db.prepare(
    "INSERT INTO pairs (block_id, teacher_id, student_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(block_id, student_id) DO UPDATE SET teacher_id = excluded.teacher_id",
  ).run(block.id, teacher.id, student.id, new Date().toISOString());
  const member = db.prepare("INSERT OR IGNORE INTO chapter_members (chapter_id, user_id) VALUES (?, ?)");
  member.run(block.chapter_id, teacher.id);
  member.run(block.chapter_id, student.id);
  audit(user, "pair", null, `${teacher.email} -> ${student.email}`);
  send(res, 200, { pairs: pairsOf(db, block.id) });
}

async function removePair(ctx, blockId) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  const block = loadBlock(db, blockId);
  if (!block) fail(404, "Block not found");
  if (!canManageBlock(db, user, block)) fail(403, "You cannot change pairs");
  const body = await readJson(req);
  db.prepare("DELETE FROM pairs WHERE block_id = ? AND student_id = ?").run(block.id, Number(body.studentId));
  audit(user, "unpair", null, String(body.studentId));
  send(res, 200, { pairs: pairsOf(db, block.id) });
}

function loadBlock(db, id) {
  return db.prepare("SELECT * FROM blocks WHERE id = ?").get(id);
}

function center(db, user) {
  if (user.role === "student") return { blocks: [] };
  const blocks = listBlocks(db, user).filter((block) => block.status === "live" || user.role === "admin");
  return {
    blocks: blocks.map((block) => ({
      ...block,
      students: block.pairs
        .filter((pair) => user.role !== "teacher" || pair.teacher_id === user.id || block.leadTeacherId === user.id)
        .map((pair) => studentCard(db, pair)),
    })),
  };
}

function focusOf(studentId) {
  const row = focus.get(studentId);
  if (!row || Date.now() - row.at > 20_000) return null;
  return { projectId: row.projectId, file: row.file || "" };
}

function studentCard(db, pair) {
  const projects = db.prepare(
    "SELECT id, title, kind, github_repo, open, updated_at FROM projects WHERE owner_id = ? ORDER BY updated_at DESC",
  ).all(pair.student_id).filter(visibleStudentProject).slice(0, 6);
  return {
    id: pair.student_id,
    name: pair.student_name,
    teacherName: pair.teacher_name,
    teacherId: pair.teacher_id,
    focus: focusOf(pair.student_id),
    latest: projects[0] || null,
    projects: projects.map((project) => ({ id: project.id, title: project.title, updatedAt: project.updated_at })),
  };
}

function folderOf(db, user, studentId, projectView) {
  if (user.role === "student" && user.id !== studentId) {
    const err = new Error("That folder is not yours");
    err.status = 403;
    err.publicMessage = err.message;
    throw err;
  }
  if (!canViewProfile(db, user, studentId)) {
    const err = new Error("You cannot open that profile");
    err.status = 403;
    err.publicMessage = err.message;
    throw err;
  }
  const student = studentRow(db, studentId) || db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(studentId);
  if (!student || student.role !== "student") {
    const err = new Error("Student not found");
    err.status = 404;
    err.publicMessage = err.message;
    throw err;
  }
  const projects = db.prepare(
    `SELECT p.*, u.name AS owner_name FROM projects p
     JOIN users u ON u.id = p.owner_id
     WHERE p.owner_id = ? ORDER BY p.updated_at DESC`,
  ).all(studentId).filter(visibleStudentProject);
  const chapter = db.prepare(
    `SELECT c.id, c.name, c.place FROM chapters c
     JOIN chapter_members m ON m.chapter_id = c.id
     WHERE m.user_id = ? ORDER BY c.name LIMIT 1`,
  ).get(studentId);
  const github = db.prepare("SELECT github_login, github_avatar FROM users WHERE id = ?").get(studentId);
  const payload = {
    student: { id: student.id, name: student.name, email: student.email, githubAvatar: github?.github_avatar || "" },
    chapter: chapter ? { id: chapter.id, name: chapter.name, place: chapter.place } : null,
    githubLogin: github?.github_login || "",
    githubAvatar: github?.github_avatar || "",
    canOpen: canSeeStudent(db, user, studentId),
    projects: projects.map((project) => projectView(project, user)),
  };
  if (user.role === "student") return payload;
  payload.reports = reportsFor(db, studentId);
  payload.preview = buildReport(db, studentId, true).diff;
  return payload;
}

function reportsFor(db, studentId) {
  const rows = db.prepare(
    `SELECT r.id, r.body, r.diff, r.created_at, r.block_id, u.name AS author_name, b.name AS block_name
     FROM reports r
     JOIN users u ON u.id = r.author_id
     LEFT JOIN blocks b ON b.id = r.block_id
     WHERE r.student_id = ?
     ORDER BY r.id DESC`,
  ).all(studentId);
  const skills = skillsForReports(db, rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    diff: row.diff,
    createdAt: row.created_at,
    authorName: row.author_name,
    blockName: row.block_name || "",
    skills: skills.get(row.id) || [],
  }));
}

function snapshotOf(db, studentId) {
  const projects = db.prepare("SELECT id, title, open FROM projects WHERE owner_id = ?").all(studentId);
  const snap = {};
  for (const project of projects) {
    const files = db.prepare("SELECT path, content FROM files WHERE project_id = ?").all(project.id);
    if (!files.length && project.open === 0) {
      snap[String(project.id)] = null;
      continue;
    }
    snap[String(project.id)] = { title: project.title, files: Object.fromEntries(files.map((file) => [file.path, file.content])) };
  }
  return snap;
}

function buildReport(db, studentId, preview) {
  const current = snapshotOf(db, studentId);
  const previous = db.prepare(
    "SELECT snapshot, created_at FROM reports WHERE student_id = ? ORDER BY id DESC LIMIT 1",
  ).get(studentId);
  const prior = previous ? JSON.parse(previous.snapshot || "{}") : {};
  for (const [id, value] of Object.entries(current)) {
    if (value === null) current[id] = prior[id] || { title: "Closed project", files: {} };
  }
  const ids = new Set([...Object.keys(prior), ...Object.keys(current)]);
  let diff = "";
  for (const id of ids) {
    const before = prior[id]?.files || {};
    const after = current[id]?.files || {};
    const title = current[id]?.title || prior[id]?.title || `project ${id}`;
    const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const path of paths) {
      diff += lineDiff(before[path] || "", after[path] || "", `${title}/${path}`);
    }
  }
  if (!diff.trim()) diff = "No code changes since the last report.\n";
  const since = previous?.created_at || "1970-01-01";
  const projectIds = Object.keys(current).map(Number);
  let saves = 0;
  if (projectIds.length) {
    const marks = projectIds.map(() => "?").join(",");
    saves = db.prepare(
      `SELECT COUNT(*) AS n FROM file_revisions WHERE project_id IN (${marks}) AND created_at > ?`,
    ).get(...projectIds, since).n;
  }
  return { diff, snapshot: JSON.stringify(current), saves, preview };
}

async function createReport(ctx, studentId) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  if (user.role === "student") fail(403, "Students cannot write or read session reports");
  if (!canSeeStudent(db, user, studentId)) fail(403, "You cannot write a report for that student");
  const body = await readJson(req);
  const text = String(body.body || "").trim().slice(0, 8000);
  if (!text) fail(400, "Write what you worked on");
  const built = buildReport(db, studentId);
  if (body.preview) return send(res, 200, { diff: built.diff, saves: built.saves });
  const skills = parseSkills(db, studentId, body.skills, fail);
  const block = db.prepare(
    `SELECT b.id FROM blocks b
     JOIN pairs p ON p.block_id = b.id
     WHERE p.student_id = ? AND b.status = 'live'
     ORDER BY b.id DESC LIMIT 1`,
  ).get(studentId);
  const id = Number(
    db.prepare(
      "INSERT INTO reports (student_id, author_id, block_id, body, diff, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(studentId, user.id, block?.id || null, text, built.diff, built.snapshot, new Date().toISOString()).lastInsertRowid,
  );
  insertSkills(db, id, studentId, skills);
  audit(user, "session_report", null, String(studentId));
  send(res, 201, { report: reportsFor(db, studentId).find((row) => row.id === id) });
}

function chapterProfile(db, user, chapterId) {
  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId);
  if (!chapter) {
    const err = new Error("Chapter not found");
    err.status = 404;
    err.publicMessage = err.message;
    throw err;
  }
  if (user.role !== "admin" && !canManageBlock(db, user, { chapter_id: chapter.id })) {
    const err = new Error("That is not your chapter");
    err.status = 403;
    err.publicMessage = err.message;
    throw err;
  }
  const leads = db.prepare(
    `SELECT u.id, u.name, u.email FROM chapter_staff s
     JOIN users u ON u.id = s.user_id
     WHERE s.chapter_id = ? ORDER BY u.name`,
  ).all(chapterId);
  const members = db.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.github_login FROM chapter_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.chapter_id = ? ORDER BY u.role, u.name`,
  ).all(chapterId);
  const blocks = db.prepare(
    `SELECT b.*, u.name AS lead_name FROM blocks b
     LEFT JOIN users u ON u.id = b.lead_teacher_id
     WHERE b.chapter_id = ? ORDER BY b.id DESC`,
  ).all(chapterId).map((block) => ({
    ...publicBlock({ ...block, chapter_name: chapter.name }),
    pairs: pairsOf(db, block.id),
  }));
  return {
    chapter: { id: chapter.id, name: chapter.name, place: chapter.place },
    leads,
    members,
    blocks,
  };
}

async function addMember(ctx, chapterId) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId);
  if (!chapter) fail(404, "Chapter not found");
  if (!canManageBlock(db, user, { chapter_id: chapter.id })) fail(403, "That is not your chapter");
  const body = await readJson(req);
  const person = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(body.userId));
  if (!person || person.role === "admin") fail(400, "Pick a student or teacher");
  db.prepare("INSERT OR IGNORE INTO chapter_members (chapter_id, user_id) VALUES (?, ?)").run(chapterId, person.id);
  audit(user, "chapter_member", null, `${person.email} -> ${chapter.name}`);
  send(res, 200, { ok: true });
}

async function removeMember(ctx, chapterId) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId);
  if (!chapter) fail(404, "Chapter not found");
  if (!canManageBlock(db, user, { chapter_id: chapter.id })) fail(403, "That is not your chapter");
  const body = await readJson(req);
  db.prepare("DELETE FROM chapter_members WHERE chapter_id = ? AND user_id = ?").run(chapterId, Number(body.userId));
  audit(user, "chapter_unmember", null, String(body.userId));
  send(res, 200, { ok: true });
}

async function setSessionLead(ctx, blockId) {
  const { db, req, res, user, send, fail, readJson, audit } = ctx;
  const block = loadBlock(db, blockId);
  if (!block) fail(404, "Block not found");
  if (!canManageBlock(db, user, block)) fail(403, "Only the chapter lead or admin can set the session lead");
  const body = await readJson(req);
  const teacher = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(body.teacherId));
  if (!teacher || !["teacher", "lead_teacher"].includes(teacher.role)) fail(400, "Pick a teacher");
  db.prepare("UPDATE blocks SET lead_teacher_id = ? WHERE id = ?").run(teacher.id, block.id);
  db.prepare("INSERT OR IGNORE INTO chapter_members (chapter_id, user_id) VALUES (?, ?)").run(block.chapter_id, teacher.id);
  audit(user, "session_lead", null, `${teacher.email} -> ${block.name}`);
  send(res, 200, { ok: true });
}

function directory(db, user, q) {
  if (!user || user.role === "student") {
    const err = new Error("You cannot do that");
    err.status = 403;
    err.publicMessage = err.message;
    throw err;
  }
  let rows;
  if (user.role === "admin") {
    rows = db.prepare(
      `SELECT u.id, u.name, u.email, u.github_login, GROUP_CONCAT(c.name, ', ') AS chapters
       FROM users u
       LEFT JOIN chapter_members m ON m.user_id = u.id
       LEFT JOIN chapters c ON c.id = m.chapter_id
       WHERE u.role = 'student'
       GROUP BY u.id
       ORDER BY u.name`,
    ).all();
  } else if (user.role === "chapter_lead") {
    rows = db.prepare(
      `SELECT u.id, u.name, u.email, u.github_login, GROUP_CONCAT(c.name, ', ') AS chapters
       FROM users u
       JOIN chapter_members m ON m.user_id = u.id
       JOIN chapter_staff s ON s.chapter_id = m.chapter_id AND s.user_id = ?
       JOIN chapters c ON c.id = m.chapter_id
       WHERE u.role = 'student'
       GROUP BY u.id
       ORDER BY u.name`,
    ).all(user.id);
  } else {
    const ids = visibleStudentIds(db, user);
    if (!ids.length) return [];
    const marks = ids.map(() => "?").join(",");
    rows = db.prepare(
      `SELECT u.id, u.name, u.email, u.github_login, GROUP_CONCAT(c.name, ', ') AS chapters
       FROM users u
       LEFT JOIN chapter_members m ON m.user_id = u.id
       LEFT JOIN chapters c ON c.id = m.chapter_id
       WHERE u.id IN (${marks})
       GROUP BY u.id
       ORDER BY u.name`,
    ).all(...ids);
  }
  const query = String(q || "").trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) =>
    row.name.toLowerCase().includes(query)
    || row.email.toLowerCase().includes(query)
    || String(row.github_login || "").toLowerCase().includes(query)
    || String(row.chapters || "").toLowerCase().includes(query),
  );
}

function homePayload(db, user) {
  if (!user) {
    const err = new Error("Sign in first");
    err.status = 401;
    err.publicMessage = err.message;
    throw err;
  }
  const live = center(db, user).blocks.filter((block) => block.status === "live");
  const chapters = listChapters(db, user);
  return {
    stats: {
      chapters: chapters.length,
      students: user.role === "student"
        ? 1
        : user.role === "admin"
          ? db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student'").get().n
          : directory(db, user, "").length,
      liveBlocks: live.length,
      teachers: user.role === "admin" ? db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'teacher'").get().n : 0,
    },
    live,
    chapters: chapters.map((chapter) => ({ id: chapter.id, name: chapter.name, place: chapter.place || "" })),
  };
}

function manageablePeople(db, user) {
  if (!user || user.role === "student") return [];
  if (user.role === "admin") {
    return db.prepare("SELECT id, name, email, role, github_login FROM users ORDER BY role, name").all();
  }
  if (user.role === "chapter_lead") {
    return db.prepare(
      `SELECT DISTINCT u.id, u.name, u.email, u.role, u.github_login
       FROM users u
       WHERE u.id = ?
          OR u.id IN (
            SELECT m.user_id FROM chapter_members m
            JOIN chapter_staff s ON s.chapter_id = m.chapter_id AND s.user_id = ?
          )
          OR u.id IN (
            SELECT s2.user_id FROM chapter_staff s2
            JOIN chapter_staff s ON s.chapter_id = s2.chapter_id AND s.user_id = ?
          )
       ORDER BY u.role, u.name`,
    ).all(user.id, user.id, user.id);
  }
  const ids = [...new Set([user.id, ...visibleStudentIds(db, user)])];
  const marks = ids.map(() => "?").join(",");
  return db.prepare(
    `SELECT id, name, email, role, github_login FROM users WHERE id IN (${marks}) ORDER BY role, name`,
  ).all(...ids);
}

function personProfile(db, user, id) {
  const person = db.prepare(
    "SELECT id, name, email, role, github_login, github_avatar, created_at FROM users WHERE id = ?",
  ).get(id);
  if (!person) throwStatus(404, "Person not found");
  if (!canViewPerson(db, user, person)) throwStatus(403, "You cannot open that page");
  const chapters = db.prepare(
    `SELECT c.id, c.name, c.place FROM chapters c
     JOIN chapter_members m ON m.chapter_id = c.id
     WHERE m.user_id = ? ORDER BY c.name`,
  ).all(id);
  const staffChapters = db.prepare(
    `SELECT c.id, c.name, c.place FROM chapters c
     JOIN chapter_staff s ON s.chapter_id = c.id
     WHERE s.user_id = ? ORDER BY c.name`,
  ).all(id);
  const sandboxes = db.prepare(
    `SELECT id, title, language, updated_at FROM projects
     WHERE owner_id = ? AND kind = 'sandbox' ORDER BY updated_at DESC`,
  ).all(id);
  return {
    person: {
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
      githubLogin: person.github_login || "",
      githubAvatar: person.github_avatar || "",
      createdAt: person.created_at,
    },
    chapters,
    staffChapters,
    sandboxes: sandboxes.map((row) => ({
      id: row.id,
      title: row.title,
      language: row.language,
      updatedAt: row.updated_at,
    })),
    access: accessOf(person, chapters, staffChapters),
    canManage: user.role === "admin" && user.id !== person.id,
    canOpenSandbox: user.role === "admin" || user.id === person.id,
    isSelf: user.id === person.id,
  };
}

function canViewPerson(db, user, person) {
  if (!user || !person) return false;
  if (user.id === person.id || user.role === "admin") return true;
  if (person.role === "student") return canViewProfile(db, user, person.id);
  if (user.role !== "chapter_lead") return false;
  return Boolean(db.prepare(
    `SELECT 1 AS ok FROM chapter_members m
     JOIN chapter_staff s ON s.chapter_id = m.chapter_id AND s.user_id = ?
     WHERE m.user_id = ?`,
  ).get(user.id, person.id)) || Boolean(db.prepare(
    `SELECT 1 AS ok FROM chapter_staff a
     JOIN chapter_staff b ON a.chapter_id = b.chapter_id
     WHERE a.user_id = ? AND b.user_id = ?`,
  ).get(user.id, person.id));
}

function accessOf(person, chapters, staffChapters) {
  const names = (rows) => rows.map((row) => row.name).join(", ");
  if (person.role === "admin") return "Full access to accounts, chapters, blocks, sandboxes, and every profile.";
  if (person.role === "chapter_lead") {
    return staffChapters.length ? `Chapter lead for ${names(staffChapters)}.` : "Chapter lead with no chapter assigned yet.";
  }
  if (person.role === "student") {
    return chapters.length
      ? `Student in ${names(chapters)}. They only see their own library.`
      : "Student with no chapter yet. They only see their own library.";
  }
  return "Teacher. During a live block they see the students paired with them, plus their own sandbox.";
}

async function createStudentRepo(ctx, studentId) {
  const { db, user, fail, readJson, req } = ctx;
  if (!user || user.role === "student") fail(403, "Students start repositories from their own GitHub page");
  if (!canSeeStudent(db, user, studentId)) fail(403, "You are not assigned to this student in a live session");
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(studentId);
  if (!student) fail(404, "Student not found");
  if (!student.github_token) fail(400, "This student has not linked GitHub");
  return createOwnedRepo(ctx, student, await readJson(req));
}

function throwStatus(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  throw err;
}

export { ROLES };
