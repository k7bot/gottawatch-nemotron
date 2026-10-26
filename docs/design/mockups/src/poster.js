// Circle Art: deterministic abstract posters (ux-design §3). Title -> SVG. Mockup version.
const MOODS = {
  dusk:   ["#2B2A5E", "#8C4F7A", "#E59A8C"],
  tide:   ["#0F2E45", "#1E6B78", "#9CD3CF"],
  orchard:["#24392C", "#6F8F5E", "#E8DDB8"],
  ember:  ["#2A1B18", "#8A4B2A", "#F2B45A"],
  static: ["#1A1838", "#2C8FA5", "#D0729F"],
  frost:  ["#1C2433", "#5D7590", "#DCE6F0"],
};
const MOTIFS = ["horizon", "rings", "dots", "waves", "split"];
function hash(s){ let h=2166136261; for (const c of s){ h^=c.charCodeAt(0); h=Math.imul(h,16777619);} return h>>>0; }
function pick(arr, h){ return arr[h % arr.length]; }
function poster(title, w, h, o = {}) {
  const hv = hash(title);
  const moodName = o.mood || pick(Object.keys(MOODS), hv);
  const [c0, c1, c2] = MOODS[moodName];
  const motif = o.motif || pick(MOTIFS, hv >>> 5);
  const land = w > h; const id = "g" + (hv % 100000) + (land ? "L" : "P");
  const cx = land ? w * 0.72 : w * 0.5, cy = land ? h * 0.42 : h * 0.4;
  const R = land ? h * 0.28 : w * 0.32;
  let m = "";
  if (motif === "horizon") {
    m += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${c2}" opacity=".95"/>`;
    m += `<rect x="0" y="${cy + R * 0.35}" width="${w}" height="${h}" fill="${c0}" opacity=".9"/>`;
    for (let i = 0; i < 5; i++) m += `<rect x="${cx - R * (1.1 - i * .18)}" y="${cy + R * 0.5 + i * (land ? 18 : 16)}" width="${R * (2.2 - i * .36)}" height="${land ? 5 : 4}" rx="2" fill="${c2}" opacity="${.5 - i * .08}"/>`;
  } else if (motif === "rings") {
    for (let i = 5; i >= 1; i--) m += `<circle cx="${cx}" cy="${cy}" r="${R * i / 3.2}" fill="none" stroke="${i % 2 ? c2 : c1}" stroke-width="${land ? 14 : 10}" opacity="${.25 + i * .1}"/>`;
    m += `<circle cx="${cx}" cy="${cy}" r="${R * .22}" fill="${c2}"/>`;
  } else if (motif === "dots") {
    const step = land ? 54 : 26, r = land ? 13 : 6.5;
    for (let y = cy - R; y < cy + R * 1.6; y += step) for (let x = (land ? w * .42 : step / 2); x < w; x += step) {
      const d = Math.hypot(x - cx, y - cy) / (R * 1.5); if (d < 1) m += `<circle cx="${x}" cy="${y}" r="${r * (1.2 - d * .6)}" fill="${c2}" opacity="${.95 - d * .55}"/>`;
    }
    m += `<path d="M${land ? w * .4 : 0} ${cy + R * 1.2} Q ${cx} ${cy + R * .9} ${w} ${cy + R * 1.25} L ${w} ${h} L ${land ? w * .4 : 0} ${h} Z" fill="${c0}" opacity=".85"/>`;
  } else if (motif === "waves") {
    for (let i = 0; i < 9; i++) { const y = cy - R + i * R * .3; const a = R * .18;
      m += `<path d="M ${land ? w * .38 : -10} ${y} C ${cx - R} ${y - a}, ${cx} ${y + a}, ${cx + R * .6} ${y} S ${w + 20} ${y - a}, ${w + 20} ${y}" fill="none" stroke="${i % 3 === 0 ? c2 : c1}" stroke-width="${land ? 7 : 5}" stroke-linecap="round" opacity="${.35 + (i % 3) * .2}"/>`; }
    m += `<circle cx="${cx + R * .35}" cy="${cy - R * .55}" r="${R * .16}" fill="${c2}"/>`;
  } else {
    m += `<rect x="${land ? w * .52 : w * .18}" y="${h * .14}" width="${land ? w * .36 : w * .64}" height="${h * .52}" rx="${land ? 24 : 14}" fill="${c1}"/>`;
    m += `<rect x="${land ? w * .6 : w * .3}" y="${h * .24}" width="${land ? w * .2 : w * .4}" height="${h * .32}" rx="${land ? 120 : 70}" fill="${c2}" opacity=".9"/>`;
  }
  const titleSize = o.titleSize || (land ? 0 : Math.round(w / (title.length > 16 ? 8.8 : 7.2)));
  const words = title.split(" "); const lines = []; let cur = "";
  for (const wd of words) { if ((cur + " " + wd).trim().length > (title.length > 16 ? 11 : 12)) { lines.push(cur.trim()); cur = wd; } else cur += " " + wd; }
  lines.push(cur.trim());
  const t = land || o.noTitle ? "" : lines.map((ln, i) => `<text x="${w * .08}" y="${h * .8 - (lines.length - 1 - i) * titleSize * 1.05}" font-family="Fraunces" font-weight="600" font-size="${titleSize}" fill="#F4F1EA">${ln}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="${land ? 1 : .3}" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c0}"/></linearGradient>
  <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#0E1020" stop-opacity="0"/><stop offset="1" stop-color="#0E1020" stop-opacity=".85"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#${id})"/>${m}${land ? "" : `<rect width="${w}" height="${h}" fill="url(#${id}s)"/>`}${t}</svg>`;
}
const CATALOG = {
  "Kestrel Bay": { mood: "tide", motif: "horizon" },
  "The Quiet Orchard": { mood: "orchard", motif: "dots" },
  "Saltwater Static": { mood: "static", motif: "waves" },
  "Glasshouse Weather": { mood: "frost", motif: "split" },
  "Velvet Arithmetic": { mood: "dusk", motif: "rings" },
  "Ninefold Hollow": { mood: "ember", motif: "rings" },
  "Harbor of Small Lights": { mood: "ember", motif: "dots" },
  "Paper Lanterns at Low Tide": { mood: "dusk", motif: "horizon" },
};
function art(title, w, h, extra = {}) { return poster(title, w, h, { ...(CATALOG[title] || {}), ...extra }); }
function fill(sel, title, w, h, extra) { document.querySelectorAll(sel).forEach(el => el.innerHTML = art(title, w, h, extra)); }
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-art]").forEach(el => {
    el.innerHTML = art(el.dataset.art, +el.dataset.w, +el.dataset.h, el.dataset.notitle ? { noTitle: true } : {});
  });
});
