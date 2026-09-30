import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { isHiddenFile } from "./templates.js";

const jobs = new Map();
const MAX_JOBS = 2;
const MAX_OUT = 200_000;
const HELPER = process.env.TF_SANDBOX_BIN || "/usr/local/lib/teachforth/tf-sandbox";
const JOB_ROOT = process.env.TF_JOB_ROOT || "/var/lib/teachforth-run/jobs";
const EXEC = new URL("./tf-exec.py", import.meta.url).pathname;

const REPL = `import traceback
while True:
    try:
        line = input(">>> ")
    except EOFError:
        break
    if line.strip() in ("exit", "exit()", "quit", "quit()"):
        break
    try:
        exec(compile(line, "<stdin>", "single"))
    except Exception:
        traceback.print_exc()
`;

export function planSteps(kind, file, content = "") {
  const path = String(file || "");
  if (kind === "python") {
    if (!path) return { steps: [["python3", "-u", "repl.py"]], repl: true };
    return { steps: [["python3", "-u", path]] };
  }
  if (kind === "node") return { steps: [["node", path]] };
  if (kind === "java") {
    const limits = ["-Xmx128m", "-XX:CompressedClassSpaceSize=64m", "-XX:ReservedCodeCacheSize=48m", "-XX:MaxMetaspaceSize=96m"];
    return {
      steps: [
        ["javac", ...limits.map((flag) => `-J${flag}`), "-encoding", "UTF-8", "-d", ".", path],
        ["java", ...limits, "-cp", ".", javaClass(content, path)],
      ],
    };
  }
  if (kind === "c" || kind === "cpp") {
    const cpp = kind === "cpp" || /\.(cpp|cc|cxx)$/.test(path);
    return {
      steps: [
        [cpp ? "g++" : "gcc", cpp ? "-std=c++17" : "-std=c11", "-o", "prog", path],
        ["./prog"],
      ],
    };
  }
  return null;
}

export function runnableFiles(files) {
  return (files || []).filter((file) => file?.path && !isHiddenFile(file.path) && !file.hidden);
}

export function startSandbox({ userId, files, steps }) {
  if (!steps?.length) fail(400, "Nothing to run");
  if (jobs.size >= MAX_JOBS) fail(429, "Too many programs are running. Stop one and try again.");
  const helper = existsSync(HELPER);
  if (!helper && process.getuid?.() !== 0) fail(503, "The language sandbox is not installed on this server");
  const id = randomBytes(16).toString("hex");
  const root = helper ? JOB_ROOT : join(tmpdir(), "tf-jobs");
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const file of runnableFiles(files)) writeProjectFile(dir, file.path, file.content);
  if (steps.some((step) => step.includes("repl.py"))) writeProjectFile(dir, "repl.py", REPL);
  writeFileSync(join(dir, "run.json"), JSON.stringify({ steps }), { mode: 0o600 });
  const child = helper
    ? spawn("sudo", ["-n", HELPER, id], { stdio: ["pipe", "pipe", "pipe"] })
    : spawn("unshare", ["--net", "--", "python3", EXEC, dir], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin", HOME: dir, LANG: "C.UTF-8", TMPDIR: dir, PYTHONDONTWRITEBYTECODE: "1" },
    });
  const job = { userId, child, dir, helper, text: "", done: false, exit: null, timer: null };
  jobs.set(id, job);
  const take = (buf, kind) => append(job, buf.toString("utf8"), kind);
  child.stdout.on("data", (buf) => take(buf, ""));
  child.stderr.on("data", (buf) => take(buf, "err"));
  child.on("error", (err) => {
    append(job, `${err.code === "ENOENT" ? "The language sandbox is not installed on this server" : "Could not start the program"}\n`, "err");
    finish(id, 1);
  });
  child.on("exit", (code) => finish(id, code ?? 1));
  job.timer = setTimeout(() => stopSandbox(id, userId), 8 * 60 * 1000);
  job.timer.unref?.();
  return id;
}

export function readSandbox(id, userId, offset) {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return null;
  const from = Math.max(0, Number(offset) || 0);
  return {
    text: job.text.slice(from),
    offset: job.text.length,
    done: job.done,
    exit: job.exit,
  };
}

export function writeSandboxStdin(id, userId, line) {
  const job = jobs.get(id);
  if (!job || job.userId !== userId || job.done || !job.child.stdin?.writable) return false;
  job.child.stdin.write(`${String(line ?? "").replace(/\r?\n$/, "").slice(0, 8000)}\n`);
  return true;
}

export function stopSandbox(id, userId) {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return false;
  if (job.helper) spawn("sudo", ["-n", HELPER, "--stop", id], { stdio: "ignore" }).unref?.();
  job.child.kill("SIGTERM");
  return true;
}

function finish(id, code) {
  const job = jobs.get(id);
  if (!job || job.done) return;
  job.done = true;
  job.exit = code;
  clearTimeout(job.timer);
  setTimeout(() => {
    rmSync(job.dir, { recursive: true, force: true });
    jobs.delete(id);
  }, 60_000).unref?.();
}

function append(job, text, kind) {
  const body = kind === "err" && text && !text.startsWith("sandbox ") ? text : text;
  job.text = `${job.text}${body}`.slice(-MAX_OUT);
}

function writeProjectFile(dir, path, content) {
  const clean = String(path || "");
  if (!/^[\w./-]{1,120}$/.test(clean) || clean.includes("..") || clean.startsWith("/")) return;
  const dest = normalize(join(dir, clean));
  if (dest !== dir && !dest.startsWith(`${dir}/`)) return;
  mkdirSync(dirnameSafe(dest), { recursive: true });
  writeFileSync(dest, String(content ?? "").slice(0, 200_000));
}

function dirnameSafe(file) {
  const slash = file.lastIndexOf("/");
  return slash > 0 ? file.slice(0, slash) : ".";
}

function javaClass(content, path) {
  const source = String(content || "");
  const pkg = source.match(/^\s*package\s+([A-Za-z_][\w.]*)\s*;/m);
  const named = source.match(/public\s+class\s+([A-Za-z_]\w*)/);
  const simple = named?.[1] || path.split("/").pop().replace(/\.java$/, "") || "Main";
  if (!/^[A-Za-z_][\w.]*$/.test(simple)) return "Main";
  return pkg ? `${pkg[1]}.${simple}` : simple;
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  throw err;
}
