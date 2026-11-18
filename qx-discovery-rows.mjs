// Discovery row presentation rules (2026-11-18). Pure helpers plus two tiny DOM painters, kept out of the row markup.
//  - Boosted only for an active boost; a paid DexScreener profile is a separate "DEX paid" label. Neither adds rank.
//  - A data column that fewer than 30% of the visible rows can fill is hidden (header and cells together).
//  - New pairs: rows whose pair age is known and over 72 h leave the New tab; a row with nothing observed yet
//    reads "First trade pending" instead of a line of dashes.
import {evidenceMetrics} from './qx-discovery-evidence.mjs';
const DASH='—';
const n=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const at=v=>{const t=typeof v==='number'?v:typeof v==='string'&&v.trim()?Date.parse(v):NaN;return Number.isFinite(t)&&t>0?t<1e12?t*1000:t:null;};
export const BOOST_MAX_AGE_MS=86400000;

/** Active boost: the pair says so (boosts.active > 0), or the row was matched against DexScreener's current
 * token-boosts top/latest lists (provenance.promoted) by an observation under 24 h old. Discovery through the
 * boosts list alone is not proof the boost is still running. */
export function activeBoost(row,now=Date.now()){
 if(!row||row.launch)return false;
 if(n(row.boosts?.active)>0)return true;
 if(row.provenance?.promoted!==true)return false;
 const seen=at(row.provenance?.promotedAt)??at(row.observedAt);
 return seen!==null&&seen<=now+5000&&now-seen<=BOOST_MAX_AGE_MS;
}
/** Paid DexScreener token profile (Enhanced Token Info), when the row data says so. */
export function dexPaid(row){
 if(!row||row.launch)return false;
 return row.dexPaid===true||row.provenance?.paidProfile===true||row.provenance?.discoverySource==='dexscreener_token_profiles';
}
export function promotionLabel(row,now=Date.now()){
 if(activeBoost(row,now))return {kind:'boost',text:'Boosted',title:'An active paid DexScreener boost, not a ranking'};
 if(dexPaid(row))return {kind:'paid',text:'DEX paid',title:'A paid DexScreener token profile, not a ranking'};
 return null;
}
export function paintPromotion(chip,vm,now=Date.now()){
 const label=promotionLabel(vm.row,now);chip.hidden=!label;
 if(!label){delete chip.dataset.kind;return;}
 if(chip.textContent!==label.text)chip.textContent=label.text;chip.title=label.title;chip.dataset.kind=label.kind;
}

// ---- columns ----
export const COLUMN_FILL_MIN=.3;
// Columns that may be hidden, with "can this row fill it". Token, price, safety and buy always show.
export const OPTIONAL_COLUMNS=Object.freeze({
 move:vm=>n(vm.numeric?.move)!==null,
 volume:vm=>n(vm.numeric?.volume)!==null||vm.volume!==DASH&&vm.volume!==undefined,
 liquidity:vm=>n(vm.numeric?.liquidity)!==null||vm.liquidity!==DASH&&vm.liquidity!==undefined,
 mcap:vm=>vm.mcap!==undefined&&vm.mcap!==DASH,
 holders:vm=>n(vm.numeric?.holders)!==null,
 txns:vm=>n(vm.numeric?.txns)!==null,
 makers:vm=>n(vm.numeric?.makers)!==null,
 top10:vm=>n(evidenceMetrics(vm.row).top10Pct)!==null,
 dev:vm=>n(evidenceMetrics(vm.row).devPct)!==null,
 riskgrid:vm=>{const m=evidenceMetrics(vm.row);return n(m.top10Pct)!==null||n(m.devPct)!==null||m.sameBlock===true||m.sharedFunding===true||n(vm.numeric?.holders)!==null;},
});
/** Pure: the optional column keys to hide for these visible view models. No rows → hide nothing. */
export function hiddenColumns(models,{min=COLUMN_FILL_MIN}={}){
 if(!models.length)return [];
 return Object.entries(OPTIONAL_COLUMNS).filter(([,fills])=>models.filter(vm=>{try{return fills(vm);}catch{return false;}}).length<min*models.length).map(([key])=>key);
}
// The density sheet's desktop tracks (>= 1100 px), in visual order. makers/riskgrid never take a desktop track.
export const DESKTOP_TRACKS=Object.freeze([['token','minmax(165px,1.65fr)'],['price','minmax(72px,.85fr)'],['mcap','minmax(72px,.8fr)'],['liquidity','minmax(68px,.75fr)'],['volume','minmax(72px,.8fr)'],['txns','minmax(74px,.8fr)'],['holders','minmax(64px,.65fr)'],['top10','minmax(48px,.5fr)'],['dev','minmax(44px,.45fr)'],['move','minmax(55px,.6fr)'],['safety','minmax(48px,.5fr)'],['buy','90px']]);
/** Pure: the desktop grid template for the columns left visible, or null when none of the desktop columns is hidden. */
export function desktopTemplate(off){
 const hidden=new Set(off);if(!DESKTOP_TRACKS.some(([key])=>hidden.has(key)))return null;
 return DESKTOP_TRACKS.filter(([key])=>!hidden.has(key)).map(([,track])=>track).join(' ');
}
/** Toggle qxfd-col-off-<key> on the table; qx-discovery-columns.css hides that column's th and td together and, on
 * desktop, rebuilds the grid from the visible tracks. A table without .qxfd-has-holders also drops the holders track. */
export function applyColumnVisibility(table,models,options){
 const off=new Set(hiddenColumns(models,options));
 for(const key of Object.keys(OPTIONAL_COLUMNS))table.classList.toggle('qxfd-col-off-'+key,off.has(key));
 const template=desktopTemplate([...off,...(table.classList.contains('qxfd-has-holders')?[]:['holders'])]);
 const dynamic=!!template&&[...off].some(key=>DESKTOP_TRACKS.some(([k])=>k===key));
 table.classList.toggle('qxfd-cols-dynamic',dynamic);
 if(dynamic)table.style.setProperty('--qxfd-cols',template);else table.style.removeProperty('--qxfd-cols');
 table.dataset.hiddenColumns=[...off].join(' ');
 return [...off];
}

// ---- new pairs ----
export const NEW_PAIR_MAX_HOURS=72;
/** Drop rows whose pair/pool age is known and over 72 h. Unknown age stays (it may be brand new). */
export function newPairsOnly(rows,{now=Date.now(),maxHours=NEW_PAIR_MAX_HOURS}={}){
 return rows.filter(row=>{const t=at(row.createdAt??row.pairCreatedAt);return t===null||t>now||now-t<=maxHours*3600000;});
}
/** Nothing observed yet: no price, move, volume, liquidity, cap, trades, wallets or holders. */
export function firstTradePending(vm){
 const x=vm.numeric||{};
 return [x.price,x.move,x.volume,x.liquidity,x.txns,x.makers,x.holders].every(v=>n(v)===null)&&(vm.mcap===undefined||vm.mcap===DASH);
}
export function paintFirstTradePending(node,vm,el){
 const pending=firstTradePending(vm);node.tr.classList.toggle('qxfd-first-trade-pending',pending);
 let note=node.cells.price.querySelector('.qxfd-pending-note');
 if(pending&&!note){note=el('span',{class:'qxfd-pending-note'},'First trade pending');node.cells.price.append(note);}
 if(note)note.hidden=!pending;
}
