// The ownerless per-chain contracts beside every pool (QLocks, QLimitOrders). Each lives at the same
// CREATE2 address on every chain, deployed once by whoever uses it first through the deterministic
// deployer. Code at that address can only be the pinned init code's runtime, so presence is proof.
import { codeAt, send } from '/qx-chain.mjs';
import { chainById } from '/chains.mjs';
// A chain whose QHooks contracts are a separate build (Elysium: its own QFeeRouter, since the shared one hard-codes its
// chain table) names them in its chains.mjs row: extras: { feeRouter: '0x…' }. That address wins over the shared
// CREATE2 one, and the site never deploys it (the team does), so setUp refuses on such a chain.
const ADDR = /^0x[0-9a-f]{40}$/i;
export function chainExtra(name, chainId) {
  const a = chainId == null ? null : chainById(String(chainId))?.extras?.[name];
  return typeof a === 'string' && ADDR.test(a) && BigInt(a) !== 0n ? a.toLowerCase() : null;
}

let artifact;
export async function extras() {
  if (!artifact) artifact = fetch('/full-launch/extras.json', { cache: 'no-store' }).then(r => { if (!r.ok) throw Error('Extras unavailable'); return r.json(); })
    .then(a => { if (a.kind !== 'qhooks-launch-extras' || a.schemaVersion !== 1) throw Error('Unknown extras artifact'); return a; })
    .catch(e => { artifact = null; throw e; });
  return artifact;
}
export async function extraAddress(name, chainId) { return chainExtra(name, chainId) || (await extras()).contracts[name].address; }
export async function isLive(chainId, name) { return (await codeAt(chainId, await extraAddress(name, chainId))) !== '0x'; }
/// One-time setup on a chain: sends salt ++ init code to the deterministic deployer.
export async function setUp(chainId,name,onStatus,assertContext=()=>{}){
  assertContext();
  if(chainExtra(name,chainId))throw Error('Trading on this chain is still being set up by the QHooks team. Nothing was sent.');
  const a=await extras();assertContext();const c=a.contracts[name];
  await send(chainId, { to: a.deployer, data: a.salt + c.initCode.slice(2)},onStatus,assertContext);assertContext();
  const live=await isLive(chainId,name);assertContext();if(!live)throw Error('Setup did not land');
}
