import JSCPP from "/vendor/jscpp.js";

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
  let stdin = "";
  let shown = "";
  while (!cancelled) {
    let out = "";
    try {
      JSCPP.run(msg.code || "", stdin, {
        stdio: {
          write(text) { out += String(text); },
        },
      });
      const fresh = out.startsWith(shown) ? out.slice(shown.length) : out;
      if (fresh) self.postMessage({ type: "out", text: fresh });
      self.postMessage({ type: "done" });
      return;
    } catch (err) {
      const fresh = out.startsWith(shown) ? out.slice(shown.length) : out;
      shown = out;
      if (fresh) self.postMessage({ type: "out", text: fresh });
      if (!String(err?.message || err).includes("TEACHFORTH_NEED_INPUT")) {
        self.postMessage({ type: "error", text: String(err?.message || err) });
        return;
      }
      self.postMessage({ type: "stdin" });
      const line = readLine();
      if (line == null || cancelled) {
        self.postMessage({ type: "done" });
        return;
      }
      stdin += line.endsWith("\n") ? line : `${line}\n`;
    }
  }
};
