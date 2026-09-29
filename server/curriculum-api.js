import { courseName, getModule, isCourse, moduleDetail, outline, suggestCourse } from "./curriculum.js";

const LEVELS = new Set(["practiced", "mastered"]);

export async function curriculumRoute(ctx, path) {
  const { req } = ctx;
  if (path === "/api/curriculum" && req.method === "GET") return listCurriculum(ctx);
  const detail = path.match(/^\/api\/curriculum\/([a-z0-9-]+)$/);
  if (detail && req.method === "GET") return curriculumDetail(ctx, detail[1]);
  const pathway = path.match(/^\/api\/folders\/(\d+)\/pathway$/);
  if (pathway && req.method === "GET") return studentPathway(ctx, Number(pathway[1]));
  const courses = path.match(/^\/api\/folders\/(\d+)\/courses$/);
  if (courses && req.method === "POST") return assignCourses(ctx, Number(courses[1]));
  const guide = path.match(/^\/api\/projects\/(\d+)\/guide$/);
  if (guide && req.method === "GET") return projectGuide(ctx, Number(guide[1]));
  const link = path.match(/^\/api\/projects\/(\d+)\/modules$/);
  if (link && req.method === "POST") return linkModule(ctx, Number(link[1]));
  const unlink = path.match(/^\/api\/projects\/(\d+)\/modules\/([a-z0-9-]+)$/);
  if (unlink && req.method === "DELETE") return unlinkModule(ctx, Number(unlink[1]), unlink[2]);
  return false;
}

export function parseSkills(db, studentId, raw, fail) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail(400, "Skills must be a list");
  if (raw.length > 12) fail(400, "Too many skills on one report");
  const enrolled = new Set(enrolledCourses(db, studentId));
  const seen = new Set();
  return raw.map((item) => {
    const moduleId = String(item?.moduleId || "");
    const course = String(item?.course || "");
    const level = String(item?.level || "");
    const mod = getModule(moduleId);
    if (!mod) fail(400, "Unknown module");
    if (!isCourse(course) || !enrolled.has(course)) fail(400, "That course is not assigned");
    if (!LEVELS.has(level)) fail(400, "A skill is practiced or mastered");
    const key = `${course}:${moduleId}`;
    if (seen.has(key)) fail(400, "That skill is listed twice");
    seen.add(key);
    const project = projectSnap(db, studentId, item?.projectId, fail);
    return {
      moduleId,
      course,
      level,
      projectId: project.id,
      projectTitle: project.title,
      githubUrl: project.url,
    };
  });
}

export function insertSkills(db, reportId, studentId, skills) {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO skill_marks (
      report_id, student_id, module_id, course, level, project_id, project_title, github_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const skill of skills) {
    insert.run(
      reportId,
      studentId,
      skill.moduleId,
      skill.course,
      skill.level,
      skill.projectId,
      skill.projectTitle,
      skill.githubUrl,
      now,
    );
  }
}

