// The ownerless per-chain contracts beside every pool (QLocks, QLimitOrders). Each lives at the same
// CREATE2 address on every chain, deployed once by whoever uses it first through the deterministic
// deployer. Code at that address can only be the pinned init code's runtime, so presence is proof.
import { codeAt, send } from '/qx-chain.mjs';

let artifact;
export async function extras() {
  if (!artifact) artifact = fetch('/full-launch/extras.json', { cache: 'no-store' }).then(r => { if (!r.ok) throw Error('Extras unavailable'); return r.json(); })
    .then(a => { if (a.kind !== 'qhooks-launch-extras' || a.schemaVersion !== 1) throw Error('Unknown extras artifact'); return a; })
    .catch(e => { artifact = null; throw e; });
  return artifact;
}
export async function extraAddress(name) { return (await extras()).contracts[name].address; }
export async function isLive(chainId, name) { return (await codeAt(chainId, await extraAddress(name))) !== '0x'; }
/// One-time setup on a chain: sends salt ++ init code to the deterministic deployer.
export async function setUp(chainId, name, onStatus) {
  const a = await extras(), c = a.contracts[name];
  await send(chainId, { to: a.deployer, data: a.salt + c.initCode.slice(2) }, onStatus);
  if (!(await isLive(chainId, name))) throw new Error('Setup did not land');
}
