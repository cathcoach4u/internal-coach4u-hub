#!/usr/bin/env bash
# Prints current production version and recent changelog so every session
# starts with accurate context — no need to grep for it manually.

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

version=$(grep -o 'v[0-9]\+\.[0-9]\+\.[0-9]\+' "$REPO_DIR/index.html" | head -1)
sw_ver=$(grep -o 'coach4u-crm-v[0-9]\+' "$REPO_DIR/sw.js" | head -1)

echo "=== Coach4U CRM — session context ==="
echo "Production version : $version"
echo "Service worker     : $sw_ver"
echo ""
echo "Last 2 releases:"
git -C "$REPO_DIR" log --oneline -2
echo ""
echo "CLAUDE.md rules: all work on main, bump both version strings on every commit."
echo "======================================"
