variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-central-1"
}

variable "bucket_prefix" {
  description = "Prefix for the practice bucket name"
  type        = string
  default     = "dci-tf-practice"
}

variable "student_suffix" {
  description = "Unique suffix so your bucket name doesn't collide with anyone else's (S3 bucket names are globally unique)"
  type        = string
}
