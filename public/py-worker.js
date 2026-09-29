let pyodidePromise = null;
let runId = "";
let cancelled = false;

function loadPyodide() {
  if (!pyodidePromise) {
    self.postMessage({ type: "loading" });
    pyodidePromise = import("https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.mjs").then((mod) =>
      mod.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/" }),
    );
  }
  return pyodidePromise;
}

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

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }
  if (msg.type !== "run") return;
  cancelled = false;
  runId = msg.runId;
  const decoder = new TextDecoder();
  try {
    const pyodide = await loadPyodide();
    if (cancelled) return;
    self.postMessage({ type: "ready" });
    const emit = (kind, text) => {
      if (text) self.postMessage({ type: "out", kind, text });
    };
    pyodide.setStdout({
      write(buffer) {
        emit("", decoder.decode(buffer, { stream: true }));
        return buffer.length;
      },
      isatty: true,
    });
    pyodide.setStderr({
      write(buffer) {
        emit("err", decoder.decode(buffer, { stream: true }));
        return buffer.length;
      },
    });
    pyodide.setStdin({
      stdin() {
        self.postMessage({ type: "stdin" });
        return readLine();
      },
      autoEOF: false,
    });
    await pyodide.runPythonAsync(`import sys\nsys.argv = ${JSON.stringify(msg.argv || ["python"])}`);
    await pyodide.runPythonAsync(msg.code || "");
    if (!cancelled) self.postMessage({ type: "done" });
  } catch (err) {
    if (cancelled) return;
    self.postMessage({ type: "error", text: err?.message || String(err) });
  }
};
