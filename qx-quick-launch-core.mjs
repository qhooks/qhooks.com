// Quick launch (one transaction through QSimpleLaunch) and the launch-idea cards on /create.
// Public configuration and pure helpers only: no DOM, wallet, storage or network.
// Cards are built from the existing launch styles (CREATE_STYLES / presetRules / makeBlocks in qx-create-plan.mjs) and the
// block catalog. A card is shown only on chains whose chains.mjs row names a QSimpleLaunch factory (`simpleLaunch`).
import {chainById} from './chains.mjs';
import {CREATE_STYLES,presetRules,makeBlocks,units} from './qx-create-plan.mjs';
import {BLOCKS} from './qx-block-catalog.mjs';
import {BLOCK_BITS} from './full-launch/packages/multichain-launch/launch-blocks.mjs';
import {nextChainFeePolicy} from './full-launch/packages/multichain/fees.mjs';

// QSimpleLaunch style numbers (QSimpleLaunch.sol NONE..FLYWHEEL_STYLE; server/simple-launch.mjs STYLE_NAMES).
export const SIMPLE_STYLE_IDS = Object.freeze({none: 0, fair: 1, degen: 2, community: 3, hours: 4, burn: 5, flywheel: 6});
// Anti-snipe lengths the factory accepts (LaunchParams.snipeSeconds; 0 means the 15 s default).
export const SNIPE_OPTIONS = Object.freeze([15, 60, 300, 600]);
// Preset for everything the person does not type: the site's default 1% creator LP fee, no first buy, no reserve,
// the connected wallet as creator.
export const QUICK_PRESET = Object.freeze({fee: 10000, buyQuote: '0', minTokensOut: '0', reserveBps: 0});
// launch((string,string,string,uint8,uint24,bytes32,uint256,uint256,uint32,address,uint16)) on the deployed factory.
export const LAUNCH_SELECTOR = '0x30583324';
// launch((…, uint16 reserveBps, bytes32 pqKey, bool lockRoles)) on the next generation (chains.mjs simpleLaunchNext.abi 'pq').
export const LAUNCH_SELECTOR_PQ = '0x00cadb72';
export const LAUNCHED_TOPIC = '0xb3dfc406bd21f3b0e4aec3411c79b38d392ec20d80835e456b24f42bc0ec245f';
export const META_LIMIT = 4096;
// Planning gas per style, measured on a Robinhood Chain fork (2026-11-08); a connected wallet's estimate replaces it.
export const PLANNING_GAS = Object.freeze({none: 600000, fair: 1100000, degen: 1100000, community: 1100000, hours: 1100000, burn: 1100000, flywheel: 2200000});

// Filter chips. A chip is shown only when at least one card on the selected chain carries it.
export const IDEA_GROUPS = Object.freeze([['all', 'All'], ['tokens', 'Tokens'], ['pools', 'Pools'], ['income', 'Income'], ['agents', 'Agents']]);

// Card copy. Every rule named here is set by the style's preset; nothing else is promised.
const ARB_CARD = {id: 'arb-burns', style: 'none', snipe: 15, group: 'tokens', name: 'Arb burns',
 what: 'Price gaps between pools buy and burn your token', why: 'A shared contract closes price gaps with other pools.'};
const CARDS = [
 {id: 'plain', style: 'none', snipe: 15, group: 'tokens', name: 'Plain token',
  what: 'Open trading from the first block. No tax, caps or launch games.',
  why: 'Nothing is taken from trades, so every holder trades on the same terms.'},
 {id: 'fair', style: 'fair', snipe: 15, group: 'pools', name: 'Fair start',
  what: 'A 15-second anti-snipe charge, then a 1% wallet cap and 30-second cooldown for ten minutes.',
  why: 'Bots can’t scoop up the supply in the opening seconds.'},
 {id: 'fair-slow', style: 'fair', snipe: 600, group: 'pools', name: 'Slow fair start',
  what: 'The anti-snipe charge fades over ten minutes, with the same wallet cap and cooldown.',
  why: 'A longer window for people to buy in before bots can.'},
 {id: 'hours', style: 'hours', snipe: 15, group: 'pools', name: 'Market hours',
  what: 'Small charges that follow US stock market sessions, plus a storm fee when the price swings.',
  why: 'Sharp swings and sandwich bots pay more than steady trading.'},
 {id: 'burn', style: 'burn', snipe: 15, group: 'tokens', name: 'Burn engine',
  what: 'Every buy burns 2%. A 2% tax goes fully to buybacks that burn.',
  why: 'Supply only goes down as people trade.'},
 {id: 'community', style: 'community', snipe: 15, group: 'income', name: 'Holder first',
  what: 'Selling right after buying costs up to 10%, fading over three days. A 2% tax funds buybacks.',
  why: 'Quick flips pay more; people who hold pay less.'},
 {id: 'arena', style: 'degen', snipe: 15, group: 'income', name: 'Pot arena',
  what: 'A 15% launch tax falling to 3%, a 1% burn per buy, a biggest-buy pot and a last-buyer clock.',
  why: 'Trading charges fill two pots that buyers compete for.'},
 {id: 'stakers', style: 'flywheel', snipe: 15, group: 'income', name: 'Stakers’ share',
  what: 'A 2% tax: part funds buybacks that anyone can run every 15 minutes, part goes to stakers and referrers.',
  why: 'Holders who stake receive a share of every trade charge.'},
];

