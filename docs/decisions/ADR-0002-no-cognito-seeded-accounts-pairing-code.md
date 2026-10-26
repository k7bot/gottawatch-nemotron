# ADR-0002: No Cognito; seeded accounts + TV pairing code + device token

- **Status:** Accepted (plan v2 §4 OUT, §5 Auth model; changelog #5)

## Context
Solo builder, 16-day window. Real sign-up/login/invites cost days and judges barely score them (plan changelog #5).

## Decision
- Seeded demo household + 3–4 friends (Priya, Sam, Maya…) with friendships, created by a seed script.
- Phone: private profile link `/u/<token>` identifies the user; only a hash is stored server-side.
- TV: 6-char pairing code (unambiguous chars, 10-min TTL, single use) → phone completes → backend issues a random 32-byte **device token**; only its SHA-256 hash is stored; TV uses it as a bearer token. Re-pairing revokes the old token.
- A small Lambda authorizer checks token hashes (briefly cached). README states "demo-grade auth".

## Alternatives
- Amazon Cognito user pools + invites: moved to stretch (plan §4 Stretch #2).
- Login with Amazon on TV: not considered in the plan.

## Consequences
- No user-facing login screens on TV or phone.
- Judges get a ready-made judge profile link.
- Security is demo-grade (hashed, revocable tokens, rate limits); must be stated honestly.
- Open detail: whether `/pair/status` must also check `deviceId` (OQ-10).
