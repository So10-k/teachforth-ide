import { randomBytes } from "node:crypto";

const runs = new Map();
const WAIT_MS = 20_000;
const TTL_MS = 30 * 60 * 1000;
const MAX_LINE = 8_000;

function drop(id) {
  const run = runs.get(id);
  if (!run) return;
  clearTimeout(run.ttl);
  runs.delete(id);
}

function touch(id, run) {
  clearTimeout(run.ttl);
  run.ttl = setTimeout(() => {
    endRun(id, run.userId);
    drop(id);
  }, TTL_MS);
  run.ttl.unref?.();
}

export function startRun(userId) {
  const id = randomBytes(16).toString("hex");
  const run = { userId, queue: [], waiter: null, eof: false, ttl: null };
  runs.set(id, run);
  touch(id, run);
  return id;
}

export function endRun(runId, userId) {
  const run = runs.get(runId);
  if (!run || run.userId !== userId) return false;
  run.eof = true;
  run.queue = [];
  if (run.waiter) {
    const deliver = run.waiter;
    run.waiter = null;
    deliver({ eof: true });
  }
  touch(runId, run);
  return true;
}

export function pushLine(runId, userId, line) {
  const run = runs.get(runId);
  if (!run || run.userId !== userId || run.eof) return false;
  const text = String(line ?? "").replace(/\r?\n$/, "").slice(0, MAX_LINE);
  touch(runId, run);
  if (run.waiter) {
    const deliver = run.waiter;
    run.waiter = null;
    deliver({ line: text });
  } else {
    run.queue.push(text);
    if (run.queue.length > 32) run.queue.shift();
  }
  return true;
}

export function waitLine(runId, userId) {
  const run = runs.get(runId);
  if (!run || run.userId !== userId) return null;
  touch(runId, run);
  if (run.eof) return Promise.resolve({ eof: true });
  if (run.queue.length) return Promise.resolve({ line: run.queue.shift() });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (run.waiter) {
        run.waiter = null;
        resolve({ pending: true });
      }
    }, WAIT_MS);
    timer.unref?.();
    run.waiter = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
  });
}
