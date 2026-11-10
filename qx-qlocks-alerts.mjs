// QLocks sell-notice alerts: one reader for the board, @qhooks_bot and the pre-buy proof.
// No DOM; runs in the browser, the worker and Node. Reads Announced / LpAnnounced logs with eth_getLogs in
// chain-sized steps (chains.mjs logStep) and returns the notices that are still live (until readyAt + 7 days).
import { decodeNotice, noticeLive, noticeText } from './qx-qlocks-core.mjs';

async function rpcCall(url, method, params, fetchFn = fetch) {
  const r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message || 'RPC error'); return j.result;
}

/// Live sell notices on one chain.
///   chain: a chains.mjs row (uses logsRpc || rpc, logStep)
///   locks: the artifact's contracts.locksV2 ({ address, events })
///   token: optional token address; LP notices are kept when `lpIds` (from lpLocksOf) includes their id
///   fromBlock: where to start (callers keep a cursor); defaults to the last `lookback` blocks
/// Returns { notices, toBlock } so callers can store toBlock as their next cursor.
export async function liveNotices({ chain, locks, token, lpIds, fromBlock, lookback = 200000, now = Math.floor(Date.now() / 1000), fetchFn }) {
  const url = chain.logsRpc || chain.rpc, step = chain.logStep || 5000;
  const head = Number(BigInt(await rpcCall(url, 'eth_blockNumber', [], fetchFn)));
  let from = fromBlock ?? Math.max(0, head - lookback);
  const topics = [[locks.events.Announced, locks.events.LpAnnounced]];
  const out = [];
  for (; from <= head; from += step) {
    const to = Math.min(head, from + step - 1);
    const logs = await rpcCall(url, 'eth_getLogs', [{ address: locks.address, fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16), topics }], fetchFn);
    for (const l of logs) { const n = decodeNotice(l, locks.events); if (n) out.push(n); }
  }
  // A later announcement on the same lock replaces the earlier one (the contract keeps only the latest).
  const latest = new Map();
  for (const n of out) latest.set(n.type + ':' + n.id, n);
  const lp = new Set((lpIds || []).map(String));
  const notices = [...latest.values()].filter(n => noticeLive(n, now) && (n.type === 'tokens' ? !token || n.token === token.toLowerCase() : !token || lp.has(String(n.id))));
  return { notices, toBlock: head };
}

/// Text for each surface. Same facts everywhere; only the frame differs.
export function noticeMessages(n, opts) {
  const line = noticeText(n, opts);
  return {
    board: line,
    bot: '🔔 ' + line + (opts.link ? '\n' + opts.link : ''),
    proof: { label: n.type === 'tokens' ? 'Sell notice open' : 'LP notice open', level: 'caution', detail: line }
  };
}
