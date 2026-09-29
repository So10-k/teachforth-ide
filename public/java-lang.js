const TYPES = new Set(["int", "double", "boolean", "String", "char", "void", "Scanner"]);
const WORDS = new Set(["if", "else", "while", "for", "return", "new", "true", "false", "null", "class", "public", "private", "protected", "static", "final", "import", "package", "break", "continue", ...TYPES]);

export function runJava(source, io) {
  const program = parse(source);
  const main = program.methods.find((method) => method.name === "main");
  if (!main) throw new Error("Add public static void main(String[] args)");
  const env = { io, methods: program.methods, steps: 0, buffer: "" };
  try {
    callMethod(main, [[]], env);
  } catch (err) {
    if (err?.signal) throw new Error("break or continue used outside a loop");
    throw err;
  }
}

function callMethod(method, args, env) {
  const scope = new Map();
  method.params.forEach((param, index) => scope.set(param.name, cast(param.type, args[index])));
  return execBlock(method.body, env, scope);
}

function execBlock(stmts, env, scope) {
  const local = new Map(scope);
  for (const stmt of stmts) exec(stmt, env, local);
}

function exec(stmt, env, scope) {
  step(env);
  if (stmt.kind === "block") return execBlock(stmt.body, env, scope);
  if (stmt.kind === "decl") {
    for (const item of stmt.items) scope.set(item.name, item.init ? evalExpr(item.init, env, scope) : zero(stmt.type));
    return;
  }
  if (stmt.kind === "if") {
    if (truth(evalExpr(stmt.test, env, scope))) exec(stmt.then, env, scope);
    else if (stmt.else) exec(stmt.else, env, scope);
    return;
  }
  if (stmt.kind === "while") {
    while (truth(evalExpr(stmt.test, env, scope))) {
      try { exec(stmt.body, env, scope); }
      catch (err) {
        if (err?.signal === "break") break;
        if (err?.signal === "continue") continue;
        throw err;
      }
    }
    return;
  }
  if (stmt.kind === "for") {
    const loop = new Map(scope);
    if (stmt.init) exec(stmt.init, env, loop);
    while (!stmt.test || truth(evalExpr(stmt.test, env, loop))) {
      try { exec(stmt.body, env, loop); }
      catch (err) {
        if (err?.signal === "break") break;
        if (err?.signal === "continue") { if (stmt.update) evalExpr(stmt.update, env, loop); continue; }
        throw err;
      }
      if (stmt.update) evalExpr(stmt.update, env, loop);
    }
    return;
  }
  if (stmt.kind === "return") throw { signal: "return", value: stmt.value ? evalExpr(stmt.value, env, scope) : null };
  if (stmt.kind === "break" || stmt.kind === "continue") throw { signal: stmt.kind };
  if (stmt.kind === "expr") evalExpr(stmt.expr, env, scope);
}

function evalExpr(expr, env, scope) {
  step(env);
  if (expr.kind === "num") return expr.value;
  if (expr.kind === "str") return expr.value;
  if (expr.kind === "bool") return expr.value;
  if (expr.kind === "null") return null;
  if (expr.kind === "name") {
    if (!scope.has(expr.name)) throw new Error(`Line ${expr.line}: ${expr.name} is not defined`);
    return scope.get(expr.name);
  }
  if (expr.kind === "unary") {
    const value = evalExpr(expr.expr, env, scope);
    if (expr.op === "!") return !truth(value);
    if (expr.op === "-") return -num(value, expr.line);
    return num(value, expr.line);
  }
  if (expr.kind === "update") return update(expr, env, scope);
  if (expr.kind === "assign") return assign(expr, env, scope);
  if (expr.kind === "binary") return binary(expr, env, scope);
  if (expr.kind === "index") return indexOf(expr, env, scope);
  if (expr.kind === "new") return makeNew(expr, env, scope);
  if (expr.kind === "call") return call(expr, env, scope);
  throw new Error(`Line ${expr.line}: cannot run that Java expression`);
}

