variable "cloudflare_api_token" {
  description = "API token with D1 Read and D1 Write permissions."
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
