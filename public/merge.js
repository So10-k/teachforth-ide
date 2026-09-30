// Merge two edits against the same base. Non-overlapping edits both survive.
// An overlapping edit keeps the local buffer so a remote save cannot wipe typing.
export function mergeText(base, local, remote) {
  const start = String(base ?? "");
  const mine = String(local ?? "");
  const theirs = String(remote ?? "");
  if (mine === theirs || theirs === start) return mine;
  if (mine === start) return theirs;
  const a = span(start, mine);
  const b = span(start, theirs);
  if (a.end <= b.start) return splice(start, a, b);
  if (b.end <= a.start) return splice(start, b, a);
  return mine;
}

function span(base, next) {
  const max = Math.min(base.length, next.length);
  let start = 0;
  while (start < max && base[start] === next[start]) start += 1;
  let endBase = base.length;
  let endNext = next.length;
  while (endBase > start && endNext > start && base[endBase - 1] === next[endNext - 1]) {
    endBase -= 1;
    endNext -= 1;
  }
  return { start, end: endBase, text: next.slice(start, endNext) };
}

function splice(base, first, second) {
  return base.slice(0, first.start) + first.text + base.slice(first.end, second.start) + second.text + base.slice(second.end);
}