function assign(expr, env, scope) {
  const value = evalExpr(expr.right, env, scope);
  if (expr.left.kind === "name") {
    if (!scope.has(expr.left.name)) throw new Error(`Line ${expr.line}: ${expr.left.name} is not defined`);
    const next = applyAssign(scope.get(expr.left.name), expr.op, value, expr.line);
    scope.set(expr.left.name, next);
    return next;
  }
  if (expr.left.kind === "index") {
    const list = evalExpr(expr.left.object, env, scope);
    const index = num(evalExpr(expr.left.index, env, scope), expr.line);
    if (!Array.isArray(list) || index < 0 || index >= list.length) throw new Error(`Line ${expr.line}: array index out of range`);
    list[index] = applyAssign(list[index], expr.op, value, expr.line);
    return list[index];
  }
  throw new Error(`Line ${expr.line}: that cannot be assigned to`);
}

function applyAssign(current, op, value, line) {
  if (op === "=") return value;
  const left = num(current, line);
  const right = num(value, line);
  if (op === "+=") return typeof current === "string" ? current + String(value ?? "null") : left + right;
  if (op === "-=") return left - right;
  if (op === "*=") return left * right;
  if (op === "/=") return divide(left, right, current, line);
  return left;
}

function update(expr, env, scope) {
  const current = expr.target.kind === "name" ? scope.get(expr.target.name) : indexOf(expr.target, env, scope);
  const next = num(current, expr.line) + (expr.op === "++" ? 1 : -1);
  if (expr.target.kind === "name") scope.set(expr.target.name, next);
  else {
    const list = evalExpr(expr.target.object, env, scope);
    list[num(evalExpr(expr.target.index, env, scope), expr.line)] = next;
  }
  return expr.pre ? next : current;
}

function binary(expr, env, scope) {
  if (expr.op === "&&") return truth(evalExpr(expr.left, env, scope)) && truth(evalExpr(expr.right, env, scope));
  if (expr.op === "||") return truth(evalExpr(expr.left, env, scope)) || truth(evalExpr(expr.right, env, scope));
  const left = evalExpr(expr.left, env, scope);
  const right = evalExpr(expr.right, env, scope);
  if (expr.op === "+") {
    if (typeof left === "string" || typeof right === "string") return String(left ?? "null") + String(right ?? "null");
    return num(left, expr.line) + num(right, expr.line);
  }
  if (expr.op === "-") return num(left, expr.line) - num(right, expr.line);
  if (expr.op === "*") return num(left, expr.line) * num(right, expr.line);
  if (expr.op === "/") return divide(left, right, left, expr.line);
  if (expr.op === "%") return num(left, expr.line) % num(right, expr.line);
  if (expr.op === "==") return same(left, right);
  if (expr.op === "!=") return !same(left, right);
  if (expr.op === "<") return num(left, expr.line) < num(right, expr.line);
  if (expr.op === ">") return num(left, expr.line) > num(right, expr.line);
  if (expr.op === "<=") return num(left, expr.line) <= num(right, expr.line);
  if (expr.op === ">=") return num(left, expr.line) >= num(right, expr.line);
  throw new Error(`Line ${expr.line}: ${expr.op} is not supported`);
}

function call(expr, env, scope) {
  const name = expr.name;
  const object = expr.object;
  if (object?.kind === "field" && object.object?.kind === "name" && object.object.name === "System" && object.name === "out") {
    const text = (expr.args || []).map((arg) => show(evalExpr(arg, env, scope))).join("");
    env.io.print(name === "println" ? `${text}\n` : text);
    return null;
  }
  if (object?.kind === "name" && object.name === "Integer" && name === "parseInt") return parseInt(String(evalExpr(expr.args[0], env, scope)), 10);
  if (object?.kind === "name" && object.name === "Double" && name === "parseDouble") return Number(evalExpr(expr.args[0], env, scope));
  if (object?.kind === "name" && object.name === "Math") return math(name, expr, env, scope);
  if (object?.kind === "name" && scope.get(object.name)?.scanner) return scan(name, scope.get(object.name), env, expr.line);
  if (object?.kind === "name" && typeof scope.get(object.name) === "string") return stringCall(name, scope.get(object.name), expr, env, scope);
  if (!object) {
    const method = env.methods.find((item) => item.name === name);
    if (!method) throw new Error(`Line ${expr.line}: ${name} is not a method in this file`);
    try {
      return callMethod(method, expr.args.map((arg) => evalExpr(arg, env, scope)), env);
    } catch (err) {
      if (err?.signal === "return") return err.value;
      throw err;
    }
  }
  throw new Error(`Line ${expr.line}: ${name}() is not supported in the browser Java runner`);
}

