# Application records have their own account. Terraform state remains separate.
resource "azurerm_storage_account" "links" {
  name                            = "sevgiqrlinks1405"
  resource_group_name             = data.azurerm_resource_group.app.name
  location                        = data.azurerm_resource_group.app.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  public_network_access_enabled   = true # Managed SWA functions need a public Table endpoint.

  tags = {
    project     = "sevgi-qr"
    environment = "production"
    managed_by  = "terraform"
  }
}

resource "azurerm_storage_table" "links" {
  name                 = "links"
  storage_account_name = azurerm_storage_account.links.name
}

resource "azurerm_storage_table" "scans" {
  name                 = "scans"
  storage_account_name = azurerm_storage_account.links.name
}

variable "budget_alert_emails" {
  type        = list(string)
  description = "Email recipients for the sevgi-qr resource-group budget alerts."
  validation {
    condition     = length(var.budget_alert_emails) > 0 && alltrue([for email in var.budget_alert_emails : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", email))])
    error_message = "Set TF_VAR_budget_alert_emails to a JSON array of valid email addresses."
  }
}

resource "azurerm_consumption_budget_resource_group" "qr" {
  name              = "sevgi-qr-monthly"
  resource_group_id = data.azurerm_resource_group.app.id
  amount            = 5
  time_grain        = "Monthly"
  time_period {
    start_date = "2026-11-01T00:00:00Z"
  }
  notification {
    enabled        = true
    threshold      = 50
    operator       = "GreaterThanOrEqualTo"
    contact_emails = var.budget_alert_emails
  }
  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThanOrEqualTo"
    contact_emails = var.budget_alert_emails
  }
}
