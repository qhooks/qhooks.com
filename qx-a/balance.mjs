import {pricingCoverage} from '../qx-portfolio-pricing.mjs';
import {portfolioReader} from '../qx-portfolio-read.mjs';
// The connected wallet's balance in the header, on every page (Randall, 2026-11-12: "My balances take 20 seconds to
// load and need to show total available funds or available funds on selected chain w/symbol at all times at the top").
//  - Every page shows the all-chain dollar total. An old saved native-chain display choice cannot override it.
//  - Last-known dollars paint immediately. Settled price gaps are Partial; active balance reads say so.
//  - Opens Portfolio. Existing balance/portfolio caches and read cadence are retained; no new provider requests.
import { chainById } from '/chains.mjs';

const doc = document, PREF = 'qhooks:wallet-connection:v1', KEY = 'qa-bal:v1:', MIN_GAP = 4000;
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const isAddr = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

export function fmtAmount(n) {
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
  if (a >= 0.0001) return Number(n.toPrecision(3)).toString();
  return '<0.0001';
}
export const fmtUsd = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: n >= 1000 ? 0 : 2, maximumFractionDigits: n >= 1000 ? 0 : 2 });


// Presentation only; the portfolio reader supplies values and original clocks.
export function portfolioHeaderStatus(report,{now=Date.now()}={}) {
  const coverage=pricingCoverage(report,{now});
  // Price status follows the priced share's evidence, not a sticky aggregate
  // partial/refresh flag. Actual balance errors remain a separate disclosure.
  const partial=!report||!coverage.settled||coverage.transportTimedOut||coverage.balanceError||coverage.liquidUnpriced>0||!coverage.priceLive;
  const note=report?coverage.label:'all chains · Reading balances';
  const age=Number.isSafeInteger(coverage.observedAt)&&coverage.observedAt>0&&coverage.observedAt<=now?'Prices observed '+new Date(coverage.observedAt).toISOString():null;
  const details=coverage.otherUnpriced>0?coverage.otherUnpriced+' other unpriced holding'+(coverage.otherUnpriced===1?' remains':'s remain')+' listed in Portfolio':null;
  return {partial:!!partial,note,age,details,coverage};
}

function remembered() {
  try { const p = JSON.parse(get(PREF) || 'null'); return p && isAddr(p.owner) && /^\d+$/.test(String(p.chainId)) ? { owner: p.owner.toLowerCase(), chainId: String(p.chainId) } : null; } catch { return null; }
}

