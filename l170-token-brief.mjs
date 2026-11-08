import {readPublicConfig} from './public-config-input.mjs';
import {BUILT} from './chains.mjs';
const CHAIN_IDS = Object.freeze(new Set(BUILT.map(c=>c.id)));
const INVALID_NAME_RE = /[\u0000-\u001F\u007F<>]/;
const SYMBOL_RE = /^[A-Z0-9]{1,10}$/;
const briefFields = Object.freeze(['chainId','name','symbol']);

export function normalizeTokenBrief(input) {
  const c = readPublicConfig(input, briefFields);
  const chainId = c.chainId;
  if (!CHAIN_IDS.has(chainId)) throw new Error('Invalid chainId');
  let name = c.name.trim();
  if (name.length < 1 || name.length > 64 || INVALID_NAME_RE.test(name)) throw new Error('Invalid name');
  let symbol = c.symbol.trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) throw new Error('Invalid symbol');
  return Object.freeze({ chainId, name, symbol });
}

export function tokenBriefLink(input) {
  const b = normalizeTokenBrief(input);
  return '/qtoken-studio?chain=' + b.chainId + '#brief=' + encodeURIComponent(JSON.stringify(b));
}

export function readTokenBrief(hash, chainId) {
  if (typeof hash !== 'string' || !hash.startsWith('#brief=') || hash.length > 2048) throw new Error('Invalid hash');
  const json = decodeURIComponent(hash.slice(7));
  const b = JSON.parse(json);
  const normalized = normalizeTokenBrief(b);
  if (normalized.chainId !== chainId) throw new Error('ChainId mismatch');
  return normalized;
}
export { briefFields };
