variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-central-1"
}

variable "name_prefix" {
  description = "Prefix applied to all resource Name tags"
  type        = string
  default     = "dci-capstone"
}

variable "admin_cidr" {
  description = "Your IP in CIDR form (e.g. 1.2.3.4/32) — allowed to SSH into the bastion"
  type        = string
}

variable "student_suffix" {
  description = "Unique suffix so your bucket name doesn't collide with anyone else's"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type — t3.micro is free-tier eligible"
  type        = string
  default     = "t3.micro"
}

variable "key_pair_name" {
  description = "Name of an EC2 key pair (create one in the console first: EC2 > Key Pairs) so you can actually SSH in"
  type        = string
}
