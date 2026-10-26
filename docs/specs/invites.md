# Friend invites — build spec (ADR-0015)

## User flows
**Inviter (Friends tab)** → "Invite a friend" sheet:
- *Email*: type address → "Send invite". Toast "Invite sent". Copy is the same for any address.
- *Invite email*: subject "<Name> sent you a Gottawatch invitation"; heading "<Name> invited you to connect on Gottawatch"; one button "Accept invitation"; link works once, expires in N days.
- *Copy link*: creates an invite and copies `…/invite/<code>`; native share sheet when available.
- "Waiting to accept" list (sent invites, masked email or "Link invite", "expires in N days") with **Cancel**.
- Connections list with **Recommend** and **•••** → **Remove connection** (gentle, Oct 14): "Stop sharing picks with Priya? You can connect again with a new invite anytime." Buttons **Keep** / **Remove** (neutral, not red). Toast: "No longer connected with Priya". Picks already on a TV stay.
- Sub line: "You and Priya can send each other picks."

**Invitee** opens `/invite/<code>`:
- Preview shows "Priya invited you to Gottawatch" + "Connect and you'll both be able to send each other picks for your TVs."
- Signed in → **Connect with Priya** / Not now. Success: "You and Priya are connected — you can send each other picks." → Recommend / Friends.
- Signed out → first name + email → code → back on the same prompt (Accept still needs one tap).
- States: expired/used/cancelled → "This invite doesn't work anymore. Ask Priya for a new one." (no name if unknown); own invite → "This is your invite. Send it to a friend."; already connected → "You and Priya are already connected."

## API
| Route | Auth | Body → Response |
|---|---|---|
| `POST /invites` | profile | `{email?}` → `{invite, code}`; email sent if given (20/day, 20 pending) |
| `GET /invites` | profile | → `{invites:[{id, to?, createdAt, expiresAt}]}` pending, unexpired |
| `DELETE /invites/{id}` | profile | → `{ok}` |
| `POST /invites/preview` | none | `{code}` → `{status: valid|gone, inviter?: {id, displayName}}` |
| `POST /invites/accept` | profile | `{code}` → `{friend, already}`; 410 gone, 409 own invite |
| `DELETE /friends/{id}` | profile | → `{ok}`; removes both `FRIEND#` rows in one DynamoDB transaction (idempotent). `putFriendship` is transactional too (closes the earlier one-way-pair gap). |
| `/auth/email/start` | none | `+ invite?, name?` sign-up path for unknown email |

Codes go in POST bodies, never query strings (no logs). Never log emails or codes.

## Tasks
- INV-1 contract + store (memory + Dynamo) · INV-2 domain + routes + tests · INV-3 sign-up via invite · INV-4 infra routes · INV-5 client + web UI · INV-6 deploy + live e2e (two test inboxes) + screenshots `docs/design/screenshots/phone-invite-*.png` · INV-7 reviewer pass.

## Invite-only + judges

Without an invite, sign-up stays closed (ADR-0015 / ADR-0002 spirit): an unknown email on `/auth/email/start` without an invite code is rejected. Judges therefore use the shared judge login (`judge@example.com` + fixed code; [ops/judge-access.md](../ops/judge-access.md)) rather than self-registering. A judge who wants their own address can send themselves an invite from that account (*Friends → Invite*).

## Later
Native deep links (universal/app links), invite codes you can read aloud, TV-side "new friend" toast.
