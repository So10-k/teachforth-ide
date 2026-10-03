import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const PASSWORD_FILE = join(DATA, "power-password.txt");
const STATE_FILE = join(DATA, "power-state.json");
const KEY = join(ROOT, "deploy/keys/teachforth-ide");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8791);
const BASE = process.env.BASE || "";
const RG = process.env.RG || "teachforth-ide";
const VM = process.env.VM || "teachforth-ide";
const AZ = process.env.AZ || "/usr/bin/az";
const MIN_MINUTES = 15;
const MAX_MINUTES = 360;
const SECRET = randomBytes(32);

mkdirSync(DATA, { recursive: true });
const password = loadPassword();
const sessions = new Map();
const loginFails = new Map();
let busy = null;
let state = loadState();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const path = stripBase(url.pathname);
    if (path.startsWith("/api/internal/")) return internalRoute(req, res, path);
    if (path === "/api/class-stop" && req.method === "POST") return classStop(req, res);
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      return page(res);
    }
    if (req.method !== "POST" && !(req.method === "GET" && path === "/api/status")) {
      return send(res, 404, { error: "Not found" });
    }
    if (req.method !== "GET") assertSameOrigin(req);
    if (path === "/api/login" && req.method === "POST") return login(req, res);
    if (path === "/api/logout" && req.method === "POST") return logout(req, res);
    if (!user(req)) return send(res, 401, { error: "Sign in" });
    if (path === "/api/status" && req.method === "GET") return send(res, 200, await publicState());
    if (path === "/api/start" && req.method === "POST") return start(req, res);
    if (path === "/api/stop" && req.method === "POST") return stop(req, res);
    send(res, 404, { error: "Not found" });
  } catch (err) {
    const status = err.status || 500;
    send(res, status, { error: err.publicMessage || "Something went wrong" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TeachForth power on http://${HOST}:${PORT}${BASE || "/"}`);
});

tick();
setInterval(tick, 20_000);
disableDailySchedules();

function loadPassword() {
  if (!existsSync(PASSWORD_FILE)) {
    const created = randomBytes(9).toString("base64url");
    writeFileSync(PASSWORD_FILE, created + "\n", { mode: 0o600 });
  }
  return readFileSync(PASSWORD_FILE, "utf8").trim();
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { phase: "off", deadline: null, ip: null, error: "" };
  }
}

function save() {
  writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 });
}

function stripBase(pathname) {
  if (BASE && pathname.startsWith(BASE)) return pathname.slice(BASE.length) || "/";
  return pathname;
}

async function login(req, res) {
  const ip = req.socket.remoteAddress || "local";
  const fails = loginFails.get(ip) || { n: 0, at: 0 };
  if (fails.n >= 8 && Date.now() - fails.at < 15 * 60_000) {
    return send(res, 429, { error: "Too many tries. Wait 15 minutes." });
  }
  const body = await readJson(req);
  const given = String(body.password || "");
  const a = scryptSync(given, "teachforth-power", 32);
  const b = scryptSync(password, "teachforth-power", 32);
  if (given.length === 0 || !timingSafeEqual(a, b)) {
    loginFails.set(ip, { n: fails.n + 1, at: Date.now() });
    return send(res, 401, { error: "Wrong password" });
  }
  loginFails.delete(ip);
  const token = randomBytes(24).toString("base64url");
  sessions.set(token, Date.now() + 12 * 60 * 60_000);
  const secure = req.headers["x-forwarded-proto"] === "https";
  res.setHeader(
    "Set-Cookie",
    `tf_power=${token}; HttpOnly; Path=${BASE || "/"}; SameSite=Lax; Max-Age=43200${secure ? "; Secure" : ""}`,
  );
  send(res, 200, { ok: true });
}

function logout(req, res) {
  const token = readCookie(req);
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", `tf_power=; HttpOnly; Path=${BASE || "/"}; Max-Age=0`);
  send(res, 200, { ok: true });
}

