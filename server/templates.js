export const TEMPLATES = ["web", "python", "javascript", "markdown", "empty"];

export function normalizeTemplate(value) {
  const key = String(value || "web");
  return TEMPLATES.includes(key) ? key : "web";
}

export function projectLanguage(template) {
  return normalizeTemplate(template) === "python" ? "python" : "web";
}

export function starterEntries(template) {
  const key = normalizeTemplate(template);
  if (key === "python") return { "main.py": "print(\"Hello from TeachForth\")\n" };
  if (key === "javascript") return { "main.js": "console.log(\"Hello from TeachForth\");\n" };
  if (key === "markdown") return { "notes.md": "# Notes\n\nWrite here.\n" };
  if (key === "empty") return {};
  return {
    "index.html": "<!DOCTYPE html>\n<html>\n<head><meta charset=\"utf-8\"><title>My page</title></head>\n<body>\n  <h1>Hello</h1>\n</body>\n</html>\n",
    "style.css": "body { font-family: sans-serif; margin: 32px; }\n",
    "script.js": "console.log(\"Hello from TeachForth\");\n",
  };
}

export function starterList(template) {
  return Object.entries(starterEntries(template)).map(([path, content]) => ({ path, content }));
}

export function isHiddenFile(path) {
  return String(path || "") === ".teachforth" || String(path || "").endsWith("/.teachforth");
}
