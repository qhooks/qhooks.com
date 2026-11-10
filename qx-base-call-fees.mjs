// Base (OP stack) quote for a contract call, for one-tap launches (lead queue item 8, 2026-11-08). Base charges an L1 data
// fee on top of execution gas, read from its GasPriceOracle; the shared next-chain quote (Nitro chains, where the gas
// estimate already includes parent-chain data) doesn't. Same review bounds as the guided Base flow (mainnet-fees.mjs):
// tip lowered to ≤0.1 gwei (never raised), max fee ≤1 gwei, gas = estimate +25% ≤7M, L1 + operator fees budgeted twice.
// Returns the quoteNextChain shape the one-tap card uses (gas, transaction, maximumFee) plus l1Wei/operatorWei.
import {BASE_CHAIN, baseDataFees, ensure, quantity, hex, address, bytes} from './full-launch/apps/marketplace-preview/mainnet-fees.mjs';
import {readPriorityFee} from './full-launch/packages/multichain/priority-fee.mjs';
const TIP_CAP = 100000000n, MAX_FEE = 1000000000n, MAX_GAS = 7000000n;
const issued = new WeakMap();
const big = (x, label) => { ensure(quantity(x), 'Invalid Base RPC ' + label); return BigInt(x); };
function checkedCall(call) {
  ensure(call && address(call.to) && (call.data === '0x' || bytes(call.data)) && call.data.length <= 98306 && quantity(call.value), 'Base call input');
  return Object.freeze({to: call.to, data: call.data, value: call.value});
}
async function read(request, owner, call) {
  ensure(await request('eth_chainId', []) === BASE_CHAIN, 'Switch your wallet to Base mainnet');
  const [block, priority, nonce, estimate, balance] = await Promise.all([request('eth_getBlockByNumber', ['latest', false]), readPriorityFee(request),
    request('eth_getTransactionCount', [owner, 'pending']), request('eth_estimateGas', [{from: owner, ...call}]), request('eth_getBalance', [owner, 'latest'])]);
  const base = big(block?.baseFeePerGas, 'baseFeePerGas'), walletTip = big(priority, 'priority fee'), g = big(estimate, 'gas estimate');
  ensure(base > 0n && g > 0n, 'Invalid Base fee data');
  const room = MAX_FEE - base * 2n;
  ensure(room > 0n, 'Base network fees are unusually high right now. Nothing was sent; wait a few minutes and retry.');
  const tip = [walletTip, TIP_CAP, room].reduce((a, b) => a < b ? a : b), gas = (g * 125n + 99n) / 100n, maxFee = base * 2n + tip;
  ensure(gas <= MAX_GAS, 'This launch needs more gas than the guided flow allows on Base. Nothing was sent.');
  const fees = await baseDataFees(request, call.data === '0x' ? '0x00' : call.data, hex(gas));
  return {nonce, balance: big(balance, 'balance'), estimate: g, gas, tip, maxFee, base, fees};
}
export async function quoteBaseCall({request, owner, call: input, clock = Date.now}) {
  ensure(typeof request === 'function' && address(owner), 'Quote dependencies');
  const call = checkedCall(input), d = await read(request, owner, call), now = clock();
  const dataFee = 2n * (BigInt(d.fees.l1Wei) + BigInt(d.fees.operatorWei)), execution = d.gas * d.maxFee, maximumFee = execution + dataFee, required = maximumFee + BigInt(call.value);
  const transaction = Object.freeze({type: '0x2', chainId: BASE_CHAIN, from: owner, ...call, nonce: d.nonce, gas: hex(d.gas), maxFeePerGas: hex(d.maxFee), maxPriorityFeePerGas: hex(d.tip)});
  const quote = Object.freeze({chainId: '8453', nativeSymbol: 'ETH', feeAccounting: 'op-l1-data', estimatedGas: d.estimate.toString(), gas: d.gas.toString(),
    l1Wei: d.fees.l1Wei, operatorWei: d.fees.operatorWei, dataFeeWei: dataFee.toString(), executionWei: execution.toString(), maximumFee: maximumFee.toString(),
    requiredBalance: required.toString(), balance: d.balance.toString(), funded: d.balance >= required, reviewedAt: now, expiresAt: now + 120000, transaction});
  issued.set(quote, {owner, call});
  return quote;
}
export async function recheckBaseCall({request, quote, clock = Date.now}) {
  const b = issued.get(quote); ensure(b, 'Review a locally issued network quote');
  const now = clock(); ensure(now >= quote.reviewedAt && now < quote.expiresAt, 'Quote expired; review again');
  const d = await read(request, b.owner, b.call), t = quote.transaction;
  ensure(d.nonce === t.nonce, 'Wallet nonce changed; review again');
  ensure(d.estimate <= BigInt(t.gas), 'Gas requirement increased; review again');
  ensure(d.base + BigInt(t.maxPriorityFeePerGas) <= BigInt(t.maxFeePerGas), 'Network fee increased; review again');
  ensure(BigInt(d.fees.l1Wei) <= 2n * BigInt(quote.l1Wei) && BigInt(d.fees.operatorWei) <= 2n * BigInt(quote.operatorWei), 'Base data fees increased; review again');
  ensure(d.balance >= BigInt(quote.requiredBalance), 'Insufficient ETH balance');
  return t;
}
