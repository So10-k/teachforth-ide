# Ship a change without breaking the live IDE

The live site is one Node process on the Azure VM. Student code, accounts, and GitHub tokens live in `/var/lib/teachforth-ide`. That directory is not in git. A normal code update must not touch it.

## 1. Edit on your machine

```bash
git clone git@github.com:So10-k/teachforth-ide.git
cd teachforth-ide
node server/index.js
```

Open `http://127.0.0.1:8787`. The local database is `data/` and is gitignored. Do not copy the VM database down, and do not commit `data/`, `deploy/keys/`, or any token.

Before you commit:

```bash
node server/selftest.js
```

## 2. Commit as yourself

```bash
git status
git add path/to/changed-files
git -c user.name='So10-k' -c user.email='96778943+So10-k@users.noreply.github.com' commit -m "Say what changed"
git push origin main
```

Do not commit secrets. Do not rewrite history on `main`.

## 3. Put that commit on the VM

The VM is often off. Start it from the power panel. Do not turn the old 8:00 / 9:30 schedule back on.

From this repo, with the VM running:

```bash
KEY=deploy/keys/teachforth-ide
HOST=azureuser@74.248.20.108
ssh -i "$KEY" "$HOST" 'mkdir -p /tmp/teachforth-ship'
# Copy only the files you changed. Example:
scp -i "$KEY" public/editor.js public/app.css "$HOST":/tmp/teachforth-ship/
scp -i "$KEY" server/index.js "$HOST":/tmp/teachforth-ship/
ssh -i "$KEY" "$HOST" 'sudo cp /tmp/teachforth-ship/* /opt/teachforth-ide/public/ 2>/dev/null || true'
```

Safer pattern when both `public/` and `server/` changed: copy into matching temp folders, then `sudo cp` each file into the same path under `/opt/teachforth-ide`. Then:

```bash
ssh -i "$KEY" "$HOST" 'sudo chown -R teachforth:teachforth /opt/teachforth-ide && sudo systemctl restart teachforth-ide.service && curl -fsS http://127.0.0.1:8080/api/health'
```

A healthy reply is JSON with `"ok":true`. Hard-refresh the browser.

## Do not do these

- Do not run `deploy/install-on-vm.sh` on the shared VM. It resets services and the firewall.
- Do not `rm -rf /opt/teachforth-ide` or rsync `--delete` over it.
- Do not copy anything into `/var/lib/teachforth-ide`.
- Do not replace `/usr/local/lib/teachforth/tf-sandbox` or `tf-exec.py` unless you changed the sandbox and know the sudoers line still matches.
- Do not restart `teachforth-idle.timer` into a schedule, and do not delete `/var/lib/teachforth-ide/manual-hold` while a class is running.

## If the site breaks

The previous commit is still on GitHub.

```bash
git checkout <previous-sha> -- public server
# copy those files the same way, then restart teachforth-ide.service
```

The database is untouched by that rollback, so accounts and projects stay.
