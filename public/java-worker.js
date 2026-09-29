import { runJava } from "./java-lang.js";

let runId = "";
let cancelled = false;

function readLine() {
  let misses = 0;
  while (!cancelled && misses < 3) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `/api/runtime/stdin?run=${encodeURIComponent(runId)}`, false);
      xhr.timeout = 25_000;
      xhr.send();
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText || "{}");
        if (data.eof) return null;
        return String(data.line ?? "");
      }
      if (xhr.status === 204) continue;
      misses += 1;
    } catch {
      misses += 1;
    }
  }
  return null;
}

self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }
  if (msg.type !== "run") return;
  cancelled = false;
  runId = msg.runId;
  try {
    runJava(msg.code || "", {
      print(text) {
        if (text) self.postMessage({ type: "out", text });
      },
      readLine() {
        self.postMessage({ type: "stdin" });
        const line = readLine();
        if (line == null) return null;
        return line.endsWith("\n") ? line.slice(0, -1) : line;
      },
    });
    if (!cancelled) self.postMessage({ type: "done" });
  } catch (err) {
    if (cancelled) return;
    self.postMessage({ type: "error", text: err?.message || String(err) });
  }
};