async function start(req, res) {
  const body = await readJson(req);
  const minutes = Number(body.minutes);
  if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
    return send(res, 400, { error: `Choose ${MIN_MINUTES} to ${MAX_MINUTES} minutes` });
  }
  if (busy) return send(res, 409, { error: "Already working on the VM" });
  state.deadline = new Date(Date.now() + minutes * 60_000).toISOString();
  state.phase = "starting";
  state.error = "";
  save();
  busy = runStart().finally(() => {
    busy = null;
  });
  send(res, 200, await publicState());
}

async function extend(req, res) {
  const body = await readJson(req);
  const minutes = Number(body.minutes);
  if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
    return send(res, 400, { error: `Choose ${MIN_MINUTES} to ${MAX_MINUTES} minutes` });
  }
  const info = await vmInfo();
  if (!info.running) return send(res, 409, { error: "The class server is off" });
  state.deadline = new Date(Date.now() + minutes * 60_000).toISOString();
  state.phase = "on";
  state.error = "";
  save();
  await writeHold(info.ip, state.deadline);
  send(res, 200, await publicState());
}

async function internalRoute(req, res, path) {
  if (!internalOk(req)) return send(res, 401, { error: "Sign in" });
  if (path === "/api/internal/status" && req.method === "GET") return send(res, 200, await publicState());
  if (path === "/api/internal/start" && req.method === "POST") return start(req, res);
  if (path === "/api/internal/stop" && req.method === "POST") return stop(req, res);
  if (path === "/api/internal/extend" && req.method === "POST") return extend(req, res);
  return send(res, 404, { error: "Not found" });
}

function internalOk(req) {
  if (req.headers["x-forwarded-for"]) return false;
  const file = process.env.POWER_INTERNAL_FILE || "/var/lib/teachforth-discord/power-secret";
  if (!existsSync(file)) return false;
  const secret = readFileSync(file, "utf8").trim();
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ") || secret.length < 16) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const owned = Buffer.from(secret);
  return given.length === owned.length && timingSafeEqual(given, owned);
}

async function stop(req, res) {
  if (busy) return send(res, 409, { error: "Already working on the VM" });
  state.deadline = null;
  state.phase = "stopping";
  state.error = "";
  save();
  busy = runStop().finally(() => {
    busy = null;
  });
  send(res, 200, await publicState());
}

async function runStart() {
  try {
    await az(["vm", "start", "--resource-group", RG, "--name", VM], 300_000);
    const info = await vmInfo();
    state.ip = info.ip;
    state.phase = "starting";
    save();
    await waitHealth(info.ip);
    await writeHold(info.ip, state.deadline);
    state.phase = "on";
    state.error = "";
    save();
  } catch (err) {
    state.phase = "off";
    state.error = clean(err);
    save();
  }
}

async function runStop() {
  let flushFailed = false;
  if (state.ip) {
    const flushed = await flushClass(state.ip);
    flushFailed = flushed === "failed";
  }
  try {
    await az(["vm", "deallocate", "--resource-group", RG, "--name", VM], 300_000);
    state.phase = "off";
    state.deadline = null;
    state.error = flushFailed ? "Open projects may not have saved before the stop." : "";
    save();
  } catch (err) {
    const text = clean(err);
    if (/already deallocated|was not found|PowerState\/deallocated/i.test(text)) {
      state.phase = "off";
      state.deadline = null;
      state.error = flushFailed ? "Open projects may not have saved before the stop." : "";
    } else {
      state.error = text;
    }
    save();
  }
}

