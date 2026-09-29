#!/usr/bin/env bash
set -euo pipefail
RG=${RG:-teachforth-ide}
VM=${VM:-teachforth-ide}
az vm deallocate --resource-group "$RG" --name "$VM"
echo "deallocated. Disk and IP still bill a few dollars. Compute does not."
