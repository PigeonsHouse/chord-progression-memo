terraform {
  required_version = ">= 1.7.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.22"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

resource "cloudflare_d1_database" "app" {
  account_id            = var.cloudflare_account_id
  name                  = var.database_name
  primary_location_hint = "apac"

  lifecycle {
    prevent_destroy = true
  }
}
