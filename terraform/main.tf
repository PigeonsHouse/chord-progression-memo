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
  read_replication = {
    mode = "disabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_workers_custom_domain" "app" {
  count = var.custom_domain_hostname == "" ? 0 : 1

  account_id = var.cloudflare_account_id
  hostname   = var.custom_domain_hostname
  service    = var.worker_name
  zone_name  = var.cloudflare_zone_name
}
