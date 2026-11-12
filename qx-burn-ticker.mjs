// Live burn ticker for QHOOKS (catalyst 7a, Randall: "we can start those now"): "N QHOOKS burned · next buyback in m:ss".
// Data: /api/qhooks/buybacks (read on chain by the worker). Burned = everything at 0x…dEaD (rules buybacks and the platform
// flywheel). The countdown runs on chain time, like the buybacks panel. Freshness: "Live · Ns ago" or "Refreshing".
const API = '/api/qhooks/buybacks', REFRESH = 20000;
export const bigQ = v => v >= 1e9 ? +(v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? +(v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? +(v / 1e3).toFixed(1) + 'K' : String(Math.round(v));
const units = wei => Number(BigInt(wei || 0)) / 1e18;
/// The ticker's two parts from a buybacks read, `now` in ms.
export function burnTickerText(data, fetchedAt, now = Date.now()) {
  if (!data?.rules) return null;
  const chainNow = (data.blockTime || Math.floor(fetchedAt / 1000)) + Math.floor((now - fetchedAt) / 1000);
  const r = data.rules, cd = r.nextAt ? Math.max(0, r.nextAt - chainNow) : 0;
  const burned = units(data.dead?.balanceWei);
  const next = !r.everRun ? (r.ready ? 'first buyback ready' : 'first buyback pending')
    : cd > 0 ? 'next buyback in ' + Math.floor(cd / 60) + ':' + String(cd % 60).padStart(2, '0')
    : 'next buyback due now';
  const age = Math.max(0, Math.round((now - fetchedAt) / 1000));
  return {main: bigQ(burned) + ' QHOOKS burned, all sources · ' + next, live: 'Live · ' + (age < 60 ? age + 's' : Math.floor(age / 60) + 'm') + ' ago'};
}
let styled = false;
function style() {
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.id = 'qx-burn-ticker-style';
  s.textContent = '.qx-burn-ticker{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:6px 0 0;font-size:13px;line-height:1.4;font-style:normal}'
    + '.qx-burn-ticker .qbt-main{font-weight:600;font-variant-numeric:tabular-nums}.qx-burn-ticker .qbt-live{font-size:12px;color:var(--qx-muted,#888)}'
    + '.qx-burn-ticker a{color:inherit}';
  document.head.append(s);
}
/// Mounts the ticker in `el` (link to the buybacks section by default). Returns an unmount function.
export function mountBurnTicker(el, {href = '/qhooks-token#qx-buybacks'} = {}) {
  if (!el) return () => {};
  style(); el.classList.add('qx-burn-ticker'); el.hidden = true;
  const main = document.createElement(href ? 'a' : 'span'); main.className = 'qbt-main'; if (href) main.href = href;
  const live = document.createElement('span'); live.className = 'qbt-live'; live.textContent = 'Refreshing';
  el.replaceChildren(main, live);
  let data = null, fetchedAt = 0, timer = 0, dead = false;
  const paint = () => { const t = burnTickerText(data, fetchedAt); if (!t) return; main.textContent = t.main; live.textContent = t.live; el.hidden = false; };
  async function load() {
    // A hidden tab makes no request; the next visible tick reads again.
    if (typeof document !== 'undefined' && document.hidden) { if (!dead) timer = setTimeout(load, REFRESH); return; }
    try {
      const r = await fetch(API, {cache: 'no-store'}); if (!r.ok) throw Error(); data = await r.json(); fetchedAt = Math.min(Date.now(), data.observedAt || Date.now());
      // System A home: the Holders act shows the same read (countdown, burns), so it is handed over instead of fetched twice.
      const detail = {data, fetchedAt}; globalThis.__qxBuybacks = detail;
      if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('qx:buybacks', {detail}));
    }
    catch { live.textContent = 'Refreshing'; }
    paint(); if (!dead) timer = setTimeout(load, REFRESH);
  }
  const tick = setInterval(paint, 1000); load();
  return () => { dead = true; clearTimeout(timer); clearInterval(tick); el.replaceChildren(); };
}
const auto = typeof document !== 'undefined' && document.querySelector('[data-burn-ticker]');
if (auto) mountBurnTicker(auto);
