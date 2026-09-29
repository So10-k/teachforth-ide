# TeachForth IDE

Browser IDE and portal for TeachForth tutoring. Teachers and students sign in, open a project, and edit together. It is one small Node process and a SQLite file. It is not VS Code, and it is not a virtual machine per student.

The repo is private. Treat it like a shared team codebase: read this before changing behavior, and do not commit secrets.

## What it does

An admin creates every account. There is no public signup.

- **Admin** manages accounts, chapters, blocks, lessons, and sandboxes.
- **Chapter lead** sees their chapter and the students who have a teacher in a live block.
- **Teacher** opens a student's project only when paired in a live block, or when they are that block's session lead. A session lead is a normal teacher promoted for one block, not a separate account type.
- **Student** sees only their own portfolio. Their TeachForth account becomes their GitHub account after they connect. Closing a project commits it and removes the local files. Only the student can commit.

The editor is a dark, VS Code-style view: explorer, opened tabs only, hidden `.teachforth`, live cursors, and a shared board. Web pages and Python run in the browser. Nothing in this app runs student code on the server.

## The terminal, preview, and published pages

The right pane is a terminal. **Play** prints a command and runs it:

| Open file | Command | Where it runs |
| --- | --- | --- |
| `.py` | `python <file>` | Pyodide, in the browser |
| `.js` with no `index.html` | `node <file>` | A sandboxed iframe. Output comes back through `postMessage`. |
| HTML, or a project with `index.html` | `teachforth serve --port 3000` | No port is opened. Play prints a private preview link. |
| `package.json` that mentions Next.js | `npm run dev` | Not started. Student servers are not run on the VM. |

**Open** launches `/preview/<project id>/`. That page requires the same TeachForth login. The server checks that the person can open the project, then puts the HTML in an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`. Do not serve student HTML as a normal same-origin page. A student script must not be able to call `/api/me`.

**Publish** is for teachers who can open the project. Students cannot publish. It copies static files (`index.html`, CSS, JS, and a few text types) to the prod host. `.teachforth` is never published. The public link is:

`https://teachforthprojects.samsprojects.xyz/p<id>-<title>/`

That host is a different origin from the IDE and from the power panel. Published pages stay up when the Azure VM is off. Python projects cannot be published. Add `index.html` first.

## Layout

```
server/index.js        HTTP routes, accounts, projects, preview shell, publish
server/org.js          Roles, chapters, blocks, who can open a student
server/github.js       OAuth, repo list, commit-on-close
server/publish.js      Static snapshot rules and the public slug
server/templates.js    Starter files. `.teachforth` stays hidden.
public/editor.js       IDE shell, terminal, play, publish button
public/preview.html    Signed-in preview window
public/app.js          Portal pages
deploy/                Azure VM, power panel, publish receiver, nginx snippet
```

No npm dependencies. Node 24 built-ins only, including `node:sqlite`.

## Run and test

```bash
cd teachforth-ide
npm test
SEED_DEMO=1 npm start
```

Open `http://127.0.0.1:8787`.

Local demo only, created when `SEED_DEMO=1` and the database is empty:

- Admin: `admin@teachforth.local` / `admin-pass-1` when the test sets that password. A normal first start writes a random password to `data/admin-password.txt`.
- Teacher: `teacher@teachforth.local` / `teacher-demo`
- Student: `student@teachforth.local` / `student-demo`

`data/` is gitignored. Do not commit a database, a password file, or `deploy/keys/`.

## Rules for changes

- Keep at least one admin. Do not allow self-delete.
- Opening a project writes an audit row. Do not add a way to watch a student without that log.
- Students never see session reports, including in zip exports.
- Do not execute student code on the server. Do not bind a port for a student, and do not start Next.js or Node for them.
- Do not loosen the preview iframe sandbox.
- Do not reset the editor from a poll or save while the person is typing.
- CodeMirror close-brackets, close-tags, and completion stay vendored. Do not add an npm package for them.
- Only public GitHub repositories named `TeachForth-…` are shown. Each has a `.teachforth` file with that student's code. The file is hidden in the IDE and cannot be renamed or deleted there.
- A published site must be copied to the prod host. Do not leave it only on the Azure VM.

## Hosts

The IDE runs on a small Azure VM in Poland. It stays off until someone starts it from the power panel. Do not turn the old 8:00 start or 9:30 stop schedules back on. Do not run `deploy/install-on-vm.sh` on the shared prod machine.

The power panel and the published-site host run on the prod machine, not on the Azure VM. The publish receiver is `deploy/projects-server.js`. The IDE posts a snapshot to it with a shared token. The token lives in a root-only file on each host. It is not in git. The nginx example is `deploy/nginx-teachforth-projects.conf`.

GitHub OAuth is configured in the VM database, not in this repo. The callback is the IDE host plus `/api/github/callback`. Do not paste the client secret into a file that gets committed.

## Working on it

1. Branch from `main`.
2. Change the smallest set of files that does the job.
3. Run `npm test`. It covers access checks, the hidden marker, and publish.
4. Open the editor and press play on a Python file, a JavaScript file, and an HTML file before calling a UI change done.
5. Do not commit `data/`, keys, tokens, or a production password.

If a change touches who can open a project, update `canAccessProject` in `server/org.js` and add a selftest. If it touches the preview, keep the sandbox attribute and prove the shell response does not contain student code.
