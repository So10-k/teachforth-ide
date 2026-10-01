#!/usr/bin/env bash
# Overlay selected repo files onto the class VM or the home host.
# Never deletes other live files, never touches student data, and restores
# the previous bytes if the health check fails.
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SHIP_SRC=${SHIP_SRC:-$ROOT}
SHIP_CMD=${1:-${SHIP_CMD:-plan}}
SHIP_TARGET=${SHIP_TARGET:-class}
SHIP_FILESET=${SHIP_FILESET:-listed}
SHIP_ROLLBACK=${SHIP_ROLLBACK:-none}
CLASS_HOST=${CLASS_SSH_HOST:-azureuser@74.248.20.108}
CLASS_KEY=${CLASS_SSH_KEY_FILE:-}
HOME_HOST=${HOME_SSH_HOST:-}
HOME_KEY=${HOME_SSH_KEY_FILE:-}
FILES_FILE=${SHIP_FILES_FILE:-}

if [[ $# -gt 0 ]]; then shift; fi

reject() { echo "ship: $*" >&2; exit 2; }

allow_class() {
  [[ "$1" =~ ^(public|server)/[A-Za-z0-9._/-]+$ ]] || return 1
  [[ "$1" != *..* && "$1" != */. ]] || return 1
  return 0
}

allow_home() {
  case "$1" in
    deploy/home-server.js|public/home.js|public/app.css|public/logo.png|public/favicon.svg) return 0 ;;
    public/vendor/[A-Za-z0-9._/-]*) [[ "$1" != *..* ]] && return 0 ;;
  esac
  return 1
}

