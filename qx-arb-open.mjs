// QHooks Arb (QArbOpen) in the browser: load the reviewed route list, find gaps by simulating the open executor with the
// wallet's real fee fields (some hooks price a call without them differently), and send one with a minimum floor so it
// cancels itself if the gap is gone. Gap sizes only; no estimates of what anyone earns.
import {chainById} from '/chains.mjs';
export const ARB_ROUTES_URL = '/arb-routes-rh.json';
export const RECAPTURE_SELECTOR = '0x6794ea77';
const W = n => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, '0');
const A = a => a.slice(2).toLowerCase().padStart(64, '0');
export function encodeRecapture(legs, amountIn, minGap) {
  return RECAPTURE_SELECTOR + W(96) + W(amountIn) + W(minGap) + W(legs.length) +
    legs.map(l => A(l.key.currency0) + A(l.key.currency1) + W(l.key.fee) + W(BigInt.asUintN(256, BigInt(l.key.tickSpacing))) + A(l.key.hooks) + W(l.zeroForOne ? 1 : 0)).join('');
}
let routesP = null;
// When the routes file names a next executor and exactly that code is on chain, use it (the liquidity build: the non-caller
// share goes to the QHOOKS floor instead of a burn). Otherwise the current executor, unchanged.
async function nextLive(d, fetchImpl) {
  const n = d?.next; if (!n?.executor || !n.runtimeSha256) return d;
  try {
    const r = await fetchImpl(chainById(String(d.chainId)).rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [n.executor, 'latest']})});
    const code = (await r.json()).result || '0x'; if (code.length < 4) return d;
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(code.slice(2).match(/../g), x => parseInt(x, 16))))].map(x => x.toString(16).padStart(2, '0')).join('');
    return h === n.runtimeSha256 ? {...d, executor: n.executor, callerBps: n.callerBps, abi: n.abi, liquidity: true, retired: d.executor} : d;
  } catch { return d; }
}
export function loadArbRoutes(fetchImpl = globalThis.fetch) { routesP ||= fetchImpl(ARB_ROUTES_URL).then(r => r.json()).then(d => nextLive(d, fetchImpl)); return routesP; }
export const SIZES = [2e15, 8e15, 3.2e16, 1.28e17, 5.12e17].map(x => BigInt(x));
export const fmtEth = w => { const s = Number(w) / 1e18; return s >= 0.01 ? s.toFixed(4) : s.toPrecision(3); };

export function createArbClient({chainId = '4663', fetchImpl = globalThis.fetch} = {}) {
  const ch = chainById(chainId); let id = 0, feeCache = null, feeAt = 0;
  const rpc = async batch => { for (let i = 0; i < 6; i++) {
    const r = await fetchImpl(ch.rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(batch.map(([m, p]) => ({jsonrpc: '2.0', id: ++id, method: m, params: p})))});
    const t = await r.text(); if (r.status === 429 || /Too Many/i.test(t)) { await new Promise(z => setTimeout(z, 1500 * (i + 1))); continue; }
    const j = JSON.parse(t); return (Array.isArray(j) ? j : [j]).sort((a, b) => a.id - b.id); } throw Error('The network is busy. Try again in a moment.'); };
  // The fee fields a real send would carry. A simulation without them can be priced differently by some hooks.
  async function fees() {
    if (feeCache && Date.now() - feeAt < 5000) return feeCache;
    const [b] = await rpc([['eth_getBlockByNumber', ['latest', false]]]); const base = BigInt(b.result.baseFeePerGas || 0), tip = 1000000n;
    feeCache = {maxFeePerGas: '0x' + (base * 2n + tip).toString(16), maxPriorityFeePerGas: '0x' + tip.toString(16)}; feeAt = Date.now(); return feeCache;
  }
  const callOf = (executor, from, data, f) => ['eth_call', [{from, to: executor, data, gas: '0x1e8480', ...f}, 'latest']];
  const gapOf = row => !row.error && row.result && row.result.length >= 130 ? BigInt('0x' + row.result.slice(2, 66)) : null;
  /// Best gap of each route: screen at the smallest size (a route that loses at the smallest size loses at every size),
  /// then try the larger sizes on the survivors. Paced in small batches for the public RPC.
  async function scan(routes, executor, {from = '0x0000000000000000000000000000000000000001', onProgress, signal} = {}) {
    const out = [];
    for (let i = 0; i < routes.length; i += 10) {
      if (signal?.aborted) break;
      const part = routes.slice(i, i + 10), f = await fees();
      const first = await rpc(part.map(r => callOf(executor, from, encodeRecapture(r.legs, SIZES[0], 0n), f)));
      const live = part.filter((_, k) => (gapOf(first[k]) || 0n) > 0n);
      if (live.length) {
        const ladder = await rpc(live.flatMap(r => SIZES.slice(1).map(s => callOf(executor, from, encodeRecapture(r.legs, s, 0n), f))));
        live.forEach((r, k) => { let best = {size: SIZES[0], gap: gapOf(first[part.indexOf(r)])};
          SIZES.slice(1).forEach((s, j) => { const g = gapOf(ladder[k * (SIZES.length - 1) + j]); if (g && g > best.gap) best = {size: s, gap: g}; });
          out.push({route: r, ...best, at: Date.now()}); });
      }
      onProgress?.(Math.min(routes.length, i + 10), routes.length, out);
      await new Promise(z => setTimeout(z, 400));
    }
    return out.sort((a, b) => (b.gap > a.gap ? 1 : -1));
  }
  /// Re-simulate from the wallet itself, then send with minGap = 90% of what the simulation showed.
  async function run(conn, executor, found, {say = () => {}} = {}) {
    const from = conn.owner, provider = conn.entry.provider, f = await fees();
    const check = encodeRecapture(found.route.legs, found.size, 0n);
    const [sim] = await rpc([callOf(executor, from, check, f)]); const gap = gapOf(sim);
    if (!gap || gap <= 0n) throw Error('The gap is gone. Nothing was sent.');
    const data = encodeRecapture(found.route.legs, found.size, gap * 9n / 10n), tx = {from, to: executor, data, value: '0x0', ...f};
    const [est] = await rpc([['eth_estimateGas', [{from, to: executor, data, value: '0x0', ...f}]]]);
    if (est.error) throw Error('The gap is gone. Nothing was sent.');
    tx.gas = '0x' + (BigInt(est.result) * 13n / 10n).toString(16);
    say('Confirm in your wallet…');
    const hash = await provider.request({method: 'eth_sendTransaction', params: [tx]});
    say('Sent. Waiting for the network…');
    for (let i = 0; i < 90; i++) { const [r] = await rpc([['eth_getTransactionReceipt', [hash]]]); if (r.result) return {hash, ok: r.result.status === '0x1'}; await new Promise(z => setTimeout(z, 1500)); }
    return {hash, ok: null};
  }
  return {scan, run, fees};
}