const addressOf = v => { const a = typeof v === 'string' ? v.toLowerCase() : ''; return /^0x[0-9a-f]{40}$/.test(a) && BigInt(a) !== 0n ? a : null; };
/// The start-cap generation of QSimpleLaunch on a chain (chains.mjs simpleLaunchNext), or null while it isn't deployed.
/// This is the feature flag: with it, new launches use that factory and can pick a starting market cap.
export function startCapFactory(chainId) { return CLEAN_LIVE.has(String(chainId)) ? cleanFactory(chainId) : addressOf(chainById(chainId)?.simpleLaunchNext?.address); }
/// The clean-token launch contract on a chain (chains.mjs simpleLaunchClean: full ERC-20 per launch, no clone), or null.
export function cleanFactory(chainId) { return addressOf(chainById(chainId)?.simpleLaunchClean?.address); }
// Chains where the clean-token launch contract has code (positives only, so a later deploy is picked up on the next check).
const CLEAN_LIVE = new Set(), CLEAN_CHECKED = new Map(), CLEAN_INFLIGHT = new Map(); // chain → time of the last negative check (rechecked after 30 s)
/// Checks once per page whether this chain's clean-token launch contract is deployed; from then on new launches go to it.
/// getCode(address) → hex runtime. Resolves true when it is in use, and reports whether it just switched (`changed`).
export async function primeCleanFactory(chainId, getCode, {background = false} = {}) {
 const id = String(chainId), a = cleanFactory(id);
 if (!a) return {live: false, changed: false};
 if (CLEAN_LIVE.has(id)) return {live: true, changed: false};
 const checked = CLEAN_CHECKED.get(id);
 if (checked && Date.now() - checked < 30000) return {live: false, changed: false};
 // One read at a time per chain; callers share it.
 let job = CLEAN_INFLIGHT.get(id);
 if (!job) {
  job = Promise.resolve().then(() => getCode(a)).catch(() => '0x').then(code => {
   CLEAN_INFLIGHT.delete(id);
   if (typeof code === 'string' && /^0x[0-9a-fA-F]{2,}$/.test(code)) { CLEAN_LIVE.add(id); return {live: true, changed: true}; }
   CLEAN_CHECKED.set(id, Date.now());
   return {live: false, changed: false};
  });
  CLEAN_INFLIGHT.set(id, job);
 }
 // A recheck after a known "not yet" runs in the background: the cost read never waits on it.
 if (background && checked) return {live: false, changed: false};
 return job;
}
/// The QSimpleLaunch factory new launches go to on a chain, or null where none is deployed.
export function quickFactory(chainId) { return startCapFactory(chainId) || addressOf(chainById(chainId)?.simpleLaunch); }
/// True when new launches go to a factory whose launch() takes the post-quantum key fields.
export function pqFactory(chainId) { const c = chainById(chainId); return !!startCapFactory(chainId) && (CLEAN_LIVE.has(String(chainId)) ? c?.simpleLaunchClean?.abi : c?.simpleLaunchNext?.abi) === 'pq'; }

