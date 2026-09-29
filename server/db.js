import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDatabase(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'chapter_lead', 'lead_teacher', 'teacher', 'student')),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assignments (
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (teacher_id, student_id)
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      language TEXT NOT NULL CHECK(language IN ('web', 'python')),
      notes TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1,
      board TEXT NOT NULL DEFAULT '[]',
      board_revision INTEGER NOT NULL DEFAULT 1,
      last_output TEXT NOT NULL DEFAULT '',
      github_repo TEXT,
      github_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, path)
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      project_id INTEGER,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usage_days (
      day TEXT PRIMARY KEY,
      requests INTEGER NOT NULL DEFAULT 0,
      logins INTEGER NOT NULL DEFAULT 0,
      editor_opens INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      library INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS course_members (
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (course_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      unit TEXT NOT NULL,
      unit_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      language TEXT NOT NULL CHECK(language IN ('web', 'python')),
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lesson_files (
      lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      PRIMARY KEY (lesson_id, path)
    );
  `);
  addColumn(db, "projects", "lesson_id", "lesson_id INTEGER");
  addColumn(db, "projects", "kind", "kind TEXT NOT NULL DEFAULT 'sandbox'");
  widenRoles(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      place TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chapter_staff (
      chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (chapter_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY,
      chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      lead_teacher_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'live', 'ended')),
      starts_at TEXT,
      ends_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pairs (
      block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (block_id, student_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id),
      block_id INTEGER,
      body TEXT NOT NULL,
      diff TEXT NOT NULL DEFAULT '',
      snapshot TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS file_revisions (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chapter_members (
      chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (chapter_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS github_states (
      state TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  addColumn(db, "users", "github_login", "github_login TEXT");
  addColumn(db, "users", "github_id", "github_id TEXT");
  addColumn(db, "users", "github_token", "github_token TEXT");
  addColumn(db, "users", "github_avatar", "github_avatar TEXT");
  addColumn(db, "users", "github_code", "github_code TEXT");
  addColumn(db, "github_states", "purpose", "purpose TEXT NOT NULL DEFAULT 'connect'");
  addColumn(db, "projects", "github_sha", "github_sha TEXT");
  addColumn(db, "projects", "open", "open INTEGER NOT NULL DEFAULT 1");
  db.prepare("UPDATE users SET role = 'teacher' WHERE role = 'lead_teacher'").run();
  db.exec(`
    INSERT OR IGNORE INTO chapter_members (chapter_id, user_id)
      SELECT b.chapter_id, p.student_id FROM pairs p JOIN blocks b ON b.id = p.block_id;
    INSERT OR IGNORE INTO chapter_members (chapter_id, user_id)
      SELECT b.chapter_id, p.teacher_id FROM pairs p JOIN blocks b ON b.id = p.block_id;
    INSERT OR IGNORE INTO chapter_members (chapter_id, user_id)
      SELECT chapter_id, lead_teacher_id FROM blocks WHERE lead_teacher_id IS NOT NULL;
  `);
  return db;
}

function widenRoles(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!row?.sql || row.sql.includes("chapter_lead")) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'chapter_lead', 'lead_teacher', 'teacher', 'student')),
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO users_new (id, email, name, role, password_hash, created_at)
        SELECT id, email, name, role, password_hash, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  db.exec("PRAGMA foreign_keys = ON");
}

function addColumn(db, table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function bumpUsage(db, field) {
  const day = dayKey();
  db.prepare(
    `INSERT INTO usage_days (day, ${field}) VALUES (?, 1)
     ON CONFLICT(day) DO UPDATE SET ${field} = ${field} + 1`,
  ).run(day);
}
