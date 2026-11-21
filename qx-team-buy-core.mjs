// Team buy (2026-11-21, Randall approved): the creator's first buy at launch is sized for the whole team, then one
// distribution transaction right after the launch sends each team wallet its share by plain token transfers.
// Optional "Disclosed team buy": the list is published on the token page, in the API and in the token metadata.
// No hops, no hiding, no QProof exemption: the transfers are ordinary on-chain transfers from the creator.
// Shared by the browser and the Worker. Pure functions only.
export const TEAM_BUY = Object.freeze({maxWallets: 8, bps: 10000});
/// The first-buy and team UI on /create stay hidden until Randall OKs the strings (TEAM_TEXT and the first-buy notes);
/// flipping this is the whole switch. Server routes (record, GET, EVM quote) are live either way.
export const TEAM_BUY_LIVE = true; // strings approved 2026-11-21 (lead); Solana still needs config v2 (policy 2)
/// EVM chains whose launch quote is the wrapped native coin: the first buy rides the launch call's value (live factories
/// on these chains checked by eth_simulateV1 2026-11-21: FirstBuy to the caller, no launch-block charge).
export const TEAM_NATIVE_CHAINS = Object.freeze(['4663', '56', '99901']);
const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, EVM = /^0x[0-9a-f]{40}$/;
const fail = m => { throw Object.assign(new TypeError(m), {code: 'team_buy_invalid'}); };
export const teamAddress = (chain, value) => { const v = String(value ?? '').trim(); return chain === 'solana' ? (SOL.test(v) ? v : null) : (EVM.test(v.toLowerCase()) ? v.toLowerCase() : null); };
/// {disclosed, wallets:[{address, bps}]} or null for "no team buy". Shares are of the creator's first-buy tokens;
/// whatever the shares leave stays with the creator. Throws a plain sentence on a bad list.
export function normalizeTeamBuy(input, {chain, creator = null} = {}) {
  if (input == null || input === false) return null;
  if (typeof input !== 'object' || Array.isArray(input)) fail('Check the team list.');
  const rows = Array.isArray(input.wallets) ? input.wallets : [];
  if (!rows.length) return null;
  if (rows.length > TEAM_BUY.maxWallets) fail('Add at most ' + TEAM_BUY.maxWallets + ' team wallets.');
  const self = creator == null ? null : teamAddress(chain, creator), seen = new Set(), wallets = [];
  let total = 0;
  for (const r of rows) {
    const address = teamAddress(chain, r?.address);
    if (!address) fail('Check team wallet ' + (wallets.length + 1) + ': it is not a ' + (chain === 'solana' ? 'Solana' : 'EVM') + ' address.');
    if (address === self) fail('The creator wallet keeps whatever the shares leave; list only the other team wallets.');
    if (seen.has(address)) fail('Each team wallet can appear once.');
    const bps = Number(r?.bps);
    if (!Number.isInteger(bps) || bps < 1 || bps > TEAM_BUY.bps) fail('Give each team wallet a share between 0.01% and 100%.');
    seen.add(address); total += bps; wallets.push({address, bps});
  }
  if (total > TEAM_BUY.bps) fail('Team shares add up to more than 100%.');
  return {disclosed: input.disclosed === true, wallets};
}
/// Raw token amounts per wallet from the tokens the creator received; rounding stays with the creator.
export function teamSplit(total, wallets) {
  const t = BigInt(total); if (t <= 0n) fail('The first buy delivered no tokens to share.');
  return wallets.map(w => ({address: w.address, bps: w.bps, amount: t * BigInt(w.bps) / BigInt(TEAM_BUY.bps)})).filter(w => w.amount > 0n);
}
/// The metadata block a disclosed team buy publishes (token metadata JSON, before launch: the planned shares).
export const teamMeta = t => t?.disclosed ? {disclosed: true, wallets: t.wallets.map(w => ({address: w.address, share_bps: w.bps}))} : null;
/// Share of supply from raw token amounts, in percent with 2 decimals.
export const supplyPercent = (amount, supplyRaw) => Number(BigInt(amount) * 10000n / BigInt(supplyRaw)) / 100;
// Draft UI strings (Team buy): for Randall's OK via the lead before release copy is final.
export const TEAM_TEXT = Object.freeze({
  toggle: 'Team buy',
  intro: chain => chain === 'solana' ? 'Your first buy can be sized for the whole team. Right after launch, one transaction sends each team wallet its share.' : 'Your first buy can be sized for the whole team. Right after launch, you send each team wallet its share, one transfer per wallet.',
  wallet: 'Team wallet',
  share: 'Share of your first buy, %',
  add: 'Add a team wallet',
  remove: 'Remove',
  disclose: 'Disclosed team buy',
  discloseNote: 'Shows the team wallets and their shares on the token page, in the QHooks API and in the token metadata.',
  keep: pct => 'You keep ' + pct + '% of the first buy.',
  supply: pct => 'About ' + pct + '% of supply.',
  send: n => 'Send team shares · ' + n + (n === 1 ? ' wallet' : ' wallets'),
  sent: 'Team shares sent.',
  badge: (n, pct) => 'Disclosed team buy · ' + n + (n === 1 ? ' wallet' : ' wallets') + (pct == null ? '' : ' · ' + pct + '% of supply'),
});
