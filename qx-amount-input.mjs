// Shared parsing for editable token amounts. Display grouping never changes the exact base-unit value.
// stakesafe (2026-11-13): one message for every format problem, so a paste that can't be read says how to type it.
export const AMOUNT_FORMAT_HELP='Use numbers only, e.g. 1000000 or 1,000,000';
export function normalizeAmountInput(value){
 if(typeof value!=='string'||value.length>120)throw new TypeError(AMOUNT_FORMAT_HELP);
 // Underscores are digit grouping some wallets and docs use ("1_000_000").
 let s=value.trim();
 if(/^\d{1,3}(?:_\d{3})+(?:[.,]\d+)?$/.test(s))s=s.replace(/_/g,'');
 if(/[ \u00a0\u202f]/.test(s)){
  if(!/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?$/.test(s))throw new TypeError(AMOUNT_FORMAT_HELP);
  s=s.replace(/[ \u00a0\u202f]/g,'');
 }
 if(s.includes(',')&&s.includes('.')){
  if(/^\d{1,3}(?:,\d{3})+\.\d+$/.test(s))s=s.replace(/,/g,'');
  else if(/^\d{1,3}(?:\.\d{3})+,\d+$/.test(s))s=s.replace(/\./g,'').replace(',','.');
  else throw new TypeError(AMOUNT_FORMAT_HELP);
 }else if(s.includes(',')){
  if(/^[1-9]\d{0,2}(?:,\d{3})+$/.test(s))s=s.replace(/,/g,'');
  else if(/^\d*,\d+$/.test(s))s=s.replace(',','.');
  else throw new TypeError(AMOUNT_FORMAT_HELP);
 }
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))throw new TypeError(AMOUNT_FORMAT_HELP);
 return s;
}
export function parseAmountInput(value,decimals){
 if(!Number.isInteger(decimals)||decimals<0||decimals>36)throw new TypeError('Invalid token decimals');
 const s=normalizeAmountInput(value),[whole,fraction='']=s.split('.');
 if(fraction.length>decimals)throw new TypeError('Too many decimals');
 const raw=BigInt(whole||'0')*10n**BigInt(decimals)+BigInt((fraction+'0'.repeat(decimals)).slice(0,decimals)||'0');
 if(raw>(1n<<256n)-1n)throw new RangeError('Amount is too large');
 return raw;
}
