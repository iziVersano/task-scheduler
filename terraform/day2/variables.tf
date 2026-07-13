variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-central-1"
}

variable "aws_profile" {
  description = "Named profile from ~/.aws/credentials to authenticate with"
  type        = string
  default     = "admin"
}
