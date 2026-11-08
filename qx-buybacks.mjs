// Live "Buybacks & burns" panel for QHOOKS (lead, launch night 2026-11-07). Data: /api/qhooks/buybacks (read on chain
// by the worker). Shows the real state: "First buyback pending" until one has run, a countdown to the next allowed run,
// totals from BuybackBurned events, % of supply at 0x…dEaD, and the flywheel row once the Safe names the pool.
// In the terminal, a "Run buyback" button lets any connected wallet call buyback() when it is ready (gas only).
import {ethUsd} from '/qx-native-usd.mjs';
const API = '/api/qhooks/buybacks', REFRESH = 20000;
const RULES = '0xf14965A00bB489B8cDdfb31BF7687cc7babc5606', TOKEN = '0x20429Af7cA3b0cE4d99EDBAA0693f26C5df05195';
const el = (t, cls, text) => { const n = document.createElement(t); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const units = (wei, d = 18) => Number(BigInt(wei || 0)) / 10 ** d;
const fmt = (v, max = 4) => v === 0 ? '0' : v < 0.0001 ? '< 0.0001' : v.toLocaleString('en-US', {maximumFractionDigits: v < 1 ? max : 2});
const big = v => v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : fmt(v, 2);
const usd = v => v == null ? '' : v < 0.01 ? '< $0.01' : '$' + v.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const short = h => h.slice(0, 8) + '…' + h.slice(-6);
const ago = s => s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h';
let styled = false;
function style() {
  if (styled) return; styled = true;
  const s = el('style'); s.id = 'qxb-style';
  s.textContent = `.qxb{display:grid;gap:14px;font-style:normal}
.qxb-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px}
.qxb-state{display:inline-flex;align-items:center;gap:8px;font-weight:600}
.qxb-dot{width:8px;height:8px;border-radius:50%;background:var(--qx-brass,#b88a3e)}
.qxb-state[data-ready="1"] .qxb-dot{background:var(--qxt-up,#1f7a46)}
.qxb-live{font-size:12px;color:var(--qx-muted,#888)}
.qxb-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.qxb-cell{padding:12px 14px;border:1px solid var(--qx-line,rgba(127,127,127,.25));border-radius:12px;min-width:0}
.qxb-cell span{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--qx-muted,#888)}
.qxb-cell b{display:block;margin-top:4px;font-size:17px;overflow-wrap:anywhere}
.qxb-cell small{display:block;margin-top:2px;font-size:12px;color:var(--qx-muted,#888)}
.qxb-row{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:var(--qx-muted,#888)}
.qxb-row b{color:var(--qx-ink,inherit);font-weight:600}
.qxb-list{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:13px}
.qxb-list li{display:flex;flex-wrap:wrap;gap:4px 12px}
.qxb-list a,.qxb a{color:inherit;text-decoration:underline}
.qxb-run{justify-self:start;padding:9px 16px;border-radius:99px;border:1px solid var(--qx-brass,#b88a3e);background:var(--qx-brass,#b88a3e);color:var(--qx-on-brass,#111);font:600 14px var(--qx-sans,inherit);cursor:pointer;min-height:40px}
.qxb-run[disabled]{opacity:.5;cursor:default}
.qxb-note{font-size:12.5px;color:var(--qx-muted,#888);margin:0}
.qxb.compact{gap:10px;padding:12px 14px;border:1px solid var(--qx-line,rgba(127,127,127,.25));border-radius:12px;margin:10px 0}
.qxb.compact .qxb-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.qxb.compact .qxb-cell{padding:8px 10px}.qxb.compact .qxb-cell b{font-size:14px}
/* Page variant: the site's own cards (panel colour, site radius, gold labels), like the other token-page sections. */
.qxb:not(.compact){gap:16px}
.qxb:not(.compact) .qxb-state{font:650 18px/1.3 var(--qx-sans,inherit);letter-spacing:-.01em}
.qxb:not(.compact) .qxb-grid{gap:14px}
.qxb:not(.compact) .qxb-cell{padding:22px 24px;border:1px solid var(--qx-line);border-radius:var(--qx-radius,22px);background:var(--qx-panel)}
.qxb:not(.compact) .qxb-cell span{font:600 12px/1 var(--qx-sans,inherit);letter-spacing:.14em;color:var(--qx-brass)}
.qxb:not(.compact) .qxb-cell b{margin-top:14px;font:650 24px/1.15 var(--qx-sans,inherit);letter-spacing:-.02em;color:var(--qx-ink)}
.qxb:not(.compact) .qxb-cell small{margin-top:6px;font-size:13.5px}
.qxb:not(.compact) .qxb-more{display:grid;gap:12px;padding:22px 24px;border:1px solid var(--qx-line);border-radius:var(--qx-radius,22px);background:var(--qx-panel)}
.qxb:not(.compact) .qxb-row,.qxb:not(.compact) .qxb-list{font-size:14.5px}
.qxb:not(.compact) .qxb-note{font-size:13.5px}
.qxb.compact .qxb-more{display:grid;gap:10px}
.qxb-list-h{font-weight:600;font-size:14px}.qxb-more .qxb-row{padding-top:10px;border-top:1px solid var(--qx-line,rgba(127,127,127,.2))}
@media (max-width:700px){.qxb-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.qxb:not(.compact) .qxb-cell{padding:16px 16px}.qxb:not(.compact) .qxb-cell b{font-size:19px}.qxb:not(.compact) .qxb-more{padding:16px}}`;
  document.head.append(s);
}
async function sendBuyback(status) {
  const {send} = await import('/qx-chain.mjs');
  return send('4663', {to: RULES, data: '0xf8ec6911', value: 0n}, t => { status.textContent = t; });
}
export function mountBuybacks(root, {compact = false, runButton = false} = {}) {
  if (!root || root.dataset.qxbMounted) return () => {};
  root.dataset.qxbMounted = '1'; style();
  root.classList.add('qxb'); if (compact) root.classList.add('compact');
  let data = null, fetchedAt = 0, price = null, timer = null, tick = null, dead = false, busy = false;
  const state = el('span', 'qxb-state'), live = el('span', 'qxb-live', 'Refreshing');
  const top = el('div', 'qxb-top'); top.append(state, live);
  const grid = el('div', 'qxb-grid'), fly = el('div', 'qxb-row'), list = el('ul', 'qxb-list'), note = el('p', 'qxb-note'), status = el('p', 'qxb-note');
  const run = el('button', 'qxb-run', 'Run buyback'); run.type = 'button'; run.hidden = true;
  const go = el('a', '', 'Run it in the terminal →'); go.href = '/terminal#t=4663:' + TOKEN; go.hidden = true;
  const listHead = el('b', 'qxb-list-h', 'Recent buybacks');
  const more = el('div', 'qxb-more'); more.append(listHead, list, fly, ...(runButton ? [run, status] : [go]), note);
  root.replaceChildren(top, grid, more);
  const cell = (k, v, sub) => { const c = el('div', 'qxb-cell'); c.append(el('span', '', k), el('b', '', v)); if (sub) c.append(el('small', '', sub)); return c; };
  function paint() {
    if (!data) return;
    // Chain time (block time at the read, plus time since), so a skewed device clock can't misstate the countdown.
    const now = (data.blockTime || Math.floor(fetchedAt / 1000)) + Math.floor((Date.now() - fetchedAt) / 1000), r = data.rules, b = data.burns;
    const pot = units(r.potWei), cd = r.nextAt ? Math.max(0, r.nextAt - now) : 0;
    const ready = r.ready && (cd === 0 || !r.nextAt);
    state.dataset.ready = ready ? '1' : '0';
    state.replaceChildren(el('i', 'qxb-dot'), document.createTextNode(!r.everRun ? (ready ? 'First buyback pending · Ready' : 'First buyback pending') : ready ? 'Ready' : cd === 0 ? 'Next buyback due now' : 'Next buyback in ' + Math.floor(cd / 60) + 'm ' + String(cd % 60).padStart(2, '0') + 's'));
    live.textContent = 'Live · ' + ago(Math.max(0, Math.round((Date.now() - fetchedAt) / 1000))) + ' ago';
    const spent = units(b.wethSpentWei), burned = units(b.qhooksBurnedWei);
    grid.replaceChildren(
      cell('Pot waiting', fmt(pot) + ' WETH', price ? usd(pot * price) : ''),
      cell('Buybacks', String(b.count), b.count ? fmt(spent) + ' WETH spent' : 'None yet'),
      cell('Burned', big(burned) + ' QHOOKS', price && spent ? usd(spent * price) + ' spent' : ''),
      cell('Supply burned', (data.dead.pctOfSupply || 0).toFixed(4) + '%', big(units(data.dead.balanceWei)) + ' at 0x…dEaD'));
    const f = data.flywheel;
    fly.replaceChildren(el('b', '', 'Platform flywheel'), ...(f.live
      ? [document.createTextNode('Spent ' + fmt(units(f.totalSpentWei)) + ' WETH'), document.createTextNode('Burned ' + big(units(f.totalBurnedWei)) + ' QHOOKS'), document.createTextNode('To the Safe ' + big(units(f.totalToSafeWei)) + ' QHOOKS')]
      : [document.createTextNode('Starts when the Safe names the pool')]));
    listHead.hidden = !b.recent.length; list.hidden = !b.recent.length;
    list.replaceChildren(...b.recent.map(x => { const li = el('li'); const a = el('a', '', short(x.tx) + ' ↗'); a.href = data.explorer + '/tx/' + x.tx; a.target = '_blank'; a.rel = 'noopener noreferrer';
      li.append(el('span', '', x.at ? ago(Math.max(0, now - x.at)) + ' ago' : 'Block ' + x.block), el('span', '', fmt(units(x.spentWei)) + ' WETH → ' + big(units(x.burnedWei)) + ' QHOOKS burned'), a); return li; }));
    note.textContent = 'Each run spends up to ' + fmt(units(r.maxPerRunWei)) + ' WETH from the pot, buys QHOOKS and sends it to 0x…dEaD. Runs are allowed every ' + Math.round(r.cooldown / 60) + ' minutes; anyone can start one.';
    run.hidden = !runButton || !ready; run.disabled = busy; go.hidden = runButton || !ready;
  }
  async function load() {
    try {
      const res = await fetch(API, {cache: 'no-store'}); if (!res.ok) throw Error();
      data = await res.json(); fetchedAt = Math.min(Date.now(), data.observedAt || Date.now()); // the read's own time
      ethUsd().then(p => { price = p?.usd || price; paint(); }).catch(() => {});
    } catch { live.textContent = 'Refreshing'; }
    paint(); if (!dead) timer = setTimeout(load, REFRESH);
  }
  run.addEventListener('click', async () => {
    if (busy) return; busy = true; paint();
    try { await sendBuyback(status); status.textContent = 'Buyback sent. Burned tokens show here within a minute.'; clearTimeout(timer); setTimeout(load, 4000); }
    catch (e) { status.textContent = /reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet.' : (e?.message || 'Buyback did not go through.') + ' Nothing was spent except any gas shown in your wallet.'; }
    finally { busy = false; paint(); }
  });
  tick = setInterval(paint, 1000); load();
  return () => { dead = true; clearTimeout(timer); clearInterval(tick); root.replaceChildren(); delete root.dataset.qxbMounted; };
}
const auto = document.getElementById('qx-buybacks');
if (auto) mountBuybacks(auto, {compact: false, runButton: false});
