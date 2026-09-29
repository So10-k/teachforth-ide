#!/usr/bin/env bash
# Runs on the Azure VM, after the app files are in /opt/teachforth-ide.
set -euo pipefail

APP=/opt/teachforth-ide
DATA=/var/lib/teachforth-ide
NODE_VERSION=v24.16.0

if [ ! -f /etc/teachforth-ide-vm ]; then
  echo "teachforth-ide azure vm" > /etc/teachforth-ide-vm
fi
if ! command -v curl >/dev/null 2>&1 || ! command -v nft >/dev/null 2>&1; then
  apt-get update
  apt-get install -y curl ca-certificates nftables xz-utils
fi

if ! id teachforth >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$DATA" --shell /usr/sbin/nologin teachforth
fi
mkdir -p "$APP" "$DATA"
chown teachforth:teachforth "$DATA"

need_node=1
if command -v node >/dev/null 2>&1; then
  major=$(node -p "process.versions.node.split('.')[0]")
  if [ "$major" -ge 24 ]; then
    need_node=0
  fi
fi
if [ "$need_node" -eq 1 ]; then
  case "$(uname -m)" in
    aarch64) arch=arm64 ;;
    *) arch=x64 ;;
  esac
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${arch}.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1
fi

chmod 755 "$APP/deploy/idle-shutdown.sh"
cp "$APP/deploy/teachforth-ide.service" /etc/systemd/system/teachforth-ide.service
cp "$APP/deploy/teachforth-redirect.service" /etc/systemd/system/teachforth-redirect.service
cp "$APP/deploy/teachforth-idle.service" /etc/systemd/system/teachforth-idle.service
cp "$APP/deploy/teachforth-idle.timer" /etc/systemd/system/teachforth-idle.timer
systemctl daemon-reload
/usr/sbin/nft delete table ip teachforth 2>/dev/null || true
systemctl enable --now teachforth-redirect.service
systemctl enable --now teachforth-ide.service
systemctl enable --now teachforth-idle.timer
systemctl restart teachforth-ide.service
sleep 1
systemctl --no-pager --full status teachforth-ide.service | head -20
curl -fsS http://127.0.0.1:8080/api/health
echo
echo "app installed"
