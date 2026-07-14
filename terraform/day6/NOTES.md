# Day 6 — Data Types, fmt, and validate

## Concepts covered

- **`string`**: text — used for `ami` and `instance_type`. `ami` has no default on purpose, so `terraform apply` prompts for it on the terminal (there's no `terraform.tfvars` and no default value to fall back to).
- **`bool`**: `true`/`false` only — `enable_public_ip` controls whether the instance is public or private (default `false` → private).
- **`list(string)`**: a collection where every element must be the *same* type — `employee_ids`. Mixing a number or bool into the list is a type error.
- **`object({...})`**: a structured type with named keys. The keys/types in the `type` block must match the keys used in `default` (or any value passed in) — in class, a student declared the type with a different key than the one used in `default`, which threw an error. `env_config` here keeps `env_id` consistent between `type` and `default` to demonstrate the fix.

## `terraform fmt` vs `terraform validate`

Two different jobs, both come up as exam questions:

- **`fmt`**: beautification only — fixes indentation to HCL's convention (2 spaces; a tab counts as 4). It does **not** catch errors of any kind.
- **`validate`**: catches **syntax errors** only — missing brackets, undefined keywords, structural mistakes. It does **not** catch **logical errors** (code that runs but does the wrong thing, e.g. subtracting when you meant to add, or a resource missing a security group it actually needs).

## Run it

```bash
cd terraform/day6
cp terraform.tfvars.example terraform.tfvars   # set ami to a real AMI ID for your region
terraform init
terraform fmt        # beautifies, doesn't validate
terraform validate   # checks syntax, not logic
terraform plan
terraform apply
```

**Cost note:** creates one EC2 instance. Destroy when your session is done:
```bash
terraform destroy
```
