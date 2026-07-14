terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ── Day 6: Data Types ────────────────────────────────────────────────────
# One EC2 instance, but the point of today isn't the instance — it's using
# every variable type covered in class on the same resource: string, bool,
# list(string), and object().

resource "aws_instance" "practice" {
  ami                         = var.ami
  instance_type               = var.instance_type
  associate_public_ip_address = var.enable_public_ip

  tags = {
    Name        = "${var.name_prefix}-day6"
    EnvId       = var.env_config.env_id
    EmployeeIds = join(",", var.employee_ids)
  }
}
