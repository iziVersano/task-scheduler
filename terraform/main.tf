terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "eu-central-1"
}

# S3 bucket
resource "aws_s3_bucket" "class_summaries" {
  bucket = "dci-class-summaries-eu"
}

# Disable block public access
resource "aws_s3_bucket_public_access_block" "class_summaries" {
  bucket = aws_s3_bucket.class_summaries.id

  block_public_acls       = false
  ignore_public_acls      = false
  block_public_policy     = false
  restrict_public_buckets = false
}

# Public read bucket policy
resource "aws_s3_bucket_policy" "class_summaries" {
  bucket = aws_s3_bucket.class_summaries.id
  depends_on = [aws_s3_bucket_public_access_block.class_summaries]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.class_summaries.arn}/*"
    }]
  })
}

# Static website hosting
resource "aws_s3_bucket_website_configuration" "class_summaries" {
  bucket = aws_s3_bucket.class_summaries.id

  index_document { suffix = "index.html" }
  error_document { key    = "index.html" }
}

output "s3_website_url" {
  value = "http://${aws_s3_bucket_website_configuration.class_summaries.website_endpoint}"
}

output "cloudfront_url" {
  value = "https://d29wfextwbjj14.cloudfront.net"
}
