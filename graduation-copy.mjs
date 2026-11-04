export const graduationCopy = Object.freeze({
  name: 'QGraduation',
  summary: 'Choose when your liquidity moves: reach a net-quote threshold, migrate manually without an automatic cap, or stay in your source pool.',
  action: 'Liquidity migration, policy changes and fee withdrawals',
  detail: 'Threshold means net raw quote-token inflow from swaps, including fees and subtracting outflows—not market cap, USD value or trading volume. Migration moves the launch-owned LP position between compatible pools on the same fixed v4 manager and EVM chain. Destination, hook commitment, positions, token limits and recipient are bound to the signed action. Pending policy changes freeze migration until applied or cancelled; changes require a notice period.',
  protectedAction: 'Wallet AND SLH-DSA-SHA2-128s approval authorizes source-pool bootstrap, noticed policy changes, fee claims, actual liquidity migration and destination exits. Both approvals cover the same complete action.',
  unprotectedActions: Object.freeze([
    'Public swaps, chain consensus, token issuer controls and market risk are not made quantum-resistant by this hook.',
    'One fixed manager, an ordered ERC20 pair and launch-owned liquidity only. No bridging, arbitrary hook stacking, third-party LP control or yield guarantee.'
  ]),
  limitations: Object.freeze([
    'Local developer beta with dedicated encrypted key backup and restore, launch setup and liquidity controls. No public deployment or external audit; actual browser-wallet signing remains untested.',
    'Category 1 SLH-SHA2-128s is not equivalent to category 3 ML-DSA-65. Neither profile makes a chain quantum-resistant.',
    'No source-principal early exit, key rotation or key recovery. Loss of either fixed key can strand protected liquidity.',
    'Manager, token and destination compatibility must be validated for each deployment; cross-EVM deployments do not bridge liquidity.'
  ])
});
