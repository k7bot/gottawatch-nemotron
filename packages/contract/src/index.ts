// @gottawatch/contract: the single source of truth for the Gottawatch HTTP API
// (docs/specs/api.md §6, docs/specs/tv-app.md §4). Used by services/api, the TV
// app (TV-05) and the phone PWA. Fields marked "(proposed)" in the specs are
// still pending Kiran's approval (OQ-10).
import { z } from "zod";

export const PAIR_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIR_CODE_LENGTH = 6;
export const NOTE_MAX = 120;
export const REASON_MAX = 220;
export const CUSTOM_TITLE_MAX = 100;
export const CUSTOM_TITLE_RAW_MAX = 300;
export const CUSTOM_YEAR_MIN = 1880;
export const CUSTOM_YEAR_MAX = 2100;

/**
 * Sanitizes a free-text title: Unicode NFC, drops control/format characters and angle brackets,
 * collapses whitespace, trims, and caps at CUSTOM_TITLE_MAX characters (by code point).
 * Returns "" when nothing printable is left. Used by the server (authoritative) and the phones.
 */
export function cleanCustomTitle(raw: string): string {
  const s = raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}<>]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...s].slice(0, CUSTOM_TITLE_MAX).join("").trim();
}

const isoDateTime = z.iso.datetime({ offset: true });
const id = z.string().min(1).max(128);

// TV-generated crypto-random id with >= 128 bits of entropy: 22+ base64url chars
// (review nice-to-have #2), so a deviceId can't be guessed and re-paired by someone else.
export const DEVICE_ID_MIN = 22;
export const DeviceId = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);
export const PairCode = z
  .string()
  .length(PAIR_CODE_LENGTH)
  .regex(new RegExp(`^[${PAIR_CODE_ALPHABET}]+$`));

export const ErrorCode = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "expired",
  "internal",
]);
export const ErrorBody = z.object({
  error: z.object({ code: ErrorCode, message: z.string() }),
});

export const MediaType = z.enum(["movie", "tv"]);

export const TitleRef = z.object({
  /** "custom" = free-text title typed by the sender when the catalog had no match (no metadata). */
  source: z.enum(["demo", "tmdb", "custom"]),
  id: id,
  mediaType: MediaType.optional(),
  title: z.string().min(1),
  year: z.number().int().optional(),
  poster: z.string().url().optional(),
  runtime: z.number().int().positive().optional(),
  genres: z.array(z.string()).optional(),
  overview: z.string().optional(),
  /** Our service ids where it streams on a US subscription (TMDB watch providers, data by JustWatch). Only on title details. */
  providers: z.array(z.string()).optional(),
});

export const Person = z.object({
  id: id,
  displayName: z.string().min(1),
  avatarUrl: z.string().url().optional(),
});

export const FeedItem = z.object({
  id: id,
  from: Person,
  title: z.string().min(1),
  year: z.number().int().optional(),
  mediaType: MediaType.optional(),
  poster: z.string().url().optional(),
  note: z.string().max(NOTE_MAX).optional(),
  service: z.string().nullable(),
  runtime: z.number().int().positive().optional(),
  genres: z.array(z.string()).optional(),
  createdAt: isoDateTime,
});

// --- Pairing -------------------------------------------------------------
export const PairStartRequest = z.object({ deviceId: DeviceId });
export const PairStartResponse = z.object({ code: PairCode, expiresAt: isoDateTime });

export const PairStatusQuery = z.object({ code: PairCode, deviceId: DeviceId });
export const PairStatusResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("paired"), deviceToken: z.string().startsWith("wcd_") }),
]);

export const PairCompleteRequest = z.object({ code: PairCode });
export const PairCompleteResponse = z.object({ ok: z.literal(true), householdId: id });

// --- Identity ------------------------------------------------------------
export const MeResponse = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("device"),
    device: z.object({ id: DeviceId }),
    householdId: id,
    householdName: z.string().optional(),
    /** IANA zone saved for the household (e.g. "America/New_York"); the TV greets in it, not the device clock zone. */
    timezone: z.string().optional(),
  }),
  z.object({ kind: z.literal("profile"), user: Person, householdId: id, email: z.string().optional() }),
]);

export const FriendsResponse = z.object({
  friends: z.array(Person.extend({ householdId: id })),
});

// --- Titles + recommendations -------------------------------------------
export const TitleSearchQuery = z.object({ q: z.string().trim().min(1).max(100) });
export const TitleSearchResponse = z.object({ results: z.array(TitleRef) });
export const TitleDetailsPath = z.object({ mediaType: MediaType, id: z.string().regex(/^\d{1,10}$/) });
export const TitleDetailsResponse = z.object({ title: TitleRef });

