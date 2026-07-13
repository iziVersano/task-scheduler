# Deploying a Static Website to S3

This is the exact process used to deploy `dist/index.html` to AWS S3 as a public static website.

---

## What We Built

A single self-contained HTML file (`dist/index.html`) that contains all class summaries and MCQs. No server needed — S3 serves it directly to anyone with the URL.

---

## Prerequisites

- AWS account (free tier)
- AWS CLI installed (`aws --version`)
- An IAM user with S3 permissions and an Access Key

---

## Step 1 — Configure AWS CLI

```bash
aws configure
```

You will be prompted for:

| Prompt | What to enter |
|---|---|
| AWS Access Key ID | From IAM → Security credentials → Access keys |
| AWS Secret Access Key | Shown once when you create the key |
| Default region name | `us-east-1` (or your preferred region) |
| Default output format | Just press Enter |

This saves your credentials to `~/.aws/credentials` and `~/.aws/config`.

If you have multiple profiles (e.g. `admin`, `tuta`) you can target one with `--profile admin` on every command.

---

## Step 2 — Create the S3 Bucket

```bash
aws s3api create-bucket \
  --bucket dci-class-summaries-eu \
  --region eu-central-1 \
  --create-bucket-configuration LocationConstraint=eu-central-1 \
  --profile admin
```

**Rules for bucket names:**
- Must be globally unique across ALL AWS accounts worldwide
- Lowercase only, no spaces, 3–63 characters
- Can contain letters, numbers, and hyphens

> ⚠️ `us-east-1` is special — it does NOT need `--create-bucket-configuration`. Every other region does:
> ```bash
> --create-bucket-configuration LocationConstraint=eu-central-1
> ```

---

## Step 3 — Disable Block Public Access

By default AWS blocks all public access to S3 buckets (a security feature). For a static website we intentionally want it public, so we turn this off at two levels.

**Bucket level:**
```bash
aws s3api put-public-access-block \
  --bucket dci-class-summaries \
  --profile admin \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

**Account level** (overrides bucket-level if left on):
```bash
aws s3control put-public-access-block \
  --account-id 302263067280 \
  --profile admin \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

The four flags mean:

| Flag | What it blocks when ON |
|---|---|
| `BlockPublicAcls` | Adding ACLs that grant public access |
| `IgnorePublicAcls` | Ignores any existing public ACLs |
| `BlockPublicPolicy` | Prevents bucket policies that allow public access |
| `RestrictPublicBuckets` | Blocks public and cross-account access to buckets with public policies |

---

## Step 4 — Attach a Bucket Policy (Allow Public Read)

A bucket policy is a JSON document that defines who can do what with your bucket. This one says: **anyone on the internet can GET (download/read) any object**.

```bash
aws s3api put-bucket-policy \
  --bucket dci-class-summaries \
  --profile admin \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::dci-class-summaries/*"
    }]
  }'
```

Breaking down the policy JSON:

```
"Principal": "*"          →  anyone (no authentication required)
"Action": "s3:GetObject"  →  can only READ files, not upload or delete
"Resource": ".../*"       →  applies to every file inside the bucket
```

---

## Step 5 — Enable Static Website Hosting

This tells S3 to serve the bucket as a website (not just a file store). Without this, the URLs return XML. With it, S3 serves HTML like a web server.

```bash
aws s3api put-bucket-website \
  --bucket dci-class-summaries \
  --profile admin \
  --website-configuration '{
    "IndexDocument": {"Suffix": "index.html"},
    "ErrorDocument": {"Key": "index.html"}
  }'
```

| Setting | What it does |
|---|---|
| `IndexDocument` | File served when someone visits the root URL `/` |
| `ErrorDocument` | File served on 404s — pointing to `index.html` makes single-page apps work correctly |

---

## Step 6 — Upload the File

```bash
aws s3 cp dist/index.html s3://dci-class-summaries-eu/index.html \
  --content-type "text/html" \
  --profile admin
```

- `aws s3 cp` copies a local file to S3
- `--content-type "text/html"` tells browsers what kind of file it is (without this, some browsers download it instead of rendering it)

---

## The Result

Your site is live at:

```
http://dci-class-summaries-eu.s3-website.eu-central-1.amazonaws.com
```

The URL pattern for S3 static websites is always:
```
http://<bucket-name>.s3-website.<region>.amazonaws.com
```

---

## How to Update the Site

Every time you add a new class summary, rebuild and re-upload:

```bash
# 1. Rebuild the static site with all summaries + MCQs
node server/build-site.js

# 2. Upload to S3 (overwrites the old file)
aws s3 cp dist/index.html s3://dci-class-summaries-eu/index.html \
  --content-type "text/html" \
  --profile admin
```

---

## Free Tier Costs

| Resource | Free tier limit | Our usage |
|---|---|---|
| S3 Storage | 5 GB / month | ~115 KB — negligible |
| S3 GET requests | 20,000 / month | One per page visit |
| S3 PUT requests | 2,000 / month | One per deployment |
| Data transfer out | 100 GB / month | ~115 KB per visitor |

This site will cost **$0** on the free tier.

---

## Architecture Diagram

```
You (local machine)
        │
        │  node server/build-site.js
        ▼
  dist/index.html   ← single self-contained file (HTML + CSS + JS + all data)
        │
        │  aws s3 cp
        ▼
  S3 Bucket: dci-class-summaries
  ┌─────────────────────────────────┐
  │  Static Website Hosting: ON     │
  │  Block Public Access: OFF       │
  │  Bucket Policy: public read     │
  └─────────────────────────────────┘
        │
        │  HTTP
        ▼
  Anyone with the URL
  http://dci-class-summaries-eu.s3-website.eu-central-1.amazonaws.com
```

---

## Key Concepts (exam relevant)

- **S3 is object storage** — files are "objects", folders don't really exist (they're just key prefixes)
- **Bucket names are globally unique** — across all AWS accounts and all regions
- **Static website hosting ≠ just storing files** — you have to explicitly enable it
- **Block Public Access has two levels** — account-level overrides bucket-level; you must disable both
- **Bucket policies use IAM policy JSON** — same syntax as IAM but `Principal` can be `"*"` (public)
- **No server, no EC2, no maintenance** — S3 scales automatically and is managed by AWS
