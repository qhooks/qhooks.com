// Quick-launch pool fees (2026-11-28): find a token's QHooks quick launch on chain, read what collect() would pay
// right now (simulated, nothing sent), and build the one collect(key) transaction. collect is open to anyone and
// always pays the launch's payout address, so the panel is shown only to the creator or the payout wallet.
// No index or listing is needed: the pool comes from the terminal's token answer when it has one, otherwise from the
// chain's quote with the factory's fixed fee/tick spacing, and every candidate is checked with launchOf on chain.
import {chainMap} from '/chains.mjs';
import {keccak_256} from '/full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

export const SEL = Object.freeze({collect: '0x839197e3', launchOf: '0xd4bf17c5', decimals: '0x313ce567', symbol: '0x95d89b41'});
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const FEES_COLLECTED = '0x4a93be8d0a356d70b54fdf016f78a2ed8b8a3c420952848eb4f4b2c4546405b6';
const ADDR = /^0x[0-9a-f]{40}$/i;
const lc = a => String(a || '').toLowerCase();
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const w = v => BigInt(v).toString(16).padStart(64, '0');
const aw = a => lc(a).slice(2).padStart(64, '0');
export const FACTORIES = chainMap(c => [c.simpleLaunch, c.simpleLaunchNext?.address, c.simpleLaunchClean?.address, c.simpleLaunchPairs?.address, c.simpleLaunchMulti?.address].filter(a => ADDR.test(a || '')).map(lc));
const QUOTES = chainMap(c => [c.quote?.address, ...(c.simpleLaunchMulti?.quotes || []).map(q => q[2]), ...(c.simpleLaunchPairs?.quotes || []).map(q => q[2])].filter(a => ADDR.test(a || '')).map(lc));
const RPC = chainMap(c => c.rpc);
export const supported = chainId => (FACTORIES[String(chainId)] || []).length > 0;

export function sortKey(token, quote, fee, tickSpacing, hooks) {
  const [currency0, currency1] = BigInt(lc(token)) < BigInt(lc(quote)) ? [lc(token), lc(quote)] : [lc(quote), lc(token)];
  return {currency0, currency1, fee: Number(fee), tickSpacing: Number(tickSpacing), hooks: lc(hooks)};
}
const keyWords = k => aw(k.currency0) + aw(k.currency1) + w(k.fee) + w(BigInt.asUintN(256, BigInt(k.tickSpacing))) + aw(k.hooks);
export const poolIdOf = k => '0x' + hex(keccak_256(Uint8Array.from(keyWords(k).match(/../g), b => parseInt(b, 16))));
export const collectData = k => SEL.collect + keyWords(k);
export const collectTx = launch => ({to: launch.key.hooks, data: collectData(launch.key), value: '0x0'});

// The public Robinhood RPC sometimes answers with a doubled CORS header, which the browser rejects as a network error:
// retry once, then the second public endpoint the site CSP already allows.
const EXTRA_RPC = Object.freeze({'4663': ['https://robinhood.rpc.pinax.network']});
export function makeRpc(chainId, fetchImpl = (...a) => fetch(...a)) {
  const urls = [RPC[String(chainId)], RPC[String(chainId)], ...(EXTRA_RPC[String(chainId)] || [])].filter(Boolean);
  return async (method, params) => {
    if (!urls.length) throw Error('Chain not supported');
    let last = null;
    for (const url of urls) {
      let r;
      try { r = await fetchImpl(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})}); }
      catch (e) { last = e; continue; }
      if (!r.ok) { last = Error('RPC read returned HTTP ' + r.status); continue; }
      const j = await r.json(); if (j.error) throw Object.assign(Error(j.error.message || 'RPC error'), {rpc: j.error}); return j.result;
    }
    throw last || Error('RPC unavailable');
  };
}
const words = h => (/^0x(?:[0-9a-f]{64})+$/i.test(h || '') ? h.slice(2).match(/.{64}/g).map(x => BigInt('0x' + x)) : []);
const asAddr = n => '0x' + n.toString(16).padStart(40, '0');

