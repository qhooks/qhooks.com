// Team buy, Solana (2026-11-21): one distribution transaction right after the launch. The creator signs it; each team
// wallet gets its share of the tokens the creator's first buy delivered, by plain SPL transfers (an idempotent token
// account create + transferChecked per wallet). Up to 8 wallets fit one transaction. No key on our side.
import {teamSplit} from './qx-team-buy-core.mjs';
import {prepareSolTransaction, sendPreparedSol} from './qx-sol-launch-client.mjs';
const DECIMALS = 6;
export async function buildSolTeamDistribution(runtime, {mint, owner, wallets}) {
  const {PublicKey, Transaction, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, connection} = runtime;
  const m = new PublicKey(mint), o = new PublicKey(owner), source = getAssociatedTokenAddressSync(m, o);
  const balance = await connection.getTokenAccountBalance(source, 'confirmed');
  const split = teamSplit(balance?.value?.amount ?? '0', wallets), tx = new Transaction();
  for (const w of split) {
    const to = new PublicKey(w.address), dest = getAssociatedTokenAddressSync(m, to);
    tx.add(createAssociatedTokenAccountIdempotentInstruction(o, dest, to, m), createTransferCheckedInstruction(source, m, dest, o, w.amount, DECIMALS));
  }
  return {transaction: tx, split, total: BigInt(balance.value.amount)};
}
/// Build, simulate, ask the creator's wallet, wait for finality, then record a disclosed list. Returns {signature, split}.
export async function sendSolTeamShares(runtime, {mint, owner, team, onStatus = () => {}}) {
  const {transaction, split} = await buildSolTeamDistribution(runtime, {mint, owner, wallets: team.wallets});
  onStatus('Simulating the team transfer…');
  const prepared = await prepareSolTransaction(runtime, transaction, [], owner);
  onStatus('Approve the team transfer in your wallet.');
  const sent = await sendPreparedSol(runtime, prepared);
  onStatus('Waiting for final confirmation…'); await sent.confirm();
  if (team.disclosed) {
    const r = await fetch('/api/team-buy/record', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({chain: 'solana', token: mint, txs: [sent.signature]})});
    if (!r.ok) throw Error('Team shares sent, but the disclosure record is refreshing. It will retry from this page.');
  }
  return {signature: sent.signature, split};
}
