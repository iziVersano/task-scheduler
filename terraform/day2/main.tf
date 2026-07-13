terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

# ── https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance ──
resource "aws_instance" "test-instance" {
  ami           = "ami-0f92e2dae65c68e2f"
  instance_type = "t3.micro"

  tags = {
    Name = "izi-instance"
  }
}
