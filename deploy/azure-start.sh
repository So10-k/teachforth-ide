#!/usr/bin/env bash
set -euo pipefail
RG=${RG:-teachforth-ide}
VM=${VM:-teachforth-ide}
az vm start --resource-group "$RG" --name "$VM"
az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv
