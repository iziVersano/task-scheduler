output "instance_id" {
  value = aws_instance.app.id
}

output "instance_public_ip" {
  value = aws_instance.app.public_ip
}

output "bucket_name" {
  value = aws_s3_bucket.app_data.bucket
}

output "iam_role_arn" {
  value = aws_iam_role.ec2_role.arn
}