// ---- Starting market cap (start-cap generation; work/qhooks-startcap-20261108/DESIGN.md §1, §6) ----
// The creator picks steps 0..161 above the chain's standard start: each step is one 200-tick spacing (price x 1.0202).
// 0 is today's standard start. The steps ride in the high 16 bits of LaunchParams.snipeSeconds.
export const START_STEPS_MAX = 161, START_STEP_RATIO = 1.0202;
export const START_TIERS = Object.freeze([['standard', 'Standard', 0], ['floor', '$20K start', 20000], ['high', '$50K start', 50000], ['custom', 'Custom', null]]);
export const START_CAP_SELECTOR = '0xf691877e'; // startAt(uint256) -> (int24 tick0, uint256 startCap)
export const startAtCall = steps => START_CAP_SELECTOR + word(checkSteps(steps));
export function checkSteps(steps) {
 const n = Number(steps);
 if (!Number.isInteger(n) || n < 0 || n > START_STEPS_MAX) throw new TypeError('Choose a starting market cap between the standard start and 25x.');
 return n;
}
/// Steps for a USD target, from the chain's standard start cap in USD: round(ln(target / standard) / ln(1.0202)), 0..161.
export function stepsForUsd(targetUsd, standardUsd) {
 if (!(targetUsd > 0) || !(standardUsd > 0)) return 0;
 return Math.min(START_STEPS_MAX, Math.max(0, Math.round(Math.log(targetUsd / standardUsd) / Math.log(START_STEP_RATIO))));
}
/// Estimated cap after `steps` (display only; the factory's startAt is exact).
export const capAtSteps = (standard, steps) => standard * START_STEP_RATIO ** steps;
/// (tick0, startCap) from a startAt(steps) result.
export function readStartAt(result) {
 if (typeof result !== 'string' || !/^0x[0-9a-f]{128}$/i.test(result)) return null;
 const raw = BigInt('0x' + result.slice(2, 66)), tick = raw >= 1n << 255n ? raw - (1n << 256n) : raw;
 return {tick0: Number(tick), startCapWei: BigInt('0x' + result.slice(66, 130))};
}
/// "$4K", "$20K", "$1.2M" for chips and labels.
export function usdShort(v) {
 if (!(v > 0)) return '';
 return v >= 1e6 ? '$' + +(v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v);
}
/// Blocks a style switches on, from CREATE_STYLES and makeBlocks (the same source the guided flow uses).
export function styleBlocks(styleId, chainId = '4663') {
 const p = CREATE_STYLES.find(s => s.id === styleId);
 if (!p) return [];
 const cfg = {chainId: String(chainId), style: styleId, liquidity: '1', ...presetRules(styleId)};
 const mask = BigInt(JSON.parse(makeBlocks(cfg, '0x' + '1'.repeat(40))).mask);
 return BLOCKS.filter(b => b.id in BLOCK_BITS && (mask >> BigInt(BLOCK_BITS[b.id])) & 1n).map(b => ({id: b.id, name: b.name, line: b.line || ''}));
}
// Base prices with its own call quote (qx-base-call-fees.mjs: L1 data fee); the other chains with the shared next-chain quote.
export function quickFeeSupported(chainId) { if (String(chainId) === '8453') return true; try { nextChainFeePolicy(String(chainId)); return true; } catch { return false; } }
/// Launch-idea cards that deploy on this chain (none when the chain has no factory).
export function ideaCards(chainId, {chain: chainOverride} = {}) {
 if (!quickFactory(chainId)) return [];
 if (!quickFeeSupported(chainId)) return [];
 const cap = !!startCapFactory(chainId), chain = chainOverride || chainById(chainId), arb = chain?.arbRecapture;
 // Arb recapture card only where the executor trusts the factory new launches go to.
 const recap = !!arb?.executor && !!arb?.simpleLaunch && String(arb.simpleLaunch).toLowerCase() === quickFactory(chainId);
 const cards = recap ? [...CARDS, ARB_CARD] : CARDS;
 return cards.filter(c => c.style in SIMPLE_STYLE_IDS && CREATE_STYLES.some(s => s.id === c.style) && SNIPE_OPTIONS.includes(c.snipe) && (cap || !c.startUsd))
  .map(c => Object.freeze({...c, styleName: CREATE_STYLES.find(s => s.id === c.style).name, blocks: styleBlocks(c.style, chainId), chip: cap && c.startUsd ? 'Starts at ' + usdShort(c.startUsd) : null}));
}
export const ideaCard = (chainId, id) => ideaCards(chainId).find(c => c.id === id) || null;
export const visibleGroups = cards => IDEA_GROUPS.filter(([id]) => cards.length && (id === 'all' || cards.some(c => c.group === id)));

const enc = new TextEncoder();
const word = v => BigInt(v).toString(16).padStart(64, '0');
const hexOf = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
function stringTail(s) {const b = enc.encode(s), h = hexOf(b);return word(b.length) + h.padEnd(Math.ceil(h.length / 64) * 64, '0');}

