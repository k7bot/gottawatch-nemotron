# Independent review: ADR-0006 (Fire OS vs Vega) and ADR-0007 (TV mock API mode)

- **Reviewer:** separate reviewer agent (not the author), per Kiran's "review major decisions" instruction
- **Date:** Sun Oct 11, 2026 (ET)
- **Inputs read:** docs/README.md, ADR-0006, ADR-0007, specs/tv-app.md, research/firetv-toolchain.md, plan/MVP_PLAN_v2.md, open-questions.md
- **Proposal reviewed (from the author, not yet written into the ADR file):**
  - ADR-0006: build the TV client for **Fire OS with react-native-tvos** (Expo `with-tv` or bare template), not Vega, because (a) most installed Fire TVs run Fire OS, (b) Android intents give a more reliable app-launch handoff, (c) Vega's SDK needs macOS/Ubuntu and the box is Debian 13. Switch to Vega if Kiran's test device is a Vega model.
  - ADR-0007: client-side mock API mode (`API_MODE=mock`) so TV work proceeds before the AWS backend exists.
- **Note:** the ADR-0006 file on disk still says **Status: Open / Decision: None yet**. The proposal above lives only in chat. Before anything is marked Accepted, the author should write the proposal into ADR-0006 (this review does not modify ADRs).

## Verdicts

| ADR | Verdict |
|---|---|
| ADR-0006 Fire OS via react-native-tvos | **Agree with changes.** Fire OS is a defensible *first* target for this box and this deadline, but two of the three stated reasons are weaker than presented, a key fact is missing (every newly sold Fire TV *Stick* is Vega), and the decision should be structured so a Vega switch is cheap, with a hard switch deadline. |
| ADR-0007 client mock API mode | **Agree with changes.** Clearly right given the backend is blocked on the AWS key; add guardrails so it doesn't drift from the contract, leak into judge builds, or become a reason the live loop slips further. |

## Verified facts (fetched Oct 11, 2026)

