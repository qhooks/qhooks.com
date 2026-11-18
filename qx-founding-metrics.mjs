// Token-page figures are display facts; reward eligibility remains campaign-owned.
export function foundingMetrics(launch, markets) {
  if (launch.chainId === 'solana') return {holders: launch.holders ?? null, volumeUsd: launch.volumeUsd ?? null, volumeWindow: 'campaign'};
  const market = (markets || []).find(m => String(m.chainId) === String(launch.chainId) && String(m.token?.address || m.token || '').toLowerCase() === String(launch.token).toLowerCase());
  const s = market?.summary, valid = n => Number.isFinite(n) && n >= 0 ? n : null;
  return {holders: valid(s?.holders), volumeUsd: valid(s?.volume24Usd), volumeWindow: '24h'};
}
export async function readFoundingMetrics(launches, {fetcher = globalThis.fetch} = {}) {
  const r = await fetcher('/api/terminal/feed?chain=all', {cache: 'no-store', signal: AbortSignal.timeout(8000)});
  if (!r.ok) throw Error('Launch figures are refreshing');
  const body = await r.json(); if (!Array.isArray(body.markets)) throw Error('Launch figures are refreshing');
  return launches.map(l => ({...l, displayMetrics: foundingMetrics(l, body.markets)}));
}
