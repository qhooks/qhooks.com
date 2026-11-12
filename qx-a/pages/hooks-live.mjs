// HOOKS lane: live launch data for the hook pages, read from the public list the terminal already uses
// (/api/terminal/feed?chain=all, one D1 list read). Each market's block mask says which launch blocks its pool runs.
// Polling is presence-gated: it runs only while the tab is visible and stops when it is hidden.
import { BLOCK_BITS } from '/full-launch/packages/multichain-launch/launch-blocks.mjs';
import { LIVE } from '/chains.mjs';

const CHAIN = Object.fromEntries(LIVE.map((c) => [String(c.id), c.name]));
CHAIN['99901'] ??= 'Elysium';
export const chainName = (id) => CHAIN[String(id)] || 'Chain ' + id;

/** Block ids switched on by a QLaunchBlocks mask. The holder-gate bit also carries the opening auction. */
export function blocksOf(mask) {
  let m; try { m = BigInt(mask || 0); } catch { return []; }
  return Object.entries(BLOCK_BITS).filter(([, b]) => (m >> BigInt(b)) & 1n).map(([id]) => id);
}

export function normalize(row) {
  const s = row.summary || {};
  const blocks = blocksOf(row.mask);
  return {
    key: row.chainId + ':' + String(row.controller || row.token).toLowerCase(),
    chainId: String(row.chainId), chain: chainName(row.chainId),
    symbol: row.symbol || '', name: row.name || '',
    logo: String(row.logo || row.profileImage || '').replace(/^https:\/\/qhooks\.com(?=\/)/, ''),
    href: '/terminal#m=' + row.chainId + ':' + String(row.controller || row.token).toLowerCase(),
    live: row.live === true || row.live === 'True',
    blocks,
    trades24: Number(s.trades24) || 0, buys24: Number(s.buys24) || 0, sells24: Number(s.sells24) || 0,
    volume24Usd: Number(s.volume24Usd) || 0, mcapUsd: Number(s.mcapUsd) || 0, holders: Number(s.holders) || 0,
    lastTradeAt: Number(s.lastTradeAt) || 0, launchedAt: Number(row.launchedAt) || 0,
  };
}

/** Launches using a block, most recently traded first. */
export const usersOf = (markets, id) => markets.filter((m) => m.blocks.includes(id)).sort((a, b) => b.lastTradeAt - a.lastTradeAt);

/**
 * watchLaunches(onData, { every }) calls onData(markets, events) after each read.
 * events: [{ market, side: 'buy'|'sell'|'trade' }] for markets whose last trade moved since the previous read.
 */
export function watchLaunches(onData, { every = 15000, url = '/api/terminal/feed?chain=all' } = {}) {
  let prev = null, timer = 0, busy = false, stopped = false;
  async function read() {
    if (busy || stopped || document.hidden) return;
    busy = true;
    try {
      const r = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
      const j = r.ok ? await r.json() : null;
      if (!Array.isArray(j?.markets)) throw new Error('feed');
      const seen = new Set(), markets = [];
      for (const row of j.markets) { const m = normalize(row); if (!seen.has(m.key)) { seen.add(m.key); markets.push(m); } }
      const events = [];
      if (prev) for (const m of markets) {
        const p = prev.get(m.key);
        if (p && m.lastTradeAt > p.lastTradeAt) events.push({ market: m, side: m.buys24 > p.buys24 ? 'buy' : m.sells24 > p.sells24 ? 'sell' : 'trade' });
      }
      prev = new Map(markets.map((m) => [m.key, m]));
      onData(markets, events, null);
    } catch (e) { onData(null, [], e); }
    finally { busy = false; }
  }
  const arm = () => { clearInterval(timer); if (!stopped && !document.hidden) timer = setInterval(read, every); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(timer); else { void read(); arm(); } });
  addEventListener('pagehide', () => clearInterval(timer));
  void read(); arm();
  return { refresh: read, stop() { stopped = true; clearInterval(timer); } };
}

/** The public hook directory's coverage (one row): total hooks, chains, pools and swaps at the snapshot. */
export async function directoryCoverage() {
  const r = await fetch('/api/v1/hooks?limit=1', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('directory');
  const j = await r.json();
  return { hooks: Number(j.coverage?.hookCount ?? j.total) || 0, chains: Number(j.coverage?.chainCount) || (j.chains?.length ?? 0), pools: Number(j.coverage?.totalPools) || 0, swaps: Number(j.coverage?.totalSwaps) || 0, snapshotAt: j.snapshotAt };
}
