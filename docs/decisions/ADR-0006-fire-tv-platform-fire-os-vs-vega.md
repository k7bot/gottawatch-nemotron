# ADR-0006: Fire TV platform: React Native for Fire OS vs Vega

- **Status:** **Accepted** (2026-10-11, confirmed by Kiran; independent review: agree with changes, see reviews/ADR-0006-0007-review.md)

## Context
Both count for the Fire TV track ("works on Fire OS or Vega OS"). Facts gathered Oct 11, 2026 are in [research/firetv-toolchain.md](../research/firetv-toolchain.md), summarized:
- **Vega:** Vega SDK + Vega Virtual Device; host must be macOS or Ubuntu 20.04/22.04/24.04 (x86_64); needs KVM; RN 0.72 (stable) or 0.83 (early access, new-template default) in SDK 0.24; app launch via `Linking.openURL` + manifest messaging.
- **Fire OS:** react-native-tvos fork (Expo `with-tv` or bare template), Android Studio + Android TV emulator; app launch via Android intents (`<queries>` needed on API 30+).
- Our build box is **Debian 13** (not on Vega's supported list), has `/dev/kvm` but the build user lacks permission, and has no GPU.

## Decision
**Fire OS first, Vega-ready.**
- Kiran's hardware (2026-10-11): a Mac, and a Fire TV Stick running **Fire OS 6.7.1.1** (Fire OS 6 is based on Android 7.1 / API 25; exact stick model not yet recorded).
- Primary target: React Native for Fire OS, tested and demoed on Kiran's real stick. Builds must support minSdk ≤ 25.
- Start from Amazon's `react-native-multi-tv-app-sample` (Fire OS + Vega from one codebase): shared UI/logic, thin platform modules (handoff, storage).
- Vega is a stretch target; the Vega Virtual Device on Kiran's Mac is the backup for the demo video.
- Video fallback order: real device → Vega simulator → Android TV emulator.

## Alternatives
1. Vega (RN 0.72 for stability, or 0.83 to match the current template).
2. React Native for Fire OS (react-native-tvos, Expo `with-tv`).
3. Time-boxed spike of both (TV-01/TV-02) and choose on evidence.

## Consequences (whichever is chosen)
- Determines simulator, storage/QR libraries, handoff module, and Product Feedback content.
- Must be reviewed by a second reviewer and confirmed by Kiran before status → Accepted.
