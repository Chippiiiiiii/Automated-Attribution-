#!/usr/bin/env bash
# Lightweight secret scan: flags likely credentials in tracked-style source files.
# Usage: scripts/scan-secrets.sh   (exit 1 on findings)
cd "$(dirname "$0")/.." || exit 2
PATTERN='(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|(api[_-]?key|secret|token|passwd|password)["'"'"']?\s*[:=]\s*["'"'"'][A-Za-z0-9+/_=-]{16,}["'"'"'])'
hits=$(grep -RInE "$PATTERN" . \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=generated \
  --exclude='package-lock.json' --exclude='.env' --exclude='*.pdf' --exclude='scan-secrets.sh' \
  | grep -vE 'change-me|example|placeholder|demo-password' )
if [ -n "$hits" ]; then echo "Possible secrets:"; echo "$hits"; exit 1; fi
echo "scan-secrets: clean"
# .env must be git-ignored
if [ -f .gitignore ] && grep -qE '^\.env$' .gitignore; then echo ".env is git-ignored"; else echo "WARNING: .env not in .gitignore"; exit 1; fi
