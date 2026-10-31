#!/usr/bin/env bash
# Run after azure/login. State storage deliberately lives outside Terraform state.
set -euo pipefail

: "${ARM_SUBSCRIPTION_ID:?Set ARM_SUBSCRIPTION_ID}"
: "${TF_STATE_STORAGE_ACCOUNT:?Set TF_STATE_STORAGE_ACCOUNT}"
state_account="$TF_STATE_STORAGE_ACCOUNT"
resource_group=sevgi-qr

if [[ ! "$state_account" =~ ^[a-z0-9]{3,24}$ ]]; then
  echo '::error::TF_STATE_STORAGE_ACCOUNT must contain 3–24 lowercase letters or digits.'
  exit 1
fi

az account set --subscription "$ARM_SUBSCRIPTION_ID"
location=$(az group show --name "$resource_group" --query location -o tsv)
# A failed list is fatal, not evidence that an account is missing.
existing=$(az storage account list --resource-group "$resource_group" \
  --query "[?name=='$state_account'].name | [0]" -o tsv)
if [[ -z "$existing" ]]; then
  echo "Creating state storage account $state_account in $resource_group."
  az storage account create --name "$state_account" --resource-group "$resource_group" \
    --location "$location" --sku Standard_LRS --kind StorageV2 --https-only true \
    --min-tls-version TLS1_2 --allow-blob-public-access false \
    --allow-shared-key-access false --output none
  az storage account blob-service-properties update --account-name "$state_account" \
    --resource-group "$resource_group" --enable-versioning true \
    --enable-delete-retention true --delete-retention-days 14 --output none
else
  echo "Reusing state storage account $state_account."
fi

# Idempotent: creates a private container if absent, preserving existing state.
# Retry briefly for new account provisioning and recently granted RBAC access.
for attempt in 1 2 3 4 5 6; do
  if az storage container create --account-name "$state_account" --name tfstate \
    --auth-mode login --output none; then
    echo 'Terraform state storage is ready.'
    exit 0
  fi
  if [[ "$attempt" -lt 6 ]]; then
    echo "State container not ready (attempt $attempt/6); retrying in 10 seconds."
    sleep 10
  fi
done
echo '::error::Cannot access the tfstate container. Check storage networking and grant the deployment identity Storage Blob Data Contributor on the state account (or sevgi-qr resource group before account creation). Owner/Contributor alone is insufficient. No storage keys are used.'
exit 1
