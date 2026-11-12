// Launch-week drop block at /qhooks-token#qdr-h (newcomer walk, 2026-11-12): the drop banner's "How it works" lands here.
// Amount, who qualifies, the snapshot, when claims open and a live countdown. Every rule and number comes from the live
// QDrops config (qdrops-config.mjs, the file the scorer runs on) and the claim timing from /api/drops/status, so the
// block can never say something the drop doesn't do. Shown until a week after the window closes, like the banner.
import {DROPS} from './qdrops-config.mjs';

const CHAIN = '4663', DAY = 86400000;
const cfg = DROPS[CHAIN], drop = cfg?.drop, win = drop?.windows?.find((w) => w.id === 'launch');
const tok = cfg?.tokens?.find((t) => t.address === drop?.token);
const dayMs = (d) => Date.parse(d + 'T00:00:00Z');
const whole = (wei) => { try { return (BigInt(wei) / 10n ** BigInt(tok?.decimals ?? 18)).toLocaleString('en-US'); } catch { return null; } };
const day = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const stamp = (ms) => day(ms) + ', ' + new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
const left = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + 'd ' : '') + (d || h ? String(h).padStart(d ? 2 : 1, '0') + 'h ' : '') + String(m).padStart(2, '0') + 'm ' + String(s % 60).padStart(2, '0') + 's';
};
const el = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; n.append(...kids.filter((k) => k != null)); return n; };

/// The block's words for a moment in time. status: /api/drops/status (or null while it hasn't answered).
export function weekModel(now, status = null) {
  if (!win || !tok) return null;
  const start = dayMs(win.start), end = dayMs(win.end);
  if (!(end > start) || now >= end + 7 * DAY) return null;
  const amount = whole(win.pot), min = whole(drop.minAverage || '0'), days = Math.round((end - start) / DAY);
  const chain = status?.chains?.find((c) => String(c.chainId) === CHAIN), onchain = chain?.onchain;
  const delayH = Number(onchain?.delay) > 0 ? Math.round(Number(onchain.delay) / 3600) : 24;
  const ep = (chain?.epochs || []).find((e) => /"launch"/.test(JSON.stringify(e.sources ?? null)));
  const ready = Number(onchain?.pending?.readyAt) || 0, readyMs = ready > 1e12 ? ready : ready * 1000;
  let clock, claims;
  if (now < end) { clock = { t: 'Window closes in ', at: end }; claims = 'The list publishes after ' + stamp(end) + '. Claims open ' + delayH + ' hours after it publishes, here and on My QHooks.'; }
  else if (ep && Number(onchain?.epoch) >= Number(ep.epoch)) { clock = { t: 'Claims are open.' }; claims = 'Claims are open. Claim below or on My QHooks.'; }
  else if (ep && readyMs > now) { clock = { t: 'Claims open in ', at: readyMs }; claims = 'The list is published. Claims open ' + stamp(readyMs) + '.'; }
  else { clock = { t: 'Window closed. The list publishes next.' }; claims = 'The list publishes next. Claims open ' + delayH + ' hours after it publishes, here and on My QHooks.'; }
  const boost = Math.max(Number(drop.stakeMultiplier) || 1, Number(drop.lockMultiplier) || 1);
  const who = 'Wallets averaging ' + min + ' ' + tok.symbol + ' or more over the week, held, staked or self-locked, with at least that much at ' + drop.minDays + ' of the ' + days + ' day-ends.'
    + (boost > 1 ? ' Staked and locked ' + tok.symbol + ' count ' + boost + '× toward your share.' : '');
  const snap = 'Balances at every day-end, 00:00 UTC, ' + day(start + DAY) + ' to ' + day(end) + '.';
  return { amount, symbol: tok.symbol, clock, rows: [['Who qualifies', who], ['Snapshot', snap], ['Claims', claims]] };
}

function mount(root) {
  let status = null, model = null, clockEl = null, last = '';
  const draw = () => {
    model = weekModel(Date.now(), status);
    if (!model) { root.hidden = true; return; }
    const key = JSON.stringify([model.amount, model.rows, model.clock.t]);
    if (key !== last) {
      last = key;
      clockEl = el('p', 'qdw-clock');
      root.replaceChildren(
        el('div', 'qdw-top', el('p', 'qdw-k', 'Launch-week drop'), clockEl),
        el('p', 'qdw-amt', model.amount + ' ', el('small', null, model.symbol)),
        el('dl', 'qdw-rules', ...model.rows.map(([k, v]) => el('div', null, el('dt', null, k), el('dd', null, v)))));
      root.hidden = false;
    }
    clockEl.textContent = model.clock.t + (model.clock.at ? left(model.clock.at - Date.now()) : '');
  };
  const read = () => fetch('/api/drops/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) { status = j; last = ''; draw(); } }).catch(() => {});
  draw(); read();
  setInterval(() => { if (document.visibilityState === 'visible') draw(); }, 1000);
  // After the window closes the list and the claim time land on chain: read them again each minute while the page is open.
  setInterval(() => { if (document.visibilityState === 'visible' && win && Date.now() >= dayMs(win.end)) read(); }, 60000);
}
if (typeof document !== 'undefined') for (const root of document.querySelectorAll('[data-drop-week]')) mount(root);
