// Quick launch (one transaction through QSimpleLaunch) and the launch-idea cards on /create.
// Public configuration and pure helpers only: no DOM, wallet, storage or network.
// Cards are built from the existing launch styles (CREATE_STYLES / presetRules / makeBlocks in qx-create-plan.mjs) and the
// block catalog. A card is shown only on chains whose chains.mjs row names a QSimpleLaunch factory (`simpleLaunch`).
import {chainById} from './chains.mjs';
import {CREATE_STYLES,presetRules,makeBlocks,units} from './qx-create-plan.mjs';
import {BLOCKS} from './qx-block-catalog.mjs';
import {BLOCK_BITS} from './full-launch/packages/multichain-launch/launch-blocks.mjs';

// QSimpleLaunch style numbers (QSimpleLaunch.sol NONE..FLYWHEEL_STYLE; server/simple-launch.mjs STYLE_NAMES).
export const SIMPLE_STYLE_IDS = Object.freeze({none: 0, fair: 1, degen: 2, community: 3, hours: 4, burn: 5, flywheel: 6});
// Anti-snipe lengths the factory accepts (LaunchParams.snipeSeconds; 0 means the 15 s default).
export const SNIPE_OPTIONS = Object.freeze([15, 60, 300, 600]);
// Preset for everything the person does not type: the site's default 1% creator LP fee, no first buy, no reserve,
// the connected wallet as creator.
export const QUICK_PRESET = Object.freeze({fee: 10000, buyQuote: '0', minTokensOut: '0', reserveBps: 0});
// launch((string,string,string,uint8,uint24,bytes32,uint256,uint256,uint32,address,uint16)) on the deployed factory.
export const LAUNCH_SELECTOR = '0x30583324';
export const LAUNCHED_TOPIC = '0xb3dfc406bd21f3b0e4aec3411c79b38d392ec20d80835e456b24f42bc0ec245f';
export const META_LIMIT = 4096;
// Planning gas per style, measured on a Robinhood Chain fork (2026-11-08); a connected wallet's estimate replaces it.
export const PLANNING_GAS = Object.freeze({none: 600000, fair: 1100000, degen: 1100000, community: 1100000, hours: 1100000, burn: 1100000, flywheel: 2200000});

// Filter chips. A chip is shown only when at least one card on the selected chain carries it.
export const IDEA_GROUPS = Object.freeze([['all', 'All'], ['tokens', 'Tokens'], ['pools', 'Pools'], ['income', 'Income'], ['agents', 'Agents']]);

// Card copy. Every rule named here is set by the style's preset; nothing else is promised.
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

/// The QSimpleLaunch factory for a chain, or null where none is deployed.
export function quickFactory(chainId) {
 const c = chainById(chainId), a = typeof c?.simpleLaunch === 'string' ? c.simpleLaunch.toLowerCase() : '';
 return /^0x[0-9a-f]{40}$/.test(a) && BigInt(a) !== 0n ? a : null;
}
/// Blocks a style switches on, from CREATE_STYLES and makeBlocks (the same source the guided flow uses).
export function styleBlocks(styleId, chainId = '4663') {
 const p = CREATE_STYLES.find(s => s.id === styleId);
 if (!p) return [];
 const cfg = {chainId: String(chainId), style: styleId, liquidity: '1', ...presetRules(styleId)};
 const mask = BigInt(JSON.parse(makeBlocks(cfg, '0x' + '1'.repeat(40))).mask);
 return BLOCKS.filter(b => b.id in BLOCK_BITS && (mask >> BigInt(BLOCK_BITS[b.id])) & 1n).map(b => ({id: b.id, name: b.name, line: b.line || ''}));
}
/// Launch-idea cards that deploy on this chain (none when the chain has no factory).
export function ideaCards(chainId) {
 if (!quickFactory(chainId)) return [];
 return CARDS.filter(c => c.style in SIMPLE_STYLE_IDS && CREATE_STYLES.some(s => s.id === c.style) && SNIPE_OPTIONS.includes(c.snipe))
  .map(c => Object.freeze({...c, styleName: CREATE_STYLES.find(s => s.id === c.style).name, blocks: styleBlocks(c.style, chainId)}));
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
export function encodeQuickLaunch({name, symbol, image = '', style, snipe = 15, salt}) {
 const v = validateQuick({name, symbol, image});
 if (!(style in SIMPLE_STYLE_IDS)) throw new TypeError('Choose a launch idea.');
 if (!SNIPE_OPTIONS.includes(Number(snipe))) throw new TypeError('Choose a supported anti-snipe length.');
 if (!/^0x[0-9a-f]{64}$/i.test(salt || '')) throw new TypeError('Missing launch salt.');
 const tails = [stringTail(v.name), stringTail(v.symbol), stringTail(v.meta)], head = 11 * 32;
 const offsets = [head, head + tails[0].length / 2, head + (tails[0].length + tails[1].length) / 2];
 const p = QUICK_PRESET;
 const tuple = offsets.map(word).join('') + word(SIMPLE_STYLE_IDS[style]) + word(p.fee) + salt.slice(2).toLowerCase() + word(p.buyQuote) + word(p.minTokensOut) +
  word(Number(snipe)) + word(0) + word(p.reserveBps) + tails.join('');
 return LAUNCH_SELECTOR + word(32) + tuple;
}

/// Launch fee from the factory's chain() result (word 3), or the chains.mjs value when the read is missing.
export function launchFeeWei(chainResult, chainId) {
 if (typeof chainResult === 'string' && /^0x[0-9a-f]{448}$/i.test(chainResult)) return BigInt('0x' + chainResult.slice(2 + 3 * 64, 2 + 4 * 64));
 return BigInt(chainById(chainId)?.launchFeeWei || 0);
}
/// What the person pays before the wallet prompt: exact launch fee plus network gas (an estimate).
export function quickCost({feeWei, gas, gasPriceWei}) {
 const f = BigInt(feeWei), g = BigInt(gas), p = BigInt(gasPriceWei), network = g * p;
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
