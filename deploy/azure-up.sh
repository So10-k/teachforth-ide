#!/usr/bin/env bash
# Creates the cheap TeachForth IDE VM and the schedules that turn it off.
# Does not run until Azure CLI is logged in.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
RG=${RG:-teachforth-ide}
VM=${VM:-teachforth-ide}
LOC=${LOC:-eastus}
SIZE=${SIZE:-Standard_B1ms}
ADMIN=${ADMIN:-azureuser}
# Windows timezone id, which is what Azure schedules use.
TZ_WIN=${TZ_WIN:-Eastern Standard Time}
# 9:30pm local. Change this before you run the script if that is wrong.
SHUTDOWN_TIME=${SHUTDOWN_TIME:-2130}
# 8:00am local. The VM starts, then shuts itself off after 90 idle minutes.
START_HOUR=${START_HOUR:-08}
IDLE_SHUTDOWN_MINUTES=${IDLE_SHUTDOWN_MINUTES:-90}
KEY_DIR="$ROOT/deploy/keys"
KEY="$KEY_DIR/teachforth-ide"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI is not installed."
  echo "Install it, run: az login"
  echo "Then re-run: deploy/azure-up.sh"
  exit 1
fi

if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI is not logged in."
  echo "Run: az login"
  echo "Then re-run: deploy/azure-up.sh"
  exit 1
fi

mkdir -p "$KEY_DIR"
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -f "$KEY" -N "" -C teachforth-ide
fi
chmod 600 "$KEY"

# B1ms is often out of capacity. Try a few small sizes before giving up.
# B2als_v2 is 2 vCPU / 4GB, about $0.038/hour, and easier to get than B1ms.
if [ -n "${SIZE_EXPLICIT:-}" ]; then
  CANDIDATES=("$LOC $SIZE")
else
  # Small burstable sizes, US regions first. Capacity moves around, so this list is a search.
  # location size zone. Zone 0 means no zone. D2as_v5 is the capacity fallback, not the cheap size.
  CANDIDATES=(
    "polandcentral Standard_B2als_v2 0"
    "eastus2 Standard_B2als_v2 1"
    "eastus2 Standard_B2als_v2 2"
    "eastus2 Standard_B2als_v2 3"
    "westus3 Standard_B2ls_v2 1"
    "southcentralus Standard_B2s 1"
    "eastus2 Standard_D2as_v5 1"
    "westus3 Standard_D2as_v5 1"
    "southcentralus Standard_D2as_v5 1"
  )
fi

cleanup_failed_vm() {
  az vm delete --resource-group "$RG" --name "$VM" --yes >/dev/null 2>&1 || true
  az network nic delete --resource-group "$RG" --name "${VM}VMNic" >/dev/null 2>&1 || true
  az network public-ip delete --resource-group "$RG" --name "${VM}PublicIP" >/dev/null 2>&1 || true
  az network nsg delete --resource-group "$RG" --name "${VM}NSG" >/dev/null 2>&1 || true
  az network vnet delete --resource-group "$RG" --name "${VM}VNET" >/dev/null 2>&1 || true
  local disk
  for disk in $(az disk list --resource-group "$RG" --query "[].name" -o tsv 2>/dev/null); do
    az disk delete --resource-group "$RG" --name "$disk" --yes >/dev/null 2>&1 || true
  done
}

az group create --name "$RG" --location eastus >/dev/null
created=0
existing=$(az vm show --resource-group "$RG" --name "$VM" --query provisioningState -o tsv 2>/dev/null || echo Missing)
if [ "$existing" = "Succeeded" ]; then
  LOC=$(az vm show --resource-group "$RG" --name "$VM" --query location -o tsv)
  SIZE=$(az vm show --resource-group "$RG" --name "$VM" --query hardwareProfile.vmSize -o tsv)
  echo "Using existing $VM ($SIZE) in $LOC"
  created=1
