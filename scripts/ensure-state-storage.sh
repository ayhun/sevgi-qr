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

# Read our own object ID from the Azure-issued token without a Graph lookup.
# Never print or persist the token. The application/client ID is NOT the object ID.
principal_id=$(az account get-access-token --resource https://management.azure.com/ \
  --query accessToken -o tsv | python3 -c '
import base64, json, sys, uuid
payload = sys.stdin.read().strip().split(".")[1]
claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
print(uuid.UUID(claims["oid"]))
')
storage_scope="/subscriptions/$ARM_SUBSCRIPTION_ID/resourceGroups/$resource_group/providers/Microsoft.Storage/storageAccounts/$state_account"
container_scope="$storage_scope/blobServices/default/containers/tfstate"
blob_contributor=ba92f5b4-2d11-453d-a403-e96b0029c9fe
blob_owner=b7e6dc6d-f1e8-4753-8033-0f276bb0955b
# Include inherited assignments and existing container-scoped grants. A failed
# lookup is fatal. Conditional grants are not assumed to cover Terraform access.
role_count=$(az role assignment list --scope "$container_scope" --include-inherited \
  --fill-principal-name false \
  --query "length([?principalId=='$principal_id' && condition==null && (ends_with(roleDefinitionId, '$blob_contributor') || ends_with(roleDefinitionId, '$blob_owner'))])" -o tsv)
if [[ "$role_count" == 0 ]]; then
  echo 'Assigning Storage Blob Data Contributor on the Terraform state account.'
  if ! az role assignment create --assignee-object-id "$principal_id" \
    --assignee-principal-type ServicePrincipal --role "$blob_contributor" \
    --scope "$storage_scope" --output none; then
    echo '::error::Cannot assign the state storage role. The workflow identity needs roleAssignments/write on this account (for example Owner on sevgi-qr). Contributor alone cannot assign roles. An administrator can instead grant Storage Blob Data Contributor directly.'
    exit 1
  fi
else
  echo 'An applicable blob data role already exists; skipping role assignment.'
fi

# Idempotent: creates a private container if absent, preserving existing state.
# Allow up to ten minutes for new RBAC grants to propagate. Verify blob listing
# too: successfully creating an existing container does not prove blob access.
for attempt in $(seq 1 31); do
  if az storage container create --account-name "$state_account" --name tfstate \
    --auth-mode login --output none && \
    az storage blob list --account-name "$state_account" --container-name tfstate \
      --auth-mode login --num-results 1 --output none; then
    echo 'Terraform state storage is ready.'
    exit 0
  fi
  if [[ "$attempt" -lt 31 ]]; then
    echo "State blob access not ready (attempt $attempt/31); retrying in 20 seconds."
    sleep 20
  fi
done
echo '::error::Cannot access the tfstate container. Check storage networking and grant the deployment identity Storage Blob Data Contributor on the state account (or sevgi-qr resource group before account creation). Owner/Contributor alone is insufficient. No storage keys are used.'
exit 1