home_dest() {
  case "$1" in
    deploy/home-server.js) echo home-server.js ;;
    public/vendor/*) echo "static/vendor/${1#public/vendor/}" ;;
    public/*) echo "static/${1#public/}" ;;
    *) return 1 ;;
  esac
}

load_requested() {
  REQUESTED=()
  if [[ -n "$FILES_FILE" && -f "$FILES_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do REQUESTED+=("$line"); done < "$FILES_FILE"
  elif [[ -n "${SHIP_FILES:-}" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do REQUESTED+=("$line"); done <<< "$SHIP_FILES"
  fi
  if [[ $# -gt 0 ]]; then REQUESTED+=("$@"); fi
  local cleaned=() line
  for line in "${REQUESTED[@]+"${REQUESTED[@]}"}"; do
    line=${line%$'\r'}
    line=${line#./}
    [[ -z "$line" || "$line" == \#* ]] && continue
    cleaned+=("$line")
  done
  REQUESTED=("${cleaned[@]+"${cleaned[@]}"}")
}

expand_runtime() {
  local target=$1
  if [[ "$target" == class ]]; then
    (cd "$SHIP_SRC" && find public server -type f | sort)
  else
    {
      printf '%s\n' deploy/home-server.js public/home.js public/app.css public/logo.png public/favicon.svg
      if [[ -d "$SHIP_SRC/public/vendor" ]]; then
        (cd "$SHIP_SRC" && find public/vendor -type f | sort)
      fi
    }
  fi
}

select_files() {
  local target=$1 rel
  SELECTED=()
  SKIPPED=()
  if [[ ${#REQUESTED[@]} -eq 0 ]]; then
    if [[ "$SHIP_CMD" == apply && "$SHIP_FILESET" != runtime ]]; then
      reject "no files listed. Set files, or fileset=runtime. Nothing was copied."
    fi
    while IFS= read -r rel; do SELECTED+=("$rel"); done < <(expand_runtime "$target")
    return
  fi
  for rel in "${REQUESTED[@]}"; do
    if [[ "$target" == class ]] && allow_class "$rel"; then SELECTED+=("$rel")
    elif [[ "$target" == home ]] && allow_home "$rel"; then SELECTED+=("$rel")
    else SKIPPED+=("$rel"); fi
  done
}

require_present() {
  local rel
  for rel in "${SELECTED[@]}"; do
    [[ -f "$SHIP_SRC/$rel" ]] || reject "missing in checkout: $rel"
  done
}

ssh_base() {
  local key=$1 host=$2 known=$3
  SSH_OPTS=(-i "$key" -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$known")
  SSH_HOST=$host
}

run_ssh() { ssh "${SSH_OPTS[@]}" "$SSH_HOST" "$@"; }
run_scp() { scp "${SSH_OPTS[@]}" "$@"; }

prepare_class() {
  [[ -n "$CLASS_KEY" && -f "$CLASS_KEY" ]] || reject "CLASS_SSH_KEY is not set. Add the VM key as a repo secret. Nothing was copied."
  ssh_base "$CLASS_KEY" "$CLASS_HOST" "$ROOT/deploy/class-known_hosts"
}

prepare_home() {
  [[ -n "$HOME_KEY" && -f "$HOME_KEY" && -n "$HOME_HOST" ]] || reject "HOME_SSH_KEY and HOME_SSH_HOST are not set. Nothing was copied."
  local known=${HOME_KNOWN_HOSTS:-$ROOT/deploy/home-known_hosts}
  [[ -f "$known" ]] || reject "deploy/home-known_hosts is missing. Pin the home host key before shipping. Nothing was copied."
  ssh_base "$HOME_KEY" "$HOME_HOST" "$known"
}

plan_target() {
  local target=$1
  [[ "$target" == class ]] && prepare_class || prepare_home
  select_files "$target"
  require_present
  local tmp rel local_hash remote_hash state
  tmp=$(mktemp)
  printf '%s\n' "${SELECTED[@]}" > "$tmp"
  run_ssh "mkdir -p /tmp/teachforth-ship"
  run_scp "$tmp" "$SSH_HOST:/tmp/teachforth-ship/plan.txt"
  rm -f "$tmp"
  echo "target $target"
  remote_hash=$(run_ssh "bash -s" -- "$target" <<'REMOTE'
set -euo pipefail
target=$1
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  if [[ "$target" == class ]]; then dest="/opt/teachforth-ide/$rel"
  else
    case "$rel" in
      deploy/home-server.js) dest=/opt/teachforth-home/home-server.js ;;
      public/vendor/*) dest="/opt/teachforth-home/static/vendor/${rel#public/vendor/}" ;;
      public/*) dest="/opt/teachforth-home/static/${rel#public/}" ;;
      *) echo "BAD $rel"; continue ;;
    esac
  fi
  if [[ -f "$dest" ]]; then printf '%s %s\n' "$(sha256sum "$dest" | awk '{print $1}')" "$rel"
  else printf 'MISSING %s\n' "$rel"; fi
done < /tmp/teachforth-ship/plan.txt
rm -f /tmp/teachforth-ship/plan.txt
REMOTE
)
  while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    local_hash=$(sha256sum "$SHIP_SRC/$rel" | awk '{print $1}')
    remote_line=$(printf '%s\n' "$remote_hash" | awk -v rel="$rel" '$2==rel {print $1; exit}')
    if [[ "$remote_line" == MISSING || -z "$remote_line" ]]; then state=NEW
    elif [[ "$remote_line" == "$local_hash" ]]; then state=SAME
    else state=DIFFER
    fi
    printf '%s %s\n' "$state" "$rel"
  done <<< "$(printf '%s\n' "${SELECTED[@]}")"
  for rel in "${SKIPPED[@]+"${SKIPPED[@]}"}"; do
    printf 'SKIP %s\n' "$rel"
  done
  run_ssh "rm -f /tmp/teachforth-ship-plan.txt" || true
}

apply_target() {
  local target=$1 root owner health
  [[ "$target" == class ]] && prepare_class || prepare_home
  select_files "$target"
  [[ ${#SELECTED[@]} -gt 0 ]] || reject "nothing allowed to copy for $target"
  require_present
  if [[ "$target" == class ]]; then
    root=/opt/teachforth-ide
    owner=teachforth:teachforth
    health=http://127.0.0.1:8080/api/health
  else
    root=/opt/teachforth-home
    owner=tfhome:tfhome
    health=http://127.0.0.1:8793/health
  fi
  local tmp stamp sha
  tmp=$(mktemp -d)
  stamp=$(date -u +%Y%m%d-%H%M%S)
  sha=$(git -C "$SHIP_SRC" rev-parse HEAD 2>/dev/null || echo unknown)
  : > "$tmp/map.txt"
  local rel dest
  for rel in "${SELECTED[@]}"; do
    if [[ "$target" == class ]]; then dest=$rel; else dest=$(home_dest "$rel"); fi
    printf '%s\t%s\n' "$rel" "$dest" >> "$tmp/map.txt"
  done
  tar -C "$SHIP_SRC" -czf "$tmp/payload.tar.gz" "${SELECTED[@]}"
  run_ssh "rm -rf /tmp/teachforth-ship && mkdir -p /tmp/teachforth-ship"
  run_scp "$tmp/payload.tar.gz" "$tmp/map.txt" "$SSH_HOST:/tmp/teachforth-ship/"
  rm -rf "$tmp"
  echo "applying $target $stamp $sha"
  run_ssh "sudo bash -s" -- "$stamp" "$sha" "$root" "$owner" "$health" "$target" <<'REMOTE'
set -euo pipefail
stamp=$1 sha=$2 root=$3 owner=$4 health=$5 target=$6
[[ "$stamp" =~ ^[0-9]{8}-[0-9]{6}$ ]] || exit 2
[[ "$root" == /opt/teachforth-ide || "$root" == /opt/teachforth-home ]] || exit 2
backup=/var/backups/teachforth-$target
exec 9>/var/lock/teachforth-ship-$target
flock -n 9 || { echo "another ship is running" >&2; exit 1; }
mkdir -p "$backup" /tmp/teachforth-ship/payload
tar -xzf /tmp/teachforth-ship/payload.tar.gz -C /tmp/teachforth-ship/payload
manifest="$backup/$stamp.manifest"
{
  echo "SHA=$sha"
  echo "STAMP=$stamp"
  echo "ROOT=$root"
} > "$manifest"
backup_list=$(mktemp)
while IFS=$'\t' read -r src dest; do
  [[ -n "$src" && -n "$dest" ]] || continue
  case "$dest" in
    *..*|/*) echo "bad dest $dest" >&2; exit 2 ;;
  esac
  if [[ "$target" == class ]]; then
    case "$dest" in public/*|server/*) ;; *) echo "bad dest $dest" >&2; exit 2 ;; esac
  else
    case "$dest" in home-server.js|static/*) ;; *) echo "bad dest $dest" >&2; exit 2 ;; esac
  fi
  if [[ ! -f "/tmp/teachforth-ship/payload/$src" ]]; then echo "payload missing $src" >&2; exit 2; fi
  if [[ -L "$root/$dest" ]]; then echo "refusing symlink $dest" >&2; exit 2; fi
  if [[ -e "$root/$dest" && ! -f "$root/$dest" ]]; then echo "not a file $dest" >&2; exit 2; fi
  if [[ -f "$root/$dest" ]]; then
    echo "$dest" >> "$backup_list"
    echo "PATH $dest" >> "$manifest"
  else
    echo "NEW $dest" >> "$manifest"
  fi
done < /tmp/teachforth-ship/map.txt
if [[ -s "$backup_list" ]]; then
  tar -C "$root" -czf "$backup/$stamp.tar.gz" -T "$backup_list"
fi
ln -sfn "$stamp" "$backup/LATEST"
ship_ok=0
restore() {
  local id=$1 rel
  if [[ "$id" == latest ]]; then id=$(readlink "$backup/LATEST"); fi
  [[ "$id" =~ ^[0-9]{8}-[0-9]{6}$ ]] || exit 2
  [[ -f "$backup/$id.manifest" ]] || { echo "no backup $id" >&2; exit 1; }
  grep -qx "ROOT=$root" "$backup/$id.manifest"
  if [[ -f "$backup/$id.tar.gz" ]]; then tar -xzf "$backup/$id.tar.gz" -C "$root"; fi
  awk '/^PATH /{print $2}' "$backup/$id.manifest" | while read -r rel; do
    [[ -f "$root/$rel" ]] && chown "$owner" "$root/$rel"
  done
  awk '/^NEW /{print $2}' "$backup/$id.manifest" | while read -r rel; do
    case "$rel" in *..*|/*) continue ;; esac
    rm -f "$root/$rel"
  done
  systemctl restart "$( [[ "$target" == class ]] && echo teachforth-ide.service || echo teachforth-home.service )"
}
trap 'if [[ "${ship_ok:-0}" != 1 ]]; then echo "ship failed, restoring $stamp" >&2; restore "$stamp" || true; fi; rm -rf /tmp/teachforth-ship' EXIT
user=${owner%%:*}
group=${owner##*:}
while IFS=$'\t' read -r src dest; do
  [[ -n "$dest" ]] || continue
  install -D -o "$user" -g "$group" -m 644 "/tmp/teachforth-ship/payload/$src" "$root/$dest"
done < /tmp/teachforth-ship/map.txt
systemctl restart "$( [[ "$target" == class ]] && echo teachforth-ide.service || echo teachforth-home.service )"
ok=0
for _ in $(seq 1 20); do
  if curl -fsS "$health" | grep -q '"ok":true'; then ok=1; break; fi
  sleep 1
done
if [[ "$ok" != 1 ]]; then
  echo "health failed, restoring $stamp" >&2
  restore "$stamp" || true
  exit 1
fi
ship_ok=1
echo "healthy $stamp"
ls -1t "$backup"/*.manifest 2>/dev/null | tail -n +9 | while read -r item; do
  id=$(basename "$item" .manifest)
  rm -f "$backup/$id.tar.gz" "$backup/$id.manifest"
done || true
REMOTE
}

rollback_target() {
  local target=$1 id=$2
  [[ "$target" == class ]] && prepare_class || prepare_home
  [[ "$id" == latest || "$id" =~ ^[0-9]{8}-[0-9]{6}$ ]] || reject "backup id must be latest or YYYYMMDD-HHMMSS"
  run_ssh "sudo bash -s" -- "$id" "$target" <<'REMOTE'
set -euo pipefail
id=$1 target=$2
root=$([[ "$target" == class ]] && echo /opt/teachforth-ide || echo /opt/teachforth-home)
owner=$([[ "$target" == class ]] && echo teachforth:teachforth || echo tfhome:tfhome)
health=$([[ "$target" == class ]] && echo http://127.0.0.1:8080/api/health || echo http://127.0.0.1:8793/health)
service=$([[ "$target" == class ]] && echo teachforth-ide.service || echo teachforth-home.service)
backup=/var/backups/teachforth-$target
exec 9>/var/lock/teachforth-ship-$target
flock -n 9 || { echo "another ship is running" >&2; exit 1; }
if [[ "$id" == latest ]]; then id=$(readlink "$backup/LATEST"); fi
[[ "$id" =~ ^[0-9]{8}-[0-9]{6}$ ]] || exit 2
[[ -f "$backup/$id.manifest" ]] || { echo "no backup $id" >&2; exit 1; }
grep -qx "ROOT=$root" "$backup/$id.manifest"
if [[ -f "$backup/$id.tar.gz" ]]; then tar -xzf "$backup/$id.tar.gz" -C "$root"; fi
awk '/^PATH /{print $2}' "$backup/$id.manifest" | while read -r rel; do
  [[ -f "$root/$rel" ]] && chown "$owner" "$root/$rel"
done
awk '/^NEW /{print $2}' "$backup/$id.manifest" | while read -r rel; do
  case "$rel" in *..*|/*) continue ;; esac
  rm -f "$root/$rel"
done
systemctl restart "$service"
ok=0
for _ in $(seq 1 20); do
  if curl -fsS "$health" | grep -q '"ok":true'; then ok=1; break; fi
  sleep 1
done
[[ "$ok" == 1 ]] || { echo "rollback $id is on disk but health failed" >&2; exit 1; }
echo "rolled back to $id"
REMOTE
}

list_target() {
  local target=$1
  [[ "$target" == class ]] && prepare_class || prepare_home
  echo "backups $target"
  run_ssh "sudo bash -s" -- "$target" <<'REMOTE'
set -euo pipefail
backup=/var/backups/teachforth-$1
[[ -d "$backup" ]] || exit 0
shopt -s nullglob
for item in "$backup"/*.manifest; do
  id=$(basename "$item" .manifest)
  sha=$(awk -F= '/^SHA=/{print $2; exit}' "$item")
  printf '%s %s\n' "$id" "$sha"
done
REMOTE
}

check_target() {
  local target=$1 rel dest
  select_files "$target"
  echo "check $target"
  for rel in "${SELECTED[@]}"; do
    if [[ "$target" == class ]]; then dest=$rel; else dest=$(home_dest "$rel"); fi
    if [[ -f "$SHIP_SRC/$rel" ]]; then echo "OK $rel -> $dest"
    else echo "MISSING $rel"; fi
  done
  for rel in "${SKIPPED[@]+"${SKIPPED[@]}"}"; do echo "SKIP $rel"; done
}

targets() {
  case "$SHIP_TARGET" in
    class|home) echo "$SHIP_TARGET" ;;
    both) printf '%s\n' class home ;;
    *) reject "target must be class, home, or both" ;;
  esac
}

preflight() {
  local target
  case "$SHIP_CMD" in
    check) return ;;
  esac
  while IFS= read -r target; do
    [[ "$target" == class ]] && prepare_class || prepare_home
  done < <(targets)
}

main() {
  load_requested "$@"
  preflight
  local target
  case "$SHIP_CMD" in
    check)
      while IFS= read -r target; do check_target "$target"; done < <(targets)
      ;;
    plan)
      while IFS= read -r target; do plan_target "$target"; done < <(targets)
      ;;
    apply)
      while IFS= read -r target; do apply_target "$target"; done < <(targets)
      ;;
    rollback)
      [[ "$SHIP_ROLLBACK" != none && -n "$SHIP_ROLLBACK" ]] || reject "set SHIP_ROLLBACK to latest or a backup id"
      while IFS= read -r target; do rollback_target "$target" "$SHIP_ROLLBACK"; done < <(targets)
      ;;
    list)
      while IFS= read -r target; do list_target "$target"; done < <(targets)
      ;;
    *) reject "command must be plan, apply, rollback, list, or check" ;;
  esac
}

main "$@"