function flushClass(ip) {
  if (!ip || !existsSync(KEY)) return Promise.resolve("skipped");
  const remote = "curl -fsS -m 90 -X POST http://127.0.0.1:8080/api/internal/flush";
  return new Promise((resolve) => {
    execFile(
      "ssh",
      ["-i", KEY, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=8", `azureuser@${ip}`, remote],
      { timeout: 100_000 },
      (err) => resolve(err ? "failed" : "ok"),
    );
  });
}

const classStopHits = [];

function classStopAuth(req) {
  const file = process.env.CLASS_STOP_FILE || "/var/lib/teachforth-power/class-stop";
  if (!existsSync(file)) return false;
  const secret = readFileSync(file, "utf8").trim();
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ") || secret.length < 16) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const owned = Buffer.from(secret);
  if (given.length !== owned.length || !timingSafeEqual(given, owned)) return false;
  const now = Date.now();
  while (classStopHits.length && now - classStopHits[0] > 10 * 60 * 1000) classStopHits.shift();
  if (classStopHits.length >= 3) return "limited";
  classStopHits.push(now);
  return true;
}

async function classStop(req, res) {
  const auth = classStopAuth(req);
  if (auth === "limited") return send(res, 429, { error: "Wait a few minutes" });
  if (!auth) return send(res, 401, { error: "Sign in" });
  return stop(req, res);
}

async function tick() {
  try {
    if (busy) return;
    const info = await vmInfo();
    if (info.ip) state.ip = info.ip;
    const due = state.deadline && Date.parse(state.deadline) <= Date.now();
    if (due && info.running) {
      state.phase = "stopping";
      save();
      busy = runStop().finally(() => {
        busy = null;
      });
      return;
    }
    if (!busy && state.phase === "on" && !info.running) state.phase = "off";
    if (!busy && state.phase === "off" && info.running && !state.deadline) {
      state.phase = "on";
      state.error = "The VM is on with no timer. It will keep billing until you turn it off.";
    }
    save();
  } catch (err) {
    state.error = clean(err);
    save();
  }
}

async function vmInfo() {
  const raw = await az([
    "vm", "show", "-d", "-g", RG, "-n", VM,
    "--query", "{power:powerState, ip:publicIps}",
    "-o", "json",
  ]);
  const parsed = JSON.parse(raw);
  return {
    ip: parsed.ip || null,
    running: parsed.power === "VM running",
    power: parsed.power || "unknown",
  };
}

async function waitHealth(ip) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await health(ip)) return;
    await sleep(5_000);
  }
  throw new Error("VM started, but the IDE did not answer on port 80");
}

function health(ip) {
  return new Promise((resolve) => {
    execFile("curl", ["-fsS", "-m", "8", `http://${ip}/api/health`], (err) => resolve(!err));
  });
}

function writeHold(ip, deadline) {
  if (!deadline || !existsSync(KEY)) return Promise.resolve();
  const remote = `echo ${deadline} | sudo tee /var/lib/teachforth-ide/manual-hold >/dev/null`;
  return new Promise((resolve) => {
    execFile(
      "ssh",
      ["-i", KEY, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10", `azureuser@${ip}`, remote],
      { timeout: 30_000 },
      () => resolve(),
    );
  });
}

async function disableDailySchedules() {
  try {
    const id = (await az([
      "automation", "account", "show", "-g", RG, "-n", `${VM}-auto`, "--query", "id", "-o", "tsv",
    ])).trim();
    for (const name of ["morning-start", "nightly-stop"]) {
      await az([
        "rest", "--method", "patch",
        "--url", `${id}/schedules/${name}?api-version=2023-11-01`,
        "--body", JSON.stringify({ properties: { isEnabled: false } }),
      ]).catch(() => {});
    }
  } catch {
    // The panel still deallocates on its own timer if Automation is missing.
  }
}

function az(args, timeout = 60_000) {
  return new Promise((resolve, reject) => {
    execFile(AZ, args, { timeout, env: { ...process.env, HOME: "/root" } }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      } else resolve(stdout);
    });
  });
}

async function publicState() {
  return {
    phase: state.phase,
    deadline: state.deadline,
    ip: state.ip,
    url: state.phase === "on" && state.ip ? "https://74-248-20-108.sslip.io" : null,
    error: state.error || "",
    busy: Boolean(busy),
  };
}

function user(req) {
  const token = readCookie(req);
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function readCookie(req) {
  const raw = req.headers.cookie || "";
  const hit = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith("tf_power="));
  return hit ? hit.slice("tf_power=".length) : "";
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    fail(403, "Bad origin");
  }
  if (host !== req.headers.host) fail(403, "Bad origin");
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 20_000) {
        reject(Object.assign(new Error("too big"), { status: 413, publicMessage: "Too big" }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("bad json"), { status: 400, publicMessage: "Bad JSON" }));
      }
    });
  });
}

