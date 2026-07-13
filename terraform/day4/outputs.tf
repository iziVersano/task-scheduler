output "bastion_public_ip" {
  value = aws_instance.bastion.public_ip
}

output "private_app_private_ip" {
  value = aws_instance.private_app.private_ip
}

output "bucket_name" {
  value = aws_s3_bucket.app_data.bucket
}

output "ssh_via_bastion_hint" {
  description = "How to SSH into the private instance through the bastion"
  value       = "ssh -J ec2-user@${aws_instance.bastion.public_ip} ec2-user@${aws_instance.private_app.private_ip}"
}
