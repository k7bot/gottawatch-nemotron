// Pre-renders "Circle Art" posters + backdrops for the TV app (UX-04, ux-design §3, ADR-0009 Tier 1).
// Recipe = docs/design/mockups/src/poster.js (copied into recipe.cjs). Renders SVG with headless Chrome,
// then converts/checks with Python (PIL): backdrops → 960×540 JPEG, poster-title contrast ≥ 4.5:1.
// Usage: node tools/poster-gen/render.mjs   (needs google-chrome, python3 + Pillow)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { poster } = require("./recipe.cjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const assets = path.join(repo, "apps/tv/packages/shared-ui/src/assets/art");
const fraunces = path.join(repo, "apps/tv/packages/shared-ui/src/assets/fonts/Fraunces-SemiBold.ttf");
const tmp = "/tmp/poster-gen";
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(assets, { recursive: true });

// Demo catalog (services/api/src/catalog/demo.ts) + mood/motif from the mockups' CATALOG.
const TITLES = [
  { slug: "kestrel-bay", title: "Kestrel Bay", mood: "tide", motif: "horizon" },
  { slug: "the-quiet-orchard", title: "The Quiet Orchard", mood: "orchard", motif: "dots" },
  { slug: "saltwater-static", title: "Saltwater Static", mood: "static", motif: "waves" },
  { slug: "small-hours-bakery", title: "Small Hours Bakery", mood: "ember", motif: "dots" },
  { slug: "lanternfish-and-co", title: "Lanternfish and Co", mood: "tide", motif: "dots" },
  { slug: "ninety-seconds-to-orbit", title: "Ninety Seconds to Orbit", mood: "frost", motif: "waves" },
  { slug: "the-paper-comet", title: "The Paper Comet", mood: "dusk", motif: "horizon" },
  { slug: "night-desk-at-hollow-pines", title: "Night Desk at Hollow Pines", mood: "static", motif: "dots" },
  { slug: "copper-and-thistle", title: "Copper and Thistle", mood: "ember", motif: "split" },
  { slug: "the-marigold-line", title: "The Marigold Line", mood: "dusk", motif: "waves" },
  { slug: "fjordlight", title: "Fjordlight", mood: "frost", motif: "horizon" },
  { slug: "the-birdie-rule", title: "The Birdie Rule", mood: "orchard", motif: "horizon" },
  { slug: "below-quarry-lake", title: "Below Quarry Lake", mood: "tide", motif: "waves" },
  { slug: "the-lighthouse-supper-club", title: "The Lighthouse Supper Club", mood: "ember", motif: "horizon" },
  // Generic fallback (unknown titles, broken poster URLs): no title in the art; the app overlays it.
  { slug: "fallback", title: "Gottawatch", mood: "dusk", motif: "rings", noTitle: true },
];

function shoot(name, svg, w, h) {
  const html = `<!doctype html><html><head><style>
@font-face{font-family:"Fraunces";src:url("file://${fraunces}");font-weight:600}
html,body{margin:0;padding:0;background:#0E1020;width:${w}px;height:${h}px;overflow:hidden}</style></head>
<body>${svg}</body></html>`;
  const file = path.join(tmp, `${name}.html`);
  writeFileSync(file, html);
  execFileSync("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--allow-file-access-from-files", `--window-size=${w},${h}`, "--virtual-time-budget=2000",
    `--screenshot=${path.join(tmp, name + ".png")}`, `file://${file}`], { stdio: "ignore" });
}

for (const t of TITLES) {
  const o = { mood: t.mood, motif: t.motif, noTitle: !!t.noTitle };
  shoot(`${t.slug}-poster`, poster(t.title, 440, 660, o), 440, 660);
  shoot(`${t.slug}-poster-notitle`, poster(t.title, 440, 660, { ...o, noTitle: true }), 440, 660);
  shoot(`${t.slug}-backdrop`, poster(t.title, 1920, 1080, o), 1920, 1080);
}

const web = path.join(repo, "apps/web/public/art");
execFileSync("python3", [path.join(here, "finish.py"), tmp, assets, JSON.stringify(TITLES), web], { stdio: "inherit" });
