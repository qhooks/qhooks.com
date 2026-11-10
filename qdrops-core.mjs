// QDrops core (2026-11-08): the leaf, tree and proof rules QDrops.sol checks, shared by the scorer cron, the claim
// card and the public verify script. Pure, no network. Leaf = keccak256(keccak256(abi.encode(account, token,
// cumulative))); tree = sorted-pair keccak (OpenZeppelin MerkleProof convention); leaves are sorted by hash so the
// root does not depend on input order; an odd node is carried up unchanged.
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

const HEX = /^0x[0-9a-f]{40}$/;
const hexOf = b => '0x' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const bytesOf = h => Uint8Array.from(h.slice(2).match(/../g) || [], x => parseInt(x, 16));
export const keccakHex = bytes => hexOf(keccak_256(bytes));
const word = v => { const b = new Uint8Array(32); let n = BigInt(v); for (let i = 31; i >= 0; i--) { b[i] = Number(n & 0xffn); n >>= 8n; } return b; };
const addrWord = a => { if (!HEX.test(a)) throw Error('bad address ' + a); const b = new Uint8Array(32); b.set(bytesOf(a), 12); return b; };

export function leafHash(account, token, cumulative) {
  const amount = BigInt(cumulative);
  if (amount < 0n || amount >= 1n << 256n) throw Error('bad amount');
  const enc = new Uint8Array(96); enc.set(addrWord(account.toLowerCase()), 0); enc.set(addrWord(token.toLowerCase()), 32); enc.set(word(amount), 64);
  return hexOf(keccak_256(keccak_256(enc)));
}
export function hashPair(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  const buf = new Uint8Array(64); buf.set(bytesOf(x), 0); buf.set(bytesOf(y), 32);
  return hexOf(keccak_256(buf));
}
/// leaves: [{account, token, cumulative}] (cumulative as decimal string or bigint). Returns the root, and each leaf
/// with its hash and proof. Rejects duplicate (account, token) pairs: one leaf per pair is what makes claims cumulative.
export function buildTree(leaves) {
  const seen = new Set();
  const items = leaves.map(l => {
    const account = l.account.toLowerCase(), token = l.token.toLowerCase(), key = account + '|' + token;
    if (seen.has(key)) throw Error('duplicate leaf ' + key); seen.add(key);
    const cumulative = BigInt(l.cumulative);
    return {...l, account, token, cumulative: cumulative.toString(), hash: leafHash(account, token, cumulative)};
  }).sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
  if (!items.length) return {root: '0x' + '0'.repeat(64), leaves: []};
  const levels = [items.map(i => i.hash)];
  while (levels.at(-1).length > 1) {
    const cur = levels.at(-1), next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? hashPair(cur[i], cur[i + 1]) : cur[i]);
    levels.push(next);
  }
  items.forEach((item, index) => {
    const proof = []; let i = index;
    for (let d = 0; d < levels.length - 1; d++) { const sib = i ^ 1; if (sib < levels[d].length) proof.push(levels[d][sib]); i >>= 1; }
    item.proof = proof;
  });
  return {root: levels.at(-1)[0], leaves: items};
}
export function verifyProof(proof, root, node) {
  let h = node; for (const p of proof) h = hashPair(h, p); return h === root;
}
/// Per-token totals in the contract's token order (what proposeRoot takes).
export function totalsFor(leaves, tokens) {
  const sum = new Map(tokens.map(t => [t.toLowerCase(), 0n]));
  for (const l of leaves) { const t = l.token.toLowerCase(); if (!sum.has(t)) throw Error('unlisted token ' + t); sum.set(t, sum.get(t) + BigInt(l.cumulative)); }
  return tokens.map(t => sum.get(t.toLowerCase()).toString());
}
/// Next cumulative leaves: previous leaves plus this epoch's awards [{account, token, amount, source}]. Amounts only
/// grow, so every account can claim all past epochs in one transaction. `sources` keeps a per-source running total.
export function nextLeaves(previous, awards) {
  const map = new Map();
  for (const l of previous || []) map.set(l.account.toLowerCase() + '|' + l.token.toLowerCase(), {account: l.account.toLowerCase(), token: l.token.toLowerCase(), cumulative: BigInt(l.cumulative), sources: {...(l.sources || {})}});
  for (const a of awards) {
    const amount = BigInt(a.amount); if (amount <= 0n) continue;
    const k = a.account.toLowerCase() + '|' + a.token.toLowerCase();
    const cur = map.get(k) || {account: a.account.toLowerCase(), token: a.token.toLowerCase(), cumulative: 0n, sources: {}};
    cur.cumulative += amount; cur.sources[a.source] = (BigInt(cur.sources[a.source] || 0) + amount).toString();
    map.set(k, cur);
  }
  return [...map.values()].map(l => ({...l, cumulative: l.cumulative.toString()}))
    .sort((a, b) => a.account.localeCompare(b.account) || a.token.localeCompare(b.token));
}
/// Splits `pot` (bigint) by weight [{account, weight}] with integer floors; the rounding remainder stays unallocated.
/// shareCap (0..1) caps any one account's share; capped excess also stays unallocated (it rolls to the next epoch).
export function splitByWeight(rows, pot, {shareCap = 1} = {}) {
  const live = rows.filter(r => BigInt(r.weight) > 0n);
  const total = live.reduce((s, r) => s + BigInt(r.weight), 0n);
  if (!total || pot <= 0n) return [];
  const cap = shareCap >= 1 ? pot : pot * BigInt(Math.round(shareCap * 1e6)) / 1000000n;
  return live.map(r => { let amount = pot * BigInt(r.weight) / total; if (amount > cap) amount = cap; return {account: r.account, amount}; }).filter(r => r.amount > 0n);
}
/// Canonical bytes of an epoch file, hashed into dataHash on chain so anyone can check the JSON they downloaded.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const dataHashOf = body => keccakHex(new TextEncoder().encode(canonical(body)));
/// Calldata for QDrops.claimMany((address account, address token, uint256 cumulative, bytes32[] proof)[]).
export const CLAIM_MANY = keccakHex(new TextEncoder().encode('claimMany((address,address,uint256,bytes32[])[])')).slice(0, 10);
export function claimManyData(items) {
  const w = v => BigInt(v).toString(16).padStart(64, '0'), a = x => x.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const tuples = items.map(i => a(i.account) + a(i.token) + w(i.cumulative) + w(128) + w(i.proof.length) + i.proof.map(p => p.slice(2)).join(''));
  let offset = items.length * 32; const heads = [];
  for (const t of tuples) { heads.push(w(offset)); offset += t.length / 2; }
  return CLAIM_MANY + w(32) + w(items.length) + heads.join('') + tuples.join('');
}
/// Safe v1.x calldata for a zero-gas-refund transaction: getTransactionHash(…, nonce) and execTransaction with owners'
/// approved-hash signatures (v=1, r=owner), sorted by owner address. Used by the one-tap /safe-drops page.
const W = v => BigInt(v).toString(16).padStart(64, '0'), PADA = a => a.toLowerCase().replace(/^0x/, '').padStart(64, '0'), Z = '0'.repeat(64);
const bytesTail = h => { const d = h.replace(/^0x/, ''); return W(d.length / 2) + d + '0'.repeat((64 - (d.length % 64)) % 64); };
export function safeHashCall(tx, nonce) {
  return '0xd8d11f78' + PADA(tx.to) + W(tx.value || 0) + W(320) + W(tx.operation) + Z + Z + Z + Z + Z + W(nonce) + bytesTail(tx.data);
}
export function safeExecData(tx, owners) {
  const sigs = '0x' + [...owners].map(o => o.toLowerCase()).sort().map(o => PADA(o) + Z + '01').join('');
  const d = bytesTail(tx.data);
  return '0x6a761202' + PADA(tx.to) + W(tx.value || 0) + W(320) + W(tx.operation) + Z + Z + Z + Z + Z + W(320 + d.length / 2) + d + bytesTail(sigs);
}
