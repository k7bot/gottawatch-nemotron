export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

/** YYYY-MM-DD for `now` in an IANA time zone (household "this evening", plan §5). */
export function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const epochSeconds = (d: Date) => Math.floor(d.getTime() / 1000);
