# ADR-0013: Phone app gets tabs, an inbox and a Me page; link-based "signed in on this phone"

- **Status:** Accepted, Kiran, Mon Oct 12, 2026 (Option A in [phone-app-gap-analysis.md](../reviews/phone-app-gap-analysis.md))
- **Amends:** ADR-0002 (no accounts: still true, link stays the identity), ADR-0009 Tier 1 phone scope, ADR-0010 non-goals ("friends' activity")
- **Review:** [phone-tabs-api-review.md](reviews/phone-tabs-api-review.md)

## Context
Kiran used the live phone app and couldn't see who he's connected with, what friends sent him, or what "account" he has. Only the TV could read received recommendations.

## Decision
1. **Identity stays the private link** (ADR-0002). The app says so honestly: Me shows "Signed in on this phone as {name}". No password, email or Cognito before Oct 23. Email sign-in links come after submission.
2. **Phone tabs (web PWA and native):** **For you** (recs your home received, grouped by title, Mark watched / Put back), **Recommend** (unchanged search → compose → sent), **Friends** (list, counts later), **Me** (name, home members, paired TVs, Sent, Watched, Pair a TV, sign out). Default tab: For you when it has items, else Recommend.
3. **New profile-only API routes**, separate from the TV's device routes (not a widened authorizer): `GET /me/feed`, `GET /me/seen`, `POST|DELETE /me/seen/{id}`, `GET /me/sent`, `GET /me/home`. They share the domain logic with the TV routes; the home is resolved from the **user record**, not from the client.
4. **New table rows:** `HH#<hh>/MEMBER#<userId>` (written with every user put) and `HH#<hh>/DEVICE#<deviceId>` (written when a TV pairs; backfilled once for existing TVs), `USER#<sender>/SENT#<recId>` (written per send, also by the seed for demo sends).
5. Copy uses people's names only, never "household" (Oct 12). Invites (M6) only if on track by Fri Oct 16.

## Consequences
- Both screens show one inbox; Seen on the phone hides the title on the TV and vice versa.
- Anyone holding a profile link can now *read* that home's inbox (before: only send). The link was already the full identity, so the risk class is unchanged, but it's stated in the README security note.
- Existing sends made before this change have no SENT row and don't appear in Sent (old "recent sends" stay as local-only until replaced).

## Amendment (Oct 12, 4:41 PM ET, Kiran): email sign-in now (option B)
Kiran changed the decision: build **email sign-in with a one-time code** before submission, after the tabs.
1. **Email attaches to an existing person.** A signed-in person adds an email on Me ("Add email"), confirms it with a 6-digit code, and from then on can sign in on any phone by typing that email and the code we send. There's no sign-up by email: an unknown email gets the same neutral reply and no mail.
2. **Rows:** `EMAIL#<sha256(normalized email)>/META → userId` (unique owner; the address itself is stored only on the user record), `OTP#<sha256(email)>/<purpose>` (`signin` | `verify`): codeHash, attempts, sends, expiresAt, ttl.
3. **Routes:** `GET /auth/config` (none) → `{ email: boolean }`; `POST /auth/email/start` (none) `{ email }` → always `{ ok: true }`; `POST /auth/email/verify` (none) `{ email, code }` → `{ profileToken }` or 400 `bad_code`-style generic error; `POST /me/email` (profile) `{ email }` → `{ ok: true }` (sends a code); `POST /me/email/verify` (profile) `{ email, code }` → `{ ok: true, email }`.
4. **Lifetimes / limits:** code 6 digits (CSPRNG), valid **10 min**, **single use**, max **5 wrong tries** then burned, max **3 sends per address per 15 min**; `/auth/email/*` route throttle 1 req/s burst 5. Each email sign-in mints a **new** profile token for that phone (other phones stay signed in), with `expiresAt` **90 days**; the authorizer rejects expired tokens. Seeded/judge links keep working as before (no expiry), so **link sign-in stays as the fallback** for judges and the demo.
5. **Delivery:** Amazon SES in us-east-1 (`EMAIL_MODE=ses`, sender in `EMAIL_FROM`). Until a sender identity is verified (needs Kiran's OK) and production access is granted, `EMAIL_MODE=off`: `/auth/config` says `email:false`, so the apps hide email sign-in and nothing pretends to send.
