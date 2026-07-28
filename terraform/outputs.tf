output "d1_database_id" {
  description = "Copy this value to database_id in wrangler.jsonc."
  value       = cloudflare_d1_database.app.id
}

output "d1_database_name" {
  value = cloudflare_d1_database.app.name
}

output "custom_domain_hostname" {
  description = "Custom hostname attached to the Worker, or null when disabled."
  value       = try(cloudflare_workers_custom_domain.app[0].hostname, null)
}

output "custom_domain_certificate_id" {
  description = "TLS certificate issued by Cloudflare for the custom domain."
  value       = try(cloudflare_workers_custom_domain.app[0].cert_id, null)
}
