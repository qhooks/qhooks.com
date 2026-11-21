// Contributor round reads (2026-11-21), shared by /create, /round and the Worker. Every read goes through a `batch`
// function: batch([{method, params}]) -> results in order, throwing on any error. Callers fail closed: a throw, a
// RoundFactory without code, or isRound(round) false means nothing about the round is shown.
import {ROUND_FACTORY, SEL, call, dU, dA, dB, dBytes32, dString, dAddrs, dSeat, decodeLaunchChain, STATUS, knownLaunch, roundChain} from './qx-round-core.mjs';

const ec = (to, data) => ({method: 'eth_call', params: [{to, data}, 'latest']});
const isAddr = a => /^0x[0-9a-f]{40}$/.test(String(a || '').toLowerCase());
const ZERO = '0x0000000000000000000000000000000000000000';

/// JSON-RPC batch over one URL, in chunks (some public RPCs cap batch size). Any error, missing id or missing result throws.
export function rpcBatch(url, {fetchImpl = (...a) => globalThis.fetch(...a), chunk = 10} = {}) {
  return async calls => {
    const parts = [];
    for (let i = 0; i < calls.length; i += chunk) parts.push(calls.slice(i, i + chunk));
    const out = await Promise.all(parts.map(async list => {
      const r = await fetchImpl(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(list.map((c, i) => ({jsonrpc: '2.0', id: i + 1, method: c.method, params: c.params})))});
      if (!r.ok) throw Error('chain_unavailable');
      const j = await r.json(), rows = Array.isArray(j) ? j : [j];
      return list.map((c, i) => { const x = rows.find(y => y && y.id === i + 1); if (!x || x.error || x.result === undefined || (x.result === null && c.method !== 'eth_getTransactionReceipt')) throw Error('chain_unavailable'); return x.result; });
    }));
    return out.flat();
  };
}

/// True only when the RoundFactory has code on this chain. Throws on a read error.
export async function factoryLive(batch, factory = ROUND_FACTORY) {
  const [code] = await batch([{method: 'eth_getCode', params: [factory, 'latest']}]);
  if (typeof code !== 'string') throw Error('chain_unavailable');
  return code.length > 2 && code !== '0x';
}

const VIEWS = ['status', 'wallets', 'pot', 'minRaise', 'maxRaise', 'deadline', 'startCap', 'fee', 'reserveBps', 'vestCliff', 'vestDuration', 'token', 'poolId',
  'tokensReceived', 'settledAt', 'settled', 'cancelled', 'refundsOpen', 'creator', 'launchFactory', 'quote', 'nativeQuote', 'name', 'symbol', 'metaHash', 'style', 'snipePacked', 'pq'];

