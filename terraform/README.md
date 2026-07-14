# Terraform — 4-Week Learning Phase

Target account: **992382612204** (main account, `Izi_accessKeys.csv`) — same account already used by `main.tf` and the existing `terraform.yml` GitHub Actions workflow.

See [COURSE-LINKS.md](../COURSE-LINKS.md) at the project root for course materials and classroom links.

## Structure

```
terraform/
├── main.tf     existing — S3 static site infra for the class summaries, untouched
├── day1/       providers, resources, variables, outputs, state
├── day2/       first EC2 instance (aws_instance basics)
├── day3/       EC2, S3, IAM roles/instance profiles
├── day4/       combined stack + remote state (S3 backend)
└── day6/       data types (string, bool, list, object), fmt vs validate
```

Each day folder is a **self-contained root module** — its own provider block, its own state, runnable independently:

```bash
cd terraform/dayN
cp terraform.tfvars.example terraform.tfvars   # fill in your values (if the day has one)
terraform init
terraform plan
terraform apply
# ... when done experimenting:
terraform destroy
```

Content in each day folder follows what's actually taught in class that day, not a fixed pre-built curriculum — check each day's `NOTES.md` for what it currently covers.

## Credentials

Uses the same AWS account as `main.tf` (`992382612204`). Set your credentials as environment variables before running any `terraform` command locally:

```bash
export AWS_ACCESS_KEY_ID="<from Izi_accessKeys.csv>"
export AWS_SECRET_ACCESS_KEY="<from Izi_accessKeys.csv>"
```

Never commit these, and never paste them into any `.tf` file — they're read from your shell environment or `~/.aws/credentials`, not from the config.

## Cost hygiene

Every week folder that creates billable resources (NAT Gateway, EC2) says so in its `NOTES.md`. Run `terraform destroy` at the end of each session — nothing here is meant to stay up between classes.

## CI (optional)

The existing `.github/workflows/terraform.yml` targets `terraform/` (i.e. `main.tf`) by default. If you want to plan/apply a specific week from GitHub Actions instead of your laptop, it can be extended with a `working-directory` input — ask and it'll be wired up before Week 2.
