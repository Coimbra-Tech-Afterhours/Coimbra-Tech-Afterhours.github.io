#!/bin/bash

# Test script to simulate the git commit/push logic from sync-notion.yml
# This helps test the commit detection and message logic locally
# WITHOUT actually pushing to the repository

set -e

echo "🧪 Testing commit logic from sync-notion.yml"
echo "=============================================="
echo ""

# Check if there are any changes
if [ -z "$(git status --porcelain)" ]; then
  echo "❌ No changes to commit."
  echo "💡 Tip: Make some changes to test files first (e.g., edit public/events.json)"
  exit 0
fi

echo "✅ Changes detected"
echo ""

# Check if only .last-sync changed (no actual data changes)
CHANGED_FILES=$(git status --porcelain | awk '{print $2}')
ONLY_SYNC_FILE=true
DATA_CHANGED=false

echo "📋 Changed files:"
for file in $CHANGED_FILES; do
  echo "   - $file"
  if [ "$file" != ".last-sync" ]; then
    ONLY_SYNC_FILE=false
    # Check if events.json or other data files changed
    if [[ "$file" == "public/events.json" ]] || [[ "$file" == "public/"* ]]; then
      DATA_CHANGED=true
    fi
  fi
done

echo ""
echo "🔍 Analysis:"
echo "   - Only .last-sync changed: $ONLY_SYNC_FILE"
echo "   - Data files changed: $DATA_CHANGED"
echo ""

# Simulate what the workflow would do
if [ "$ONLY_SYNC_FILE" = true ]; then
  echo "📝 Would commit with message:"
  echo "   'chore(sync): update last sync timestamp'"
  echo ""
  echo "📦 Would stage: .last-sync"
else
  if [ "$DATA_CHANGED" = true ]; then
    echo "📝 Would commit with message:"
    echo "   'chore(data): update events from Notion'"
    echo ""
    echo "📦 Would stage: All files (git add -A)"
  else
    echo "📝 Would commit with message:"
    echo "   'chore: update files from Notion sync'"
    echo ""
    echo "📦 Would stage: All files (git add -A)"
  fi
fi

echo ""
echo "⚠️  This is a dry-run. No actual commit was made."
echo "💡 To actually commit, use:"
echo "   git add <files>"
echo "   git commit -m '<message>'"
echo ""
echo "✅ Commit logic test completed!"

