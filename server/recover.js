import { isHiddenFile } from "./templates.js";

export function ensureRecovery(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_snapshots (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS file_bases (
      project_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      PRIMARY KEY (project_id, path)
    );
    CREATE INDEX IF NOT EXISTS file_snapshots_project ON file_snapshots(project_id, id);
  `);
}

export function loadBases(db, projectId) {
  ensureRecovery(db);
  const map = new Map();
  for (const row of db.prepare("SELECT path, content FROM file_bases WHERE project_id = ?").all(projectId)) {
    map.set(row.path, String(row.content ?? ""));
  }
  return map;
}

export function rememberBases(db, projectId, files) {
  ensureRecovery(db);
  const upsert = db.prepare(
    `INSERT INTO file_bases (project_id, path, content) VALUES (?, ?, ?)
     ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content`,
  );
  for (const file of files || []) {
    if (!file?.path) continue;
    upsert.run(projectId, file.path, String(file.content ?? ""));
  }
}

export function snapshotFiles(db, projectId) {
  ensureRecovery(db);
  const files = db.prepare("SELECT path, content FROM files WHERE project_id = ? ORDER BY path").all(projectId);
  if (!files.some((file) => String(file.content || "").length)) return 0;
  const body = JSON.stringify(files);
  if (body.length > 2_000_000) return 0;
  db.prepare("INSERT INTO file_snapshots (project_id, body, created_at) VALUES (?, ?, ?)").run(
    projectId,
    body,
    new Date().toISOString(),
  );
  db.prepare(
    `DELETE FROM file_snapshots WHERE project_id = ? AND id NOT IN (
      SELECT id FROM file_snapshots WHERE project_id = ? ORDER BY id DESC LIMIT 12
    )`,
  ).run(projectId, projectId);
  return files.length;
}

// A pull may update a file only when the class copy still matches the last
// shared base. Diverged and local-only files stay. An empty pull is refused.
export function mergePulled(local, bases, incoming, flags = new Map()) {
  const mine = (local || []).filter((file) => file?.path).map((file) => ({
    path: file.path,
    content: String(file.content ?? ""),
  }));
  const remote = (incoming || []).filter((file) => file?.path).map((file) => ({
    path: file.path,
    content: String(file.content ?? ""),
  }));
  if (!remote.length && mine.length) return { files: mine, refused: true, taken: [] };
  const localMap = new Map(mine.map((file) => [file.path, file.content]));
  const baseMap = bases instanceof Map ? bases : new Map(Object.entries(bases || {}));
  const result = new Map();
  const taken = [];
  for (const file of remote) {
    const current = localMap.get(file.path);
    const base = baseMap.has(file.path) ? baseMap.get(file.path) : undefined;
    if (current === undefined) {
      result.set(file.path, file.content);
      taken.push(file.path);
      continue;
    }
    if (current.length && !file.content.length) {
      result.set(file.path, current);
      continue;
    }
    if (base !== undefined && current === base) {
      result.set(file.path, file.content);
      taken.push(file.path);
      continue;
    }
    if (base === undefined && current === file.content) {
      result.set(file.path, file.content);
      taken.push(file.path);
      continue;
    }
    result.set(file.path, current);
  }
  for (const file of mine) {
    if (result.has(file.path)) continue;
    const flag = flags.get(file.path) || {};
    const base = baseMap.has(file.path) ? baseMap.get(file.path) : undefined;
    if (isHiddenFile(file.path) || flag.hidden || flag.skip_github || base === undefined || file.content !== base) {
      result.set(file.path, file.content);
    }
  }
  return {
    files: [...result].map(([path, content]) => ({ path, content })),
    refused: false,
    taken,
  };
}

export function restoreIfEmpty(db, projectId) {
  ensureRecovery(db);
  const rows = db.prepare("SELECT path, content FROM files WHERE project_id = ?").all(projectId);
  if (rows.some((file) => String(file.content || "").length && !isHiddenFile(file.path))) {
    return { restored: false, paths: [] };
  }
  let source = [];
  const snap = db.prepare("SELECT body FROM file_snapshots WHERE project_id = ? ORDER BY id DESC LIMIT 1").get(projectId);
  if (snap?.body) {
    try {
      const parsed = JSON.parse(snap.body);
      if (Array.isArray(parsed)) source = parsed;
    } catch {
      source = [];
    }
  }
  if (!source.some((file) => String(file?.content || "").length)) {
    source = db.prepare(
      `SELECT path, content FROM file_revisions
       WHERE project_id = ? AND id IN (
         SELECT MAX(id) FROM file_revisions WHERE project_id = ? GROUP BY path
       )`,
    ).all(projectId, projectId);
  }
  source = source.filter((file) => file?.path && /^[\w./-]{1,120}$/.test(file.path) && !file.path.includes("..") && String(file.content || "").length);
  if (!source.length) return { restored: false, paths: [] };
  const now = new Date().toISOString();
  const paths = [];
  db.exec("BEGIN");
  try {
    for (const file of source) {
      const existing = db.prepare("SELECT content FROM files WHERE project_id = ? AND path = ?").get(projectId, file.path);
      const content = String(file.content);
      if (existing && String(existing.content || "").length) continue;
      if (existing) {
        db.prepare("UPDATE files SET content = ?, updated_at = ? WHERE project_id = ? AND path = ?").run(content, now, projectId, file.path);
      } else {
        db.prepare("INSERT INTO files (project_id, path, content, updated_at) VALUES (?, ?, ?, ?)").run(projectId, file.path, content, now);
      }
      paths.push(file.path);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { restored: paths.length > 0, paths };
}
