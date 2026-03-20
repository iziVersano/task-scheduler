#!/bin/bash
# Build the lab sandbox Docker image
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
docker build -t lab-sandbox "$SCRIPT_DIR"
echo "lab-sandbox image built successfully"