function stringCall(name, value, expr, env, scope) {
  if (name === "length") return value.length;
  if (name === "equals") return value === String(evalExpr(expr.args[0], env, scope) ?? "");
  if (name === "charAt") return value.charAt(num(evalExpr(expr.args[0], env, scope), expr.line));
  throw new Error(`Line ${expr.line}: String.${name} is not supported`);
}

function math(name, expr, env, scope) {
  const args = expr.args.map((arg) => num(evalExpr(arg, env, scope), expr.line));
  if (name === "abs") return Math.abs(args[0]);
  if (name === "max") return Math.max(args[0], args[1]);
  if (name === "min") return Math.min(args[0], args[1]);
  if (name === "sqrt") return Math.sqrt(args[0]);
  if (name === "pow") return Math.pow(args[0], args[1]);
  throw new Error(`Line ${expr.line}: Math.${name} is not supported`);
}

function scan(name, scanner, env, line) {
  if (name === "nextLine") {
    fill(scanner, env);
    const cut = scanner.buffer.indexOf("\n");
    const lineText = cut < 0 ? scanner.buffer : scanner.buffer.slice(0, cut);
    scanner.buffer = cut < 0 ? "" : scanner.buffer.slice(cut + 1);
    return lineText;
  }
  if (name === "next" || name === "nextInt" || name === "nextDouble") {
    let word = "";
    while (!word) {
      fill(scanner, env);
      scanner.buffer = scanner.buffer.replace(/^[ \t\r\n]+/, "");
      if (!scanner.buffer) { scanner.buffer = ""; continue; }
      const match = scanner.buffer.match(/^\S+/);
      word = match[0];
      scanner.buffer = scanner.buffer.slice(word.length);
    }
    if (name === "nextInt") return parseInt(word, 10);
    if (name === "nextDouble") return Number(word);
    return word;
  }
  throw new Error(`Line ${line}: Scanner.${name} is not supported`);
}

function fill(scanner, env) {
  if (scanner.buffer) return;
  const line = env.io.readLine();
  if (line == null) throw new Error("input closed");
  scanner.buffer = `${line}\n`;
}

function makeNew(expr, env, scope) {
  if (expr.type === "Scanner") return { scanner: true, buffer: "" };
  const size = num(evalExpr(expr.size, env, scope), expr.line);
  if (size < 0 || size > 1_000_000) throw new Error(`Line ${expr.line}: bad array length`);
  return Array.from({ length: size }, () => zero(expr.type));
}

function indexOf(expr, env, scope) {
  const list = evalExpr(expr.object, env, scope);
  const index = num(evalExpr(expr.index, env, scope), expr.line);
  if (!Array.isArray(list) || index < 0 || index >= list.length) throw new Error(`Line ${expr.line}: array index out of range`);
  return list[index];
}

