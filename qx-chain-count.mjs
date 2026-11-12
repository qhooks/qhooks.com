// One chain count for the whole site (2026-11-12, newcomer walk: pages said six, 6, seven and five).
// The number is the live EVM chains in chains.mjs (LIVE, hidden and testnet chains never count). Solana is always named
// on its own ("seven chains and Solana"). Static copy carries the same word, and lead/landing4/chain-count.mjs checks it.
import {LIVE} from './chains.mjs';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const CHAIN_COUNT = LIVE.length;
export const CHAIN_WORD = WORDS[CHAIN_COUNT] || String(CHAIN_COUNT);
export const CHAIN_WORD_CAP = CHAIN_WORD.charAt(0).toUpperCase() + CHAIN_WORD.slice(1);
/// "Base, Robinhood Chain, … and Monad"
export const chainNames = (list = LIVE) => { const n = list.map((c) => c.name); return n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : n.join(''); };
/// Fills [data-chain-count] with the word ("seven"); data-chain-count="cap" gives "Seven".
export function fillChainCount(root = globalThis.document) {
  for (const el of root?.querySelectorAll?.('[data-chain-count]') || []) {
    const t = el.dataset.chainCount === 'cap' ? CHAIN_WORD_CAP : CHAIN_WORD;
    if (el.textContent !== t) el.textContent = t;
  }
}
