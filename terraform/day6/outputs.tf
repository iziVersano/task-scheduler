output "instance_id" {
  description = "ID of the practice instance"
  value       = aws_instance.practice.id
}

output "is_public" {
  description = "Whether the instance was launched with a public IP"
  value       = var.enable_public_ip
}

output "employee_ids" {
  description = "Employee IDs tagged on this instance"
  value       = var.employee_ids
}
