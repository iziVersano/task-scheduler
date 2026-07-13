output "instance_id" {
  value = aws_instance.test-instance.id
}

output "instance_public_ip" {
  value = aws_instance.test-instance.public_ip
}
