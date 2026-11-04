export const directionalFeeCopy = Object.freeze({
  name: 'Directional Fees',
  summary: 'Set different LP fees for the two swap directions. Schedule changes with wallet and post-quantum approval.',
  action: 'Directional-fee schedules',
  detail: 'One fixed Uniswap v4 manager and ordered token pair. The complete 23-word action binds the chain, controller, module, manager, hook, pool, policy, authorization epoch, nonce, validity window, old/new versions and both fee pairs plus activation time. Each fee stays within an immutable ceiling of at most 100,000 pips (10%). Notice is 60–604,800 seconds; only one pending schedule, with no overwrite or cancellation. At the activation time swaps use the new pair; the next successful swap or schedule materializes stored state. Both directions and exact-input/output swaps are supported. Liquidity exits remain available.',
  protectedAction: 'Scheduling directional LP-fee changes requires wallet AND ML-DSA-65 approval of the same complete 23-word action, with sequential versions and bounded notice.',
  unprotectedActions: Object.freeze([
    'Public swaps apply the effective fee without PQ verification on each swap. Ordinary token transfers, consensus, protocol-fee governance, token issuer controls and market risk are not quantum-protected.',
    'Fee scheduling is not custody protection, an oracle, a yield guarantee or a defense against adverse pricing.'
  ]),
  limitations: Object.freeze([
    'Local developer beta; no public deployment or independent external audit.',
    'Optional expensive ML-DSA profile, not the cheaper hash-based default. Chain-specific costs and transaction limits still require validation.',
    'Configure and compile Directional Fees in the Lab for local chain31337. Connected fee-governance wallet controls remain separate. No enrollment, key rotation or recovery workflow.',
    'No bridging or arbitrary hook stacking. Active reentrancy and natural core-failure paths were not triggered in this fixed callback graph.'
  ])
});
