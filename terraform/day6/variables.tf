variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-central-1"
}

variable "name_prefix" {
  description = "Prefix applied to the instance's Name tag"
  type        = string
  default     = "dci-tf-day6"
}

# string — no default on purpose, same as class: since there's no
# terraform.tfvars and no default, `terraform apply` prompts for it on the
# terminal.
variable "ami" {
  description = "AMI ID to launch the instance from (region-specific)"
  type        = string
}

# string — same type as ami, but this one does have a default.
variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

# bool — true/false only. Controls whether the instance gets a public IP,
# i.e. whether it's a public or private instance.
variable "enable_public_ip" {
  description = "Whether to associate a public IP with the instance"
  type        = bool
  default     = false
}

# list(string) — a collection where every element must be the same type.
# Mixing a number or bool into this list is a type error.
variable "employee_ids" {
  description = "List of employee IDs allowed to access this instance"
  type        = list(string)
  default     = ["E101", "E102", "E103"]
}

# object() — structured type. The keys/types declared here MUST match the
# keys used in default (or in any value passed in). In class, a student's
# object type declared only `env` but the default block used `env_id`,
# which threw an error — the fix was making the type and the default agree
# on the same key name.
variable "env_config" {
  description = "Environment metadata block"
  type = object({
    env_id = number
  })
  default = {
    env_id = 1
  }
}
