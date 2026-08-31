resource "random_password" "db_master" {
  length      = 24
  special     = false # avoid characters that need URL-encoding in connection strings
  min_upper   = 2
  min_lower   = 2
  min_numeric = 2
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${local.name_prefix}-db-subnets" }
}

resource "aws_db_instance" "main" {
  identifier     = "${local.name_prefix}-db"
  engine         = "postgres"
  engine_version = "16"

  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 4
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = "erp_admin"
  password = random_password.db_master.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az                  = var.environment == "prod"
  backup_retention_period   = 7
  auto_minor_version_upgrade = true
  deletion_protection       = var.environment == "prod"
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${local.name_prefix}-db-final" : null

  tags = { Name = "${local.name_prefix}-db" }
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name = "${local.name_prefix}/db-credentials"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.db_master.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = var.db_name
    # DATABASE_URL in the format Prisma/TypeORM expect
    url = "postgresql://${aws_db_instance.main.username}:${random_password.db_master.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"
  })
}
