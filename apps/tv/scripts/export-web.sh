#!/usr/bin/env bash
# Browser TV view for judges (no Fire TV needed): expo web export of apps/tv served at <site>/tv/.
# Usage (from apps/tv after `yarn install`): scripts/export-web.sh [outDir]   default ../web/dist/tv
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EXPO_PUBLIC_API_URL:?EXPO_PUBLIC_API_URL is required (https URL of the backend, or same-origin)}"
OUT="${1:-../web/dist/tv}"
TMP="$(mktemp -d)"
( cd apps/expo-multi-tv && EXPO_PUBLIC_API_MODE=live npx expo export --platform web --output-dir "$TMP" --clear )
# Keyboard-as-remote hint (the TV UI itself has no keyboard copy).
HINT='<div id="gw-keys" style="position:fixed;right:16px;bottom:12px;z-index:9999;font:13px/1.4 system-ui,sans-serif;color:#cfd3e0;background:rgba(14,16,32,.85);border:1px solid #2a2f4a;border-radius:8px;padding:6px 12px;pointer-events:none">Use your keyboard as the remote: <b>arrow keys</b> move &middot; <b>Enter</b> selects &middot; <b>Backspace</b>/<b>Esc</b> goes back &middot; <b>M</b> menu</div>'
# Post-process with node (always present here; python3 isn't in slim build images).
node - "$TMP/index.html" "$HINT" <<'JS'
const fs = require('fs');
const [p, hint] = process.argv.slice(2);
let s = fs.readFileSync(p, 'utf8');
s = s.replace('<meta httpEquiv=', '<meta http-equiv=')
  .replace('<title>Gottawatch</title>', '<title>Gottawatch for Fire TV (browser preview)</title>\n    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />')
  .replace('</body>', hint + '\n</body>');
fs.writeFileSync(p, s);
JS
rm -rf "$OUT" && mkdir -p "$(dirname "$OUT")" && mv "$TMP" "$OUT"
echo "TV web export → $OUT"