export const TitleSelector = z.discriminatedUnion("source", [
  z.object({ source: z.literal("demo"), id: id }),
  z.object({ source: z.literal("tmdb"), id: id, mediaType: MediaType }),
  // Free-text fallback when search has no match (OQ-16: no TMDB key yet). The server re-sanitizes.
  z.object({
    source: z.literal("custom"),
    title: z.string().max(CUSTOM_TITLE_RAW_MAX),
    year: z.number().int().min(CUSTOM_YEAR_MIN).max(CUSTOM_YEAR_MAX).optional(),
  }),
]);
export const CreateRecommendationRequest = z.object({
  titleRef: TitleSelector,
  note: z.string().trim().max(NOTE_MAX).optional(),
  service: z.string().max(40).nullable().optional(),
  recipientHouseholdIds: z.array(id).min(1).max(20),
});
export const CreateRecommendationResponse = z.object({ ids: z.array(id) });

export const FeedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const FeedResponse = z.object({ items: z.array(FeedItem) });

export const SeenResponse = z.object({ ok: z.literal(true) });
// Watched history (ux §5.5a): one item per title, newest seenAt first.
export const SeenQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const SeenItem = FeedItem.extend({ seenAt: isoDateTime });
export const SeenHistoryResponse = z.object({ items: z.array(SeenItem) });

// --- Phone-only routes (ADR-0013) ----------------------------------------------
export const SentQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(30) });
export const SentItem = z.object({
  id: id,
  title: z.string().min(1),
  year: z.number().int().optional(),
  mediaType: MediaType.optional(),
  poster: z.string().url().optional(),
  note: z.string().max(NOTE_MAX).optional(),
  service: z.string().nullable(),
  to: z.array(z.string()),
  createdAt: isoDateTime,
});
export const SentResponse = z.object({ items: z.array(SentItem) });
export const HomeResponse = z.object({
  home: z.object({ id: id, name: z.string() }),
  members: z.array(Person),
  tvs: z.array(z.object({ id: id, label: z.string(), pairedAt: isoDateTime })),
});
// --- Email sign-in (ADR-0013 amendment) ---------------------------------------
/** trim, lowercase, NFC; no gmail dot/plus folding (ES-6). Returns null when it isn't an address. */
export function normalizeEmail(raw: string): string | null {
  const e = raw.normalize("NFC").trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(e) ? e : null;
}
export const AuthConfigResponse = z.object({ email: z.boolean() });
export const InviteCode = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
export const NAME_MAX = 40;
export const EmailStartRequest = z.object({ email: z.string().max(320), invite: InviteCode.optional(), name: z.string().max(200).optional() });
export const EmailVerifyRequest = z.object({ email: z.string().max(320), code: z.string().max(12) });
export const OkResponse = z.object({ ok: z.literal(true) });
export const EmailSignInResponse = z.object({ profileToken: z.string().startsWith("wcp_") });
export const AddEmailVerifyResponse = z.object({ ok: z.literal(true), email: z.string() });
export type AuthConfigResponse = z.infer<typeof AuthConfigResponse>;
export type SentItem = z.infer<typeof SentItem>;
export type SentResponse = z.infer<typeof SentResponse>;
export type HomeResponse = z.infer<typeof HomeResponse>;

// --- Friend invites (ADR-0015) ---------------------------------------------
export const INVITE_TTL_DAYS = 7;
export const CreateInviteRequest = z.object({ email: z.string().max(320).optional() });
export const InviteItem = z.object({ id: id, to: z.string().optional(), createdAt: isoDateTime, expiresAt: isoDateTime });
export const CreateInviteResponse = z.object({ invite: InviteItem, code: InviteCode });
export const InvitesResponse = z.object({ invites: z.array(InviteItem) });
export const InviteCodeRequest = z.object({ code: InviteCode });
export const InvitePreviewResponse = z.object({ status: z.enum(["valid", "gone"]), inviter: Person.optional() });
export const AcceptInviteResponse = z.object({ friend: Person.extend({ householdId: id }), already: z.boolean() });
export type InviteItem = z.infer<typeof InviteItem>;
export type InvitePreviewResponse = z.infer<typeof InvitePreviewResponse>;
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponse>;
/** "pr•••@example.com" — shown only to the inviter, who typed it. */
export function maskEmail(e: string): string {
  const [u = "", d = ""] = e.split("@");
  return `${u.slice(0, Math.min(2, Math.max(1, u.length - 1)))}•••@${d}`;
}
/** First name for sign-up: trimmed, collapsed whitespace, control chars removed, max NAME_MAX. */
export function cleanName(raw: string): string {
  return raw.normalize("NFC").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
}

