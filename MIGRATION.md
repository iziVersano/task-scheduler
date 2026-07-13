# Moving to a new machine

## 1. Clone

```bash
git clone git@github.com:iziVersano/task-scheduler.git
cd task-scheduler
npm install
cd client && npm install && cd ..
```

## 2. Copy over manually (NOT in git — verify these before doing anything else)

| What | From (old machine) | Why it matters |
|---|---|---|
| `.env` | repo root | Slack token, other app secrets |
| AWS credentials | `~/.aws/credentials`, `~/.aws/config` | `admin` (working) + `tuta` (was expired as of 2026-07-08) profiles — Terraform and the AWS console features need these |
| **Terraform state** | `terraform/day1/terraform.tfstate`, `terraform/day2/terraform.tfstate` | Tracks the **already-applied** S3 bucket (day1) and the **running EC2 instance** `izi-instance` (`i-0047c4ea580ef3212`, eu-central-1). **Copy these before running `terraform apply`/`plan` on the new machine** — without them Terraform doesn't know these resources exist and could try to recreate or orphan them. |
| `server/jobs.db` (+ `-shm`/`-wal`) | repo root/`server/` | Scheduled jobs — won't carry over otherwise |
| Chrome meet profile | `~/.config/google-chrome-meet/` | Logged-in Google session used by `meet-join.js` for caption capture. Easiest to just let it re-login on the new machine rather than copy this. |

## 3. Verify after setup

```bash
# AWS creds wired up correctly
AWS_PROFILE=admin aws sts get-caller-identity

# Terraform sees the existing resources, not a fresh plan
cd terraform/day1 && terraform init && terraform plan   # should show "No changes"
cd ../day2 && terraform init && terraform plan           # should show "No changes"
```

If `terraform plan` on day1/day2 wants to create resources instead of showing "No changes", the state file didn't come over correctly — stop and fix that before applying anything.

## 4. Start the app

```bash
npm run server   # backend, port 3001
cd client && npm run dev   # frontend, port 3002
```

## Known issues to be aware of (see project memory for full detail)

- The local caption auto-push job has been unreliable — check `git status` on `server/captions/` periodically rather than assuming it's working.
- Caption capture (`meet-captions.js`) can silently die mid-class if the Meet Chrome tab closes/crashes — no auto-restart exists yet. If captions stop appearing, rerun `node server/meet-join.js "<meet-url>" --force`.
