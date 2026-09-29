export function lineDiff(before, after, label) {
  const a = String(before ?? "").split("\n");
  const b = String(after ?? "").split("\n");
  if (a.join("\n") === b.join("\n")) return "";
  const body = a.length > 700 || b.length > 700 ? rough(a, b) : lcs(a, b);
  return `diff ${label}\n${body}\n`;
}

function rough(a, b) {
  return [...a.map((line) => `-${line}`), ...b.map((line) => `+${line}`)].join("\n");
}

function lcs(a, b) {
  const width = b.length + 1;
  const dp = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * width + j] = a[i] === b[j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(` ${a[i]}`);
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      out.push(`-${a[i]}`);
      i += 1;
    } else {
      out.push(`+${b[j]}`);
      j += 1;
    }
  }
  while (i < a.length) out.push(`-${a[i++]}`);
  while (j < b.length) out.push(`+${b[j++]}`);
  return out.join("\n");
}