/// Reads launchOf(poolId) and accepts it only when it names this token.
async function readLaunch(rpc, chainId, token, factory, quote, fee, tickSpacing) {
  const key = sortKey(token, quote, fee, tickSpacing, factory), poolId = poolIdOf(key);
  let p; try { p = words(await rpc('eth_call', [{to: factory, data: SEL.launchOf + poolId.slice(2)}, 'latest'])); } catch { return null; }
  if (p.length < 9 || lc(asAddr(p[0])) !== lc(token)) return null;
  if (Number(p[3]) !== Number(fee)) return null;
  return {chainId: String(chainId), token: lc(token), quote: lc(quote), poolId, key, fee: Number(fee), creator: asAddr(p[7]), payout: asAddr(p[8])};
}

/// Finds the token's quick launch. `pools` is the terminal token answer's pools list when the page has it.
export async function findLaunch(chainId, token, {rpc = makeRpc(chainId), pools = null, fetchJson = null} = {}) {
  chainId = String(chainId); token = lc(token);
  if (!supported(chainId) || !ADDR.test(token)) return null;
  const facs = FACTORIES[chainId];
  if (!pools && fetchJson) { try { pools = (await fetchJson('/api/terminal/x/token/' + chainId + '/' + token))?.pools || null; } catch { pools = null; } }
  const cands = [];
  for (const p of pools || []) {
    const hooks = lc(p.hooks), id = lc(p.address || p.poolId || p.id);
    if (!facs.includes(hooks) || !ADDR.test(p.quoteAddress || '')) continue;
    cands.push({factory: hooks, quote: lc(p.quoteAddress), id});
  }
  if (!cands.length) for (const f of facs) for (const q of QUOTES[chainId] || []) cands.push({factory: f, quote: q, id: null});
  for (const c of cands) {
    // Quick launches open their pool at a 1% fee, tick spacing 200 (server/simple-launch.mjs poolKeyOf).
    const hit = await readLaunch(rpc, chainId, token, c.factory, c.quote, 10000, 200);
    if (hit && (!c.id || c.id === hit.poolId)) return hit;
  }
  return null;
}

async function tokenInfo(rpc, a) {
  const [d, s] = await Promise.all([rpc('eth_call', [{to: a, data: SEL.decimals}, 'latest']).catch(() => null), rpc('eth_call', [{to: a, data: SEL.symbol}, 'latest']).catch(() => null)]);
  let symbol = '';
  try { const b = (s || '0x').slice(2); if (b.length >= 192) { const n = parseInt(b.slice(64, 128), 16); symbol = new TextDecoder().decode(Uint8Array.from(b.slice(128, 128 + n * 2).match(/../g) || [], x => parseInt(x, 16))); } else if (b.length === 64) symbol = new TextDecoder().decode(Uint8Array.from(b.match(/../g), x => parseInt(x, 16))).replace(/\0+$/, ''); } catch {}
  const dec = words(d)[0];
  return {address: lc(a), decimals: dec != null && dec <= 36n ? Number(dec) : 18, symbol: symbol || 'token'};
}

/// What collect() would pay the payout now. Simulated with eth_simulateV1; amounts are the token transfers into the
/// payout (FeesCollected's amounts when the quote is native ETH). `amounts: null` = the RPC cannot simulate.
export async function pending(launch, {rpc = makeRpc(launch.chainId)} = {}) {
  const [i0, i1] = await Promise.all([tokenInfo(rpc, launch.key.currency0), tokenInfo(rpc, launch.key.currency1)]);
  const tx = collectTx(launch), base = {currency0: i0, currency1: i1};
  let sim;
  try { sim = await rpc('eth_simulateV1', [{blockStateCalls: [{calls: [{from: launch.payout, to: tx.to, data: tx.data}]}]}, 'latest']); }
  catch (e) {
    try { await rpc('eth_call', [{from: launch.payout, to: tx.to, data: tx.data}, 'latest']); return {...base, ok: true, amounts: null}; }
    catch (e2) { return {...base, ok: false, amounts: null, error: e2.message}; }
  }
  const call = sim?.[0]?.calls?.[0];
  if (!call || call.status !== '0x1') return {...base, ok: false, amounts: null, error: call?.error?.message || 'Collect would not go through right now'};
  const to = '0x' + aw(launch.payout), amounts = [0n, 0n];
  let fromTransfers = false;
  for (const l of call.logs || []) {
    if (l.topics?.[0] !== TRANSFER || lc(l.topics[2]) !== to) continue;
    const at = [lc(launch.key.currency0), lc(launch.key.currency1)].indexOf(lc(l.address));
    if (at >= 0) { amounts[at] += BigInt(l.data); fromTransfers = true; }
  }
  if (!fromTransfers) { const fc = (call.logs || []).find(l => l.topics?.[0] === FEES_COLLECTED && lc(l.address) === lc(launch.key.hooks)); const v = words(fc?.data); if (v.length >= 2) { amounts[0] = v[0]; amounts[1] = v[1]; } }
  return {...base, ok: true, amounts};
}

