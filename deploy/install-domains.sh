#!/bin/bash
# Run as root on the class VM. Installs the domain helper only.
# Usage: deploy/install-domains.sh /path/to/tf-domains
set -euo pipefail
SRC=${1:?path to tf-domains}
[[ -f "$SRC" && ! -L "$SRC" ]] || { echo "helper source must be a normal file" >&2; exit 2; }
install -d -o root -g root -m 755 /usr/local/lib/teachforth
install -o root -g root -m 755 "$SRC" /usr/local/lib/teachforth/tf-domains
cat > /etc/sudoers.d/teachforth-domains <<'EOF'
teachforth ALL=(root) NOPASSWD: /usr/local/lib/teachforth/tf-domains
EOF
chmod 440 /etc/sudoers.d/teachforth-domains
visudo -cf /etc/sudoers.d/teachforth-domains
mkdir -p /var/lib/teachforth-ide/acme/.well-known/acme-challenge
chmod 755 /var/lib/teachforth-ide/acme /var/lib/teachforth-ide/acme/.well-known /var/lib/teachforth-ide/acme/.well-known/acme-challenge
if ! command -v certbot >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y certbot
fi
echo "domain helper installed"