fi
for candidate in "${CANDIDATES[@]}"; do
  if [ "$created" -eq 1 ]; then
    break
  fi
  set -- $candidate
  LOC=$1
  SIZE=$2
  ZONE=${3:-0}
  zone_args=()
  if [ "$ZONE" != "0" ]; then
    zone_args=(--zone "$ZONE")
    echo "Trying $SIZE in $LOC zone $ZONE"
  else
    echo "Trying $SIZE in $LOC"
  fi
  az vm create \
    --resource-group "$RG" \
    --name "$VM" \
    --location "$LOC" \
    --image Ubuntu2404 \
    --size "$SIZE" \
    --admin-username "$ADMIN" \
    --ssh-key-values "$KEY.pub" \
    --public-ip-sku Standard \
    --storage-sku StandardSSD_LRS \
    --os-disk-size-gb 32 \
    --nsg-rule SSH \
    "${zone_args[@]}" \
    >/tmp/teachforth-vm.json 2>/tmp/teachforth-vm.err || true
  state=$(az vm show --resource-group "$RG" --name "$VM" --query provisioningState -o tsv 2>/dev/null || echo Missing)
  if [ "$state" = "Succeeded" ]; then
    created=1
    break
  fi
  echo "$SIZE is not available in $LOC ($state). Cleaning up."
  cleanup_failed_vm
done
if [ "$created" -ne 1 ]; then
  echo "No small VM size was available. Nothing was left running."
  exit 1
fi
echo "Created $VM ($SIZE) in $LOC"

az vm open-port --resource-group "$RG" --name "$VM" --port 80 >/dev/null || true
IP=$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)
VM_ID=$(az vm show -g "$RG" -n "$VM" --query id -o tsv)
SUB=$(az account show --query id -o tsv)
# DevTest Labs schedules are not offered in every VM region (polandcentral).
# Start and stop runbooks live in eastus and can still manage this VM.
AUTO_LOC=eastus

echo "Public IP: $IP"
echo "Giving the VM permission to deallocate itself when idle"
az vm identity assign --resource-group "$RG" --name "$VM" >/dev/null
VM_PRINCIPAL=$(az vm show -g "$RG" -n "$VM" --query identity.principalId -o tsv)
for attempt in 1 2 3 4 5 6; do
  if az role assignment create \
    --assignee-object-id "$VM_PRINCIPAL" \
    --assignee-principal-type ServicePrincipal \
    --role "Virtual Machine Contributor" \
    --scope "$VM_ID" >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 6 ]; then
    echo "WARNING: VM cannot deallocate itself yet. Nightly stop still covers it."
  fi
  sleep 15
done

setup_autostart() {
  set -e
  if [ -f "$ROOT/deploy/manual-power.on" ]; then
    echo "Manual power panel owns start and stop. Skipping daily schedules."
    return 0
  fi
  local auto="${VM}-auto"
  if ! az automation account show -g "$RG" -n "$auto" >/dev/null 2>&1; then
    az automation account create \
      --resource-group "$RG" \
      --name "$auto" \
      --location "$AUTO_LOC" \
      --sku Free >/dev/null
  fi
  local account_id
  account_id=$(az automation account show -g "$RG" -n "$auto" --query id -o tsv)
  az rest --method patch --url "${account_id}?api-version=2023-11-01" \
    --body '{"identity":{"type":"SystemAssigned"}}' >/dev/null
  local principal
  principal=$(az automation account show -g "$RG" -n "$auto" --query identity.principalId -o tsv)
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if az role assignment create \
      --assignee-object-id "$principal" \
      --assignee-principal-type ServicePrincipal \
      --role "Virtual Machine Contributor" \
      --scope "$VM_ID" >/dev/null; then
      break
    fi
    if [ "$attempt" -eq 6 ]; then
      return 1
    fi
    sleep 15
  done
  publish_runbook() {
    local name="$1" src="$2"
    local filled
    filled=$(mktemp)
    sed -e "s/__SUB__/$SUB/" -e "s/__RG__/$RG/" -e "s/__VM__/$VM/" "$src" > "$filled"
    az automation runbook create \
      --resource-group "$RG" \
      --automation-account-name "$auto" \
      --name "$name" \
      --type Python3 \
      --location "$AUTO_LOC" >/dev/null 2>&1 || true
    az automation runbook replace-content \
      --resource-group "$RG" \
      --automation-account-name "$auto" \
      --name "$name" \
      --content @"$filled" >/dev/null
    az automation runbook publish \
      --resource-group "$RG" \
      --automation-account-name "$auto" \
      --name "$name" >/dev/null
    rm -f "$filled"
  }
  publish_runbook StartTeachForth "$ROOT/deploy/start_vm.py"
  publish_runbook StopTeachForth "$ROOT/deploy/stop_vm.py"
  local start_time stop_time
  # Include the Eastern offset. A naive timestamp is treated as the machine's timezone.
  start_time=$(TZ=America/New_York date -d "tomorrow ${START_HOUR}:00" +%Y-%m-%dT%H:%M:%S%:z)
  stop_time=$(TZ=America/New_York date -d "today ${SHUTDOWN_TIME:0:2}:${SHUTDOWN_TIME:2:2}" +%Y-%m-%dT%H:%M:%S%:z)
  if [ "$(TZ=America/New_York date -d "$stop_time" +%s)" -le "$(( $(date +%s) + 600 ))" ]; then
    stop_time=$(TZ=America/New_York date -d "tomorrow ${SHUTDOWN_TIME:0:2}:${SHUTDOWN_TIME:2:2}" +%Y-%m-%dT%H:%M:%S%:z)
  fi
  az automation schedule create \
    --resource-group "$RG" \
    --automation-account-name "$auto" \
    --name morning-start \
    --frequency Day \
    --interval 1 \
    --start-time "$start_time" \
    --time-zone "$TZ_WIN" >/dev/null
  az automation schedule create \
    --resource-group "$RG" \
    --automation-account-name "$auto" \
    --name nightly-stop \
    --frequency Day \
    --interval 1 \
    --start-time "$stop_time" \
    --time-zone "$TZ_WIN" >/dev/null
  local link_id
  link_id=$(python3 -c "import uuid; print(uuid.uuid4())")
  az rest --method put \
    --url "${account_id}/jobSchedules/${link_id}?api-version=2023-11-01" \
    --body "{\"properties\":{\"schedule\":{\"name\":\"morning-start\"},\"runbook\":{\"name\":\"StartTeachForth\"}}}" \
    >/dev/null
  link_id=$(python3 -c "import uuid; print(uuid.uuid4())")
  az rest --method put \
    --url "${account_id}/jobSchedules/${link_id}?api-version=2023-11-01" \
    --body "{\"properties\":{\"schedule\":{\"name\":\"nightly-stop\"},\"runbook\":{\"name\":\"StopTeachForth\"}}}" \
    >/dev/null
}

