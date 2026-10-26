# ADR-0011: Product renamed to Gottawatch

- **Status:** Accepted, Kiran, Mon Oct 12, 2026 (name chosen from [research/naming.md](../research/naming.md))
- **Supersedes:** the product name "WatchCircle" everywhere a user sees it. Earlier ADRs, specs and reviews keep their original wording as history.

## Context
"WatchCircle" is already a live App Store app in the same category (naming.md), so keeping it risks confusion and store rejection. Kiran chose **Gottawatch**. Per naming.md, trademark clearance (USPTO) and the Google Play check have **not** been done; that remains an open item for Kiran.

## Decision
Rename all **user-facing** branding to Gottawatch:
- TV app display name / launcher label (Expo `name`), wordmark, pairing welcome, About, error and handoff copy.
- Phone web app `<title>`, PWA manifest `name`/`short_name`, wordmark and copy.
- Native phone app display name, wordmark and copy.
- README and doc titles.

**Kept internal, unchanged for now:**

| Kept | Why |
|---|---|
| Android app ID `com.k7apps.watchcircle` (TV) and `com.k7apps.watchcircle.mobile` (phone, PROPOSED) | Changing the app ID makes it a different app. An installed build wouldn't update in place, so it would have to be re-paired. It's not visible to users. Decide before any store listing. |
| GitHub repo `k7bot/watchcircle`, folder names, code identifiers (`WatchCircleApp`, `src/watchcircle/`) | Renaming churns every path and link for no user benefit. |
| AWS stack `WatchCircleApi`, DynamoDB table, Lambda names, CloudFront domain | A stack rename means replacing the resources, i.e. a new table (data loss/migration) and a new API URL that is baked into the clients. Not worth the risk before Oct 23. |
| Custom scheme `watchcircle://` | Changing it would break existing links. Users don't see it, and we never hand out links that use it (ADR-0010). |
| Storage keys (`wc.*`), token prefixes (`wcp_`, `wcd_`) | Changing them would sign everyone out. |

## Consequences
- The demo video and submission use "Gottawatch". The video mustn't show the app ID or the API URL anyway.
- A later cleanup (after submission) can rename the internals in one go, together with the store-listing decision on app IDs.
- Open: trademark and Play Store clearance for "Gottawatch" (naming.md); domains are not registered.

**Update 2026-10-15:** Kiran asked to rename the GitHub repo to `k7bot/gottawatch` (GitHub redirects the old URL). Folder names and code identifiers stay unchanged.