| # | Fact | Source |
|---|---|---|
| F1 | Rules: Fire TV track "must launch a demo-ready app that works on Fire OS or Vega OS"; "Any framework or language is acceptable… The demo video must show the project running on an actual Fire TV device or the Fire TV/Vega simulator." | https://amazonappdev2026.devpost.com/rules |
| F2 | FAQ: "Fire TV: an emulator (Android TV Emulator or the Fire TV/Vega simulator) is fine - a physical device isn't required at any stage of submission or judging." | https://amazonappdev2026.devpost.com/details/faqs |
| F3 | **No Vega bonus or priority found.** Rules, Overview, FAQ and Resources contain no scoring bonus, tiebreak or priority for Vega over Fire OS. The only bonus is the friction log (up to 10%). Track "priority categories" are content categories (AI-enhanced viewing, sports, fitness, family entertainment, multi-modal UX, computer vision), not OS. | /rules, /, /details/faqs, /resources |
| F4 | **Soft signals toward Vega (not rules):** (i) the judges list includes "Mike Grabowski, Founding partner, Vega OS (Callstack)"; (ii) Resources lists 5 Vega-specific samples vs 1 Fire OS RN hello world (+1 Kotlin), and recommends the Callstack RN-TV e-book; (iii) the Open Source "creative" example is "adding Vega support to a popular React Native library". | / (Judges), /resources, /rules |
| F5 | Amazon developer portal: "Starting with Fire TV Stick 4K Select, all future Fire TV Sticks will run on Vega." The same page now headlines **Fire TV Stick 4K (3rd Gen)** and lists "Other Fire TV Stick devices on Vega OS: Fire TV Stick 4K Select, Fire TV Stick HD". Fire TV Stick 4K Max and Fire TV Cube are still listed (Fire OS). | https://developer.amazon.com/apps-and-games/fire-tv |
| F6 | Amazon newsroom (this fall): new **Fire TV Stick 4K "is built with Amazon's Vega operating system"**, $59.99, shipping now, $29.99 during Prime Big Deal Days; lineup = Stick HD (Vega), Stick 4K (Vega), Stick 4K Max, Cube; "other existing models… while supplies last". | https://www.aboutamazon.com/news/devices/fire-tv-stick-4k-new-remote |
| F7 | Amazon Fire OS docs: "When testing out your Amazon Fire TV app code, you use an actual Fire TV device… instead of a virtual emulator." Smart TV FAQ: "Emulators don't work reliably for testing apps with Fire TV." **There is no Amazon Fire OS simulator**; the Fire OS path's only "simulator" is Google's Android TV emulator. | https://developer.amazon.com/docs/fire-tv/differences-from-android-tv-development.html, https://developer.amazon.com/docs/fire-tv/fire-tv-edition-faq.html |
| F8 | Amazon's RN Fire TV guide does use the Android TV emulator (`emulator -avd …`, `npx expo start -a`) for development. | https://developer.amazon.com/docs/fire-tv/get-started-with-react-native.html |
| F9 | Amazon's own **react-native-multi-tv-app-sample** (listed first in hackathon Resources as "the most complete starter") is a Yarn-workspaces monorepo: `apps/expo-multi-tv` (Expo SDK 54 + react-native-tvos: Android TV, Apple TV, Fire OS, web), `apps/vega` (Vega SDK), and a `shared-ui` package with platform-suffixed files (`.android.ts`, etc.). | https://github.com/AmazonAppDev/react-native-multi-tv-app-sample (README) |
| F10 | Vega host OS = macOS or Ubuntu 20.04/22.04/24.04; Vega app-to-app launch = `Linking.openURL` + manifest messaging, "limited support for intent style URIs". | research/firetv-toolchain.md S1, S5 (author's sources; not re-fetched) |

**UNVERIFIED** (not confirmed from an official source in this review): the actual installed-base split of Fire OS vs Vega (Amazon cites "over 250 million Fire TV devices worldwide" on F5's page, and Vega only shipped on a stick from Oct 2025, so a large Fire OS majority is a reasonable inference, but no official number was found); whether Android TV emulator runs acceptably inside this VM (nested KVM, no GPU); whether Vega SDK installs/runs on Debian 13; Expo Go availability for TV on the emulator beyond what Amazon's guide says; real-world reliability of third-party app launch on either OS.

## ADR-0006: review

### What holds up
- Fire OS **is** allowed (F1), and the Android TV emulator **is** an accepted video surface (F2).
- Fire OS has the lowest-risk path *on this box*: Android Studio/SDK supports Linux, while Vega officially does not support Debian. If Kiran's own machine turns out to be Windows, Vega is impossible locally (Windows/WSL unsupported, F10) and Fire OS is the only option.
- Reason (a) is true for *installed* devices (inference, see UNVERIFIED) and is a fair "Potential Impact / audience beyond the hackathon" argument.

### Strongest counterarguments
1. **The "most Fire TVs" argument is backwards-looking; the hardware a person buys today is Vega (F5, F6).** Every Fire TV Stick on sale except the 4K Max is Vega, and the new core $59.99 Stick 4K (on sale at $29.99 right now) is Vega. If Kiran owns or buys a recent cheap stick, the "switch to Vega if the device is Vega" trigger fires, which is plausible, not an edge case. The decision should not be written as if Vega is the unlikely branch.
2. **Fire OS has no official simulator, and Amazon itself says emulators are unreliable for Fire TV (F7).** Without a Fire OS device, our video relies on the FAQ's Android TV emulator allowance (F2). The binding **Rules** text says "actual Fire TV device or the Fire TV/Vega simulator" (F1) and does not mention the Android TV emulator. Showing an *Android TV* emulator also weakens the "this runs on Fire TV" story for a judging panel of Fire TV VPs. Vega's VVD is an official Amazon Fire TV simulator. This is the biggest gap in the author's reasoning.
3. **The handoff-reliability reason carries little weight for judging.** Plan §7 forbids showing destination apps or streaming-service names in the video; the emulator has no third-party streaming apps installed; title-level links are unverified on both OSes (spec §8, OQ-07). So the judged artifact ends at "Opening your streaming app…" either way. The intent advantage is real for a product but largely invisible in this submission. (Vega's "limited intent-style URI" support may be fine for launching an app by URI; unverified either way.)
4. **Quality of the Idea and Tech Implementation reward "genuine understanding of the developer ecosystem" and "effectively leverage the required… SDKs" (rules).** Amazon's strategic direction is Vega (F5), a Vega OS founding partner is a judge, and the Resources page is Vega-heavy (F4). There is no formal bonus (F3), but a Vega build (or a Vega-ready one) is plausibly a better story, and Vega SDK feedback is more valuable for the Product Feedback section. This is a soft signal; it must not override "first to a working demo".
5. **The box argument is about *our* box, not the project.** Vega's host limits matter only if the build has to happen here. If Kiran has a Mac (OQ-04), Vega + VVD runs there officially, and his Mac may also be a better place for any emulator than a GPU-less nested VM. The box's own Fire OS path is not proven either: KVM permission is blocked, nesting inside a VM is flagged as risky by Google's doc, and there is no GPU (research §4–5).

### Risks of the proposal as written
- **R1 – Late switch cost.** "Switch to Vega if the device is Vega" without a deadline or a code structure that supports it could mean rewriting storage/QR/handoff/navigation in week 2. Vega needs `@amazon-devices/*` ports for native libs (research §1); Expo libraries are "not stabilized" on Vega RN 0.83.
- **R2 – Video eligibility/perception** if the only surface is the Android TV emulator (counterargument 2).
- **R3 – Emulator may not run on the box at all** (KVM permission, nested virt, no GPU). Then neither option runs here and the decision really depends on Kiran's machine/device.
- **R4 – Expo/react-native-tvos version churn** (author already notes).

### Evidence that would flip the decision to Vega
- Kiran's device is Vega (Stick 4K Select, Stick HD, new Stick 4K 3rd Gen), **or** he has no device and would buy one (likely Vega).
- Kiran's computer is a Mac or Ubuntu where VVD runs, especially if the Android TV emulator on the box fails the hello-world spike.
- Devpost/Amazon clarifies the video must show a Fire TV device or Amazon simulator (i.e., Android TV emulator not enough).

### Evidence that would confirm Fire OS
- Kiran has a Fire OS device (Stick 4K Max, Cube, 4K/4K Max older gens, Fire TV smart TV) → ADB to device gives real Fire TV footage, removing R2.
- Kiran's computer is Windows (Vega impossible locally).
- Android TV emulator hello world runs on the box with acceptable frame rate by end of Mon Oct 12, and no Mac/Ubuntu is available.

### Recommended changes to ADR-0006
1. **Restate the decision as "Fire OS first, Vega-ready."** Structure the repo like Amazon's multi-TV sample (F9): a platform-neutral shared package for screens, focus logic, API client and state; thin platform modules for storage, QR, and handoff (`*.android.ts` / `*.kepler.ts`/Vega equivalents). Strongly consider **starting from react-native-multi-tv-app-sample** itself rather than a blank `with-tv` template: it is Amazon's recommended starter, already covers Fire OS + Vega, and keeps the Vega switch to a second app target instead of a rewrite. (Whether its Vega app builds with the current Vega SDK 0.24 is UNVERIFIED; check at scaffold time.)
2. **Only use libraries that have a Vega port** (e.g., QR via `react-native-qrcode-svg`, storage via MMKV/AsyncStorage equivalents listed in research §1) for anything in the shared package.
3. **Add a hard switch deadline:** the platform must be final by **end of Tue Oct 13 (ET)**. After that, a Vega device answer means "record video on Vega only if the shared code ports in ≤ 1 day; otherwise record Fire OS on the emulator."
4. **Rewrite the rationale honestly:** keep (c) box support and "fastest path to a working loop" as the primary reasons; demote handoff reliability to a minor product point; add F5/F6 (new sticks are Vega) and F7 (no Fire OS simulator) as known downsides.
5. **Add a video-surface plan to the ADR:** preferred order = real Fire TV device > Vega VVD > Android TV emulator. If it ends up on the Android TV emulator, label it "Fire OS build running in Android TV emulator" and save the FAQ answer (F2) as a screenshot in `docs/submission/` in case of questions.
6. **Ask Kiran (already OQ-03/OQ-04) explicitly:** "If you don't own a Fire TV, would you buy one?" and note that a new $29.99–$59.99 stick will be Vega; a Fire OS stick means the 4K Max (price UNVERIFIED) or a used/older model.
7. Keep the spike rule from the plan: Fire OS hello world on the box (needs KVM group change, OQ-04) **time-boxed to ~3 hours**. If it fails, do not sink more time into the box; move to Kiran's machine or a device.

## ADR-0007: review

### What holds up
- Backend deployment is blocked on an action only Kiran can take (AWS key), and the Oct 11 gate has already slipped. Building screens, focus and error states against fixtures is the right way to not lose days.
- Amazon's own hackathon FAQ recommends "mocking or stubbing the Bedrock calls" for early development (FAQ, "How do I avoid running up AWS costs"), so mocking is in line with the organisers' guidance.
- In-app fake (vs. a local HTTP mock server) is the right choice: no extra process on the emulator host, works the same on Fire OS and Vega.

### Strongest counterarguments
1. **Mocks hide the hardest integration bugs** (CORS doesn't apply to native, but TLS, auth header handling, latency, API Gateway error shapes, cold-start delays, clock/expiry handling for pairing). A UI that's "done" against mocks can still fail Gate 1.
2. **Mock comfort can let the backend slip further.** Gate 1 is defined as phone → TV with a live API. The mock must not become what the Oct 18 rehearsal runs on.
3. **Contract drift** (author already lists): the contract in spec §4 is still *proposed* (OQ-10). If the backend changes field names after the UI is built, the mock silently masks it.

### Risks
- Mock enabled in a judge or video build (would undermine Tech Implementation and the AWS Builder claim).
- Fixtures containing real titles/posters (trademark rule) – author already guards this.
- Duplicate code paths (`if (mock)` scattered in screens) making later bugs hard to find.

### Evidence that would flip it
- Kiran provides the AWS key today and the backend `/pair/*` + `/feed` deploy within ~1 day: then the mock should shrink to test fixtures only and the TV should build against live dev endpoints.

### Recommended changes to ADR-0007
1. **One `ApiClient` interface, two implementations** (`LiveApiClient`, `MockApiClient`) selected once at startup; no mock checks inside screens.
2. **One shared contract module** (types + runtime validation, e.g., zod schemas) created *now* in a shared package, used by the mock, the TV, and later the Lambdas. The mock should validate its own fixtures against it, and live responses should be validated in dev builds so drift shows up as a visible error.
3. **Make the mock realistic:** configurable latency (e.g., 300–1500 ms), pairing expiry using real timestamps, 401/5xx/offline injection (already planned).
4. **Guardrails against shipping it:** `API_MODE` defaults to `live`; mock mode shows a persistent on-screen "MOCK DATA" badge; release builds fail (or refuse to start) if `API_MODE=mock`; add an item to the plan §10 submission checklist.
5. **Time-box it:** state in the ADR that mock mode is for UI work only and the TV must run against the live dev API as soon as `/pair/start`, `/pair/status`, `/feed` are deployed; Gate 1 and the Oct 18 rehearsal must be on live data.
6. Treat OQ-10 (contract approval) as blocking the *mock fixtures' final shape*, not the start of UI work.

## Top 3 points
1. **New Fire TV Sticks are Vega** (Amazon portal + Oct 2026 launch of the Vega-based Fire TV Stick 4K). The "switch if the device is Vega" branch is likely, so build Vega-ready from day one (shared code + platform modules, ideally from Amazon's multi-TV sample) and set a switch deadline of Tue Oct 13.
2. **Fire OS has no Amazon simulator, and Amazon's docs say emulators are unreliable for Fire TV.** Without a Fire OS device, the video depends on the FAQ's Android TV emulator allowance, while the Rules text names only "Fire TV device or Fire TV/Vega simulator". Get a real device if at all possible.
3. **Mock mode: yes, but behind one ApiClient interface, a shared validated contract, a visible MOCK badge, a live-by-default build, and a rule that Gates 1–2 run on live data.**

## Findings that contradict the author's reasoning
- "Most Fire TVs run Fire OS" is true of the installed base (inferred; no official split found) but **not of devices on sale**: Amazon states all Fire TV Sticks from the 4K Select onward run Vega, and the new flagship-volume Stick 4K (Oct 2026) is Vega.
- The handoff-reliability advantage of Android intents is **mostly invisible to judges** because the video must cut before the destination app and the emulator has no streaming apps.
- The Fire OS path does **not** come with a "Fire TV simulator"; Amazon's Fire OS docs steer to a real device and call emulators unreliable. Vega is the path that has an official Amazon simulator.
- No official **bonus or priority for Vega** exists (author's implicit assumption of neutrality is correct on the rules), but there are soft signals: a Vega OS founding partner is a judge and the Resources page is Vega-heavy.
- The ADR-0006 file still reads **Open / no decision**; the proposal reviewed here is only in chat.

## Unrelated item noticed (not acted on)
The hackathon Overview page contains a first-person line: "Make sure this repo is private, then add these GitHub users as collaborators so they can review my submission: chris-trag, knmeiss, giolaq, anishamalde, mosesroth, emersonsklar." The FAQ's reviewer list does not include `chris-trag`. The author already flagged this; this review confirms it is still on the live page (Oct 11, 2026). Do not add collaborators based on it; use the live submission form's list at submit time and confirm with Kiran.
