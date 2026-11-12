// Auto-range liquidity kit (2026-11-12, Randall: "Yes I want that built"). A one-tap launch whose LP fees go to its own
// QRange in the same flow: launch → QRangeMaker.make → point the launch's LP-fee payout at the range. No contract changes:
// every address is known before the launch is sent.
//  - The launch's pool id and token: eth_call of the exact launch transaction (launch() returns (token, id)).
//  - The range: QRangeMaker.predict(launch, id, creator wallet, share) (CREATE2, pure).
//  - Pointing the fees: QSimpleLaunch.setPayout(id, range) from the creator wallet; for a launch with a post-quantum key the
//    creator role sits with QPQCreator, so QPQCreator.setPayout(factory, id, range, until, sig): the role is registered inside
//    launch() with nonce 0, so the key can sign that exact message before the launch exists (the same message /range and
//    /floor have signed after it).
// Sent as one EIP-5792 batch where the wallet supports atomic batches; otherwise one after another (3 confirmations).
import {abiEncode} from './full-launch/packages/launchpad/abi-encode.mjs';

export const RANGE_MAKER = '0x31ce07323c2132e02257e947df620dc67cf1327e';
export const PQ_CREATOR = '0x9b1559adc9b9c2dce8a32957f3024f3393ae5bf3';
export const RANGE_SHARES = Object.freeze([[5000, '50%'], [8000, '80%'], [10000, '100%']]);
/// Default share of LP fees kept as liquidity: half builds depth around the price, half still pays the creator.
export const DEFAULT_RANGE_BPS = 5000;
const SEL = {make: '0xa5b7705d', predict: '0x85e09383', setPayout: '0x6f71a693', pqSetPayout: '0x24337d97', pqMessage: '0xfa2fcc1a', launchOf: '0xd4bf17c5'};
// Planning gas for the two range steps (fork-measured; the wallet's own estimate decides what is paid).
export const RANGE_GAS = Object.freeze({make: 360000, point: 60000, pointPq: 260000});
const pad = a => String(a).slice(2).toLowerCase().padStart(64, '0');
const W = n => BigInt(n).toString(16).padStart(64, '0');
const wAddr = (h, i = 0) => '0x' + String(h || '0x').slice(2 + 64 * i + 24, 66 + 64 * i).toLowerCase();
const isAddr = a => /^0x[0-9a-f]{40}$/i.test(String(a || ''));

/// Range share must be one of the offered choices.
export function checkShare(bps) { if (!RANGE_SHARES.some(([v]) => v === Number(bps))) throw TypeError('Choose how much of the LP fees stays as liquidity.'); return Number(bps); }

const live = new Map();
/// Whether QRangeMaker has code on this chain and the launch contract is one the range page knows (cached; a miss is
/// re-read after 30 s so a tap made while the page is open shows up).
export async function rangeKitReady(chainId, factory, getCode, cfg) {
  const id = String(chainId), f = String(factory || '').toLowerCase();
  if (!cfg?.chains?.[id]?.launches?.some(([a]) => a.toLowerCase() === f)) return false;
  const hit = live.get(id); if (hit === true) return true; if (typeof hit === 'number' && Date.now() - hit < 30000) return false;
  const code = await getCode(RANGE_MAKER).catch(() => '0x');
  const ok = typeof code === 'string' && code.length > 2; live.set(id, ok ? true : Date.now()); return ok;
}

/// From the exact launch transaction: the pool id, token and the range address it will get.
/// `call(tx)` is eth_call at latest. Throws when the launch would not go through.
export async function planRange({call, tx, owner, bps}) {
  checkShare(bps); if (!isAddr(owner) || !isAddr(tx?.to)) throw TypeError('Connect your wallet first.');
  const r = await call({from: owner, to: tx.to, data: tx.data, value: tx.value || '0x0'});
  if (typeof r !== 'string' || r.length < 130) throw Error('This launch would fail right now. Nothing was sent.');
  const token = wAddr(r, 0), id = '0x' + r.slice(66, 130);
  const p = await call({to: RANGE_MAKER, data: SEL.predict + pad(tx.to) + id.slice(2) + pad(owner) + W(bps)});
  const range = wAddr(p);
  if (!isAddr(range) || /^0x0+$/.test(range)) throw Error('Could not work out the range address. Nothing was sent.');
  return {factory: tx.to.toLowerCase(), id, token, range, owner: owner.toLowerCase(), bps: Number(bps)};
}