/// Checks name, ticker and the token's meta JSON. Throws a plain sentence.
export function validateQuick({name, symbol, image = ''}) {
 const n = String(name ?? '').trim(), s = String(symbol ?? '').trim().toUpperCase();
 if (!n || !n.isWellFormed() || enc.encode(n).length > 64) throw new TypeError('Enter a token name, up to 64 characters.');
 if (!/^[A-Z0-9]{1,10}$/.test(s)) throw new TypeError('Use 1–10 letters or digits for the ticker.');
 if (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new TypeError('Choose a PNG, JPEG or WebP image.');
 const meta = quickMeta({image});
 if (enc.encode(meta).length > META_LIMIT) throw new TypeError('Choose a smaller image.');
 return {name: n, symbol: s, meta};
}
export const quickMeta = ({image = ''}) => JSON.stringify({...(image ? {image} : {}), launchedFrom: 'create-quick'});

/// Calldata for QSimpleLaunch.launch from the card preset and the three typed fields.
export function encodeQuickLaunch({name, symbol, image = '', style, snipe = 15, salt, steps = 0, startCap = false, pq = false, pqKey = null, lockRoles = false}) {
 const v = validateQuick({name, symbol, image});
 if (!(style in SIMPLE_STYLE_IDS)) throw new TypeError('Choose a launch idea.');
 if (!SNIPE_OPTIONS.includes(Number(snipe))) throw new TypeError('Choose a supported anti-snipe length.');
 if (!/^0x[0-9a-f]{64}$/i.test(salt || '')) throw new TypeError('Missing launch salt.');
 const st = checkSteps(steps);
 // Only the start-cap generation reads the high bits; the live factory refuses them, so never send them there.
 if (st && !startCap) throw new TypeError('A starting market cap needs the newer launch contract on this chain.');
 const key = pqKey == null ? null : String(pqKey).toLowerCase();
 if (key !== null && (!pq || !/^0x[0-9a-f]{64}$/.test(key) || BigInt(key) === 0n)) throw new TypeError('A post-quantum key needs the newer launch contract on this chain.');
 if (lockRoles && (!pq || key !== null)) throw new TypeError('Locking fee routing can’t be combined with a post-quantum key.');
 const tails = [stringTail(v.name), stringTail(v.symbol), stringTail(v.meta)], head = (pq ? 13 : 11) * 32;
 const offsets = [head, head + tails[0].length / 2, head + (tails[0].length + tails[1].length) / 2];
 const p = QUICK_PRESET;
 const tuple = offsets.map(word).join('') + word(SIMPLE_STYLE_IDS[style]) + word(p.fee) + salt.slice(2).toLowerCase() + word(p.buyQuote) + word(p.minTokensOut) +
  word(st * 65536 + Number(snipe)) + word(0) + word(p.reserveBps) + (pq ? (key ? key.slice(2) : word(0)) + word(lockRoles ? 1 : 0) : '') + tails.join('');
 return (pq ? LAUNCH_SELECTOR_PQ : LAUNCH_SELECTOR) + word(32) + tuple;
}

/// Launch fee from the factory's chain() result (word 3), or the chains.mjs value when the read is missing.
export function launchFeeWei(chainResult, chainId) {
 if (typeof chainResult === 'string' && /^0x[0-9a-f]{448}$/i.test(chainResult)) return BigInt('0x' + chainResult.slice(2 + 3 * 64, 2 + 4 * 64));
 return BigInt(chainById(chainId)?.launchFeeWei || 0);
}
/// What the person pays before the wallet prompt: exact launch fee plus network gas (an estimate).
export function quickCost({feeWei, gas, gasPriceWei, dataFeeWei = 0}) {
 const f = BigInt(feeWei), g = BigInt(gas), p = BigInt(gasPriceWei), network = g * p + BigInt(dataFeeWei); // + Base L1 data fee
 return {feeWei: f.toString(), gas: g.toString(), gasPriceWei: p.toString(), networkWei: network.toString(), totalWei: (f + network).toString(), valueWei: f.toString()};
}
/// Short ETH figure: 0.0002, 0.00004213 …
export function ethText(wei, digits = 6) {
 const w = BigInt(wei);
 if (w === 0n) return '0';
 const s = w.toString().padStart(19, '0'), whole = s.slice(0, -18), frac = s.slice(-18);
 const lead = frac.match(/^0*/)[0].length, keep = whole !== '0' ? digits : Math.min(18, lead + 3);
 const f = frac.slice(0, Math.max(keep, 1)).replace(/0+$/, '');
 return whole + (f ? '.' + f : '');
}
/// Token address from the receipt's Launched log, or null.
export function launchedToken(receipt, factory) {
 const log = (receipt?.logs || []).find(l => String(l.address).toLowerCase() === String(factory).toLowerCase() && String(l.topics?.[0]).toLowerCase() === LAUNCHED_TOPIC);
 return log ? '0x' + log.topics[2].slice(-40).toLowerCase() : null;
}
export const marketPath = (chainId, token) => '/terminal#m=' + chainId + ':' + token;
export const randomSalt = (rng = globalThis.crypto) => '0x' + hexOf(rng.getRandomValues(new Uint8Array(32)));
export {units};
