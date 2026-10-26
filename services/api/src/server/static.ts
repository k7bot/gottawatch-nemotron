// Static files for the single-origin server: the phone PWA at / and the TV browser view at /tv/.
// Hashed build assets are cached for a year; HTML is always revalidated. Text responses are gzipped
// once and kept in memory (the whole site is a few MB).
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { gzipSync } from "node:zlib";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".map": "application/json",
};
const COMPRESS = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".txt", ".ttf", ".map"]);

export interface StaticFile {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface StaticSite {
  /** `prefix` "/" for the PWA, "/tv/" for the TV export. */
  serve(path: string, acceptEncoding: string): Promise<StaticFile | undefined>;
}

/** Files from `root`; unknown paths under `prefix` fall back to `<root>/index.html` (SPA routing). */
export function staticSite(root: string, prefix = "/"): StaticSite {
  const cache = new Map<string, { raw: Buffer; gz?: Buffer; type: string; immutable: boolean }>();
  const load = async (rel: string) => {
    const hit = cache.get(rel);
    if (hit) return hit;
    const full = normalize(join(root, rel));
    if (full !== root && !full.startsWith(root.endsWith(sep) ? root : root + sep)) return undefined; // traversal
    try {
      if (!(await stat(full)).isFile()) return undefined;
    } catch {
      return undefined;
    }
    const raw = await readFile(full);
    const ext = extname(full).toLowerCase();
    const entry = {
      raw,
      ...(COMPRESS.has(ext) && raw.length > 1024 ? { gz: gzipSync(raw, { level: 9 }) } : {}),
      type: TYPES[ext] ?? "application/octet-stream",
      // Vite (assets/) and Expo (_expo/static/) put content hashes in these names.
      immutable: /(^|\/)(assets|_expo\/static)\//.test(rel) && ext !== ".html",
    };
    cache.set(rel, entry);
    return entry;
  };
  return {
    async serve(path, acceptEncoding) {
      if (!path.startsWith(prefix) && path !== prefix.replace(/\/$/, "")) return undefined;
      let rel = path === prefix.replace(/\/$/, "") ? "" : path.slice(prefix.length);
      try {
        rel = decodeURIComponent(rel);
      } catch {
        return undefined;
      }
      if (rel.includes("\0")) return undefined;
      let f = rel && !rel.endsWith("/") ? await load(rel) : await load(join(rel, "index.html"));
      let fallback = false;
      if (!f && !extname(rel)) {
        f = await load("index.html"); // SPA route like /pair, /u/<token>, /invite/<code>
        fallback = true;
      }
      if (!f) return undefined;
      const gz = f.gz && /\bgzip\b/.test(acceptEncoding);
      return {
        status: 200,
        headers: {
          "content-type": f.type,
          "cache-control": f.immutable && !fallback ? "public, max-age=31536000, immutable" : "no-cache",
          vary: "accept-encoding",
          ...(gz ? { "content-encoding": "gzip" } : {}),
        },
        body: gz ? f.gz! : f.raw,
      };
    },
  };
}
