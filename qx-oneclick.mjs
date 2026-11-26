import { tradeError } from './qx-chain-guard.mjs';
// One-click trading, client side (Randall 2026-11-10: "Need auto signing site wide and tg").
// One toggle in the trade ticket. Turning it on is one Privy "add signer" confirm (plus a one-time sign-in signature on
// the web if the wallet has no QHooks session yet). After that, ticket trades on QHooks markets go through
// /api/oneclick/trade with no wallet popup. Off, external wallets (MetaMask etc.), or other tokens: the wallet signs as before.
import { getWalletHub } from '/wallet-hub.mjs';
import { authHeaders, boardSession, signIn } from '/qx-board-session.mjs';

export const DISCLOSURE = 'QHooks can place trades from your wallet up to your limits. Turn off any time.';
const tg = () => { const t = globalThis.qxTelegram; return t?.inTelegram && t.getInitData?.() ? t.getInitData() : null; };
// The hub is per window: getWalletHub() with no target threw (WeakMap key), so owner() was always null and the toggle
// never showed (2026-11-26).
const hub = () => getWalletHub(globalThis.window || globalThis);
const owner = () => { try { return String(hub().snapshot().current?.owner || '').toLowerCase() || null; } catch { return null; } };
const controlsFor = wallet => {
  const c = globalThis.qhooksPrivySignerControls, w = c?.wallet;
  return w?.walletClientType === 'privy' && String(w.address || '').toLowerCase() === wallet && typeof w.id === 'string' && typeof c.addSigner === 'function' ? c : null;
};
// The wallet's QHooks session when it has one (web and Mini App alike); otherwise, inside Telegram, the Telegram
// identity plus a wallet linked to it.
async function api(path, { method = 'GET', body, wallet } = {}) {
  const session = boardSession(), init = session ? null : tg(), q = method === 'GET' && wallet ? '?wallet=' + wallet : '';
  const auth = session ? authHeaders() : init ? { authorization: 'tma ' + init } : {};
  const r = await fetch(path + q, { method, cache: 'no-store', headers: { ...auth, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify({ ...body, ...(init ? { initData: init, wallet } : {}) }) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = Error(data.error || 'failed'); e.code = data.error || 'failed'; e.status = r.status; throw e; }
  return data;
}
let cache = { wallet: null, at: 0, value: null };
/// Status for the connected wallet: {available, on, perTradeUsd, dailyUsd, usedTodayUsd, ...} or {available:false}.
export async function oneClickStatus({ fresh = false } = {}) {
  const wallet = owner(); if (!wallet) return { available: false, on: false };
  if (!fresh && cache.wallet === wallet && Date.now() - cache.at < 30000) return cache.value;
  let value;
  // No QHooks session on the web: the server would only answer 401 sign_in, so skip the request (state "check").
  if (!boardSession() && !tg()) value = { available: true, on: false, needsSignIn: true };
  else try { value = await api('/api/oneclick', { wallet }); }
  catch (e) { value = { available: e.status !== 404, on: false, needsSignIn: e.code === 'sign_in', needsLink: e.code === 'link_wallet', why: e.code === 'sign_in' || e.code === 'link_wallet' ? '' : e.code || 'refreshing' }; }
  value.embedded = !!controlsFor(wallet);
  cache = { wallet, at: Date.now(), value }; return value;
}
/// One shared reading of the status for every place that shows it (same states as the /new app):
/// on | off | check (no QHooks session, so the server cannot be asked: never shown as Off) | retry (no answer) | na.
export function oneClickState(s) {
  if (!s || !s.available) return 'na';
  if (s.on) return 'on';
  if (s.needsSignIn || s.needsLink) return 'check';
  return s.why ? 'retry' : 'off';
}
const emit = () => { try { globalThis.dispatchEvent?.(new Event('qh-oneclick')); } catch {} };
/// "Sign in to check": one free sign-in signature, then read the real setting.
export async function checkOneClick() {
  if (!owner()) throw Error('Connect your wallet first.');
  if (!boardSession()) await signIn();
  cache.at = 0; const s = await oneClickStatus({ fresh: true }); emit(); return s;
}
export const oneClickOn = async () => { const s = await oneClickStatus(); return !!(s.on && !s.paused && s.embedded); };
/// One tap: sign in once on the web if needed, approve Privy's signer dialog, store the grant.
export async function enableOneClick(limits = {}) {
  const wallet = owner(); if (!wallet) throw Error('Connect your wallet first.');
  const controls = controlsFor(wallet); if (!controls) throw Error('One-click works with your email or Google wallet.');
  if (!boardSession()) {
    let linked = false;
    if (tg()) linked = await api('/api/oneclick', { wallet }).then(() => true, () => false);
    if (!linked) await signIn(); // one signature, once: proves this wallet to QHooks
  }
  let status = await api('/api/oneclick', { wallet });
  if (!status.available) throw Error('One-click trading is not available right now.');
  // Already on (set up on another device, or the session had expired): keep the saved setup and its limits.
  if (status.on) {
    if (limits.perTradeUsd != null || limits.dailyUsd != null) return setOneClickLimits(limits.perTradeUsd, limits.dailyUsd);
    cache = { wallet, at: Date.now(), value: { ...status, embedded: true } }; emit(); return status;
  }
  try { await controls.addSigner(status.policyId, status.signerId); }
  catch (e) { throw Error(e?.code === 4001 || /reject|cancel/i.test(e?.message || '') ? 'Cancelled. Nothing changed.' : 'Could not turn on one-click. Try again.'); }
  status = await api('/api/oneclick', { method: 'POST', wallet, body: { action: 'on', walletId: controls.wallet.id, ...limits } });
  cache = { wallet, at: Date.now(), value: { ...status, embedded: true } }; emit(); return status;
}
export async function disableOneClick() {
  const wallet = owner(); if (!wallet) return;
  const status = await api('/api/oneclick', { method: 'POST', wallet, body: { action: 'off' } });
  try { await controlsFor(wallet)?.removeSigner?.(); } catch {}
  cache = { wallet, at: Date.now(), value: { ...status, embedded: !!controlsFor(wallet) } }; emit(); return status;
}
export async function setOneClickLimits(perTradeUsd, dailyUsd) {
  const v = x => x === '' || x == null ? null : Number(x);
  const wallet = owner(); const status = await api('/api/oneclick', { method: 'POST', wallet, body: { action: 'limits', perTradeUsd: v(perTradeUsd), dailyUsd: v(dailyUsd) } });
  cache = { wallet, at: Date.now(), value: { ...status, embedded: !!controlsFor(wallet) } }; emit(); return status;
}
const MESSAGES = {
  over_trade_limit: 'Over your one-click limit per trade. Lower the amount or raise your limit.',
  over_daily_limit: 'Over your one-click limit for today.', over_limit: 'Over the one-click limit for this chain.',
  paused: 'One-click is paused. Your wallet will ask to confirm.', not_permitted: 'Turn one-click on again: the wallet permission is missing.',
  insufficient_balance: 'Not enough balance.', refreshing: 'Refreshing prices. Try again in a moment.',
  sell_check_failed: 'This token failed the sell check, so one-click won’t buy it.', no_route: 'No route for this trade right now.'
};
/// Over the saved limits for a trade worth `usd` (null when the value or the limits are unknown: the server checks).
export function overOneClickLimit(s, usd) {
  if (!s || !(usd > 0)) return null;
  if (s.perTradeUsd != null && usd > s.perTradeUsd) return 'over_trade_limit';
  if (s.dailyUsd != null && (Number(s.usedTodayUsd) || 0) + usd > s.dailyUsd) return 'over_daily_limit';
  return null;
}
const OVER = ['over_trade_limit', 'over_daily_limit', 'over_limit'];
/// Sends one trade with no popup. Returns {hashes, explorer} or null when the wallet should sign instead (use_wallet / off /
/// paused, or over a one-click limit: the trade is not refused, the wallet asks to confirm it as usual; onFallback(text) says why).
export async function oneClickTrade({ chainId, token, side, amountWei, pct, slippageBps, referrer, quoteToken, usd = null, onFallback = null }) {
  if(quoteToken!=null&&!/^0x[0-9a-f]{40}$/i.test(quoteToken))throw Error('Choose a receive token.');
  const wallet = owner(), say = t => { try { onFallback?.(t); } catch {} };
  const over = cache.wallet === wallet ? overOneClickLimit(cache.value, usd) : null;
  if (over) { say(MESSAGES[over].split('.')[0] + '. Confirm in your wallet.'); return null; }
  const key = 'oc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  try {
    return await api('/api/oneclick/trade', { method: 'POST', wallet, body: { chainId: String(chainId), token, side, amountWei: amountWei != null ? String(amountWei) : undefined, pct, slippageBps, referrer, ...(quoteToken?{quoteToken}:{}), idempotencyKey: key } });
  } catch (e) {
    if (['use_wallet', 'off', 'sign_in', 'link_wallet', 'paused'].includes(e.code)) { cache.at = 0; return null; }
    if (OVER.includes(e.code)) { cache.at = 0; say(MESSAGES[e.code].split('.')[0] + '. Confirm in your wallet.'); return null; }
    throw Error(MESSAGES[e.code] || 'One-click trade failed. Nothing was spent if no transaction is shown.');
  }
}
/// The ticket toggle: one switch, one line of disclosure, limits folded underneath.
/// On: switch on + "On" in green + limits + Modify (the limits fold). No session: "—" + Sign in to check (never Off).
/// No answer: "—" + Check again. Re-reads on wallet switch, Privy ready and "qh-oneclick" (any one-click change on the page).
export function mountOneClickToggle(host, { doc = document, before = null } = {}) {
  if (!host || host.querySelector('.qx-oneclick')) return () => {};
  const el = (t, a = {}, ...kids) => { const n = doc.createElement(t); for (const [k, v] of Object.entries(a)) k === 'class' ? n.className = v : n.setAttribute(k, v); n.append(...kids); return n; };
  const box = el('div', { class: 'qx-oneclick', style: 'display:grid;gap:6px;margin-top:10px;font-size:13px' });
  const input = el('input', { type: 'checkbox', role: 'switch', style: 'width:20px;height:20px' });
  const badge = el('b', { class: 'qx-oneclick-state', style: 'font-weight:600' });
  const label = el('label', { style: 'display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;min-width:0' }, input, el('b', {}, 'One-click trading'), badge);
  const act = el('button', { type: 'button', class: 'qxt-mini qx-oneclick-check', style: 'min-height:36px;white-space:nowrap' }); act.hidden = true;
  const head = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap' }, label, act);
  const line = el('p', { class:'qx-oneclick-disclosure', style:'margin:0;opacity:.75;line-height:1.4;overflow-wrap:anywhere' }, DISCLOSURE), status = el('span', { role: 'status', 'aria-live': 'polite' });
  const per = el('input', { type: 'number', min: '1', step: '1', inputmode: 'decimal', placeholder: 'No limit', 'aria-label': 'Per trade, USD', style: 'width:6.5em;min-height:36px' });
  const day = el('input', { type: 'number', min: '1', step: '1', inputmode: 'decimal', placeholder: 'No limit', 'aria-label': 'Per day, USD', style: 'width:6.5em;min-height:36px' });
  const save = el('button', { type: 'button', class: 'qxt-mini', style: 'min-height:36px' }, 'Save');
  const limits = el('details', {}, el('summary', { style: 'cursor:pointer;min-height:32px' }, 'Modify'), el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-top:6px' }, 'Per trade $', per, 'Per day $', day, save));
  box.append(head, line, status, limits); box.hidden = true;if(before?.parentNode===host)host.insertBefore(box,before);else host.append(box);
  let stopped = false, busy = false, seq = 0;
  const render = async (fresh = false) => {
    const n = ++seq, s = await oneClickStatus({ fresh }); if (stopped || n !== seq) return;
    const state = oneClickState(s), on = state === 'on', unknown = state === 'check' || state === 'retry';
    box.hidden = !s.available || !s.embedded; box.dataset.state = state;
    input.checked = on; input.indeterminate = unknown; input.disabled = unknown || busy;
    badge.textContent = on ? 'On' : unknown ? '—' : 'Off'; badge.style.color = on ? 'var(--up,#4cc38a)' : '';
    act.hidden = !unknown; act.textContent = state === 'check' ? 'Sign in to check' : 'Check again';
    act.title = state === 'check' ? 'One free signature. No transaction.' : '';
    line.hidden = on; limits.hidden = !on; if (!on) limits.open = false;
    if (on) { per.value = s.perTradeUsd == null ? '' : String(s.perTradeUsd); day.value = s.dailyUsd == null ? '' : String(s.dailyUsd); status.textContent = s.perTradeUsd == null && s.dailyUsd == null ? 'No limits' : [s.perTradeUsd == null ? null : '$' + s.perTradeUsd + ' per trade', s.dailyUsd == null ? null : '$' + s.dailyUsd + ' per day'].filter(Boolean).join(' · '); }
    else status.textContent = '';
  };
  input.addEventListener('change', async () => {
    if (busy) return; busy = true; input.disabled = true; const want = input.checked;
    status.textContent = want ? 'Confirm in your wallet…' : 'Turning off…';
    try { want ? await enableOneClick() : await disableOneClick(); busy = false; await render(true); }
    catch (e) { input.checked = !want; status.textContent = tradeError(e); }
    finally { busy = false; input.disabled = box.dataset.state === 'check' || box.dataset.state === 'retry'; }
  });
  act.addEventListener('click', async () => {
    if (busy) return; busy = true; act.disabled = true;
    try { box.dataset.state === 'check' ? await checkOneClick() : null; busy = false; await render(true); }
    catch (e) { status.textContent = /reject|cancel|denied/i.test(e?.message || '') || e?.code === 4001 ? 'Cancelled. Nothing changed.' : tradeError(e); }
    finally { busy = false; act.disabled = false; }
  });
  save.addEventListener('click', async () => { try { await setOneClickLimits(per.value, day.value); await render(true); } catch (e) { status.textContent = e.code === 'invalid_limits' ? 'Use whole dollars, and a day at least as large as one trade.' : 'Could not save limits.'; } });
  let unsub = () => {};
  try { unsub = hub().subscribe(() => render(true)); } catch {}
  const onReady = () => render(true), onChange = () => render(false);
  globalThis.addEventListener?.('qhooks:privy-signer-ready', onReady); globalThis.addEventListener?.('qh-oneclick', onChange);
  render(true);
  return () => { stopped = true; unsub(); globalThis.removeEventListener?.('qhooks:privy-signer-ready', onReady); globalThis.removeEventListener?.('qh-oneclick', onChange); box.remove(); };
}