export function skillsForReports(db, reportIds) {
  const grouped = new Map();
  if (!reportIds.length) return grouped;
  const marks = reportIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT report_id, module_id, course, level, project_id, project_title, github_url
     FROM skill_marks WHERE report_id IN (${marks}) ORDER BY id`,
  ).all(...reportIds);
  for (const row of rows) {
    const list = grouped.get(row.report_id) || [];
    list.push(publicSkill(row));
    grouped.set(row.report_id, list);
  }
  return grouped;
}

function listCurriculum(ctx) {
  const { res, send } = ctx;
  staffOnly(ctx);
  send(res, 200, { courses: ["python", "java", "c"].map((id) => ({ id, name: courseName(id) })), units: outline() });
  return true;
}

function curriculumDetail(ctx, moduleId) {
  const { res, send, fail } = ctx;
  staffOnly(ctx);
  const detail = moduleDetail(moduleId);
  if (!detail) fail(404, "Module not found");
  send(res, 200, detail);
  return true;
}

function studentPathway(ctx, studentId) {
  const { db, res, send } = ctx;
  const student = studentForStaff(ctx, studentId);
  send(res, 200, pathwayOf(db, student.id));
  return true;
}

async function assignCourses(ctx, studentId) {
  const { db, req, res, user, send, readJson, audit } = ctx;
  const student = studentForStaff(ctx, studentId);
  const body = await readJson(req);
  const courses = [...new Set((Array.isArray(body.courses) ? body.courses : []).map(String))];
  if (courses.some((course) => !isCourse(course))) ctx.fail(400, "Unknown course");
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM enrollments WHERE user_id = ?").run(student.id);
    const insert = db.prepare(
      "INSERT INTO enrollments (user_id, course, assigned_by, created_at) VALUES (?, ?, ?, ?)",
    );
    for (const course of courses) insert.run(student.id, course, user.id, now);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  audit(user, "assign_courses", null, `${student.id}:${courses.join(",")}`);
  send(res, 200, { courses });
  return true;
}

function projectGuide(ctx, projectId) {
  const { db, res, send } = ctx;
  const project = studentProject(ctx, projectId);
  const files = db.prepare("SELECT path FROM files WHERE project_id = ?").all(project.id);
  send(res, 200, {
    projectId: project.id,
    ownerId: project.owner_id,
    suggested: suggestCourse(files.map((file) => file.path)),
    enrollments: enrolledCourses(db, project.owner_id),
    linked: linksForProject(db, project.id),
    units: outline(),
  });
  return true;
}

async function linkModule(ctx, projectId) {
  const { db, req, res, user, send, readJson, audit } = ctx;
  const project = studentProject(ctx, projectId);
  const body = await readJson(req);
  const moduleId = String(body.moduleId || "");
  const course = String(body.course || "");
  if (!getModule(moduleId)) ctx.fail(400, "Unknown module");
  if (!enrolledCourses(db, project.owner_id).includes(course)) ctx.fail(400, "Assign that course first");
  db.prepare(
    `INSERT INTO project_modules (project_id, module_id, course, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, module_id, course) DO NOTHING`,
  ).run(project.id, moduleId, course, new Date().toISOString());
  audit(user, "link_module", project.id, `${course}:${moduleId}`);
  send(res, 200, { linked: linksForProject(db, project.id) });
  return true;
}

function unlinkModule(ctx, projectId, moduleId) {
  const { db, req, res, user, send, audit } = ctx;
  const project = studentProject(ctx, projectId);
  const course = new URL(req.url, "http://localhost").searchParams.get("course") || "";
  if (!isCourse(course)) ctx.fail(400, "Unknown course");
  db.prepare("DELETE FROM project_modules WHERE project_id = ? AND module_id = ? AND course = ?").run(
    project.id,
    moduleId,
    course,
  );
  audit(user, "unlink_module", project.id, `${course}:${moduleId}`);
  send(res, 200, { linked: linksForProject(db, project.id) });
  return true;
}

function staffOnly(ctx) {
  if (!ctx.user || ctx.user.role === "student") ctx.fail(403, "Students cannot open the curriculum");
}

function studentForStaff(ctx, studentId) {
  staffOnly(ctx);
  const student = ctx.db.prepare("SELECT id, role FROM users WHERE id = ?").get(studentId);
  if (!student || student.role !== "student") ctx.fail(404, "Student not found");
  const { canViewProfile } = ctx;
  if (!canViewProfile(ctx.db, ctx.user, studentId)) ctx.fail(403, "You cannot open that pathway");
  return student;
}

function studentProject(ctx, projectId) {
  staffOnly(ctx);
  const project = ctx.db.prepare(
    `SELECT p.*, u.role AS owner_role FROM projects p
     JOIN users u ON u.id = p.owner_id
     WHERE p.id = ?`,
  ).get(projectId);
  if (!project || project.owner_role !== "student") ctx.fail(404, "That project has no teaching guide");
  if (!ctx.canAccessProject(ctx.db, ctx.user, project)) ctx.fail(403, "You cannot open that guide");
  return project;
}

function enrolledCourses(db, studentId) {
  return db.prepare("SELECT course FROM enrollments WHERE user_id = ? ORDER BY course").all(studentId).map((row) => row.course);
}

function linksForProject(db, projectId) {
  return db.prepare(
    "SELECT module_id, course FROM project_modules WHERE project_id = ? ORDER BY course, module_id",
  ).all(projectId).map((row) => ({
    moduleId: row.module_id,
    course: row.course,
    title: getModule(row.module_id)?.title || row.module_id,
  }));
}

function pathwayOf(db, studentId) {
  const courses = enrolledCourses(db, studentId);
  const marks = db.prepare(
    `SELECT module_id, course, level, project_id, project_title, github_url
     FROM skill_marks WHERE student_id = ? ORDER BY id DESC`,
  ).all(studentId);
  const latest = new Map();
  const markedProjects = new Map();
  for (const mark of marks) {
    const key = `${mark.course}:${mark.module_id}`;
    if (!latest.has(key)) latest.set(key, mark.level);
    if (!mark.project_title && !mark.github_url && !mark.project_id) continue;
    const list = markedProjects.get(key) || [];
    list.push(projectRef(mark.project_id, mark.project_title, mark.github_url));
    markedProjects.set(key, list);
  }
  const links = db.prepare(
    `SELECT m.module_id, m.course, p.id AS project_id, p.title, p.github_url
     FROM project_modules m
     JOIN projects p ON p.id = m.project_id
     WHERE p.owner_id = ?`,
  ).all(studentId);
  const linked = new Map();
  for (const link of links) {
    const key = `${link.course}:${link.module_id}`;
    const list = linked.get(key) || [];
    list.push(projectRef(link.project_id, link.title, link.github_url));
    linked.set(key, list);
  }
  return {
    courses,
    pathways: courses.map((course) => ({
      course,
      name: courseName(course),
      units: outline().map((unit) => ({
        number: unit.number,
        title: unit.title,
        modules: unit.modules.map((mod) => {
          const key = `${course}:${mod.id}`;
          const status = latest.get(key) || (linked.has(key) ? "linked" : "none");
          return {
            id: mod.id,
            title: mod.title,
            focus: mod.focus || "",
            status,
            projects: dedupeProjects([...(linked.get(key) || []), ...(markedProjects.get(key) || [])]),
          };
        }),
      })),
    })),
  };
}

function projectRef(id, title, url) {
  return { id: id || null, title: title || "Project", url: url || "" };
}

function dedupeProjects(projects) {
  const seen = new Set();
  const out = [];
  for (const project of projects) {
    const key = project.id ? `id:${project.id}` : `${project.title}:${project.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(project);
  }
  return out;
}

function projectSnap(db, studentId, projectId, fail) {
  if (projectId == null || projectId === "") return { id: null, title: "", url: "" };
  const id = Number(projectId);
  const project = db.prepare("SELECT id, title, github_url, owner_id FROM projects WHERE id = ?").get(id);
  if (!project || project.owner_id !== studentId) fail(400, "That project is not this student's");
  return { id: project.id, title: project.title, url: project.github_url || "" };
}

function publicSkill(row) {
  return {
    moduleId: row.module_id,
    moduleTitle: getModule(row.module_id)?.title || row.module_id,
    course: row.course,
    level: row.level,
    projectId: row.project_id || null,
    projectTitle: row.project_title || "",
    githubUrl: row.github_url || "",
  };
}