// --- Tonight's pick --------------------------------------------------------
// "stub" (proposed, OQ-10): PICK_MODE=stub picks; the TV renders them like "bedrock"
// ("Tonight's pick" label) but the API stays honest about where the pick came from.
export const PickSource = z.enum(["bedrock", "stub", "fallback"]);
export const TonightResponse = z.object({
  recId: id,
  title: z.string().min(1),
  poster: z.string().url().optional(),
  reason: z.string().min(1).max(REASON_MAX),
  source: PickSource,
});

export type DeviceId = z.infer<typeof DeviceId>;
export type ErrorCode = z.infer<typeof ErrorCode>;
export type ErrorBody = z.infer<typeof ErrorBody>;
export type MediaType = z.infer<typeof MediaType>;
export type TitleRef = z.infer<typeof TitleRef>;
export type Person = z.infer<typeof Person>;
export type FeedItem = z.infer<typeof FeedItem>;
export type PairStartRequest = z.infer<typeof PairStartRequest>;
export type PairStartResponse = z.infer<typeof PairStartResponse>;
export type PairStatusQuery = z.infer<typeof PairStatusQuery>;
export type PairStatusResponse = z.infer<typeof PairStatusResponse>;
export type PairCompleteRequest = z.infer<typeof PairCompleteRequest>;
export type PairCompleteResponse = z.infer<typeof PairCompleteResponse>;
export type MeResponse = z.infer<typeof MeResponse>;
export type FriendsResponse = z.infer<typeof FriendsResponse>;
export type TitleSearchResponse = z.infer<typeof TitleSearchResponse>;
export type TitleDetailsResponse = z.infer<typeof TitleDetailsResponse>;
export type TitleSelector = z.infer<typeof TitleSelector>;
export type CreateRecommendationRequest = z.infer<typeof CreateRecommendationRequest>;
export type CreateRecommendationResponse = z.infer<typeof CreateRecommendationResponse>;
export type FeedResponse = z.infer<typeof FeedResponse>;
export type SeenItem = z.infer<typeof SeenItem>;
export type SeenHistoryResponse = z.infer<typeof SeenHistoryResponse>;
export type TonightResponse = z.infer<typeof TonightResponse>;
export type PickSource = z.infer<typeof PickSource>;

// --- Streaming services (ADR-0012) -------------------------------------------
// Stable ids stored in `service`; display names are plain text (no logos). `demo` entries are
// invented services used by seed/mock data and the demo video (hackathon rules: no third-party
// trademarks on screen). Names checked by web search Oct 20 for clashes with real streaming
// services or film/TV brands. Ids stay app_a/app_b so stored recs keep working.
export interface ServiceInfo {
  id: string;
  name: string;
  demo?: boolean;
  /** Brand colour for a small dot beside the name (demo services only; real names stay plain text). */
  color?: string;
}
export const LIVE_SERVICES: ServiceInfo[] = [
  { id: "netflix", name: "Netflix" },
  { id: "prime_video", name: "Prime Video" },
  { id: "disney_plus", name: "Disney+" },
  { id: "hulu", name: "Hulu" },
  { id: "max", name: "Max" },
  { id: "apple_tv", name: "Apple TV" },
  { id: "youtube", name: "YouTube" },
  { id: "peacock", name: "Peacock" },
  { id: "paramount_plus", name: "Paramount+" },
];
export const DEMO_SERVICES: ServiceInfo[] = [
  { id: "app_a", name: "Kitehouse", demo: true, color: "#E8774A" },
  { id: "app_b", name: "Pebblewave", demo: true, color: "#4FA3C7" },
];
/** "other" is a valid choice but has no name to show, so the TV treats it like unknown. */
export const OTHER_SERVICE_ID = "other";

const SERVICE_NAMES = new Map([...LIVE_SERVICES, ...DEMO_SERVICES].map((s) => [s.id, s.name]));

/** Display name for a stored service id, or null when unknown / "other" / Not sure. */
export function serviceName(id: string | null | undefined): string | null {
  return id ? SERVICE_NAMES.get(id) ?? null : null;
}

/**
 * The service to show for a title several friends sent: the most common named service; ties go
 * to the most recent rec. Not sure / unknown ids never outvote a named one. Returns an id or null.
 */
export function summarizeService(recs: { service: string | null; createdAt: string }[]): string | null {
  const tally = new Map<string, { n: number; latest: string }>();
  for (const r of recs) {
    if (!serviceName(r.service)) continue;
    const t = tally.get(r.service!) ?? { n: 0, latest: "" };
    t.n += 1;
    if (r.createdAt > t.latest) t.latest = r.createdAt;
    tally.set(r.service!, t);
  }
  let best: [string, { n: number; latest: string }] | null = null;
  for (const e of tally) if (!best || e[1].n > best[1].n || (e[1].n === best[1].n && e[1].latest > best[1].latest)) best = e;
  return best ? best[0] : null;
}
