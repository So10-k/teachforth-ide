#!/usr/bin/env bash
# Shuts this VM off when nobody has hit TeachForth IDE recently.
# Refuses to run unless the systemd unit sets TEACHFORTH_ALLOW_SHUTDOWN=1,
# so a copy of this script cannot power off the wrong machine.
set -euo pipefail

if [ "${TEACHFORTH_ALLOW_SHUTDOWN:-}" != "1" ]; then
  echo "idle shutdown skipped: TEACHFORTH_ALLOW_SHUTDOWN is not 1"
  exit 0
fi
if [ ! -f /etc/teachforth-ide-vm ]; then
  echo "idle shutdown skipped: this is not the TeachForth IDE VM"
  exit 0
fi

HOLD="${MANUAL_HOLD:-/var/lib/teachforth-ide/manual-hold}"
if [ -f "$HOLD" ]; then
  until=$(tr -d '[:space:]' < "$HOLD" || true)
  until_s=$(date -d "$until" +%s 2>/dev/null || echo 0)
  if [ "$until_s" -gt "$(date +%s)" ]; then
    echo "manual session until $until, leaving the VM up"
    exit 0
  fi
fi

STAMP="${IDLE_STAMP:-/var/lib/teachforth-ide/last-request}"
MINUTES="${IDLE_SHUTDOWN_MINUTES:-90}"

if [ ! -f "$STAMP" ]; then
  echo "no stamp yet, leaving the VM up"
  exit 0
fi

age=$(( $(date +%s) - $(stat -c %Y "$STAMP") ))
limit=$(( MINUTES * 60 ))
if [ "$age" -lt "$limit" ]; then
  echo "active ${age}s ago, limit ${limit}s"
  exit 0
fi

logger -t teachforth-ide "idle for ${age}s, saving open projects"
curl -fsS -m 90 -X POST http://127.0.0.1:8080/api/internal/flush || logger -t teachforth-ide "flush failed, still deallocating"
logger -t teachforth-ide "idle for ${age}s, deallocating"
# Guest shutdown leaves the VM allocated, so Azure keeps charging for compute.
# Deallocate through the VM identity. If that is not ready yet, try again next tick.
python3 - <<'PY'
import json, sys, urllib.request
meta_req = urllib.request.Request(
    "http://169.254.169.254/metadata/instance/compute?api-version=2021-02-01",
    headers={"Metadata": "true"},
)
with urllib.request.urlopen(meta_req, timeout=5) as res:
    meta = json.load(res)
token_req = urllib.request.Request(
    "http://169.254.169.254/metadata/identity/oauth2/token"
    "?api-version=2018-02-01&resource=https://management.azure.com/",
    headers={"Metadata": "true"},
)
with urllib.request.urlopen(token_req, timeout=5) as res:
    token = json.load(res)["access_token"]
url = (
    "https://management.azure.com/subscriptions/"
    + meta["subscriptionId"]
    + "/resourceGroups/"
    + meta["resourceGroupName"]
    + "/providers/Microsoft.Compute/virtualMachines/"
    + meta["name"]
    + "/deallocate?api-version=2024-07-01"
)
req = urllib.request.Request(
    url,
    data=b"{}",
    method="POST",
    headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=30) as res:
    print("deallocate status", res.status)
PY