set +e
( setup_autostart )
start_status=$?
set -e
if [ "$start_status" -eq 0 ]; then
  echo "Morning start scheduled at ${START_HOUR}:00 $TZ_WIN"
else
  echo "WARNING: start/stop schedules were not created."
  echo "Idle deallocate still runs on the VM. Manual start: deploy/azure-start.sh"
fi

echo "Waiting for SSH"
for _ in $(seq 1 30); do
  if ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 "$ADMIN@$IP" true; then
    break
  fi
  sleep 10
done

tar -C "$ROOT" \
  --exclude data \
  --exclude deploy/keys \
  --exclude .git \
  -czf /tmp/teachforth-ide.tgz .
scp -i "$KEY" -o StrictHostKeyChecking=accept-new /tmp/teachforth-ide.tgz "$ADMIN@$IP:/tmp/teachforth-ide.tgz"
ssh -i "$KEY" "$ADMIN@$IP" "sudo mkdir -p /opt/teachforth-ide && sudo tar -xzf /tmp/teachforth-ide.tgz -C /opt/teachforth-ide"
ssh -i "$KEY" "$ADMIN@$IP" "sudo IDLE_SHUTDOWN_MINUTES=$IDLE_SHUTDOWN_MINUTES bash /opt/teachforth-ide/deploy/install-on-vm.sh"
ssh -i "$KEY" "$ADMIN@$IP" "sudo sed -i 's/IDLE_SHUTDOWN_MINUTES=90/IDLE_SHUTDOWN_MINUTES=$IDLE_SHUTDOWN_MINUTES/' /etc/systemd/system/teachforth-idle.service && sudo systemctl daemon-reload"

echo
echo "TeachForth IDE: http://$IP"
echo "Admin login:"
ssh -i "$KEY" "$ADMIN@$IP" "sudo cat /var/lib/teachforth-ide/admin-password.txt"
echo
echo "The VM deallocates after $IDLE_SHUTDOWN_MINUTES idle minutes, and again at $SHUTDOWN_TIME $TZ_WIN."
echo "It is scheduled to start again at ${START_HOUR}:00. Manual start: deploy/azure-start.sh"
echo "Region is $LOC because smaller US regions had no capacity. US students will see higher latency."
