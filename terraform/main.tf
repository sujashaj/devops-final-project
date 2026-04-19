terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ── Key pair ──────────────────────────────────────────────────────────────────
resource "aws_key_pair" "deployer" {
  key_name   = "${var.project_name}-deployer"
  public_key = var.ssh_public_key
}

# ── Security group ────────────────────────────────────────────────────────────
resource "aws_security_group" "resume_analyzer" {
  name        = "${var.project_name}-sg"
  description = "Allow HTTP, HTTPS, and SSH"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "FastAPI"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Prometheus"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Grafana"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project = var.project_name
  }
}

# ── IAM role for EC2 (Secrets Manager access) ─────────────────────────────────
resource "aws_iam_role" "ec2_role" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "secrets_access" {
  name = "${var.project_name}-secrets-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:gemini-api-key*"
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${var.project_name}-instance-profile"
  role = aws_iam_role.ec2_role.name
}

# ── AMI lookup (latest Amazon Linux 2023) ─────────────────────────────────────
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── User-data script ──────────────────────────────────────────────────────────
locals {
  user_data = <<-EOF
    #!/bin/bash
    set -e
    yum update -y
    yum install -y docker git
    systemctl start docker
    systemctl enable docker
    usermod -aG docker ec2-user

    # Install Docker Compose v2
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL https://github.com/docker/compose/releases/download/v2.26.1/docker-compose-linux-x86_64 \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

    echo "Bootstrap complete"
  EOF
}

# ── Test EC2 instance ─────────────────────────────────────────────────────────
resource "aws_instance" "test" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deployer.key_name
  vpc_security_group_ids = [aws_security_group.resume_analyzer.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name
  user_data              = local.user_data

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  tags = {
    Name        = "${var.project_name}-test"
    Environment = "test"
    Project     = var.project_name
  }
}

# ── Production EC2 instance ───────────────────────────────────────────────────
resource "aws_instance" "production" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deployer.key_name
  vpc_security_group_ids = [aws_security_group.resume_analyzer.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name
  user_data              = local.user_data

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  tags = {
    Name        = "${var.project_name}-production"
    Environment = "production"
    Project     = var.project_name
  }
}

# ── AWS Secrets Manager — Gemini API key ─────────────────────────────────────
resource "aws_kms_key" "secrets_key" {
  description             = "KMS key for ${var.project_name} secrets"
  deletion_window_in_days = 7

  tags = {
    Project = var.project_name
  }
}

resource "aws_kms_alias" "secrets_key_alias" {
  name          = "alias/${var.project_name}-secrets"
  target_key_id = aws_kms_key.secrets_key.key_id
}

resource "aws_secretsmanager_secret" "gemini_api_key" {
  name                    = "gemini-api-key"
  description             = "Google Gemini API key for ${var.project_name}"
  kms_key_id              = aws_kms_key.secrets_key.key_id
  recovery_window_in_days = 7

  tags = {
    Project = var.project_name
  }
}

resource "aws_secretsmanager_secret_version" "gemini_api_key_value" {
  secret_id = aws_secretsmanager_secret.gemini_api_key.id
  secret_string = jsonencode({
    GEMINI_API_KEY = var.gemini_api_key
  })
}
