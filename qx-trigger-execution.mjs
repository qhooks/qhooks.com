// The escrow TP/SL placement action, shared with deterministic regression tests.
import { abi, calldata, ethCall, rpc, keyTuple, KEY_T, MANAGER, ensureAllowance, send } from './qx-chain.mjs';
import { quoteSingle } from './qx-swap.mjs';
import { keccak_256 } from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';
const digest = h => '0x' + Array.from(keccak_256(Uint8Array.from(h.match(/../g), x => parseInt(x, 16))), b => b.toString(16).padStart(2, '0')).join('');
export async function placeTriggerExit(c, { amount, tpPct, slPct, floorBps, tipBps, onStatus, assert = () => {} }) {
  assert();
  const id = digest(abi([KEY_T], [keyTuple(c.key)]).slice(2));
  const slot = digest(id.slice(2) + (6).toString(16).padStart(64, '0'));
  const p0 = BigInt(await ethCall(c.chainId, MANAGER[c.chainId], calldata('0x1e2eaeaf', ['bytes32'], [slot]))) & ((1n << 160n) - 1n); assert();
  const q = await quoteSingle(c.chainId, c.key, c.tokenIs0, amount); assert();
  const scaled = f => { const r = BigInt(Math.round(Math.sqrt(f) * 1e9)); return c.tokenIs0 ? p0 * r / 1_000_000_000n : p0 * 1_000_000_000n / r; };
  const f = x => BigInt(Math.round(x * 1e6)), keep = 10000n - BigInt(floorBps);
  const tp = tpPct ? scaled(1 + tpPct / 100) : 0n, sl = slPct ? scaled(1 - slPct / 100) : 0n;
  const tpMin = tpPct ? q * f(1 + tpPct / 100) / 1_000_000n * keep / 10000n : 0n, slMin = slPct ? q * f(1 - slPct / 100) / 1_000_000n * keep / 10000n : 0n;
  const now = BigInt((await rpc(c.chainId, 'eth_getBlockByNumber', ['latest', false])).timestamp); assert();
  await ensureAllowance(c.chainId, c.token, c.address, amount, onStatus, assert); assert();
  onStatus?.('Confirm the order in your wallet…');
  const receipt = await send(c.chainId, { to: c.address, data: calldata('0x953a6fc6', ['address', KEY_T, 'bool', 'uint128', 'uint160', 'uint128', 'uint160', 'uint128', 'uint40', 'uint16'],
    [MANAGER[c.chainId], keyTuple(c.key), c.tokenIs0, amount, tp, tpMin, sl, slMin, now + 30n * 86400n, tipBps]) }, onStatus, assert);
  assert(); return receipt;
}
