resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-users"

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration {
    enabled = true
  }

  auto_verified_attributes = ["email"]

  schema {
    name                     = "email"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = true
    developer_only_attribute = false
  }

  # Custom attribute linking a Cognito identity to a department in the core schema.
  # Kept as a string of the department's UUID rather than a foreign key, since
  # Cognito has no concept of your application database.
  schema {
    name                     = "department_id"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false
    developer_only_attribute = false
  }

  tags = { Name = "${local.name_prefix}-user-pool" }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${local.name_prefix}-auth"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "backend" {
  name         = "${local.name_prefix}-backend-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                     = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  callback_urls                        = var.cognito_callback_urls
  logout_urls                          = var.cognito_logout_urls
  supported_identity_providers          = ["COGNITO"]

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

# The backend needs this to exchange an auth code for tokens server-side
# (see backend/src/auth/cognito-oauth.service.ts) — stored in Secrets
# Manager rather than a plain ECS env var, mirroring db_credentials in
# rds.tf, since unlike the client id this must stay confidential.
resource "aws_secretsmanager_secret" "cognito_client_secret" {
  name = "${local.name_prefix}/cognito-client-secret"
}

resource "aws_secretsmanager_secret_version" "cognito_client_secret" {
  secret_id     = aws_secretsmanager_secret.cognito_client_secret.id
  secret_string = aws_cognito_user_pool_client.backend.client_secret
}

# One Cognito group per top-level ERP role. The backend maps these group
# names directly onto the Role records seeded in the application database
# (see backend/prisma/seed.ts), so keep the two in sync.
resource "aws_cognito_user_group" "roles" {
  for_each     = toset(var.department_seed_roles)
  name         = each.value
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "ERP role group: ${each.value}"
}