function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

function page(res) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(HTML.replaceAll("__BASE__", BASE));
}

function clean(err) {
  return String(err.stderr || err.message || err).replace(/\s+/g, " ").slice(0, 280);
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status, publicMessage: message });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TeachForth power</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Source Sans 3", sans-serif; background: #fbf7fc; color: #1c1620; }
    main { max-width: 520px; margin: 48px auto; padding: 0 20px 48px; }
    h1 { font-family: Poppins, sans-serif; color: #a334cb; font-size: 32px; margin: 0 0 8px; }
    p { line-height: 1.45; }
    .card { background: white; border: 1px solid #f0e4f4; border-radius: 16px; padding: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; box-sizing: border-box; border: 1px solid #e4d5ea; border-radius: 10px; padding: 12px; font: inherit; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
    button { font: inherit; font-weight: 600; border: 0; border-radius: 999px; padding: 10px 16px; background: #a334cb; color: white; cursor: pointer; }
    button.ghost { background: white; color: #a334cb; border: 1px solid #a334cb; }
    button:disabled { opacity: 0.55; cursor: wait; }
    a { color: #a334cb; font-weight: 600; }
    .err { color: #9b1c4a; }
    .muted { color: #6d6272; }
  </style>
</head>
<body>
  <main>
    <h1>TeachForth power</h1>
    <p class="muted">Turns the IDE on for a set time, then deallocates it so compute stops billing.</p>
    <div class="card" id="box"></div>
  </main>
  <script>
    const base = "__BASE__";
    const box = document.querySelector("#box");
    let minutes = 90;
    async function api(path, body) {
      const res = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    }
    function when(iso) {
      if (!iso) return "";
      return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    function drawLogin(message) {
      box.innerHTML = '<form id="login"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required><p class="err"></p><button>Unlock</button></form>';
      if (message) box.querySelector(".err").textContent = message;
      box.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        try {
          await api("/api/login", { password: box.querySelector("#pw").value });
          await refresh();
        } catch (err) {
          box.querySelector(".err").textContent = err.message;
        }
      };
    }
    function draw(state) {
      const offAt = state.deadline ? "Off at " + when(state.deadline) + "." : "No timer set.";
      const link = state.url ? '<p><a href="' + state.url + '">Open the IDE</a></p>' : "";
      const err = state.error ? '<p class="err">' + state.error + '</p>' : "";
      box.innerHTML = '<p><strong>' + state.phase + '</strong>. ' + offAt + '</p>' + link + err +
        '<label>Minutes</label><div class="row" id="presets"></div><input id="mins" type="number" min="15" max="360" value="' + minutes + '">' +
        '<div class="row"><button id="on">Turn on</button><button id="off" class="ghost">Turn off now</button></div>' +
        '<p class="muted">15 to 360 minutes. Open the IDE from the link above, not the raw IP.</p>';
      for (const n of [30, 60, 90, 120, 180]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ghost";
        b.textContent = n + "m";
        b.onclick = () => { minutes = n; box.querySelector("#mins").value = n; };
        box.querySelector("#presets").append(b);
      }
      const lock = state.busy || state.phase === "starting" || state.phase === "stopping";
      box.querySelector("#on").disabled = lock;
      box.querySelector("#off").disabled = lock || state.phase === "off";
      box.querySelector("#on").onclick = async () => {
        minutes = Number(box.querySelector("#mins").value);
        try { await refresh(await api("/api/start", { minutes })); }
        catch (err) { state.error = err.message; draw(state); }
      };
      box.querySelector("#off").onclick = async () => {
        try { await refresh(await api("/api/stop", {})); }
        catch (err) { state.error = err.message; draw(state); }
      };
    }
    async function refresh(known) {
      try {
        const state = known || await api("/api/status");
        draw(state);
      } catch (err) {
        if (/sign in/i.test(err.message)) drawLogin();
        else drawLogin(err.message);
      }
    }
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>
`;
