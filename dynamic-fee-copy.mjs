export const dynamicFeeCopy = Object.freeze({
  name: 'Dynamic Fees',
  summary: 'Adjust your pool’s LP fee within a fixed ceiling. Require both your wallet and post-quantum key to approve every change.',
  action: 'LP-fee updates',
  detail: 'Current and next versions and fees, chain, controller, pool, policy, authorization epoch, nonce and validity window are bound to the same 18-word action. The immutable ceiling is at most 100,000 pips (10%). Local tests exercised 3,000 → 5,000 → 0 → 100,000 → 3,000 pips, both swap directions and exact-input/output swaps. Liquidity exits remain available.',
  protectedAction: 'Replacing one fixed Uniswap v4 pool’s LP fee requires wallet AND ML-DSA-65 approval of the same complete 18-word action, within its fixed ceiling and sequential version transition.',
  unprotectedActions: Object.freeze([
    'Public swaps use the approved fee without PQ verification on each swap. Ordinary token transfers, chain consensus, token issuer controls and market risk are not quantum-protected.',
    'Fee governance is not custody protection, an oracle, a yield guarantee or a defense against adverse pricing.'
  ]),
  limitations: Object.freeze([
    'Local developer beta; no public deployment or independent external audit.',
    'Optional expensive ML-DSA profile, not the cheaper hash-based default. Chain-specific costs and transaction limits still require validation.',
    'Configure and compile Dynamic Fees in the Lab for local chain31337. Connected fee-governance wallet controls remain separate. No enrollment, key rotation or recovery workflow.',
    'One fixed manager and ordered ERC20 pair; no bridging or arbitrary hook stacking. Active reentrancy and natural core-update failure were not triggered in this fixed callback-free graph.'
  ])
});
