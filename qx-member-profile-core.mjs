// Public, wallet-owned identity. Wallet addresses remain the stable identity.
import {memberWallet} from './qx-member-wallet.mjs';
import {memberPicture} from './qx-member-picture.mjs';
export const MEMBER_PROFILE_LIMITS=Object.freeze({name:32,bio:280,image:220000,body:225000});
const fail=message=>{throw new TypeError(message);};
export function normalizeMemberLinks(value=[]){
 if(!Array.isArray(value)||value.length>4)return fail('Add up to four profile links.');
 return value.map(link=>{
  if(!link||typeof link.url!=='string'||link.url.length>200||/[\s\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u200e\u200f\u200b-\u200d\u2060\ufeff]/.test(link.url))return fail('Use a full HTTPS profile link.');
  let url;try{url=new URL(link.url);}catch{return fail('Use a full HTTPS profile link.');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.href.length>200)return fail('Use a full HTTPS profile link without credentials.');
  return{kind:url.hostname==='github.com'?'github':link.kind==='website'?'website':'other',url:url.href,verified:false};
 });
}
function text(value,label,max){
 if(value==null)return'';if(typeof value!=='string')return fail('Enter a valid '+label+'.');
 const clean=value.normalize('NFC').trim();
 if(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u200e\u200f\u200b-\u200d\u2060\ufeff]/.test(clean))return fail('Use plain text for your '+label+'.');
 if([...clean].length>max)return fail('Keep your '+label+' to '+max+' characters.');return clean;
}
export function normalizeMemberProfile(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))return fail('The profile could not be read.');
 if(value.shareHoldings!=null&&typeof value.shareHoldings!=='boolean')return fail('Choose whether to share your holdings.');
 return{version:1,name:text(value.name,'display name',MEMBER_PROFILE_LIMITS.name),bio:text(value.bio,'bio',MEMBER_PROFILE_LIMITS.bio),image:memberPicture(value.image),shareHoldings:value.shareHoldings===true,links:normalizeMemberLinks(value.links)};
}
export const memberProfilePath=wallet=>{const identity=memberWallet(wallet);if(!identity)return fail('Use a full EVM wallet address or a Solana profile identity.');return identity.path;};
export const CALLER_METHOD=Object.freeze({version:2,minimum:5,hitHours:24,qualityHours:[24,168],notes:[
 'Caller record v2 uses available stored call records across history, not the recent feed’s 30-day window. The wallet signs the thesis; QHooks records its entry quote separately at publication.',
 'A hit compares the entry quote with the first indexed launch trade at or after 24 hours, observed no later than1 hour beyond that target. The record shows the actual indexed timestamp, block and transaction. Missing, late and incomplete observations do not become price outcomes.',
 'Known creator and linked-to-creator calls remain excluded. An absent relationship label does not prove independence; external relationship and exit coverage is unsupported.',
 'Indexed first-day sales are shown separately. Selling does not erase the call’s price outcome. Hiding a call or removing launch metadata does not remove its retained record.',
 'At least five observed eligible 24h outcomes are needed to rank. Each caller shows observed, eligible and total record counts. Incomplete source sets withhold percentages and ranking.',
 'The median 24h/7d move uses only calls with both timely checkpoints. Each move is capped between −100% and +200%, then averaged per call before the median. Its completed sample count can differ from the 24h hit-rate sample.',
 'Market prices without a timed quote are shown on the call but not counted. Calls on a token with a QHooks pool are timed from that pool. Stored calls and board standing are unchanged.',
 'These are source price comparisons, not realized profit. Gas, slippage, taxes and position size are excluded. Thanks never changes caller rank. Physically erased database rows cannot be reconstructed from this record set.'
]});

// The existing wallet endpoint returns numeric indexed balances, not arbitrary JSON.
export function memberHoldingsObservation(value,wallet){
 if(!value||value.version!==1||typeof value.wallet!=='string'||value.wallet.toLowerCase()!==wallet?.toLowerCase()||!Array.isArray(value.positions))return null;
 if(value.positions.some(row=>!row||typeof row!=='object'||!/^\d+$/.test(String(row.chainId))||!/^0x[0-9a-f]{40}$/i.test(row.controller||'')||typeof row.balance!=='number'||!Number.isFinite(row.balance)||row.balance<0||typeof row.price!=='number'||!Number.isFinite(row.price)||row.price<0))return null;
 return value;
}
