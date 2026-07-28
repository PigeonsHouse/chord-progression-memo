output "d1_database_id" {
  description = "Copy this value to database_id in wrangler.jsonc."
  value       = cloudflare_d1_database.app.id
}

output "d1_database_name" {
  value = cloudflare_d1_database.app.name
}
