#!/bin/bash
# Installs the Discord helper on this always-on VPS. Does not start the class VM.
set -euo pipefail
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
id tfdiscord >/dev/null 2>&1 || useradd --system --home /var/lib/teachforth-discord --shell /usr/sbin/nologin tfdiscord
install -d -o tfdiscord -g tfdiscord -m 750 /var/lib/teachforth-discord
install -d -o root -g root -m 755 /opt/teachforth-discord
install -o root -g root -m 644 "$ROOT/deploy/discord-bot.js" "$ROOT/deploy/discord-policy.js" /opt/teachforth-discord/
install -o root -g root -m 644 "$ROOT/deploy/teachforth-discord.service" /etc/systemd/system/teachforth-discord.service
if [[ ! -f /var/lib/teachforth-discord/secret ]]; then
  umask 077
  python3 -c 'import secrets; print(secrets.token_urlsafe(32))' > /var/lib/teachforth-discord/secret
fi
chown root:tfdiscord /var/lib/teachforth-discord/secret
chmod 640 /var/lib/teachforth-discord/secret
if [[ ! -f /var/lib/teachforth-discord/power-secret ]]; then
  umask 077
  python3 -c 'import secrets; print(secrets.token_urlsafe(32))' > /var/lib/teachforth-discord/power-secret
fi
chown root:tfdiscord /var/lib/teachforth-discord/power-secret
chmod 640 /var/lib/teachforth-discord/power-secret
if [[ ! -f /var/lib/teachforth-discord/config.json ]]; then
  printf '%s\n' '{"token":"","publicKey":"","applicationId":"","guildId":"","loginChannelId":""}' > /var/lib/teachforth-discord/config.json
fi
chown tfdiscord:tfdiscord /var/lib/teachforth-discord/config.json
chmod 600 /var/lib/teachforth-discord/config.json
if [[ ! -f /var/lib/teachforth-discord/roles.json ]]; then
  printf '%s\n' '{}' > /var/lib/teachforth-discord/roles.json
fi
chown tfdiscord:tfdiscord /var/lib/teachforth-discord/roles.json
chmod 600 /var/lib/teachforth-discord/roles.json
systemctl daemon-reload
systemctl enable --now teachforth-discord.service
echo "discord helper installed"
