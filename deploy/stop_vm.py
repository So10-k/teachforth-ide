import json
import os
import urllib.request

endpoint = os.environ["IDENTITY_ENDPOINT"]
header = os.environ["IDENTITY_HEADER"]
token_url = endpoint + "?resource=https://management.azure.com/&api-version=2019-08-01"
token_req = urllib.request.Request(token_url, headers={"X-IDENTITY-HEADER": header})
with urllib.request.urlopen(token_req) as res:
    token = json.load(res)["access_token"]

sub = "__SUB__"
rg = "__RG__"
name = "__VM__"
url = (
    "https://management.azure.com/subscriptions/"
    + sub
    + "/resourceGroups/"
    + rg
    + "/providers/Microsoft.Compute/virtualMachines/"
    + name
    + "/deallocate?api-version=2024-07-01"
)
stop = urllib.request.Request(
    url,
    data=b"{}",
    method="POST",
    headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
)
with urllib.request.urlopen(stop) as res:
    print("deallocate status", res.status)
