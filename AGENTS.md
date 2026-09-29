# TeachForth IDE

Browser IDE for TeachForth tutoring. Not VS Code, not a VM per student. One small Node process and a SQLite file.

## Run

- Local: `node server/index.js` from this directory. Default port `8787`.
- Tests: `node server/selftest.js`
- Azure, only after `az login`: `deploy/azure-up.sh`

Do not run `deploy/install-on-vm.sh` on the shared prod machine. It is for the Azure VM.

## Rules

- No public signup. An admin creates every account.
- Roles are admin, chapter lead, teacher, and student. A session lead is a normal teacher promoted for one block, not a separate account type. A teacher can open a student's code only when paired in a live block, or when they are that block's session lead. A chapter lead can open a student only when that student has a teacher in their live block. Students never see session reports, including in zip exports. Students also never see course pathways, skill marks, or the teaching guide. Those stay on staff routes and return 403 to a student, including for their own id.
- A student's TeachForth account is their GitHub account after they connect. Only public repositories named `TeachForth-…` are shown. Each one has a `.teachforth` file with that student's code. Closing commits with the student's token and deletes the local files. Only the student can commit. Teacher sandbox code stays on this server and is never pushed.
- Opening a project writes an audit row. Do not add a way to watch a student without that log.
- Student HTML runs in a sandboxed iframe (`sandbox="allow-scripts"` without `allow-same-origin`). Do not loosen that. The preview URL is `/preview/:id/` on the IDE origin. It is a login page plus that iframe. Do not serve student HTML as a same-origin document.
- The editor's right pane is a terminal. The bottom line accepts commands: `python`, `node`, `ls`, `cat`, `teachforth serve`, `help`. Play runs the same command for the open file. Python runs in a browser worker via Pyodide. The worker is reused, so a flush wrapper around `print` must call the original `builtins.print` saved once, never the previous wrapper. `input()` reads that bottom line. The server only holds the typed line until the browser picks it up. It must not execute that line or any student code. `node` stays inside the sandboxed runner. `teachforth serve` only opens the private preview link. Do not start student servers, bind ports, or run Next.js on the VM.
- Only a teacher who can open a project can publish it. Publish copies static files, never `.teachforth`, to the prod host at `teachforthprojects.samsprojects.xyz`. Students cannot publish. Do not store a published site only on the Azure VM, because that VM turns off.
- Python runs in the browser via Pyodide. C and C++ run in the browser through a teaching interpreter. Java runs in the browser through the teaching runner in `public/java-lang.js`. Do not execute student code on the server, and do not shell out to gcc, g++, or java.
- No new npm dependencies. The server uses Node 24 built-ins, including `node:sqlite`.
- The portal stays the blue TeachForth shell. The editor is a dark VS Code-style view: opened tabs only, explorer for the rest, hidden `.teachforth`. Do not reset the editor from a poll or save while the user is typing. CodeMirror close-brackets, close-tags, and completion stay vendored. No new npm dependencies.

## Shutdown

The Azure VM stays off until someone starts it from the power panel (`deploy/power-server.js`). That panel sets a deadline and deallocates the VM when the deadline passes. Do not turn the daily 8:00 start or 9:30 stop back on. Idle shutdown may still deallocate a forgotten VM, but it must exit while `/var/lib/teachforth-ide/manual-hold` is in the future. Do not point either script at this prod machine.
