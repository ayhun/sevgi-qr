terraform {
  required_version = ">= 1.5.0, < 2.0.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
  backend "azurerm" {
    resource_group_name = "sevgi-qr"
    container_name      = "tfstate"
    key                 = "production.tfstate"
    use_oidc            = true
    use_azuread_auth    = true
  }
}

provider "azurerm" {
  features {}
  # Resource-group-scoped identities cannot register subscription providers.
  resource_provider_registrations = "none"
  storage_use_azuread             = true
}

# Existing group: do not import, recreate, or destroy it with this stack.
data "azurerm_resource_group" "app" {
  name = "sevgi-qr"
}

output "resource_group_id" {
  value = data.azurerm_resource_group.app.id
}

output "location" {
  value = data.azurerm_resource_group.app.location
}
