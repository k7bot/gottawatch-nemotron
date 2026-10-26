# ADR-0004: Phone client is a mobile web PWA

- **Status:** Accepted (plan v2 §4 OUT "Native iOS / Android phone apps", §5 Clients)

## Context
The phone composes recommendations (search, note, send). Native apps would add store/build overhead for a solo 16-day build.

## Decision
Vite + React PWA hosted on S3 + CloudFront; seeded-profile links mean no login screen; pairing-code entry and QR deep link into the PWA.

## Alternatives
- Native iOS/Android apps: OUT for MVP.
- React Native mobile sharing code with the TV app: not chosen in the plan.

## Consequences
- The TV pairing QR points at a PWA URL (domain still open, OQ-12).
- Product Feedback covers S3/CloudFront rather than mobile SDKs.