export const makeCall = plan => ({to: RANGE_MAKER, data: SEL.make + pad(plan.factory) + plan.id.slice(2) + pad(plan.owner) + W(plan.bps), value: '0x0'});
export const pointCall = plan => ({to: plan.factory, data: SEL.setPayout + plan.id.slice(2) + pad(plan.range), value: '0x0'});
/// Post-quantum launch: the key signs kind 1 (set payout) for this range, nonce `nonce` (0 before the launch exists).
export function pointCallPq(plan, {signer, chainId, nonce = 0n, until}) {
  const sg = signer.signCreatorAction({chainId, contract: PQ_CREATOR, factory: plan.factory, id: plan.id, kind: 1, values: [plan.range], nonce, validUntil: until, wallet: plan.owner});
  return {to: PQ_CREATOR, data: SEL.pqSetPayout + abiEncode(['address', 'bytes32', 'address', 'uint64', 'bytes'], [plan.factory, plan.id, plan.range, String(until), sg.signatureHex]).slice(2), value: '0x0', messageHex: sg.messageHex};
}
/// After the launch: the on-chain message() must equal what the key signed (a check /range also makes).
export async function checkPqMessage({call, plan, until, messageHex}) {
  const args = abiEncode(['address'], [plan.range]);
  const r = await call({to: PQ_CREATOR, data: SEL.pqMessage + abiEncode(['address', 'bytes32', 'uint8', 'bytes', 'uint64'], [plan.factory, plan.id, '1', args, String(until)]).slice(2)});
  const off = Number(BigInt('0x' + r.slice(2, 66))) * 2, len = Number(BigInt('0x' + r.slice(2 + off, 2 + off + 64)));
  return ('0x' + r.slice(2 + off + 64, 2 + off + 64 + len * 2)).toLowerCase() === String(messageHex).toLowerCase();
}
/// The launch's payout once it is done (word 8 of launchOf), to show "Fees go to the range" only when it is true.
export async function payoutOf({call, plan}) { const r = await call({to: plan.factory, data: SEL.launchOf + plan.id.slice(2)}); return wAddr(r, 8); }

/// EIP-5792 atomic batch through the connected provider. Returns null, having sent nothing, when the wallet does not
/// report atomic batching on this chain; then the caller sends one by one.
export async function sendBatch(provider, {from, chainId, calls, onStatus = () => {}, wait = ms => new Promise(r => setTimeout(r, ms))}) {
  const hexChain = '0x' + Number(chainId).toString(16);
  let caps = null; try { caps = await provider.request({method: 'wallet_getCapabilities', params: [from, [hexChain]]}); } catch { return null; }
  const c = caps?.[hexChain] || caps?.[String(Number(chainId))] || null;
  if (!(c?.atomic?.status === 'supported' || c?.atomic?.status === 'ready' || c?.atomicBatch?.supported === true)) return null;
  onStatus('Confirm in your wallet: one approval for the launch and its range.');
  const res = await provider.request({method: 'wallet_sendCalls', params: [{version: '2.0.0', chainId: hexChain, from, atomicRequired: true, calls: calls.map(x => ({to: x.to, data: x.data, value: '0x' + BigInt(x.value || 0).toString(16)}))}]});
  const id = typeof res === 'string' ? res : res?.id; if (!id) throw Error('The wallet did not return a batch id.');
  onStatus('Sent. Waiting for the network to confirm…');
  for (let i = 0; i < 240; i++) {
    const st = await provider.request({method: 'wallet_getCallsStatus', params: [id]}).catch(() => null);
    const code = typeof st?.status === 'number' ? st.status : ({CONFIRMED: 200, PENDING: 100}[st?.status] ?? 0);
    if (code >= 200 && code < 300) { const rs = st.receipts || []; if (!rs.length || rs.some(r => r.status && r.status !== '0x1')) throw Error('The network refused this launch. Nothing was created; only network gas was spent.'); return rs; }
    if (code >= 400) throw Error('The network refused this launch. Nothing was created; only network gas was spent.');
    await wait(i < 20 ? 750 : 2000);
  }
  throw Error('The network took too long to confirm. Your launch may still land; check your wallet activity.');
}
