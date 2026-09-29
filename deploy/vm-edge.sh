#!/usr/bin/env bash
# Runs on the Azure VM. Serves the IDE on ports 80 and 443.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y nginx openssl
systemctl disable --now teachforth-redirect.service >/dev/null 2>&1 || true
nft delete table ip teachforth >/dev/null 2>&1 || true
sed -i 's/^Environment=HOST=.*/Environment=HOST=127.0.0.1/' /etc/systemd/system/teachforth-ide.service
systemctl daemon-reload
systemctl restart teachforth-ide.service
mkdir -p /etc/teachforth
if [ ! -f /etc/teachforth/fullchain.pem ]; then
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout /etc/teachforth/privkey.pem \
    -out /etc/teachforth/fullchain.pem \
    -subj "/CN=74.248.20.108" \
    -addext "subjectAltName=IP:74.248.20.108"
fi
cat > /etc/nginx/sites-available/teachforth-ide <<'EOF'
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;
  client_max_body_size 20m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
  }
}
server {
  listen 443 ssl default_server;
  listen [::]:443 ssl default_server;
  server_name _;
  ssl_certificate /etc/teachforth/fullchain.pem;
  ssl_certificate_key /etc/teachforth/privkey.pem;
  client_max_body_size 20m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
  }
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/teachforth-ide /etc/nginx/sites-enabled/teachforth-ide
nginx -t
systemctl enable nginx
systemctl restart nginx
curl -fsS http://127.0.0.1/api/health
echo
