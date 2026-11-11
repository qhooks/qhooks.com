import { tradeError } from './qx-chain-guard.mjs';
// One-click trading, client side (Randall 2026-11-10: "Need auto signing site wide and tg").
// One toggle in the trade ticket. Turning it on is one Privy "add signer" confirm (plus a one-time sign-in signature on
// the web if the wallet has no QHooks session yet). After that, ticket trades on QHooks markets go through
// /api/oneclick/trade with no wallet popup. Off, external wallets (MetaMask etc.), or other tokens: the wallet signs as before.
import { getWalletHub } from '/wallet-hub.mjs';
import { authHeaders, boardSession, signIn } from '/qx-board-session.mjs';

export const DISCLOSURE = 'QHooks can place trades from your wallet up to your limits. Turn off any time.';
const tg = () => { const t = globalThis.qxTelegram; return t?.inTelegram && t.getInitData?.() ? t.getInitData() : null; };
const owner = () => { try { return String(getWalletHub().snapshot().current?.owner || '').toLowerCase() || null; } catch { return null; } };
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
  try { value = await api('/api/oneclick', { wallet }); }
  catch (e) { value = { available: e.status !== 404, on: false, needsSignIn: e.code === 'sign_in', needsLink: e.code === 'link_wallet' }; }
  value.embedded = !!controlsFor(wallet);
  cache = { wallet, at: Date.now(), value }; return value;
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
  try { await controls.addSigner(status.policyId, status.signerId); }
  catch (e) { throw Error(e?.code === 4001 || /reject|cancel/i.test(e?.message || '') ? 'Cancelled. Nothing changed.' : 'Could not turn on one-click. Try again.'); }
  status = await api('/api/oneclick', { method: 'POST', wallet, body: { action: 'on', walletId: controls.wallet.id, ...limits } });
  cache = { wallet, at: Date.now(), value: { ...status, embedded: true } }; return status;
}
export async function disableOneClick() {
  const wallet = owner(); if (!wallet) return;
  const status = await api('/api/oneclick', { method: 'POST', wallet, body: { action: 'off' } });
  try { await controlsFor(wallet)?.removeSigner?.(); } catch {}
  cache = { wallet, at: Date.now(), value: { ...status, embedded: !!controlsFor(wallet) } }; return status;
}
export async function setOneClickLimits(perTradeUsd, dailyUsd) {
  const v = x => x === '' || x == null ? null : Number(x);
  const wallet = owner(); const status = await api('/api/oneclick', { method: 'POST', wallet, body: { action: 'limits', perTradeUsd: v(perTradeUsd), dailyUsd: v(dailyUsd) } });
  cache = { wallet, at: Date.now(), value: { ...status, embedded: !!controlsFor(wallet) } }; return status;
}
const MESSAGES = {
  over_trade_limit: 'Over your one-click limit per trade. Lower the amount or raise your limit.',
  over_daily_limit: 'Over your one-click limit for today.', over_limit: 'Over the one-click limit for this chain.',
  paused: 'One-click is paused. Your wallet will ask to confirm.', not_permitted: 'Turn one-click on again: the wallet permission is missing.',
  insufficient_balance: 'Not enough balance.', refreshing: 'Refreshing prices. Try again in a moment.',
  sell_check_failed: 'This token failed the sell check, so one-click won’t buy it.', no_route: 'No route for this trade right now.'
};
/// Sends one trade with no popup. Returns {hashes, explorer} or null when the wallet should sign instead (use_wallet / off).
export async function oneClickTrade({ chainId, token, side, amountWei, pct, slippageBps, referrer }) {
  const wallet = owner(), key = 'oc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  try {
    return await api('/api/oneclick/trade', { method: 'POST', wallet, body: { chainId: String(chainId), token, side, amountWei: amountWei != null ? String(amountWei) : undefined, pct, slippageBps, referrer, idempotencyKey: key } });
  } catch (e) {
    if (['use_wallet', 'off', 'sign_in', 'link_wallet', 'paused'].includes(e.code)) { cache.at = 0; return null; }
    throw Error(MESSAGES[e.code] || 'One-click trade failed. Nothing was spent if no transaction is shown.');
  }
}
/// The ticket toggle: one switch, one line of disclosure, limits folded underneath.
export function mountOneClickToggle(host, { doc = document } = {}) {
  if (!host || host.querySelector('.qx-oneclick')) return () => {};
  const el = (t, a = {}, ...kids) => { const n = doc.createElement(t); for (const [k, v] of Object.entries(a)) k === 'class' ? n.className = v : n.setAttribute(k, v); n.append(...kids); return n; };
  const box = el('div', { class: 'qx-oneclick', style: 'display:grid;gap:6px;margin-top:10px;font-size:13px' });
  const input = el('input', { type: 'checkbox', role: 'switch', style: 'width:20px;height:20px' });
  const label = el('label', { style: 'display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer' }, input, el('b', {}, 'One-click trading'));
  const line = el('span', { style: 'opacity:.75' }, DISCLOSURE), status = el('span', { role: 'status', 'aria-live': 'polite' });
  const per = el('input', { type: 'number', min: '1', step: '1', inputmode: 'decimal', placeholder: 'No limit', 'aria-label': 'Per trade, USD', style: 'width:6.5em;min-height:36px' });
  const day = el('input', { type: 'number', min: '1', step: '1', inputmode: 'decimal', placeholder: 'No limit', 'aria-label': 'Per day, USD', style: 'width:6.5em;min-height:36px' });
  const save = el('button', { type: 'button', class: 'qxt-mini', style: 'min-height:36px' }, 'Save');
  const limits = el('details', {}, el('summary', { style: 'cursor:pointer;min-height:32px' }, 'Limits'), el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-top:6px' }, 'Per trade $', per, 'Per day $', day, save));
  box.append(label, line, limits, status); box.hidden = true; host.append(box);
  let stopped = false, busy = false;
  const render = async (fresh = false) => {
    const s = await oneClickStatus({ fresh }); if (stopped) return;
    box.hidden = !s.available || !s.embedded; input.checked = !!s.on; limits.hidden = !s.on;
    if (s.on) { per.value = s.perTradeUsd == null ? '' : String(s.perTradeUsd); day.value = s.dailyUsd == null ? '' : String(s.dailyUsd); status.textContent = s.perTradeUsd == null && s.dailyUsd == null ? '' : [s.perTradeUsd == null ? null : '$' + s.perTradeUsd + ' per trade', s.dailyUsd == null ? null : '$' + s.dailyUsd + ' per day'].filter(Boolean).join(' · '); }
    else status.textContent = '';
  };
  input.addEventListener('change', async () => {
    if (busy) return; busy = true; input.disabled = true; const want = input.checked;
    status.textContent = want ? 'Confirm in your wallet…' : 'Turning off…';
    try { want ? await enableOneClick() : await disableOneClick(); await render(true); }
    catch (e) { input.checked = !want; status.textContent = tradeError(e); }
    finally { busy = false; input.disabled = false; }
  });
  save.addEventListener('click', async () => { try { await setOneClickLimits(per.value, day.value); await render(true); } catch (e) { status.textContent = e.code === 'invalid_limits' ? 'Use whole dollars, and a day at least as large as one trade.' : 'Could not save limits.'; } });
  let unsub = () => {};
  try { unsub = getWalletHub().subscribe(() => render(true)); } catch {}
  const onReady = () => render(true); globalThis.addEventListener?.('qhooks:privy-signer-ready', onReady);
  render(true);
  return () => { stopped = true; unsub(); globalThis.removeEventListener?.('qhooks:privy-signer-ready', onReady); box.remove(); };
}
