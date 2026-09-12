#!/bin/sh
set -eu
cd /workspace
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
# Bac à sable : pas d'écran, donc Vite seul sur 8080.
SKITRACK_NO_WINDOW=1 npm run dev >>/tmp/app-startup.log 2>&1 &