/// Everything the round page shows. {ok:false, reason} when the round must not be shown; throws on any read error.
/// `account`: the connected wallet (its claimable amount, balance and, on ERC-20 rounds, allowance to the round).
export async function readRound({batch, chainId, round, account = null, factory = ROUND_FACTORY}) {
  if (!roundChain(chainId)) return {ok: false, reason: 'chain'};
  if (!isAddr(round)) return {ok: false, reason: 'address'};
  round = round.toLowerCase(); const acct = isAddr(account) ? account.toLowerCase() : null;
  const [code, is] = await batch([{method: 'eth_getCode', params: [factory, 'latest']}, ec(factory, call.isRound(round))]);
  if (typeof code !== 'string' || code.length <= 2) return {ok: false, reason: 'no_factory'};
  if (!dB(is)) return {ok: false, reason: 'not_round'};
  const res = await batch([...VIEWS.map(k => ec(round, SEL[k])), {method: 'eth_getBlockByNumber', params: ['latest', false]}]);
  const v = Object.fromEntries(VIEWS.map((k, i) => [k, res[i]])), block = res.at(-1);
  const r = {
    ok: true, chainId: String(chainId), round, factory: factory.toLowerCase(), now: Number(BigInt(block.timestamp)), blockNumber: Number(BigInt(block.number)),
    status: STATUS[Number(dU(v.status))] || 'Open', statusCode: Number(dU(v.status)), wallets: dAddrs(v.wallets),
    pot: dU(v.pot), minRaise: dU(v.minRaise), maxRaise: dU(v.maxRaise), deadline: Number(dU(v.deadline)), startCap: dU(v.startCap), fee: Number(dU(v.fee)),
    reserveBps: Number(dU(v.reserveBps)), vestCliff: Number(dU(v.vestCliff)), vestDuration: Number(dU(v.vestDuration)), token: dA(v.token), poolId: dBytes32(v.poolId),
    tokensReceived: dU(v.tokensReceived), settledAt: Number(dU(v.settledAt)), settled: dB(v.settled), cancelled: dB(v.cancelled), refundsOpen: dB(v.refundsOpen),
    creator: dA(v.creator), launchFactory: dA(v.launchFactory), quote: dA(v.quote), nativeQuote: dB(v.nativeQuote), name: dString(v.name), symbol: dString(v.symbol),
    metaHash: dBytes32(v.metaHash), style: Number(dU(v.style)), snipeSeconds: Number(dU(v.snipePacked) & 0xffffn), startSteps: Number(dU(v.snipePacked) >> 16n), pq: dB(v.pq),
  };
  r.graceEnd = r.deadline + 3 * 86400;
  if (!knownLaunch(r.chainId, r.launchFactory).known) return {ok: false, reason: 'launch_factory'};
  const more = [...r.wallets.map(w => ec(round, call.seat(w))), ec(r.launchFactory, SEL.chain)];
  if (!r.nativeQuote) more.push(ec(r.quote, SEL.decimals));
  if (r.token !== ZERO) more.push(ec(r.token, SEL.totalSupply));
  if (acct) {
    more.push(ec(round, call.claimable(acct)));
    more.push(r.nativeQuote ? {method: 'eth_getBalance', params: [acct, 'latest']} : ec(r.quote, call.balanceOf(acct)));
    if (!r.nativeQuote) more.push(ec(r.quote, call.allowance(acct, round)));
  }
  const m = await batch(more); let i = 0;
  r.seats = r.wallets.map(w => ({address: w, ...dSeat(m[i++])}));
  const ch = decodeLaunchChain(m[i++]); r.launchFee = ch.launchFee; r.chainQuoteOk = ch.quote.toLowerCase() === r.quote.toLowerCase() && ch.wrapsNative === r.nativeQuote;
  r.decimals = r.nativeQuote ? 18 : Number(dU(m[i++]));
  r.totalSupply = r.token !== ZERO ? dU(m[i++]) : null;
  if (acct) {
    const c = m[i++]; r.account = {address: acct, seat: r.seats.find(s => s.address === acct) || null, claimableTokens: dU(c, 0), claimableQuote: dU(c, 1), balance: BigInt(m[i++])};
    if (!r.nativeQuote) r.account.allowance = dU(m[i++]);
  }
  return r;
}

/// The launch factory's start market cap for a round at `steps` (pq: startAt(steps); original: chain().startCap), and its
/// quote: {startCap, quote, wrapsNative, launchFee}. Throws on a read error.
export async function readStart(batch, chainId, launchFactory, steps = 0) {
  const k = knownLaunch(chainId, launchFactory); if (!k.known) throw Error('launch_factory');
  const calls = [{method: 'eth_getCode', params: [launchFactory, 'latest']}, ec(launchFactory, SEL.chain)];
  if (k.pq) calls.push(ec(launchFactory, call.startAt(steps)));
  const [code, chainRes, at] = await batch(calls);
  if (typeof code !== 'string' || code.length <= 2) throw Error('launch_factory');
  const ch = decodeLaunchChain(chainRes);
  return {startCap: k.pq ? dU(at, 1) : ch.startCap, quote: ch.quote.toLowerCase(), wrapsNative: ch.wrapsNative, launchFee: ch.launchFee, pq: k.pq};
}
