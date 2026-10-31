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
  description = "Create a CNAME named qr in sgkafali.com pointing here. Bind the custom domain after DNS is ready."
  value       = azurerm_static_web_app.qr.default_host_name
}

# Do not output the deployment API key. The provider still stores this sensitive
# computed attribute in state, so state blob permissions must remain restricted.