export function mountBalance(end, before) {
  if (!end || end.querySelector('.qa-bal')) return null;
  const btn = doc.createElement('a');
  btn.href = '/portfolio'; btn.className = 'qa-bal'; btn.hidden = true;
  const amt = doc.createElement('b'), sub = doc.createElement('span');
  btn.append(amt, sub);
  (before && before.parentNode === end ? before : end.lastElementChild)?.before(btn);
  // Randall2026-11-14: dollars on every page, including old native-mode preferences.
  const mode = 'usd';
  let who = remembered(), last = 0, seq = 0, totalStarted = '';

  function paint() {
    if (!who) { btn.hidden = true; return; }
    const saved=portfolioReader().cached('evm',who.owner),report=saved?.report,value=report?.totals?.valueUsd;
    const {partial,note,age,details}=portfolioHeaderStatus(report,{fresh:!!saved?.fresh}),known=typeof value==='number'&&Number.isFinite(value);
    const main=known?fmtUsd(value):'$—';
    amt.textContent=main;sub.textContent=note;btn.title=main+' · '+note+(age?' · '+age:'')+(details?' · '+details:'')+' · Open Portfolio';btn.setAttribute('aria-label',btn.title);
    btn.dataset.mode='usd';btn.hidden=false;if(partial)btn.dataset.partial='1';else delete btn.dataset.partial;
  }

  async function readChain(force) {
    if (!who) return;
    const now = Date.now(); if (!force && now - last < MIN_GAP) return; last = now;
    const c = chainById(who.chainId), mine = ++seq, target = who;
    if (!c?.rpc) return;
    try {
      const r = await fetch(c.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(6000),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [target.owner, 'latest'] }) });
      const j = await r.json(); if (typeof j?.result !== 'string') return;
      const v = Number(BigInt(j.result === '0x' ? 0 : j.result)) / 1e18;
      if (mine !== seq || who !== target) return;
      put(KEY + target.owner + ':' + target.chainId, String(v)); paint();
    } catch { /* keep the last-known value */ }
  }

  // headertotal (2026-11-13): the total is the portfolio list's total (outside tokens included, qx-header-total.mjs).
  // The QHooks-only reading below stays as the fallback when that read is capped or doesn't answer.
  let fullAt = 0, fullOwner = null;
  async function readFull(owner, force) {
    if (!force && fullOwner === owner && Date.now() - fullAt < 60000) return true;
    try {
      const {headerTotal} = await import('/qx-header-total.mjs');
      const later = (v, meta = {}) => { if (who?.owner === owner && Number.isFinite(v)) { put(KEY + owner + ':usd', String(v)); put(KEY + owner + ':usd-src', meta.partial ? 'partial' : 'full'); paint(); } };
      const r = await headerTotal(owner, {onLater: later});
      if (who?.owner !== owner) return false;
      if (Number.isFinite(r.total)) {
        fullAt = Date.now(); fullOwner = owner; later(r.total, {partial: r.partial});
        // served from the server's last reading while it refreshes: one more read once that lands (no loop)
        if (r.refreshing) setTimeout(() => { if (who?.owner === owner) headerTotal(owner).then(x => { if (Number.isFinite(x.total)) later(x.total, {partial: x.partial}); }, () => {}); }, 4000);
        return true;
      }
      return false;
    } catch { return false; }
  }
  async function readTotal(force=false) {
    if(!who)return;const owner=who.owner;
    await readFull(owner,force);if(who?.owner===owner)paint();
  }

  function use(next, why) {
    const changed = !who || !next || who.owner !== next.owner || who.chainId !== next.chainId;
    who = next; paint();
    if (!who) return;
    
    const idle = globalThis.requestIdleCallback || ((f) => setTimeout(f, 1500));
    if (mode === 'usd') readTotal(why === 'trade'); else idle(() => readTotal(why === 'trade'));
  }

  // instant: the remembered wallet and chain, from the last visit
  if (who) { paint(); if (mode === 'usd') readTotal(false); }
  // the live connection: connect, chain switch, disconnect
  import('/wallet-hub.mjs').then(({ getWalletHub }) => {
    getWalletHub(window).subscribe((s) => {
      const c = s.current;
      if (c && isAddr(c.owner)) use({ owner: c.owner.toLowerCase(), chainId: String(c.chainId) }, 'hub');
      else if (!s.busy && !remembered()) use(null, 'hub');
    });
  }).catch(() => {});
  addEventListener('qhooks:wallet-disconnected', () => use(null, 'off'));
  addEventListener('qhooks:chain-switch', (e) => { if (who && e.detail?.chainId) use({ owner: who.owner, chainId: String(e.detail.chainId) }, 'chain'); });
  doc.addEventListener('qhooks:traded', () => use(who, 'trade'));
  addEventListener('qhooks:traded', () => use(who, 'trade'));
  addEventListener('qhooks:wallet-moved', () => use(who, 'trade'));
  // headertotal: on the portfolio page the header shows the list's own total, so the two never disagree
  addEventListener('qhooks:portfolio-total', (e) => { const d = e.detail || {}; if (who && d.owner === who.owner && Number.isFinite(d.valueUsd)) { put(KEY + who.owner + ':usd', String(d.valueUsd)); put(KEY + who.owner + ':usd-src', d.partial ? 'partial' : 'full'); fullAt = Date.now(); fullOwner = who.owner; paint(); } }); // walletpos: the terminal saw this wallet trade elsewhere
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') { paint(); if (who && mode === 'usd' && (fullOwner !== who.owner || Date.now() - fullAt >= 60000)) { totalStarted = ''; readTotal(false); } } }); // headertotal: on return, at most once a minute
  addEventListener('qhooks:portfolio-report',e=>{const d=e.detail||{},p=d.report;if(who&&d.family==='evm'&&d.owner===who.owner&&Number.isFinite(p?.totals?.valueUsd)){put(KEY+who.owner+':usd',String(p.totals.valueUsd));put(KEY+who.owner+':usd-src',p.partial||p.refreshing?'partial':'full');fullAt=Date.now();fullOwner=who.owner;paint();}});
  addEventListener('storage', (e) => { if (e.key === PREF) use(remembered(), 'storage'); });
  let ageTimer=setInterval(()=>{if(!doc.hidden)paint();},15000);
  addEventListener('pagehide',()=>{clearInterval(ageTimer);ageTimer=null;});
  addEventListener('pageshow',e=>{if(e.persisted&&!ageTimer){paint();ageTimer=setInterval(()=>{if(!doc.hidden)paint();},15000);}});
  return btn;
}
