// L81-C04 local proposal, lead-repaired structure, imports, direction and bounds.
import {parseDecimalAmount} from '../../packages/crosschain/decimal-amount.mjs';
import {normalizeSwapFields} from '../../packages/multichain-swap/swap-fields.mjs';

function record(value, names) {
 if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Plain form data required');
 const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
 if (keys.length !== names.length || keys.some(k => typeof k !== 'string' || !names.includes(k) || !descriptors[k].enumerable || !Object.hasOwn(descriptors[k], 'value'))) throw new TypeError('Exact enumerable data fields required');
 return Object.fromEntries(names.map(k => [k, descriptors[k].value]));
}
function address(value) {
 if (typeof value !== 'string' || value.length !== 42 || !/^0x[0-9a-f]{40}$/.test(value) || BigInt(value) === 0n) throw new TypeError('Canonical nonzero address required');
 return value;
}
export function readSwapForm(input, context) {
 const i = record(input, ['side', 'amount', 'slippageBps']);
 const c = record(context, ['token', 'currency0', 'currency1', 'tokenDecimals', 'quoteDecimals']);
 if (i.side !== 'buy' && i.side !== 'sell') throw new TypeError('Select buy or sell');
 for (const k of ['token', 'currency0', 'currency1']) address(c[k]);
 if (BigInt(c.currency0) >= BigInt(c.currency1) || ![c.currency0, c.currency1].includes(c.token)) throw new TypeError('Sorted token/quote pair required');
 for (const k of ['tokenDecimals', 'quoteDecimals']) if (!Number.isInteger(c[k]) || Object.is(c[k], -0) || c[k] < 0 || c[k] > 18) throw new TypeError('Decimals out of range');
 if (typeof i.amount !== 'string' || i.amount.length === 0 || i.amount.length > 100 || /[^0-9.]/.test(i.amount)) throw new TypeError('Decimal amount required');
 if (typeof i.slippageBps !== 'string' || i.slippageBps.length === 0 || i.slippageBps.length > 3 || /[^0-9]/.test(i.slippageBps) || String(Number(i.slippageBps)) !== i.slippageBps || Number(i.slippageBps) > 500) throw new TypeError('Slippage must be 0–500 basis points');
 const quote = c.token === c.currency0 ? c.currency1 : c.currency0;
 const currencyIn = i.side === 'buy' ? quote : c.token;
 const amountIn = parseDecimalAmount(i.amount, i.side === 'buy' ? c.quoteDecimals : c.tokenDecimals);
 return normalizeSwapFields({zeroForOne: currencyIn === c.currency0, amountIn, slippageBps: Number(i.slippageBps)});
}
