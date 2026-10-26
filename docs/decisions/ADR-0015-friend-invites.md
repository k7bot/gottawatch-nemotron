# ADR-0015: Friend invites — bearer invite links, always-mutual connections

- **Status:** Accepted (Kiran, Tue Oct 13, 2026)
- **Relates to:** ADR-0002 (no Cognito, seeded accounts), ADR-0013 (phone tabs, email sign-in), ADR-0014 (Resend sender), spec `docs/specs/invites.md`

## Context
Until now friendships only came from seed data. Two people who signed up separately had no way to connect, and a new person had no way to get an account.

## Decision
1. **A connection is always two-way.** Accepting an invite connects both people; either can send picks to the other. No follow/one-way model (considered and dropped by Kiran to keep it simple).
2. **The invite is a bearer link, not tied to an email address.** `https://<web>/invite/<code>`, 128-bit random code, only its SHA-256 is stored. Whoever opens it accepts with whatever account they sign in with, so friends don't need to know each other's sign-in email.
3. **Two ways to share:** an email sent by Gottawatch (Resend, `login@example.com`, subject "<Name> sent you a Gottawatch invitation" (changed from "<Name> wants to share shows with you", which read as easy to overlook), heading "<Name> invited you to connect on Gottawatch", button "Accept invitation", one button), or "Copy link" to text it.
4. **An invite also lets a new person join.** Signed-out invitee enters first name + email; an unknown email gets a sign-up code (new person + new home), a known email gets the normal sign-in code. Same response either way (no account enumeration). Without an invite, sign-up stays closed (ADR-0002 spirit).
5. **Safety:** 7-day expiry, single use (conditional delete), inviter can cancel, can't accept your own, already-connected accepted gracefully without consuming, 20 invite emails/day per person, 20 pending invites max, email copy identical whether or not the address has an account. Either person can remove the connection (both directions).
6. **Web app first.** Links open the PWA. Native app deep links (universal/app links) are out of scope until after Oct 23.

## Alternatives
- Search by email/username: privacy + spam risk, no time to moderate. Rejected.
- One-way follow (Instagram-style): more UI (two lists, follow-back). Dropped by Kiran.
- Email-bound invites (only that address can accept): breaks "friends don't know each other's sign-in email". Rejected.

## Consequences
- New table items: `INVITE#<codeHash>` (lookup, TTL), `USER#<id>/INVITE#<id>` (pending list), `USER#<id>/INVRATE#<date>` (daily counter).
- New routes: `POST/GET /invites`, `DELETE /invites/{id}`, `POST /invites/preview` (no auth), `POST /invites/accept`, `DELETE /friends/{id}`; `/auth/email/start|verify` accept an optional `invite` (+ `name`).
- Anyone holding a live link can connect with the inviter; that's the intended bearer trade-off, bounded by expiry, single use and cancel.
