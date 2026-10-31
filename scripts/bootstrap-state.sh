#!/usr/bin/env bash
# Run once as an Azure administrator in Azure Cloud Shell (Bash).
set -euo pipefail

subscription=f90ff751-313f-4e7a-a475-8d252d80c41a
resource_group=sevgi-qr
client_id=e1a4ae50-f5fd-41de-80c8-3159e6b0da84
state_account="${TF_STATE_STORAGE_ACCOUNT:-sevgiqrtff90ff751}"

az account set --subscription "$subscription"
location=$(az group show --name "$resource_group" --query location -o tsv)
# Resolve the application client ID to its distinct service principal object ID.
principal_id=$(az ad sp show --id "$client_id" --query id -o tsv)
scope="/subscriptions/$subscription/resourceGroups/$resource_group"

az provider register --namespace Microsoft.Storage --wait
az storage account create --name "$state_account" --resource-group "$resource_group" \
  --location "$location" --sku Standard_LRS --kind StorageV2 --https-only true \
  --min-tls-version TLS1_2 --allow-blob-public-access false --allow-shared-key-access false --output none
storage_scope="$scope/providers/Microsoft.Storage/storageAccounts/$state_account"
# Use the management plane to create the private container; no account keys.
az rest --method put \
  --url "https://management.azure.com$storage_scope/blobServices/default/containers/tfstate?api-version=2023-05-01" \
  --body '{"properties":{"publicAccess":"None"}}' --output none
az storage account blob-service-properties update --account-name "$state_account" \
  --resource-group "$resource_group" --enable-versioning true \
  --enable-delete-retention true --delete-retention-days 14 --output none

ensure_role() {
  local target_scope="$1" role="$2"
  local count
  count=$(az role assignment list --scope "$target_scope" \
    --query "length([?principalId=='$principal_id' && roleDefinitionName=='$role'])" -o tsv)
  if [ "$count" = "0" ]; then
    az role assignment create --assignee-object-id "$principal_id" \
      --assignee-principal-type ServicePrincipal --role "$role" --scope "$target_scope" --output none
  fi
}
ensure_role "$scope" Contributor
ensure_role "$storage_scope/blobServices/default/containers/tfstate" 'Storage Blob Data Contributor'
printf 'Set GitHub production environment variables:\nAZURE_TENANT_ID=%s\nTF_STATE_STORAGE_ACCOUNT=%s\n' \
  "$(az account show --query tenantId -o tsv)" "$state_account"
