output "test_instance_public_ip" {
  description = "Public IP of the test EC2 instance"
  value       = aws_instance.test.public_ip
}

output "production_instance_public_ip" {
  description = "Public IP of the production EC2 instance"
  value       = aws_instance.production.public_ip
}

output "test_instance_id" {
  description = "Instance ID of the test EC2 instance"
  value       = aws_instance.test.id
}

output "production_instance_id" {
  description = "Instance ID of the production EC2 instance"
  value       = aws_instance.production.id
}

output "secrets_manager_arn" {
  description = "ARN of the Gemini API key secret"
  value       = aws_secretsmanager_secret.gemini_api_key.arn
}

output "kms_key_arn" {
  description = "ARN of the KMS key used to encrypt secrets"
  value       = aws_kms_key.secrets_key.arn
}
