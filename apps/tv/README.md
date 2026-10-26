# apps/tv: Gottawatch Fire TV client

Started from Amazon's multi-TV sample (see [UPSTREAM.md](UPSTREAM.md); upstream docs in [UPSTREAM_README.md](UPSTREAM_README.md)).
Spec: [docs/specs/tv-app.md](../../docs/specs/tv-app.md) · Tasks: [docs/tasks/tv-app-tasks.md](../../docs/tasks/tv-app-tasks.md) · Platform: [ADR-0006](../../docs/decisions/ADR-0006-fire-tv-platform-fire-os-vs-vega.md) (Fire OS first, Vega-ready).

## Current state (Tier 1 client, 2026-10-11)
- `apps/expo-multi-tv` (Expo SDK 54, react-native-tvos 0.81, old architecture) is the **Fire OS** app. `App.tsx` loads the app fonts and renders `GottawatchApp` from `packages/shared-ui/src/gottawatch/`:
  - `core/`: pure TS. Config + guardrails (`config.ts`, `env.ts`), contract-validated API client (`api.ts`), mock client (`mock.ts`), Home logic (`home.ts`), storage, deviceId, launcher map (empty → fails closed).
  - `ui/`: Evening Circle tokens, double-ring `Focusable`, `Button`, avatars, posters (bundled Circle Art + fallback), View-based QR, Back/Menu key hooks.
  - `screens/`: Boot, Pairing (+ success), Home (Spotlight + one row, all states), Handoff, About, title actions sheet.
- Scope: ADR-0009 **Tier 1** (no animations). Spec: [ux-design.md](../../docs/specs/ux-design.md) §5.
- The sample's old screens/navigator are still in `packages/shared-ui` but unused. `apps/vega` is untouched upstream code (stretch target).

## Config (EXPO_PUBLIC_*, inlined at bundle time)
| Variable | Default | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_MODE` | `live` | `mock` only works in **dev bundles** (Metro dev server); release/embedded bundles refuse it (ADR-0007) |
| `EXPO_PUBLIC_API_URL` | the deployed API (`core/config.ts`) | |
| `EXPO_PUBLIC_PWA_URL` | the deployed PWA (`core/config.ts`) | Pairing QR/short URL target (OQ-12: CloudFront default domain); `none` hides the QR |
| `EXPO_PUBLIC_MOCK_SCENARIO` | `default` | `default, stub, fallback, nopick, empty, offline, unpaired, server-error, handoff` |
| `EXPO_PUBLIC_DEV_TAGS` | off (on in dev bundles) | Shows the Tonight's pick `source` tag |
| `EXPO_PUBLIC_DEMO_MODE` | on | Hides service names |
| `EXPO_PUBLIC_FEED_POLL_MS` / `PAIR_POLL_MS` / `HANDOFF_TIP_MS` | 20000 / 3000 / 4000 | |

## Checks
```bash
npm run test:tv                                  # repo root: core unit tests (vitest)
cd apps/tv/apps/expo-multi-tv && yarn typecheck:gw   # Gottawatch code typecheck
```
Web layout preview + screenshots (mock data): see [tools/tv-screens/README.md](../../tools/tv-screens/README.md). Output: `docs/design/screenshots/`.

Remote keys: D-pad/OK, Back (KEYCODE_BACK via BackHandler, plus the starter's keycode 67), ☰ Menu (keycode 82). Web preview: arrows, Enter, Escape/Backspace = Back, M = ☰.

## Android identity / SDK levels
| Field | Value | Note |
|---|---|---|
| App name | Gottawatch | `app.json` (package id unchanged) |
| Package | `com.k7apps.gottawatch.nemotron` | separate app ID for this project |
| minSdk | 24 (Android 7.0) | upstream default via `expo-build-properties`; ≤ 25 so Fire OS 6 (Android 7.1, API 25) is supported |
| targetSdk / compileSdk | 34 / 36 | upstream defaults |

## Build a Fire OS debug APK (Linux, verified 2026-10-11 on the agent box, Debian 13 x86_64)
Toolchain used: Node v20.19.2, Yarn 4.5.0 (via corepack), Temurin JDK 17.0.20.1, Android cmdline-tools 13114758 with platform-tools, platforms;android-36, build-tools;36.0.0, ndk;27.1.12297006. No emulator, GPU or KVM needed.

```bash
cd apps/tv
corepack enable            # yarn 4.5.0 from packageManager
yarn install
cd apps/expo-multi-tv
EXPO_TV=1 npx expo prebuild --platform android --clean   # generates android/ (git-ignored)
cd android
EXPO_PUBLIC_API_MODE=live EXPO_PUBLIC_DEV_TAGS=1 ./gradlew assembleDebug -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
# -> android/app/build/outputs/apk/debug/app-debug.apk
# Gradle doesn't track packages/shared-ui or env changes for the JS bundle: after editing them add
# --rerun-tasks (or delete android/app/build), otherwise the APK keeps the old bundle.
```
Shortcut: `yarn build:android:debug` from `apps/tv` (prebuild + assembleDebug, all ABIs).

The JS bundle is **embedded in debug APKs** (`plugins/withEmbeddedDebugBundle.js`), so a sideloaded debug build runs on the stick without a Metro server. For live reload, prebuild with `WC_DEBUG_USE_METRO=1` and run `yarn dev:android` with the device connected via ADB.

## Install on the Fire TV stick (not yet done)
Needs Developer Options → ADB debugging + Apps from Unknown Sources on the stick, then from a computer on the same network:
```bash
adb connect <stick-ip>:5555
adb install -r gottawatch-tv-tier1-debug.apk
```
