import {BUILT, SOLANA_NETWORK} from './chains.mjs';

const chains = new Set([...BUILT, SOLANA_NETWORK].map(c => c.id));
export const HOT_WINDOWS = [['1h', '1h'], ['24h', '24h']];
export const hotChain = chain => typeof chain === 'string' && chains.has(chain);
export function hotTarget(chain, token) {
  if (!hotChain(chain) || typeof token !== 'string') return null;
  if (!(chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ : /^0x[0-9a-f]{40}$/i).test(token)) return null;
  return {chain, token: chain === 'solana' ? token : token.toLowerCase()};
}
export function hotEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['search', 'open'].includes(value.kind)) return null;
  if (Object.keys(value).some(k => !['chain', 'token', 'kind'].includes(k))) return null;
  const target = hotTarget(value.chain, value.token);
  return target ? {...target, kind: value.kind} : null;
}
export const hotKey = ({chain, token}) => chain + ':' + token;

// Reuse received observations. A search count supplies no price or token metadata.
export function mergeHotRows(ranked, marketRows = []) {
  const known = new Map();
  for (const row of marketRows) {
    const target = hotTarget(String(row?.chainId), row?.token?.address);
    if (target && !known.has(hotKey(target))) known.set(hotKey(target), row);
  }
  const seen = new Set(), rows = [];
  for (const item of ranked || []) {
    const target = hotTarget(item?.chain, item?.token);
    if (!target || !Number.isSafeInteger(item.count) || item.count < 1 || seen.has(hotKey(target))) continue;
    seen.add(hotKey(target));
    const row = known.get(hotKey(target));
    rows.push({...row, chainId: target.chain, token: {...row?.token, address: target.token, symbol: row?.token?.symbol || '—'}, hotCount: item.count});
    if (rows.length === 30) break;
  }
  return rows;
}
