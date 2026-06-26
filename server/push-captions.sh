#!/bin/bash
# Runs at 11:55 Berlin time via crontab — pushes today's captions to git
# so the GitHub Actions daily-summary workflow can read them at 12:05.

cd /home/dci-student/work/task-scheduler

TODAY=$(date +%Y-%m-%d)
CAPTIONS="server/captions/${TODAY}.txt"

if [ ! -f "$CAPTIONS" ] || [ ! -s "$CAPTIONS" ]; then
  echo "$(date): No captions for $TODAY — nothing to push" >> /tmp/push-captions.log
  exit 0
fi

git add "$CAPTIONS"
git diff --staged --quiet && {
  echo "$(date): Captions for $TODAY already committed" >> /tmp/push-captions.log
  exit 0
}

git commit -m "Auto-push captions for $TODAY"
git push

echo "$(date): Pushed $CAPTIONS to git" >> /tmp/push-captions.log
