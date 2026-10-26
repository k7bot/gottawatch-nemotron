# ADR-0014: Email sign-in provider for the hackathon: keep our own code sign-in, send via a dedicated Gmail; Cognito after Oct 23

- **Status:** Accepted by expert reviewer, Tue Oct 13, 2026 (Kiran asked the reviewer to decide)
- **Relates to:** ADR-0002 (Cognito cut), ADR-0013 + amendment (email sign-in built), `docs/ops/gmail-email.md`, `docs/ops/ses-email.md`, `docs/decisions/reviews/phone-tabs-api-review.md`
- **Deadline context:** submission Fri Oct 23 12:00 PM PT; Tier 2 gate Wed Oct 14, last Tier 2 start Fri Oct 16, feature cutoff Sun Oct 18 (ADR-0009).

## Question
Should email sign-in move to Amazon Cognito (Kiran has AWS credits; "uses Amazon services" may help judging), or stay on the custom email-code sign-in already built and deployed (off), delivered via Gmail SMTP from a dedicated Gmail account?

## Findings (sources checked Oct 13, 2026)
1. **Cognito's passwordless email code requires Amazon SES.** The user-pool email settings table marks email OTP sign-in (`USER_AUTH` / choice-based, `EMAIL_OTP`) as "Requires Essentials feature plan or higher **and Amazon SES email configuration**"; the Essentials page says the same for email MFA. Source: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html , https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-essentials.html
   - So the "built-in Cognito email" (sender `no-reply@verificationemail.com`) cannot deliver the sign-in code we want. It only covers sign-up confirmation / verification / forgot-password codes.
2. **The default Cognito email is capped at 50 messages/day per AWS account** (resets 09:00 UTC, not adjustable). Source: https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html
3. **Essentials tier** is the default for new pools and includes passwordless one-time codes; it has a monthly-active-user free tier (10,000 MAU at the time of writing, see https://aws.amazon.com/cognito/pricing/), so cost and credits are not the issue. Source: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-sign-in-feature-plans.html
4. Therefore **Cognito puts us back on exactly the SES blockers in `ses-email.md`**: a verified sender identity that isn't Gmail (realistically a bought domain + DNS records) and SES production access (sandbox can only mail verified addresses; approval ~1 day, not guaranteed). Cognito with `COGNITO_DEFAULT` email only works via a workaround (password sign-up with an emailed confirmation code), which is not the passwordless flow Kiran chose and is still capped at 50/day.

## Integration cost if we switched (estimate)
- New user pool (Essentials) + app client in CDK, SES identity, service-linked role.
- Replace `/auth/email/*` and `/me/email*` with Cognito `InitiateAuth(USER_AUTH, PREFERRED_CHALLENGE=EMAIL_OTP)` / `RespondToAuthChallenge`; or keep our profile tokens and exchange a Cognito ID token for one (a token-exchange Lambda) so the existing Lambda authorizer, DynamoDB `USER#` persons, profile-link fallback for judges and TV pairing keep working. Two identity sources = mapping `sub` ↔ `userId`, plus migration of the "add email to existing person" flow (Cognito users must be pre-created by `AdminCreateUser` to keep "no sign-up by email").
- Clients: Expo/React Native and the PWA would use Amplify Auth v6 (`signIn` with `authFlowType: 'USER_AUTH'`, `preferredChallenge: 'EMAIL_OTP'`) or direct `@aws-sdk/client-cognito-identity-provider` calls; both need re-testing on device and web.
- Realistic total: ~1–1.5 days of build + test, landing on Oct 14–15, i.e. on top of the Tier 2 gate window, and still blocked on SES/domain steps outside our control.

## Decision
**Gmail now, Cognito (or SES) later.**
- Keep the custom email-code sign-in (ADR-0013 amendment) unchanged. Turn it on with `EMAIL_MODE=gmail` from a **dedicated Gmail account** (e.g. `sender@example.com`) that Kiran creates himself, with an app password stored only in Secrets Manager (`gottawatch/gmail-app-password`), per `docs/ops/gmail-email.md` (set `GMAIL_USER` to the new address, not `sender@example.com`).
- Profile links remain the judge/demo fallback. TV pairing and the authorizer are untouched.
- Do **not** start Cognito work before Oct 23. After submission, buy `gottawatch.example`, verify it in SES, request production access, then choose between our code flow on SES (smallest change) or a Cognito Essentials migration if we want hosted passkeys/social sign-in.
- For the "Amazon story" in the video: the backend is already fully AWS (API Gateway, Lambda, DynamoDB, Secrets Manager, Fire TV, Bedrock if unblocked). Sign-in provider choice adds little judging value compared with a polished core loop; do not claim Cognito.

## Rationale (key reasons)
1. **Cognito doesn't remove the blocker.** Its passwordless email code requires SES, so it needs the same domain + SES production approval we were trying to avoid; its no-SES default email can't send sign-in codes and is capped at 50/day.
2. **Already built and tested.** The Gmail path needs zero code; Cognito costs ~1–1.5 days and rewires auth that touches every phone/TV route, during the Tier 2 gate (Oct 14–18).
3. **Lower risk to the demo.** No second identity system, no token mapping, profile links and TV pairing unchanged.
4. **Low judging upside.** AWS usage is already strong; credits are irrelevant at this scale.

## Risks / mitigations
- Google may throttle or pause automated sending from a personal-type account: dedicated account isolates Kiran's personal Gmail; volume is tiny (<500/day cap); profile links are the fallback; `EMAIL_MODE=off` hides email sign-in instantly.
- Codes come from a gmail.com address: acceptable for a hackathon, stated in README.

## Next step (Kiran)
Create the dedicated Gmail account yourself (Google blocks agent sign-ups), turn on 2-Step Verification, and tell the agent the address. The app-password step follows.

## Addendum (Tue Oct 13, 2026): Resend with example.com subdomain
Kiran couldn't create a dedicated Gmail (phone-number account limit) and doesn't want to wait on AWS approvals (Bedrock case still open). He owns `example.com` on Namecheap. Decision: **EMAIL_MODE=resend**, sending as "Gottawatch" <login@example.com> via Resend's HTTP API (free, 100/day, no approval wait).
- Subdomain `example.com` keeps the root domain's email untouched.
- Plain `fetch`, no SDK. API key only in Secrets Manager `gottawatch/resend-api-key` (us-east-1); IAM read on that one secret only. Sending-only key scoped to the domain.
- Off until repo variable `RESEND_FROM` is set. Precedence SES > Resend > Gmail. All existing security rules unchanged (enumeration-safe, rate limits, no address/code logging).
- Setup steps: `docs/ops/resend-email.md`. Gmail mode stays in code but is not planned for use.
