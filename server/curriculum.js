import { MODULES } from "./curriculum-bank.js";

export const COURSES = [
  { id: "python", name: "Python" },
  { id: "java", name: "Java" },
  { id: "c", name: "C" },
];

const ORDER = COURSES.map((course) => course.id);
const byId = new Map(MODULES.map((mod) => [mod.id, mod]));

export function courseName(id) {
  return COURSES.find((course) => course.id === id)?.name || id;
}

export function isCourse(id) {
  return ORDER.includes(id);
}

export function getModule(id) {
  return byId.get(id) || null;
}

export function outline() {
  const units = [];
  for (const mod of MODULES) {
    let unit = units.find((item) => item.number === mod.unit);
    if (!unit) {
      unit = { number: mod.unit, title: mod.unitTitle, modules: [] };
      units.push(unit);
    }
    unit.modules.push({ id: mod.id, title: mod.title, focus: mod.focus || "" });
  }
  return units;
}

export function moduleDetail(moduleId) {
  const mod = getModule(moduleId);
  if (!mod) return null;
  return {
    id: mod.id,
    unit: mod.unit,
    unitTitle: mod.unitTitle,
    title: mod.title,
    focus: mod.focus || "",
    teach: mod.teach,
    code: mod.code,
  };
}

export function suggestCourse(paths) {
  const names = (paths || []).map((path) => String(path).toLowerCase());
  if (names.some((path) => path.endsWith(".py"))) return "python";
  if (names.some((path) => path.endsWith(".java"))) return "java";
  if (names.some((path) => path.endsWith(".c") || path.endsWith(".h"))) return "c";
  return "";
}

function assertCatalog() {
  const ids = MODULES.map((mod) => mod.id);
  const dup = ids.filter((id, index) => ids.indexOf(id) !== index);
  const bad = MODULES.filter((mod) => {
    const teach = mod.teach || {};
    return !teach.goal || !Array.isArray(teach.steps) || !teach.steps.length
      || !mod.code?.python || !mod.code?.java || !mod.code?.c;
  }).map((mod) => mod.id);
  if (dup.length || bad.length || MODULES.length !== 87) {
    throw new Error(`curriculum catalog invalid count=${MODULES.length} dup=${dup.join(",")} bad=${bad.join(",")}`);
  }
}

assertCatalog();
