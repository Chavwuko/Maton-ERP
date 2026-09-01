output "alb_dns_name" {
  description = "Public DNS name of the load balancer fronting the backend"
  value       = aws_lb.main.dns_name
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint (host:port)"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "db_credentials_secret_arn" {
  description = "Secrets Manager ARN holding DB credentials and connection URL"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.backend.id
}

output "cognito_client_secret" {
  value     = aws_cognito_user_pool_client.backend.client_secret
  sensitive = true
}

output "cognito_hosted_ui_domain" {
  value = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "documents_bucket_name" {
  value = aws_s3_bucket.documents.bucket
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}
