# Upstream: Amazon React Native Multi-TV App Sample

This directory started as a verbatim copy of Amazon's sample (TV-01, 2026-10-11):

- Repo: https://github.com/AmazonAppDev/react-native-multi-tv-app-sample
- Commit: `d435082446b4c834b0b4af8968f83666fd70a116` (2026-10-04, "Merge pull request #130 from davidumoru/fix/vega-sdk-0.24-build")
- License: MIT No Attribution (MIT-0), see `LICENSE`.
- Not copied: `.git`, `.github/` (upstream CI), `.husky/` (git hooks; would act on the Gottawatch repo root), `tvdemo.gif` (22 MB demo animation), `.yarn/install-state.gz` (generated).

Layout (unchanged from upstream):

- `apps/expo-multi-tv`: Expo SDK 54 + `react-native-tvos` 0.81 app. **This is our Fire OS build path** (Android APK via `expo prebuild` + Gradle).
- `apps/vega`: Vega SDK app (stretch target, ADR-0006).
- `packages/shared-ui`: screens/components shared by both apps.

All Gottawatch changes after the import are separate commits on top of the import commit; `git log -- apps/tv` shows them.
