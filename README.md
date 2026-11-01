# Sevgi QR

QR Studio at https://qr.sgkafali.com: a browser-based QR generator, styled to
match Sevgi's portfolio, with automated Azure deployment.

## Application

- Link, text, email, call, SMS, vCard, WhatsApp, and Wi-Fi codes.
- Live preview, three high-contrast ink colors, error correction selection,
  and PNG (512/1024/2048 px) or SVG downloads.
- Content stays in memory in the current tab. No account, analytics, backend,
  or browser storage. The deployed content security policy blocks network
  connections from scripts. Google Fonts supplies the portfolio typography.
- Static codes contain their content directly; there is no redirect service,
  editing after download, scan tracking, or expiry imposed by this tool.
- Wi-Fi uses personal-network credentials (WPA/WPA2/WPA3, WEP or open).
  Enterprise/EAP networks are not supported. Scanner behavior varies by device;
  test the downloaded code with your intended phone before printing.

Use Node.js 24 and pnpm 11.19.0:

```bash
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Tests generate PNGs for all eight payload types and independently decode them,
including Unicode and escaped Wi-Fi/vCard fields. Browser verification also
covers downloads, input clearing, and the mobile layout.

Every push to `main` validates Terraform, tests and builds the frontend, applies
the saved Terraform plan, and deploys `dist/` with Azure Static Web Apps. The
workflow obtains and masks the deployment token through the existing Azure
OIDC login; no additional GitHub secret is required. The identity needs
`Microsoft.Web/staticSites/listSecrets/action`, included in its existing
resource-group Owner/Contributor role. Manual plan-only runs do not deploy.

## Identity

- Subscription: `f90ff751-313f-4e7a-a475-8d252d80c41a`
- Application (client) ID: `e1a4ae50-f5fd-41de-80c8-3159e6b0da84`
- Federated subject: `repo:ayhun@6255734/sevgi-qr@1441227231:environment:production`
- Issuer: `https://token.actions.githubusercontent.com`
- Audience: `api://AzureADTokenExchange`

The supplied identity ID must be the **Application (client) ID**, not an Object ID. No client secret is used. Terraform authenticates directly through GitHub OIDC, including for state access.

## One-time setup

The production workflow now creates the state account automatically using the
`TF_STATE_STORAGE_ACCOUNT` production environment variable, and creates the
private `tfstate` container before Terraform initializes. Existing accounts and
state are reused. Choose a globally unique account name (3–24 lowercase letters
or digits). New accounts use Standard LRS, disable shared keys and public blob
access, and enable versioning and 14-day blob soft deletion; storage incurs Azure
usage charges. Even plan-only production runs may create this backend storage.

The workflow checks for an existing Storage Blob Data Contributor/Owner grant
on `tfstate`, including inherited grants. If missing, it assigns itself
**Storage Blob Data Contributor on the state storage account only**. Creating
that assignment requires `Microsoft.Authorization/roleAssignments/write`, for
example through an existing **Owner** role on `sevgi-qr`. It never grants itself
Owner or subscription-wide permissions. Alternatively, an administrator can
preassign the blob role and leave the workflow with Contributor for deployment.
Conditional/custom roles are not treated as equivalent by this check.

An administrator must register `Microsoft.Storage` in the subscription; the
workflow does not register subscription providers. It retries container creation
and blob listing for up to ten minutes for RBAC propagation before Terraform init.
Set `AZURE_TENANT_ID` and `TF_STATE_STORAGE_ACCOUNT` under the GitHub
`production` environment's **Variables**, not Secrets. Then run the workflow.

Alternatively, use the administrator bootstrap below to pre-create storage and
grant narrower, container-scoped blob permissions:

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

3. Push to `main` to plan and automatically apply the saved plan. Manual
   **Actions → Build and deploy → Run workflow** still supports `plan` and `apply`.
   Configure environment reviewers if desired.

## Workflow behavior

- Pull requests: formatting, Terraform validation, frontend tests and build.
- Pushes to `main`: validation, production plan, then automatic apply of that
  exact saved plan, then frontend deployment. Changes on `main` can therefore change Azure resources.
- Manual runs on `main`: plan, or plan plus apply of the exact saved plan in the same job.
- Production jobs are serialized; Azure Blob leases lock the state.
- State and plans are neither committed nor uploaded as workflow artifacts.
- CI uses Terraform 1.9.8 and the committed provider lockfile.
- All jobs use Ubuntu 24.04 explicitly, with Node.js 24-based checkout,
  setup-terraform and Azure login actions. Runner OS upgrades are intentional,
  rather than following changes to `ubuntu-latest`.

Terraform defines one **Azure Static Web App on the Free plan**, named `sevgi-qr`
in West Europe, inside the existing resource group. No API, database, paid App
Service plan, Front Door, DNS zone, or monitoring resources are provisioned.
The remote Terraform state account is separately metered Azure Storage; this
configuration does not guarantee a zero Azure bill.

## Provision hosting

1. Ensure `Microsoft.Web` is registered in the target subscription. If the
   workflow preflight reports it is not, a subscription administrator can run
   `az provider register --namespace Microsoft.Web --subscription f90ff751-313f-4e7a-a475-8d252d80c41a --wait`.
2. Review the production plan from the push. For a fresh hosting deployment it
   adds `azurerm_static_web_app.qr` on the Free SKU and its custom-domain binding.
   With hosting already provisioned, only the custom-domain binding should be added.
3. Push to `main`. The workflow plans and applies automatically. For a retry
   without a new commit, run **Actions → Build and deploy → Run workflow → apply**.
4. The successful run summary provides the Azure HTTPS URL and the CNAME target
   for `qr.sgkafali.com`. Add only a `qr` CNAME at the current DNS provider;
   leave the portfolio's apex and `www` records unchanged.

The workflow deploys the QR application after applying Terraform. Terraform binds
`qr.sgkafali.com` with CNAME validation; the DNS-only Cloudflare CNAME was verified
before enabling this resource. Keep that record in place for Azure validation
and managed HTTPS. Until binding and certificate provisioning complete, use the
generated Azure hostname.

The domain binding is now in Terraform state. Its one-time import declaration
has been removed. The workflow identity retains subscription Reader (or an
equivalent custom role for `Microsoft.Web/locations/staticSitesOperationStatuses/read`)
so future domain operations can be polled.

The provider stores the sensitive deployment API key in Terraform state. It is
not exposed through Terraform outputs or the workflow summary. Keep state
storage access restricted.

Provider auto-registration is disabled because the identity is resource-group-scoped. An administrator must register additional service namespaces when needed. Contributor cannot create runtime IAM role assignments; those require separate authorization.

## Local validation

```bash
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init -backend=false -lockfile=readonly
terraform -chdir=infra validate
bash -n scripts/bootstrap-state.sh
bash -n scripts/ensure-state-storage.sh
```

A local Azure login cannot exercise the GitHub federated credential. Verify the trust by running the production workflow.
