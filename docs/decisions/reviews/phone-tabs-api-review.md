# Review: ADR-0013 phone tabs + profile-only API routes

Reviewer pass: independent-style security/API critique, written as a separate pass before coding (Oct 12). Verdict: **approve with must-fixes** (all applied before coding, see "Applied").

## Critique
| ID | Finding | Severity |
|---|---|---|
| PT-1 | Reusing `/feed` and `/recommendations/{id}/seen` for profile tokens would blur the device/profile split from api-spec-review MF-3. A mistaken `auth()` call could let either token kind reach the other's routes. | Must-fix |
| PT-2 | The token record carries `householdId` frozen at issue time. If a seed moves a user to another home, the old context still points at the old home. Resolve from the user record and fail closed (401) if the user is gone. | Must-fix |
| PT-3 | `/me/home` must not return raw device ids: the device id is half of what `/pair/status` checks, and nothing on the phone needs it. Return a label and pairedAt only. | Must-fix |
| PT-4 | `clearHouseholdActivity` deletes every non-META `HH#` row. With new MEMBER#/DEVICE# rows a re-seed would silently unlist paired TVs and members. Restrict it to REC#/PICK#/PICKTRY#. | Must-fix |
| PT-5 | CORS `allowMethods` lacks DELETE, so "Put back" from the PWA (`DELETE /me/seen/{id}`) fails in browsers. | Must-fix |
| PT-6 | SENT rows store recipient names at send time; a later rename shows the old name. Acceptable (demo, names don't change). | Accept |
| PT-7 | Seen on the phone affects the TV and Tonight's pick. That's intended (one inbox), but the UI needs Undo/Put back on the phone too. | UX must |
| PT-8 | `/me/sent` and `/me/seen` are unbounded scans of small partitions. Fine at demo scale; cap `limit` in the contract. | Accept |
| PT-9 | Link holders can now read the inbox. Same identity class as before (the link already let you send as the person); state it in README "demo-grade auth". | Note |
| PT-10 | Mock clients must implement the new methods, or the dev/mock screenshots crash. | Should |

## Applied
PT-1 separate `/me/*` routes guarded by `auth(event, "profile")`; tests assert the device token gets 403 and vice versa. PT-2 `homeOf(store, ctx)` reads the user record. PT-3 `tvs: [{label, pairedAt}]`. PT-4 clear filter changed + test. PT-5 DELETE added to CORS. PT-7 phone Undo toast + Put back. PT-8 contract limits. PT-10 mocks updated.

## Pass 2: email sign-in (ADR-0013 amendment)
| ID | Finding | Severity |
|---|---|---|
| ES-1 | **Enumeration:** `/auth/email/start` must answer identically (status, body, roughly timing) for known and unknown emails, and must not send mail to unknown ones. | Must-fix |
| ES-2 | **Brute force:** 6 digits = 10^6. Cap at 5 wrong tries per code (burn the code), 3 sends per 15 min per address, plus the gateway throttle. Worst case ≈ 15 guesses per 15 min per address → ~1.5e-5 success. | Must-fix |
| ES-3 | Store only `sha256(email + code)`, never the code; compare in constant time; delete on success (single use, conditional delete so two parallel verifies can't both win). | Must-fix |
| ES-4 | Tokens minted by email sign-in need an expiry, or a stolen phone stays signed in forever. 90 days, enforced in the authorizer; seeded links unchanged (judges). | Must-fix |
| ES-5 | Email uniqueness: claim `EMAIL#` with a conditional put; on conflict, reply generically ("That email can't be used") without saying who owns it. | Must-fix |
| ES-6 | Normalize email (trim, lowercase, NFC; no gmail dot/plus folding, which surprises people). Max 254 chars, simple syntax check. | Should |
| ES-7 | Never log email addresses or codes; Lambda logs only error names. The email body has the code and a short note; no links that carry a token. | Must-fix |
| ES-8 | SES sandbox (checked Oct 12: `ProductionAccessEnabled=false`, 200/day, 1/s, no verified identities). In the sandbox only verified recipients get mail, so real friends can't sign in until production access is granted. Ship with `EMAIL_MODE=off` and the UI hidden until then. | Blocker for go-live, not for build |
| ES-9 | Lambda IAM: `ses:SendEmail` only on the configured identity ARN, and only when `EMAIL_MODE=ses`. | Must-fix |

All must-fixes are applied in the implementation (tests in `services/api/test/email.test.ts`).
