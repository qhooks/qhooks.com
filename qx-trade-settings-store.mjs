// Keep the existing logical keys. Original device-wide records remain untouched migration defaults.
export const QUICK_KEY='qhooks:terminal:quick';
export const QUICK_DEFAULTS=Object.freeze({usd:'10',eth:'0.01',bnb:'0.05',hype:'0.1',sol:'0.1'});
const identity=owner=>/^0x[0-9a-f]{40}$/i.test(owner||'')?owner.toLowerCase():owner?String(owner):'device';
export function scopedTradingStorage(storage,{owner=()=>null}={}){
 const scoped=key=>key+':wallet:'+encodeURIComponent(identity(owner()));
 return {getItem(key){const who=identity(owner()),migration='qhooks:trade-settings:legacy-owner:v1';let legacyOwner=storage?.getItem(migration);if(!legacyOwner&&/^0x[0-9a-f]{40}$/i.test(who)){legacyOwner=who;try{storage?.setItem(migration,who);}catch{}}const own=storage?.getItem(scoped(key));if(own!==null&&own!==undefined)return own;if(key==='qhooks:exit-after-buy:v2'&&who!=='device'&&who!==legacyOwner)return null;const device=storage?.getItem(key+':wallet:device');return device??storage?.getItem(key)??null;},setItem(key,value){if(!storage?.setItem)throw Error('Settings could not be saved on this device.');storage.setItem(scoped(key),String(value));},removeItem(key){storage?.removeItem(scoped(key));}};
}
const positive=value=>typeof value==='string'&&/^(?:0|[1-9]\d{0,11})(?:\.\d{1,18})?$/.test(value)&&/[1-9]/.test(value);
export function quickAmounts(storage,chain){let record={};try{record=JSON.parse(storage?.getItem(QUICK_KEY)||'{}')||{};}catch{}const values={...QUICK_DEFAULTS};for(const k of Object.keys(values)){if(positive(record[k]))values[k]=record[k];if(positive(record.chains?.[chain]?.[k]))values[k]=record.chains[chain][k];}return values;}
export function saveQuickAmounts(storage,chain,values){for(const v of Object.values(values))if(!positive(v))throw Error('Enter positive quick-buy amounts with up to 18 decimal places.');let record={};try{record=JSON.parse(storage?.getItem(QUICK_KEY)||'{}')||{};}catch{}record={...record,chains:{...record.chains,[chain]:{...record.chains?.[chain],...values}}};storage.setItem(QUICK_KEY,JSON.stringify(record));return quickAmounts(storage,chain);}
export const quickUnit=chain=>chain==='solana'?'sol':String(chain)==='56'?'bnb':String(chain)==='99901'?'hype':String(chain)==='5042'?'usd':'eth';
export const QUICK_UNITS=Object.freeze({usd:'USDC',eth:'ETH',bnb:'BNB',hype:'HYPE',sol:'SOL'});