export function fmt(n, decimals) {
  n = BigInt(n); if (n === 0n) return '0';
  const s = n.toString().padStart(decimals + 1, '0'), whole = s.slice(0, -decimals) || '0', frac = s.slice(-decimals).replace(/0+$/, '');
  const v = Number(whole + (frac ? '.' + frac.slice(0, 18) : ''));
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'; if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (v >= 1e4) return Math.round(v).toLocaleString('en-US');
  return v >= 1 ? v.toLocaleString('en-US', {maximumFractionDigits: 4}) : Number(v.toPrecision(3)).toString();
}
export const short = a => a.slice(0, 6) + '…' + a.slice(-4);
/// The connected wallet may collect when it is the creator or the payout.
export const canCollect = (launch, me) => !!(launch && me && (lc(me) === lc(launch.creator) || lc(me) === lc(launch.payout)));

/// Renders the panel into `el`. io: {address(), send(tx, onStatus) -> Promise, onChange(cb)}.
export function mountCollect(el, launch, io) {
  if (!el || !launch) return;
  if (!document.getElementById('qsc-style')) { const st = document.createElement('style'); st.id = 'qsc-style'; st.textContent = '.qsc .qsc-title{margin:0 0 10px}.qsc-amounts{font-size:15px;font-weight:650;margin:0 0 6px;overflow-wrap:anywhere}.qsc-to,.qsc-status{font-size:12px;opacity:.72;margin:6px 0;overflow-wrap:anywhere}.qsc-btn{min-height:44px;border-radius:0;margin-top:6px;padding:0 18px;cursor:pointer}.qsc-btn[disabled]{opacity:.5;cursor:default}'; document.head.appendChild(st); }
  let busy = false, info = null, gen = 0;
  const h = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids.filter(k => k != null)); return n; };
  async function draw() {
    const my = ++gen, me = io.address();
    if (!canCollect(launch, me)) { el.hidden = true; el.replaceChildren(); return; }
    el.hidden = false;
    const status = h('p', {class: 'qsc-status', role: 'status', 'aria-live': 'polite'}, info ? '' : 'Reading pool fees…');
    const btn = h('button', {type: 'button', class: 'qa-btn qa-btn--primary qx-btn qx-btn-primary q-btn qsc-btn'}, 'Collect fees');
    const amounts = h('p', {class: 'qsc-amounts'});
    el.replaceChildren(h('h3', {class: 'qsc-title'}, 'Pool fees'), amounts, h('p', {class: 'qsc-to'}, 'Paid to ', h('code', {}, short(launch.payout)), lc(me) === lc(launch.payout) ? ' (this wallet)' : ''), btn, status);
    if (!info) { try { info = await pending(launch); } catch (e) { info = {ok: false, amounts: null, error: e.message}; } if (my !== gen) return; }
    status.textContent = '';
    if (info.amounts) {
      const parts = [[info.amounts[0], info.currency0], [info.amounts[1], info.currency1]].filter(([n]) => n > 0n).map(([n, t]) => fmt(n, t.decimals) + ' ' + t.symbol);
      amounts.textContent = parts.length ? 'Ready to collect: ' + parts.join(' + ') : 'Nothing to collect yet.';
      if (!parts.length) btn.disabled = true;
    } else amounts.textContent = info.ok ? 'Ready to collect. The amount shows in your wallet before you confirm.' : 'Fees cannot be read right now. You can still try to collect.';
    btn.onclick = async () => {
      if (busy) return; busy = true; btn.disabled = true;
      try { await io.send(collectTx(launch), t => { status.textContent = t; }); info = null; status.textContent = 'Collected. Fees sent to ' + short(launch.payout) + '.'; setTimeout(draw, 4000); }
      catch (e) { status.textContent = e?.message || 'Collect did not go through.'; btn.disabled = false; }
      finally { busy = false; }
    };
  }
  io.onChange?.(() => { draw(); });
  draw();
}
