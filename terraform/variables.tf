variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "resume-analyzer"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.micro"
}

variable "ssh_public_key" {
  description = "SSH public key for EC2 access (contents of ~/.ssh/id_rsa.pub)"
  type        = string
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Google Gemini API key — stored in AWS Secrets Manager, never hardcoded"
  type        = string
  sensitive   = true
}
