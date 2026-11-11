import {HOME_CHAINS, DEFAULT_HOME, homeAssets, homePref, restoreHomePref, homeName, homeToken, loadLocalHome, saveLocalHome, homeFailure, sameWallet, homePanelLine} from './qx-home-core.mjs';
import {chainById} from './chains.mjs';
import {privyAccessToken} from './qx-privy-access-token.mjs';
import {tradeError} from './qx-chain-guard.mjs';
const storage = () => { try { return globalThis.localStorage; } catch { return null; } };
export function homeHeaders(owner, store = storage()) {
  const headers = {'x-qhooks-home-wallet': owner};
  try {
    const s = JSON.parse(store?.getItem('qhooks:board-session:v1') || 'null');
    if (sameWallet(s?.wallet, owner) && s.expiresAt > Date.now()) headers.authorization = 'Bearer ' + s.token;
    const token = privyAccessToken(store); if (token) headers['x-qhooks-privy-token'] = token;
    const init = globalThis.Telegram?.WebApp?.initData || globalThis.window?.Telegram?.WebApp?.initData || globalThis.window?.qxTelegram?.getInitData?.();
    if (init) headers['x-qhooks-tg-init'] = init;
  } catch {} return headers;
}
export async function homeConfig(fetchImpl = globalThis.fetch) {
  const r = await fetchImpl('/api/home/config', {cache: 'no-store'}); if (!r.ok) throw homeFailure('home_refreshing');
  const config = await r.json(); return {enabled: config.enabled === true};
}
export async function assertHomeOn(fetchImpl = globalThis.fetch) {
  if (!(await homeConfig(fetchImpl)).enabled) throw homeFailure('home_off');
}
export async function homeFetch(owner, url, init = {}, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl(url, {...init, headers: {'content-type': 'application/json', ...homeHeaders(owner), ...init.headers}, cache: 'no-store'});
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw homeFailure(b.error || 'home_refreshing'); } return r;
}
export async function loadHomePref(owner, {fetchImpl = globalThis.fetch, store = storage()} = {}) {
  if (!owner) return loadLocalHome(null, store);
  const b = await (await homeFetch(owner, '/api/home/pref', {}, fetchImpl)).json();
  if (!sameWallet(b.wallet, owner)) throw homeFailure('home_sign_in');
  return saveLocalHome(owner, restoreHomePref(b.pref), store);
}
export async function saveHomePref(owner, value, {fetchImpl = globalThis.fetch, store = storage()} = {}) {
  const p = homePref(value);
  if (!owner) return saveLocalHome(null, p, store);
  let headers = homeHeaders(owner, store);
  if (!headers.authorization && !headers['x-qhooks-privy-token'] && !headers['x-qhooks-tg-init']) {
    // Existing wallet sign-in; no transaction authority is created.
    await (await import('./qx-board-session.mjs')).signIn(); headers = homeHeaders(owner, store);
  }
  const b = await (await homeFetch(owner, '/api/home/pref', {method: 'POST', headers, body: JSON.stringify(p)}, fetchImpl)).json();
  if (!sameWallet(b.wallet, owner)) throw homeFailure('home_sign_in');
  saveLocalHome(owner, b.pref, store);
  globalThis.window?.dispatchEvent(new CustomEvent('qhooks:home', {detail: {owner, pref: b.pref}})); return b.pref;
}
export function instantHomeEnabled({search = globalThis.location?.search || '', store = storage()} = {}) {
  try { return new URLSearchParams(search).has('instant') || store?.getItem('qhooks:pro:instant') === '1'; } catch { return false; }
}
const pendingKey = owner => 'qhooks:home:transfer:v1:' + owner.toLowerCase();
export function rememberHomeTransfer(owner, result, store = storage()) {
  try { store?.setItem(pendingKey(owner), JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v)); } catch {}
  globalThis.window?.dispatchEvent(new CustomEvent('qhooks:home-transfer', {detail: {owner}}));
}
export function homeTransfer(owner, store = storage()) { try { return JSON.parse(store?.getItem(pendingKey(owner)) || 'null'); } catch { return null; } }
export async function refreshHomeTransfer(owner, {fetchImpl = globalThis.fetch, store = storage()} = {}) {
  if (!owner) return null;
  const result = homeTransfer(owner, store); if (!result?.requestId || ['success', 'refunded'].includes(result.status) || result.landed) return result;
  const {status} = await import('./qx-relay.mjs');
  const state = await status(result.requestId, {fetchImpl});
  let next = {...result, status: state.status};
  if (state.status === 'success' && result.needsSwap) {
    try {
      const {readAssetBalance} = await import('./qx-xchain.mjs');
      const {formatAmount} = await import('./qx-move-funds.mjs');
      const amount = await readAssetBalance(owner, {chainId: result.chainId, asset: result.asset});
      if (amount > 0n) next = {...next, landed: true, completed: false, amountText: formatAmount(amount, result.asset.decimals), symbol: result.asset.symbol, address: result.asset.address};
      else next.status = 'pending';
    } catch {next.status = 'pending';}
  } if (next.status !== result.status) rememberHomeTransfer(owner, next, store); return next;
}
// Scoped to one user press, checked by the chain guard before every signature/send.
const activeRailChecks = new Set(); let previousRailCheck;
export async function withHomeRails(owner, run, {fetchImpl = globalThis.fetch, currentOwner = () => owner} = {}) {
  const check = async () => { if (!sameWallet(currentOwner(), owner)) throw homeFailure('home_sign_in'); await assertHomeOn(fetchImpl); };
  await check();
  if (!activeRailChecks.size) previousRailCheck = globalThis.__qhooksHomeCheck;
  activeRailChecks.add(check);
  globalThis.__qhooksHomeCheck = async () => {await previousRailCheck?.(); for (const active of activeRailChecks) await active();};
  try { return await run(); } finally {activeRailChecks.delete(check); if (!activeRailChecks.size) {globalThis.__qhooksHomeCheck = previousRailCheck; previousRailCheck = undefined;}}

}
export function homePicker({document: doc = globalThis.document, getOwner = () => null, getUsd = () => null, fetchImpl = globalThis.fetch, store = storage()} = {}) {
  const el = (tag, text) => { const n = doc.createElement(tag); if (text) n.textContent = text; return n; };
  const root = el('section'); root.className = 'qhome'; root.setAttribute('aria-label', 'Home currency');
  const line = el('b'), chain = el('select'), asset = el('select'), toggle = el('input'), note = el('p'), recovery = el('p');
  chain.setAttribute('aria-label', 'Home chain'); asset.setAttribute('aria-label', 'Home asset'); toggle.type = 'checkbox'; toggle.setAttribute('aria-label', 'Sells go home');
  for (const id of HOME_CHAINS) { const o = el('option', chainById(id).name + ' · ' + homeAssets(id).map(t => t.symbol).join(' / ')); o.value = String(id); chain.append(o); }
  function fillAssets(selected) {
    const options = homeAssets(chain.value).map(token => {const o = el('option', token.symbol); o.value = token.symbol; return o;});
    asset.replaceChildren(...options);
    asset.value = options.some(o => o.value === selected) ? selected : options[0]?.value || '';
  }
  const choices = el('div'); choices.className = 'qhome-pickers'; choices.append(chain, asset);
  const hint = el('div'); hint.className = 'qhome-ethereum-hint'; hint.hidden = true;
  const useBase = el('button', 'Use Base'); useBase.type = 'button';
  hint.append(el('p', 'Ethereum home pays L1 gas on every cross-chain buy. Base is cheaper.'), useBase);
  const label = el('label'); label.append(toggle, doc.createTextNode(' Sells go home'));
  note.setAttribute('role', 'status'); root.append(line, choices, hint, label, note, recovery);
  let owner = null, pref = {...DEFAULT_HOME}, revision = 0, busy = false, pollTimer;
  function paint() {
    const usd = getUsd(pref), money = Number.isFinite(usd) ? '$' + usd.toFixed(2) : 'Refreshing';
    line.textContent = 'Home: ' + homeName(pref) + ' · ' + money;
    chain.value = String(pref.chainId); fillAssets(pref.asset); toggle.checked = pref.sellsGoHome;
    hint.hidden = pref.chainId !== 1;
    const result = owner && homeTransfer(owner, store); recovery.replaceChildren();
    if (result) {
      recovery.append(doc.createTextNode(homePanelLine(result)));
      if (result.landed && !result.completed) {
        const move = el('button', 'Move home'); move.type = 'button';
        move.addEventListener('click', async () => { try { const {openMoveFunds} = await import('./qx-move-funds.mjs'); const home = homeToken(pref); await openMoveFunds({homeCurrency: true, from: {chainId: result.chainId, token: result.address}, to: {chainId: pref.chainId, token: home.address}, amount: result.amountText}); } catch (e) { note.textContent = tradeError(e); } });
        recovery.append(move);
      }
    }
  }
  async function refresh() {
    if (busy) return;
    clearTimeout(pollTimer);
    const mine = ++revision; owner = getOwner(); pref = loadLocalHome(owner, store); paint();
    try {
      const config = await homeConfig(fetchImpl); if (mine !== revision) return; root.hidden = !config.enabled; if (!config.enabled) return;
      const loaded = await loadHomePref(owner, {fetchImpl, store}); if (mine !== revision) return;
      pref = loaded; note.textContent = ''; await refreshHomeTransfer(owner, {fetchImpl, store}).catch(() => {}); if (mine === revision) {paint(); const transfer = owner && homeTransfer(owner, store); if (transfer?.requestId && !transfer.landed && !['success', 'refunded', 'failure', 'fallback'].includes(transfer.status) && root.isConnected && doc.visibilityState !== 'hidden' && (!root.closest('dialog') || root.closest('dialog').open)) pollTimer = setTimeout(refresh, 2000);}
    } catch (e) { if (mine === revision) note.textContent = tradeError(e); }
  }
  async function change() {
    if (busy) return; busy = true; revision++; const who = getOwner();
    for (const n of [chain, asset, toggle, useBase]) n.disabled = true;
    try { const saved = await saveHomePref(who, {chainId: Number(chain.value), asset: asset.value, sellsGoHome: toggle.checked}, {fetchImpl, store}); if (sameWallet(who, getOwner()) || !who && !getOwner()) { pref = saved; note.textContent = 'Home saved.'; } }
    catch (e) { note.textContent = tradeError(e); }
    finally { busy = false; for (const n of [chain, asset, toggle, useBase]) n.disabled = false; if (who !== getOwner()) void refresh(); else paint(); }
  }
  chain.addEventListener('change', () => {fillAssets(asset.value); return change();});
  for (const n of [asset, toggle]) n.addEventListener('change', change);
  useBase.addEventListener('click', () => {if (busy) return; chain.value = '8453'; fillAssets('ETH'); return change();});
  return {element: root, refresh, repaint: paint};
}
