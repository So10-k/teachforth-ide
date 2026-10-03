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

Home links are not part of the Azure process. The light IDE runs on this machine as `teachforth-home.service`, with temporary sessions in `/var/lib/teachforth-home`. A code update there is a copy of `deploy/home-server.js` and `public/home.js` into `/opt/teachforth-home`, then a restart of that service. Do not copy student sessions or the home token into git. The class VM reads the same token from `/var/lib/teachforth-ide/home-token`.

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

## 4. GitHub Action

Actions → Deploy. It does not run on push. Leave Apply off the first time. That only prints SAME, DIFFER, NEW, or SKIP. The class VM must already be running. The action does not start it and does not deallocate it.

Add the VM private key as the repo secret `CLASS_SSH_KEY`. Do not print it. Home shipping also needs `HOME_SSH_KEY`, `HOME_SSH_HOST`, and a committed `deploy/home-known_hosts` pin. Without that pin, home is refused.

Apply copies only the paths you list, and only under `public/` and `server/` on the class VM, or the home shell files. It does not delete a live file that is not in that list. A blank list does nothing unless Fileset is `runtime`. A pull request lists its changed files and skips deletions. Health must return `"ok":true` or that overlay is put back. Backups stay in `/var/backups/teachforth-class` or `/var/backups/teachforth-home`. Rollback is `latest` or the stamp from List, such as `20261001-025600`.

The script that copies is the one on the branch you started the action from, not the pull request. A pull request cannot change the copy step or read the key.

## Discord helper

The bot runs on this VPS, not the class VM. `deploy/install-discord.sh` installs it and creates two secrets under `/var/lib/teachforth-discord`. Copy `secret` to `/var/lib/teachforth-ide/discord-secret` on the class VM, mode 600, owner `teachforth`. Do not copy the bot token or the power secret there. Put the bot token, public key, application id, and server id in `config.json`, then restart `teachforth-discord.service`. The interactions URL is `https://samsprojects.xyz/teachforth-discord/interactions`. Overlay deploy does not update the bot files. Copy `deploy/discord-bot.js` and `deploy/discord-policy.js` to `/opt/teachforth-discord` when those change.

## Authorized domains

The class app saves names in `/var/lib/teachforth-ide/domains.txt`. Nginx changes only through the root helper `/usr/local/lib/teachforth/tf-domains`. Overlay deploy does not install that helper. Copy `deploy/tf-domains` to the class VM and run `deploy/install-domains.sh` as root, with the copied script as its argument. That installs the helper, the sudoers line, and certbot if it is missing. It does not replace the default site.

## If the site breaks

The previous commit is still on GitHub.

```bash
git checkout <previous-sha> -- public server
# copy those files the same way, then restart teachforth-ide.service
```

The database is untouched by that rollback, so accounts and projects stay.
