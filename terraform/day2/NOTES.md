# Day 2 — First EC2 Instance

## Concepts covered

- **`resource "aws_instance"`**: launches an EC2 virtual machine — [provider docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance)
- **`ami`**: the machine image ID the instance boots from (region-specific — this ID only resolves in the region set by `var.aws_region`)
- **`instance_type`**: `t3.micro` — free-tier eligible
- **`tags`**: the `Name` tag is what shows up as the instance's name in the AWS Console

This is the bare-minimum instance example from class — no VPC/subnet/security-group wiring yet, so it lands in your account's **default VPC**.

## Run it

```bash
cd terraform/day2
terraform init
terraform plan
terraform apply
```

Destroy when done:
```bash
terraform destroy
```
