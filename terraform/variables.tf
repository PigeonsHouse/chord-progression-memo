variable "cloudflare_api_token" {
  description = "API token with D1 Edit and, when using a custom domain, Workers Scripts Edit permissions."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "database_name" {
  description = "D1 database name."
  type        = string
  default     = "chord-progression-memo"
}

variable "worker_name" {
  description = "Name of the already-deployed Worker to attach the custom domain to."
  type        = string
  default     = "chord-progression-memo"
}

variable "custom_domain_hostname" {
  description = "Full custom hostname, for example chords.example.com. Leave empty to skip custom-domain creation."
  type        = string
  default     = ""
}

variable "cloudflare_zone_name" {
  description = "Cloudflare zone containing the custom hostname, for example example.com."
  type        = string
  default     = ""
}
