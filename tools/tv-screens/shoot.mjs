import { chromium } from 'playwright-core';
const OUT = process.env.OUT ?? new URL('../../docs/design/screenshots', import.meta.url).pathname;
const BASE = 'http://localhost:8082/';
const only = process.argv.slice(2);
const now = Date.now();
const paired = { 'wc.deviceId': 'previewDevice000000000A', 'wc.deviceToken': 'wcd_preview', 'wc.pairedAt': String(now - 86400000), 'wc.householdName': "Kiran's household", 'wc.lastSessionEnd': String(now - 4 * 3600000) };
const shots = [
  { name: 'tv-pairing-intro', ls: {}, wait: 'Get started' },
  { name: 'tv-pairing-code', ls: { 'wc.deviceId': 'previewDevice000000000A' }, wait: 'Waiting for your phone' },
  { name: 'tv-pair-success', ls: { 'wc.deviceId': 'previewDevice000000000A' }, wait: "You're paired!", timeout: 20000 },
  { name: 'tv-pairing-unpaired', q: 'scenario=unpaired', ls: { ...paired, 'wc.deviceToken': 'wcd_stale' }, wait: 'This TV was disconnected' },
  { name: 'tv-home-loading', q: 'latency=60000', ls: paired, delay: 1500 },
  { name: 'tv-home-pick', ls: paired, wait: 'From your circle' },
  { name: 'tv-home-stub', q: 'scenario=stub', ls: paired, wait: 'From your circle' },
  { name: 'tv-home-fallback', q: 'scenario=fallback', ls: paired, wait: 'From your circle' },
  { name: 'tv-home-newest', q: 'scenario=nopick', ls: paired, wait: 'Watch now' },
  { name: 'tv-home-empty', q: 'scenario=empty', ls: paired, wait: 'quiet tonight' },
  { name: 'tv-home-error', q: 'scenario=offline', ls: paired, wait: "Can't reach" },
  { name: 'tv-home-row-focus', ls: paired, wait: 'From your circle', keys: ['ArrowDown', 'ArrowRight'], delay: 700 },
  { name: 'tv-home-marked-seen', ls: paired, wait: 'From your circle', keys: ['ArrowRight', 'Enter'], delay: 1200 },
  { name: 'tv-actions-sheet', ls: paired, wait: 'From your circle', keys: ['ArrowDown', 'KeyM'], delay: 700 },
  { name: 'tv-handoff-named', ls: paired, wait: 'From your circle', keys: ['Enter'], delay: 1200 },
  { name: 'tv-handoff-unknown', ls: paired, wait: 'From your circle', keys: ['ArrowDown', 'ArrowRight', 'ArrowRight', 'Enter'], delay: 1200 },
  { name: 'tv-about', ls: paired, wait: 'From your circle', keys: ['ArrowUp', 'ArrowRight', 'ArrowRight', 'Enter'], delay: 800 },
  { name: 'tv-undo-toast', ls: paired, wait: 'From your circle', keys: ['ArrowRight', 'Enter'], delay: 1200 },
  { name: 'tv-undo-focused', ls: paired, wait: 'From your circle', keys: ['ArrowRight', 'Enter', 'ArrowDown', 'ArrowDown'], delay: 900 },
  { name: 'tv-undo-done', ls: paired, wait: 'From your circle', keys: ['ArrowRight', 'Enter', 'ArrowDown', 'ArrowDown', 'Enter'], delay: 1200 },
  { name: 'tv-watched', q: 'scenario=history', ls: paired, wait: 'From your circle', keys: ['ArrowUp', 'ArrowRight', 'Enter'], delay: 1200 },
  { name: 'tv-watched-empty', ls: paired, wait: 'From your circle', keys: ['ArrowUp', 'ArrowRight', 'Enter'], delay: 1200 },
  { name: 'tv-home-ask-focus', ls: paired, wait: 'From your circle', keys: ['ArrowUp'], delay: 500 },
  { name: 'tv-ask-idle', ls: paired, wait: 'From your circle', keys: ['ArrowUp', 'Enter'], delay: 900 },
  { name: 'tv-ask-thinking', q: 'latency=4000', ls: paired, wait: 'From your circle', timeout: 30000, keys: ['ArrowUp', 'Enter', 'Enter'], delay: 600 },
  { name: 'tv-ask-answer', ls: paired, wait: 'From your circle', keys: ['ArrowUp', 'Enter', 'Enter'], delay: 1500 },
  { name: 'tv-ask-pick-focus', ls: paired, wait: 'From your circle', keys: ['ArrowUp', 'Enter', 'Enter'], delay: 1500, after: ['ArrowDown'] },
  { name: 'tv-ask-handoff', ls: paired, wait: 'From your circle', keys: ['ArrowUp', 'Enter', 'Enter'], delay: 1500, after: ['ArrowDown', 'Enter'] },
  { name: 'tv-ask-handoff-back', ls: paired, wait: 'From your circle', keys: ['ArrowUp', 'Enter', 'Enter'], delay: 1500, after: ['ArrowDown', 'Enter', 'Escape'] },
  { name: 'tv-ask-limit', q: 'scenario=ask-limit', ls: paired, wait: 'From your circle', keys: ['ArrowUp', 'Enter', 'ArrowRight', 'Enter'], delay: 1500 },
];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
for (const s of shots) {
  if (only.length && !only.includes(s.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript((ls) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear();
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    sessionStorage.setItem('seeded', '1');
  }, s.ls);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${s.name} console: ${m.text().slice(0, 200)}`); });
  await page.goto(BASE + (s.q ? `?${s.q}` : ''), { waitUntil: 'load' });
  try {
    if (s.wait) await page.getByText(s.wait, { exact: false }).first().waitFor({ timeout: s.timeout ?? 15000 });
    await page.waitForTimeout(600);
    for (const k of s.keys ?? []) { await page.keyboard.press(k); await page.waitForTimeout(350); }
    if (s.delay) await page.waitForTimeout(s.delay);
    for (const k of s.after ?? []) { await page.keyboard.press(k); await page.waitForTimeout(500); }
    await page.screenshot({ path: `${OUT}/${s.name}.png` });
    console.log('ok', s.name);
  } catch (e) {
    console.log('FAIL', s.name, e.message.split('\n')[0]);
    await page.screenshot({ path: `/tmp/tv-screens-fail-${s.name}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no page errors');
