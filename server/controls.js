import { isHiddenFile } from "./templates.js";

export function ensureControls(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_flags (
      project_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      locked INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      skip_github INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, path)
    );
    CREATE TABLE IF NOT EXISTS project_controls (
      project_id INTEGER PRIMARY KEY,
      force_board INTEGER NOT NULL DEFAULT 0,
      lock_draw INTEGER NOT NULL DEFAULT 0,
      force_seq INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

export function studentMaySeePath(role, path, hiddenFlag) {
  if (role !== "student") return true;
  if (isHiddenFile(path) || hiddenFlag) return false;
  return true;
}

export function isLeadPlus(db, user, studentId) {
  if (!user || !studentId || user.role === "student" || user.id === studentId) return false;
  if (user.role === "admin") return true;
  return Boolean(db.prepare(
    `SELECT 1 AS ok FROM blocks b
     JOIN pairs p ON p.block_id = b.id
     WHERE b.status = 'live' AND b.lead_teacher_id = ? AND p.student_id = ?`,
  ).get(user.id, studentId));
}

export function flagMap(db, projectId) {
  const map = new Map();
  for (const row of db.prepare("SELECT path, locked, hidden, skip_github FROM file_flags WHERE project_id = ?").all(projectId)) {
    map.set(row.path, row);
  }
  return map;
}

export function fileViews(db, projectId, user) {
  const flags = flagMap(db, projectId);
  const staff = user.role !== "student";
  return db.prepare("SELECT path, content, updated_at FROM files WHERE project_id = ? ORDER BY path").all(projectId)
    .filter((file) => {
      if (isHiddenFile(file.path)) return false;
      return staff || !flags.get(file.path)?.hidden;
    })
    .map((file) => {
      const flag = flags.get(file.path);
      const view = { path: file.path, content: file.content, updatedAt: file.updated_at };
      if (staff && flag) {
        view.locked = Boolean(flag.locked);
        view.hidden = Boolean(flag.hidden);
        view.skipGithub = Boolean(flag.skip_github);
      } else if (flag?.locked) view.locked = true;
      return view;
    });
}

export function publicControl(db, projectId) {
  const row = db.prepare("SELECT * FROM project_controls WHERE project_id = ?").get(projectId) || {};
  return {
    forceBoard: Boolean(row.force_board),
    lockDraw: Boolean(row.lock_draw),
    forceSeq: Number(row.force_seq || 0),
  };
}

export function controlView(db, user, project) {
  const row = db.prepare("SELECT * FROM project_controls WHERE project_id = ?").get(project.id) || {};
  const studentProject = project.owner_role === "student" && project.owner_id !== user.id;
  const locked = db.prepare("SELECT path FROM file_flags WHERE project_id = ? AND locked = 1").all(project.id).map((item) => item.path);
  return {
    teacher: Boolean(studentProject && user.role !== "student"),
    lead: Boolean(studentProject && isLeadPlus(db, user, project.owner_id)),
    forceBoard: Boolean(row.force_board),
    lockDraw: Boolean(row.lock_draw),
    forceSeq: Number(row.force_seq || 0),
    locked,
  };
}

export function studentWriteBlock(db, user, project, path) {
  if (!user || user.role !== "student") return "";
  const flag = db.prepare("SELECT locked, hidden FROM file_flags WHERE project_id = ? AND path = ?").get(project.id, path);
  if (flag?.hidden) return "missing";
  if (flag?.locked) return "locked";
  return "";
}

export function setFileFlag(db, projectId, path, patch) {
  const current = db.prepare("SELECT * FROM file_flags WHERE project_id = ? AND path = ?").get(projectId, path) || {};
  const locked = bit(patch.locked, current.locked);
  const hidden = bit(patch.hidden, current.hidden);
  const skip = bit(patch.skipGithub, current.skip_github) || hidden;
  db.prepare(
    `INSERT INTO file_flags (project_id, path, locked, hidden, skip_github)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id, path) DO UPDATE SET locked = excluded.locked, hidden = excluded.hidden, skip_github = excluded.skip_github`,
  ).run(projectId, path, locked, hidden, skip);
}

export function setBoardControl(db, projectId, patch) {
  const current = db.prepare("SELECT * FROM project_controls WHERE project_id = ?").get(projectId) || {};
  const force = patch.forceBoard === undefined ? current.force_board || 0 : patch.forceBoard ? 1 : 0;
  const lock = patch.lockDraw === undefined ? current.lock_draw || 0 : patch.lockDraw ? 1 : 0;
  const seq = Number(current.force_seq || 0) + (patch.forceBoard && !current.force_board ? 1 : 0);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO project_controls (project_id, force_board, lock_draw, force_seq, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET force_board = excluded.force_board, lock_draw = excluded.lock_draw, force_seq = excluded.force_seq, updated_at = excluded.updated_at`,
  ).run(projectId, force, lock, seq, now);
}

export function moveFlags(db, projectId, from, to) {
  db.prepare("UPDATE file_flags SET path = ? WHERE project_id = ? AND path = ?").run(to, projectId, from);
}

export function clearFlags(db, projectId, path) {
  db.prepare("DELETE FROM file_flags WHERE project_id = ? AND path = ?").run(projectId, path);
}

export function commitFileList(db, projectId, files) {
  const flags = flagMap(db, projectId);
  return files.filter((file) => {
    if (isHiddenFile(file.path)) return String(file.path).endsWith(".teachforth");
    const flag = flags.get(file.path);
    return !flag?.hidden && !flag?.skip_github;
  });
}

function bit(value, fallback) {
  if (value === undefined) return fallback ? 1 : 0;
  return value ? 1 : 0;
}