function parse(source) {
  const tokens = tokenize(source);
  let i = 0;
  const peek = (offset = 0) => tokens[i + offset] || { kind: "eof", value: "", line: tokens.at(-1)?.line || 1 };
  const eat = (value) => (peek().value === value ? tokens[i++] : null);
  const expect = (value) => {
    const token = eat(value);
    if (!token) throw new Error(`Line ${peek().line}: expected ${value}`);
    return token;
  };
  while (peek().value === "import" || peek().value === "package") {
    while (peek().kind !== "eof" && !eat(";")) i += 1;
  }
  while (["public", "private", "protected", "static", "final", "class"].includes(peek().value) && peek().value !== "class") i += 1;
  if (peek().value === "class") {
    expect("class");
    i += 1;
    expect("{");
  }
  const methods = [];
  while (peek().kind !== "eof" && peek().value !== "}") {
    if (eat(";")) continue;
    const method = parseMember();
    if (method) methods.push(method);
  }
  return { methods };

  function parseMember() {
    while (["public", "private", "protected", "static", "final"].includes(peek().value)) i += 1;
    if (peek().kind === "eof" || peek().value === "}") return null;
    const type = parseType();
    const name = peek().kind === "ident" ? tokens[i++].value : "";
    if (eat("(")) {
      const params = [];
      if (peek().value !== ")") {
        do {
          const paramType = parseType();
          const paramName = tokens[i++]?.value || "arg";
          params.push({ type: paramType, name: paramName });
        } while (eat(","));
      }
      expect(")");
      expect("{");
      return { name, type, params, body: parseBlock() };
    }
    while (peek().kind !== "eof" && !eat(";")) i += 1;
    return null;
  }

  function parseType() {
    const token = tokens[i++];
    let type = token?.value || "int";
    if (eat("[")) expect("]");
    return type;
  }

  function parseBlock() {
    const body = [];
    while (peek().value !== "}" && peek().kind !== "eof") body.push(parseStmt());
    expect("}");
    return body;
  }

  function parseStmt() {
    if (eat("{")) return { kind: "block", body: parseBlock() };
    if (eat("if")) {
      expect("(");
      const test = parseExpr();
      expect(")");
      const then = parseStmt();
      const otherwise = eat("else") ? parseStmt() : null;
      return { kind: "if", test, then, else: otherwise };
    }
    if (eat("while")) {
      expect("(");
      const test = parseExpr();
      expect(")");
      return { kind: "while", test, body: parseStmt() };
    }
    if (eat("for")) {
      expect("(");
      const init = peek().value === ";" ? (i += 1, null) : parseStmt();
      const test = peek().value === ";" ? null : parseExpr();
      expect(";");
      const update = peek().value === ")" ? null : parseExpr();
      expect(")");
      return { kind: "for", init, test, update, body: parseStmt() };
    }
    if (eat("return")) {
      const value = peek().value === ";" ? null : parseExpr();
      expect(";");
      return { kind: "return", value };
    }
    if (eat("break")) return finishJump("break");
    if (eat("continue")) return finishJump("continue");
    if (isType(peek())) {
      const type = parseType();
      const items = [];
      do {
        const name = tokens[i++].value;
        const init = eat("=") ? parseExpr() : null;
        items.push({ name, init });
      } while (eat(","));
      expect(";");
      return { kind: "decl", type, items };
    }
    const expr = parseExpr();
    expect(";");
    return { kind: "expr", expr };
  }

  function finishJump(kind) {
    expect(";");
    return { kind };
  }

  function parseExpr() { return parseAssign(); }
  function parseAssign() {
    const left = parseOr();
    const op = ["=", "+=", "-=", "*=", "/="].find((item) => peek().value === item);
    if (!op) return left;
    i += 1;
    return { kind: "assign", op, left, right: parseAssign(), line: left.line };
  }
  function parseOr() { return parseBinary(parseAnd, ["||"]); }
  function parseAnd() { return parseBinary(parseEq, ["&&"]); }
  function parseEq() { return parseBinary(parseRel, ["==", "!="]); }
  function parseRel() { return parseBinary(parseAdd, ["<", ">", "<=", ">="]); }
  function parseAdd() { return parseBinary(parseMul, ["+", "-"]); }
  function parseMul() { return parseBinary(parseUnary, ["*", "/", "%"]); }
  function parseBinary(next, ops) {
    let left = next();
    while (ops.includes(peek().value)) {
      const op = tokens[i++].value;
      left = { kind: "binary", op, left, right: next(), line: left.line };
    }
    return left;
  }
  function parseUnary() {
    if (eat("!")) return { kind: "unary", op: "!", expr: parseUnary(), line: peek().line };
    if (eat("-")) return { kind: "unary", op: "-", expr: parseUnary(), line: peek().line };
    if (eat("+")) return parseUnary();
    if (peek().value === "++" || peek().value === "--") {
      const op = tokens[i++].value;
      const target = parsePostfix();
      return { kind: "update", op, pre: true, target, line: target.line };
    }
    return parsePostfix();
  }
  function parsePostfix() {
    let expr = parsePrimary();
    while (true) {
      if (eat(".")) {
        const name = tokens[i++].value;
        if (eat("(")) expr = { kind: "call", object: expr, name, args: parseArgs(), line: expr.line };
        else expr = { kind: "field", object: expr, name, line: expr.line };
      } else if (eat("(")) {
        expr = { kind: "call", object: null, name: expr.name, args: parseArgs(), line: expr.line };
      } else if (eat("[")) {
        const index = parseExpr();
        expect("]");
        expr = { kind: "index", object: expr, index, line: expr.line };
      } else if (peek().value === "++" || peek().value === "--") {
        expr = { kind: "update", op: tokens[i++].value, pre: false, target: expr, line: expr.line };
      } else break;
    }
    return expr;
  }
  function parsePrimary() {
    const token = tokens[i++] || { kind: "eof", value: "", line: 1 };
    if (token.kind === "num") return { kind: "num", value: token.num, line: token.line };
    if (token.kind === "str") return { kind: "str", value: token.text, line: token.line };
    if (token.value === "true" || token.value === "false") return { kind: "bool", value: token.value === "true", line: token.line };
    if (token.value === "null") return { kind: "null", line: token.line };
    if (token.value === "new") {
      const type = tokens[i++].value;
      if (eat("[")) {
        const size = parseExpr();
        expect("]");
        return { kind: "new", type, size, line: token.line };
      }
      expect("(");
      parseArgs();
      return { kind: "new", type, line: token.line };
    }
    if (token.value === "(") {
      const expr = parseExpr();
      expect(")");
      return expr;
    }
    return { kind: "name", name: token.value, line: token.line };
  }
  function parseArgs() {
    const args = [];
    if (peek().value !== ")") {
      do args.push(parseExpr());
      while (eat(","));
    }
    expect(")");
    return args;
  }
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const push = (token) => tokens.push({ ...token, line });
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") { line += 1; i += 1; continue; }
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === "/" && source[i + 1] === "/") { while (i < source.length && source[i] !== "\n") i += 1; continue; }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      let text = "";
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          const esc = source[++i];
          text += esc === "n" ? "\n" : esc === "t" ? "\t" : esc;
          i += 1;
        } else text += source[i++];
      }
      i += 1;
      push(quote === '"' ? { kind: "str", text } : { kind: "str", text });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const start = i;
      while (/[0-9.]/.test(source[i] || "")) i += 1;
      push({ kind: "num", num: Number(source.slice(start, i)) });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (/[A-Za-z0-9_]/.test(source[i] || "")) i += 1;
      const value = source.slice(start, i);
      push({ kind: WORDS.has(value) ? "word" : "ident", value });
      continue;
    }
    const two = source.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/="].includes(two)) {
      push({ kind: "op", value: two });
      i += 2;
      continue;
    }
    push({ kind: "op", value: ch });
    i += 1;
  }
  return tokens;
}

function isType(token) {
  return TYPES.has(token.value);
}

function step(env) {
  env.steps += 1;
  if (env.steps > 2_000_000) throw new Error("Stopped. That loop ran too long. Press stop, or check the condition.");
}

function num(value, line) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Line ${line}: expected a number`);
  return n;
}

function divide(left, right, original, line) {
  if (right === 0) throw new Error(`Line ${line}: division by zero`);
  return Number.isInteger(original) && Number.isInteger(right) ? Math.trunc(left / right) : left / right;
}

function truth(value) { return Boolean(value); }
function same(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) return left === right;
  return left === right;
}
function zero(type) {
  if (type === "String") return "";
  if (type === "boolean") return false;
  if (type === "char") return "\0";
  return 0;
}
function cast(type, value) { return value; }
function show(value) {
  if (value == null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
