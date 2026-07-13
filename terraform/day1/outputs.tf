output "bucket_name" {
  description = "Name of the practice bucket that was created"
  value       = aws_s3_bucket.practice.bucket
}

output "bucket_arn" {
  description = "ARN of the practice bucket"
  value       = aws_s3_bucket.practice.arn
}
