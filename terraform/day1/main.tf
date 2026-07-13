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

# ── Week 1: Basics ──────────────────────────────────────────────────────────
# One resource, one provider, one state file. The goal here isn't the bucket
# itself — it's seeing how init/plan/apply/destroy and state actually work.

resource "aws_s3_bucket" "practice" {
  bucket = "${var.bucket_prefix}-week1-${var.student_suffix}"

  tags = {
    Phase = "terraform-basics"
    Week  = "1"
  }
}

resource "aws_s3_bucket_versioning" "practice" {
  bucket = aws_s3_bucket.practice.id
  versioning_configuration {
    status = "Enabled"
  }
}
