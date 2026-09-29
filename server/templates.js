export const TEMPLATES = ["web", "python", "javascript", "java", "c", "cpp", "markdown", "empty"];

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
  if (key === "java") {
    return {
      "Main.java": "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello from TeachForth\");\n    }\n}\n",
    };
  }
  if (key === "c") return { "main.c": "#include <stdio.h>\n\nint main() {\n    printf(\"Hello from TeachForth\\n\");\n    return 0;\n}\n" };
  if (key === "cpp") {
    return {
      "main.cpp": "#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello from TeachForth\" << endl;\n    return 0;\n}\n",
    };
  }
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
