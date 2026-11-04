// Shared by the bot and Studio. Vendored normalizers are byte-for-byte owner source.
import {createLaunchRecipe, recipeChain} from './vendor/studio/public/trade-client/apps/marketplace-preview/l124-launch-recipe.mjs';
import {parseDecimalAmount} from './vendor/studio/public/trade-client/packages/crosschain/decimal-amount.mjs';
import {BLOCKS, PRESETS, AUCTION_CONFLICTS, AUCTION_ADDRESS} from './vendor/studio/public/qx-block-catalog.mjs';
import {BLOCK_BITS, emptyBlocks, blocksText, normalizeBlocks} from './vendor/studio/public/full-launch/packages/multichain-launch/launch-blocks.mjs';
import {qTokenPresetValues} from './vendor/studio/public/l162-qtoken-presets.mjs';

export const CHAIN_IDS = Object.freeze(['8453', '4663', '1', '42161', '56']);
export const PRESET_IDS = Object.freeze(PRESETS.filter(p => !p.hidden).map(p => p.id));
export const BLOCK_IDS = Object.freeze(BLOCKS.filter(b => !['payees', 'holderGate'].includes(b.id)).map(b => b.id));
export const REQUEST_FIELDS = Object.freeze(['chainId','name','ticker','image','preset','blocks','auctionMinutes','decimals','supply','tokens','quote','fee','graduation','notice','threshold','destinationFee']);
export const DEFAULTS = Object.freeze({decimals:'18', supply:'1000000', fee:'1', graduation:'manual', notice:'86400', threshold:'0', destinationFee:'0.5'});
const ensure = (v, m) => { if (!v) throw new TypeError(m); };
export function dataObject(input, allowed, required = []) {
  ensure(input && Object.getPrototypeOf(input) === Object.prototype, 'Expected a plain data object');
  const ds = Object.getOwnPropertyDescriptors(input), keys = Reflect.ownKeys(ds);
  ensure(keys.every(k => typeof k === 'string' && allowed.includes(k)) && required.every(k => keys.includes(k)), 'Unexpected or missing fields');
  const out = {};
  for (const k of keys) { const d = ds[k]; ensure(d.enumerable && Object.hasOwn(d, 'value'), 'Data properties required'); out[k] = d.value; }
  return out;
}
export function imageReference(value) {
  ensure(typeof value === 'string' && value.length <= 512 && !/[\s\u0000-\u001f\u007f]/u.test(value), 'Image must be a public HTTPS URL up to 512 characters');
  let u; try { u = new URL(value); } catch { throw new TypeError('Image must be a public HTTPS URL'); }
  // References are never fetched here. Reject literal local/private hosts and credentials.
  const host = u.hostname.toLowerCase();
  ensure(u.protocol === 'https:' && !u.username && !u.password && !u.hash && (!u.port || u.port === '443'), 'Image must use HTTPS without credentials, fragments or custom ports');
  ensure(host.includes('.') && !host.includes(':') && !/^[\d.]+$/.test(host) && host !== 'api.telegram.org' && !/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host), 'Image must name a public host; Telegram token URLs are not public references');
  ensure(u.href.length <= 512, 'Canonical image URL must be at most 512 characters');
  return u.href;
}
export function effectiveSettings(request) {
  const settings = {...DEFAULTS, ...request};
  if (request.graduation) {
    const p = qTokenPresetValues(request.chainId, request.graduation);
    for (const key of ['fee','notice','threshold','destinationFee']) if (!Object.hasOwn(request, key)) settings[key] = p[key];
  }
  return settings;
}
// Missing liquidity stays blank in the UI. Minimal positive amounts here ONLY exercise
// the authoritative validator for a partial request; they are never serialized or applied.
export function studioRecipe(request, {tokens, quote} = {}) {
  const s = effectiveSettings(request), decimals = Number(s.decimals);
  const minimum = decimals === 0 ? '1' : '0.' + '0'.repeat(decimals - 1) + '1';
  return createLaunchRecipe(s.chainId, {
    tokenName:s.name, symbol:s.ticker, decimals:s.decimals,
    totalSupply:parseDecimalAmount(s.supply, decimals),
    notice:s.notice, lpFeePpm:parseDecimalAmount(s.fee, 4),
    tokenAmount:s.tokens ?? tokens ?? minimum, quoteAmount:s.quote ?? quote ?? '1',
    graduationMode:({manual:'1',target:'0',stay:'2'})[s.graduation],
    threshold:s.threshold, destinationFeePpm:parseDecimalAmount(s.destinationFee, 4)
  });
}
export function selectedBlocks(request) {
  return request.blocks !== undefined ? request.blocks === 'none' ? [] : request.blocks.split(',') : (PRESETS.find(p => p.id === (request.preset || 'none'))?.on || []);
}
// Build a validation-only config using public catalog defaults, just like qx-blocks.
// Payees are never accepted from chat. Studio resolves @owner from its connected wallet.
export function blockConfig(request, owner = '0x000000000000000000000000000000000000a11c') {
  const on = selectedBlocks(request), preset = PRESETS.find(p => p.id === request.preset);
  if (!on.length) return '';
  const c = emptyBlocks(owner), quoteDecimals = recipeChain(request.chainId).quoteDecimals;
  const values = Object.fromEntries(BLOCKS.flatMap(b => b.params.map(p => [p.k, p.def])));
  const toBase=(human,decimals)=>{
    const s=String(human??'').trim();if(!/^\d*(\.\d*)?$/.test(s)||s===''||s==='.')return '0';
    const [i,f='']=s.split('.');return (BigInt(i||'0')*10n**BigInt(decimals)+BigInt((f+'0'.repeat(decimals)).slice(0,decimals)||'0')).toString();
  };
  Object.assign(values, preset?.set || {});
  if (request.auctionMinutes) values.auctionMin = request.auctionMinutes;
  const usesGuard = on.some(id => BLOCKS.find(b => b.id === id)?.guard);
  c.guardSeconds = usesGuard ? String((preset?.guardMin || 10) * 60) : '0';
  c.mask = on.filter(id => id in BLOCK_BITS).reduce((mask, id) => mask | 1n << BigInt(BLOCK_BITS[id]), 0n).toString();
  for (const b of BLOCKS) if (on.includes(b.id) && b.id !== 'openingAuction') for (const p of b.params) {
    let v = values[p.k];
    if (v === 'auto') {
      // Unknown quote is deferred to Studio. Use a positive quote for bound checking only.
      v = Number(request.quote || '1') * ({maxBuyPerBlock:0.005,buybackMax:0.01,clockMinBuy:0.001}[p.k] || 0);
    }
    if (p.unit === 'addr') c[p.k] = String(v).toLowerCase();
    else if (p.unit === 'quote') {
      c[p.k] = toBase(Number(v).toFixed(quoteDecimals).replace(/\.?0+$/,''),quoteDecimals);
    } else c[p.k] = String(Math.round(Number(v) * ({pct:100,supplyPct:100,sec:1,min:60,hr:3600,day:86400,raw:1})[p.unit]));
  }
  if (on.includes('antiSnipe') && BigInt(c.snipeDecay) > BigInt(c.guardSeconds)) c.snipeDecay = c.guardSeconds;
  if (on.includes('openingAuction')) {
    c.mask = (BigInt(c.mask) | 1n << BigInt(BLOCK_BITS.holderGate)).toString();
    c.gateToken = AUCTION_ADDRESS; c.gateMin = '1'; c.gateSeconds = String(Number(values.auctionMin) * 60);
  }
  return normalizeBlocks(blocksText(c));
}
export function normalizeRequest(input) {
  const d = dataObject(input, REQUEST_FIELDS, ['chainId','name','ticker']);
  for (const v of Object.values(d)) ensure(typeof v === 'string' && v.length <= 512, 'Launch fields must be bounded strings');
  ensure(CHAIN_IDS.includes(d.chainId), 'Choose a chain: base, robinhood, ethereum, arbitrum or bnb');
  if (d.image !== undefined) d.image = imageReference(d.image);
  ensure(d.preset === undefined || PRESET_IDS.includes(d.preset), 'Choose a public launch preset');
  ensure(!(d.preset !== undefined && d.blocks !== undefined), 'Choose preset or blocks, not both');
  if (d.blocks !== undefined) {
    const ids = d.blocks.split(',');
    ensure(d.blocks === 'none' || ids.length <= BLOCK_IDS.length && ids.every(id => BLOCK_IDS.includes(id)) && new Set(ids).size === ids.length, 'Choose unique supported block IDs (holderGate and payees require Studio)');
    d.blocks = d.blocks === 'none' ? 'none' : BLOCK_IDS.filter(id => ids.includes(id)).join(',');
  }
  const on = selectedBlocks(d);
  ensure(!on.includes('openingAuction') || !on.some(id => AUCTION_CONFLICTS.includes(id)), 'Opening auction conflicts with the selected blocks');
  if (d.auctionMinutes !== undefined) {
    const p = BLOCKS.find(b => b.id === 'openingAuction').params[0];
    ensure(on.includes('openingAuction') && /^(0|[1-9][0-9]*)$/.test(d.auctionMinutes) && Number(d.auctionMinutes) >= p.min && Number(d.auctionMinutes) <= p.max, 'Opening auction must be selected and last 5–1440 whole minutes');
  }
  ensure(d.graduation === undefined || ['manual','target','stay'].includes(d.graduation), 'Graduation must be manual, target or stay');
  const recipe = studioRecipe(d); // exact Studio name, ticker, decimals, amounts, fees, notice and target rules
  d.name = recipe.fields.tokenName; d.ticker = recipe.fields.symbol;
  blockConfig(d);
  return Object.freeze(Object.fromEntries(REQUEST_FIELDS.filter(k => Object.hasOwn(d,k)).map(k => [k,d[k]])));
}
