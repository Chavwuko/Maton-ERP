variable "project_name" {
  description = "Short name used to prefix all resources"
  type        = string
  default     = "erp"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones to spread subnets across"
  type        = number
  default     = 2
}

variable "db_name" {
  description = "Name of the initial Postgres database"
  type        = string
  default     = "erp"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 50
}

variable "backend_image_tag" {
  description = "Tag of the backend container image to deploy"
  type        = string
  default     = "latest"
}

variable "backend_container_port" {
  description = "Port the NestJS backend listens on inside the container"
  type        = number
  default     = 3000
}

variable "backend_desired_count" {
  description = "Number of ECS tasks to run for the backend service"
  type        = number
  default     = 2
}

variable "backend_cpu" {
  description = "Fargate task CPU units"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Fargate task memory (MB)"
  type        = number
  default     = 1024
}

variable "cognito_callback_urls" {
  description = "Allowed OAuth callback URLs for the Cognito app client"
  type        = list(string)
  default     = ["http://localhost:3000/auth/callback"]
}

variable "cognito_logout_urls" {
  description = "Allowed OAuth logout URLs for the Cognito app client"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "department_seed_roles" {
  description = "Initial Cognito groups representing top-level ERP roles"
  type        = list(string)
  default     = ["admin", "finance", "hr", "maintenance", "hse", "project_control", "document_control", "inventory"]
}
