# Sevgi QR

QR generator project with Terraform CI/CD for the existing resource group `sevgi-qr`.

## Identity

- Subscription: `f90ff751-313f-4e7a-a475-8d252d80c41a`
- Application (client) ID: `e1a4ae50-f5fd-41de-80c8-3159e6b0da84`
- Federated subject: `repo:ayhun@6255734/sevgi-qr@1441227231:environment:production`
- Issuer: `https://token.actions.githubusercontent.com`
- Audience: `api://AzureADTokenExchange`

The supplied identity ID must be the **Application (client) ID**, not an Object ID. No client secret is used. Terraform authenticates directly through GitHub OIDC, including for state access.

## One-time setup

1. Open Azure Cloud Shell in **Bash**, authenticated as an administrator able to create storage and assign roles in the target subscription:

   ```bash
   git clone https://github.com/ayhun/sevgi-qr.git
   cd sevgi-qr
   bash scripts/bootstrap-state.sh
   ```

   The script explicitly selects the specified subscription, confirms the existing group, resolves the client ID, and creates a Standard LRS account with a private `tfstate` container, versioning and 14-day soft deletion. Shared-key access is disabled. Storage incurs Azure usage charges. Default account name: `sevgiqrtff90ff751`; override with `TF_STATE_STORAGE_ACCOUNT` if needed. State storage stays outside the application Terraform stack.

   The script assigns **Contributor** on `sevgi-qr` and **Storage Blob Data Contributor** on the state container. It does not grant Owner or subscription-wide deployment access. Allow several minutes for role propagation.

2. In GitHub **Settings → Environments**, create `production`, restrict deployment branches to `main`, and add the environment variables printed by the script:
   - `AZURE_TENANT_ID`
   - `TF_STATE_STORAGE_ACCOUNT`

3. Under **Actions → Terraform → Run workflow**, select `main` and `plan`. After a successful run, choose `apply` to generate and apply a saved plan. Configure environment reviewers if desired.

## Workflow behavior

- Pull requests: formatting and validation without Azure access or OIDC tokens.
- Pushes to `main`: validation and production plan only.
- Manual runs on `main`: plan, or plan plus apply of the exact saved plan in the same job.
- Production jobs are serialized; Azure Blob leases lock the state.
- State and plans are neither committed nor uploaded as workflow artifacts.
- CI uses Terraform 1.9.8 and the committed provider lockfile.

The initial Terraform configuration only reads the existing resource group's ID and location. **No application hosting resources are defined yet.** The first workflow run verifies federation, state storage and access. Future resources should use `data.azurerm_resource_group.app.name` and `.location`.

Provider auto-registration is disabled because the identity is resource-group-scoped. An administrator must register additional service namespaces when needed. Contributor cannot create runtime IAM role assignments; those require separate authorization.

## Local validation

```bash
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init -backend=false -lockfile=readonly
terraform -chdir=infra validate
bash -n scripts/bootstrap-state.sh
```

A local Azure login cannot exercise the GitHub federated credential. Verify the trust by running the production workflow.
