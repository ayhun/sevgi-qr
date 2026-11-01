# Frontend only: no Functions, database, paid App Service plan, or Front Door.
# Explicit Free values prevent an accidental paid default.
resource "azurerm_static_web_app" "qr" {
  name                = "sevgi-qr"
  resource_group_name = data.azurerm_resource_group.app.name
  # Static Web Apps supports fewer regions than resource groups do.
  location = "westeurope"
  sku_tier = "Free"
  sku_size = "Free"

  tags = {
    project     = "sevgi-qr"
    environment = "production"
    managed_by  = "terraform"
  }

  # The content deployment action records these fields in Azure.
  lifecycle {
    ignore_changes = [repository_branch, repository_url]
  }
}

# DNS remains managed in Cloudflare. Its DNS-only CNAME has been verified.
resource "azurerm_static_web_app_custom_domain" "qr" {
  static_web_app_id = azurerm_static_web_app.qr.id
  domain_name       = "qr.sgkafali.com"
  validation_type   = "cname-delegation"
}

output "qr_url" {
  description = "Custom HTTPS endpoint; Azure manages the certificate."
  value       = "https://${azurerm_static_web_app_custom_domain.qr.domain_name}"
}

output "static_web_app_name" {
  description = "Hosting resource for the browser-only QR generator."
  value       = azurerm_static_web_app.qr.name
}

output "static_web_app_url" {
  description = "Azure HTTPS endpoint; application content is deployed separately."
  value       = "https://${azurerm_static_web_app.qr.default_host_name}"
}

output "qr_domain_cname_target" {
  description = "Keep the DNS-only Cloudflare CNAME named qr pointing here."
  value       = azurerm_static_web_app.qr.default_host_name
}

# Do not output the deployment API key. The provider still stores this sensitive
# computed attribute in state, so state blob permissions must remain restricted.
