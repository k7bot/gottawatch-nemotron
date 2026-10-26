# tv-screens: web-rendered TV screenshots

Renders the Gottawatch TV app through react-native-web (Expo web dev server, **mock API**) at
1920×1080 and saves one PNG per screen/state to `docs/design/screenshots/`. This is a layout check
only: web is not the Fire TV renderer (fonts, focus and image scaling can differ on the stick).

```bash
# 1. Mock-mode dev server (mock is allowed only in dev bundles, ADR-0007). CI=1 disables file
#    watching, so restart it after code changes.
cd apps/tv/apps/expo-multi-tv
EXPO_PUBLIC_API_MODE=mock EXPO_PUBLIC_MOCK_LATENCY_MS=50 CI=1 BROWSER=none npx expo start --web --port 8082 --clear

# 2. In another shell (needs playwright-core + a Chrome binary; not a repo dependency):
npm i --prefix /tmp/tv-screens playwright-core@1
cp tools/tv-screens/shoot.mjs /tmp/tv-screens/   # ESM resolves playwright-core next to the script
OUT=$PWD/docs/design/screenshots node /tmp/tv-screens/shoot.mjs               # all screens
OUT=$PWD/docs/design/screenshots node /tmp/tv-screens/shoot.mjs tv-home-pick  # one
```

Each shot seeds `localStorage` (the web AsyncStorage backend) with a fake paired state, picks a
mock scenario with `?scenario=` (dev bundles only), and drives the D-pad with arrow keys / Enter /
`M` (☰) / Escape (Back).
