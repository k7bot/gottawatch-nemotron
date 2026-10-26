#!/usr/bin/env bash
# Render mockups to PNG with headless Chrome. Usage: ./render.sh  (from this folder)
set -euo pipefail
cd "$(dirname "$0")"
OUT=..
for f in tv-*.html; do google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --allow-file-access-from-files --window-size=1920,1080 --virtual-time-budget=3000 --screenshot="$OUT/${f%.html}.png" "file://$PWD/$f" >/dev/null 2>&1; done
for f in phone-*.html; do google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=2 --window-size=390,844 --virtual-time-budget=3000 --screenshot="$OUT/${f%.html}.png" "file://$PWD/$f" >/dev/null 2>&1; done
ls -la "$OUT"/*.png
