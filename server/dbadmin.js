const SECRET = new Set(["password_hash", "github_token", "code_hash", "token_hash"]);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WRITE = /^(insert|update|delete|replace|create|drop|alter|begin|commit|rollback)\b/i;
const BLOCKED = /^(attach|detach|pragma|vacuum|reindex|load_extension)\b/i;

export function maskCell(table, column, value, row) {
  const name = String(column || "");
  if (SECRET.has(name)) return value == null ? value : "••••";
  if (table === "settings" && name === "value" && /secret|token|password/i.test(String(row?.key || ""))) {
    return value ? "••••" : value;
  }
  return value;
}

export function maskRow(table, row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) out[key] = maskCell(table, key, value, row);
  return out;
}

export async function dbAdminRoute(ctx, path) {
  if (!path.startsWith("/api/db")) return false;
  const { req, res, url, user, db, send, fail, readJson, audit } = ctx;
  if (!user) fail(401, "Sign in first");
  if (user.role !== "admin") fail(403, "Only an admin can open the database");
  if (req.method === "GET" && path === "/api/db/tables") {
    return send(res, 200, { tables: tables(db) });
  }
  if (req.method === "POST" && path === "/api/db/query") return runQuery(ctx);
  const named = path.match(/^\/api\/db\/tables\/([A-Za-z_][A-Za-z0-9_]*)(\/rows|\/export)?$/);
  if (!named) fail(404, "Not found");
  const table = named[1];
  assertTable(db, table, fail);
  if (req.method === "GET" && !named[2]) return send(res, 200, browse(db, table, url));
  if (req.method === "GET" && named[2] === "/export") return exportTable(res, db, table, url);
  if (req.method === "POST" && named[2] === "/rows") return insertRow(ctx, table);
  if (req.method === "PATCH" && named[2] === "/rows") return updateRow(ctx, table);
  if (req.method === "DELETE" && named[2] === "/rows") return deleteRow(ctx, table);
  fail(404, "Not found");
}

function tables(db) {
  return db.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  ).all().map((row) => ({ name: row.name, columns: columns(db, row.name).map((col) => col.name) }));
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${quote(table)})`).all();
}

function assertTable(db, table, fail) {
  if (!NAME.test(table)) fail(400, "Unknown table");
  const found = db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!found) fail(404, "Unknown table");
}

function browse(db, table, url) {
  const info = columns(db, table);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const q = String(url.searchParams.get("q") || "").slice(0, 120);
  const searchable = info.filter((col) => /CHAR|CLOB|TEXT|INT|NUM|REAL|BLOB/i.test(col.type || "TEXT") || !col.type);
  const where = [];
  const params = [];
  if (q && searchable.length) {
    for (const col of searchable) {
      where.push(`CAST(${quote(col.name)} AS TEXT) LIKE ?`);
      params.push(`%${q.replaceAll("%", "")}%`);
    }
  }
  const filter = where.length ? ` WHERE ${where.join(" OR ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)}${filter}`).get(...params).n;
  const rows = db.prepare(
    `SELECT rowid AS _rowid, * FROM ${quote(table)}${filter} ORDER BY rowid DESC LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset).map((row) => maskRow(table, row));
  return {
    table,
    columns: info,
    indexes: db.prepare(`PRAGMA index_list(${quote(table)})`).all(),
    total,
    offset,
    limit,
    rows,
  };
}

async function insertRow(ctx, table) {
  const { req, res, db, send, fail, readJson, audit, user } = ctx;
  const body = await readJson(req);
  if (body.confirm !== true) fail(400, "Confirm the insert");
  const info = columns(db, table);
  const allowed = new Set(info.map((col) => col.name).filter((name) => !SECRET.has(name)));
  const keys = Object.keys(body.values || {}).filter((key) => allowed.has(key));
  if (!keys.length) fail(400, "Nothing to insert");
  const sql = `INSERT INTO ${quote(table)} (${keys.map(quote).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
  const result = db.prepare(sql).run(...keys.map((key) => String(body.values[key] ?? "").slice(0, 200_000)));
  audit(user, "db_insert", null, table);
  send(res, 201, { rowid: Number(result.lastInsertRowid) });
}

async function updateRow(ctx, table) {
  const { req, res, db, send, fail, readJson, audit, user } = ctx;
  const body = await readJson(req);
  if (body.confirm !== true) fail(400, "Confirm the edit");
  const rowid = Number(body.rowid);
  if (!Number.isInteger(rowid) || rowid < 1) fail(400, "Missing row");
  const info = columns(db, table);
  const allowed = new Set(info.map((col) => col.name).filter((name) => !SECRET.has(name)));
  const keys = Object.keys(body.values || {}).filter((key) => allowed.has(key) && body.values[key] !== "••••");
  if (!keys.length) fail(400, "Nothing to update");
  const sql = `UPDATE ${quote(table)} SET ${keys.map((key) => `${quote(key)} = ?`).join(", ")} WHERE rowid = ?`;
  const result = db.prepare(sql).run(...keys.map((key) => String(body.values[key] ?? "").slice(0, 200_000)), rowid);
  if (!result.changes) fail(404, "Row not found");
  audit(user, "db_update", null, `${table} ${rowid}`);
  send(res, 200, { ok: true });
}

async function deleteRow(ctx, table) {
  const { req, res, db, send, fail, readJson, audit, user } = ctx;
  const body = await readJson(req);
  if (body.confirm !== true) fail(400, "Confirm the delete");
  const rowid = Number(body.rowid);
  if (!Number.isInteger(rowid) || rowid < 1) fail(400, "Missing row");
  const result = db.prepare(`DELETE FROM ${quote(table)} WHERE rowid = ?`).run(rowid);
  if (!result.changes) fail(404, "Row not found");
  audit(user, "db_delete", null, `${table} ${rowid}`);
  send(res, 200, { ok: true });
}

function exportTable(res, db, table, url) {
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const rows = db.prepare(`SELECT rowid AS _rowid, * FROM ${quote(table)} ORDER BY rowid LIMIT 1000`).all().map((row) => maskRow(table, row));
  if (format === "json") {
    const body = JSON.stringify({ table, rows }, null, 2);
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${table}.json"`,
    });
    res.end(body);
    return;
  }
  const headers = rows[0] ? Object.keys(rows[0]) : ["_rowid"];
  const csv = [headers.join(",")].concat(rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))).join("\n");
  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${table}.csv"`,
  });
  res.end(csv);
}

async function runQuery(ctx) {
  const { req, res, db, send, fail, readJson, audit, user } = ctx;
  const body = await readJson(req);
  const parts = String(body.sql || "").split(";").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 1) fail(400, "Send one statement");
  const sql = parts[0];
  if (sql.length > 4_000 || BLOCKED.test(sql)) fail(400, "That statement is not allowed");
  const writing = WRITE.test(sql);
  if (writing && body.confirm !== true) fail(400, "Confirm that this statement should change data");
  if (writing) {
    db.exec(sql);
    audit(user, "db_query", null, sql.slice(0, 160));
    return send(res, 200, { ok: true });
  }
  if (!/^(select|with|explain)\b/i.test(sql)) fail(400, "Only a SELECT can run without confirmation");
  const rows = db.prepare(sql).all().slice(0, 200).map((row) => maskRow("", row));
  audit(user, "db_query", null, sql.slice(0, 160));
  send(res, 200, { rows });
}

function quote(name) {
  if (!NAME.test(name)) throw Object.assign(new Error("Bad name"), { status: 400, publicMessage: "Bad name" });
  return `"${name}"`;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}
