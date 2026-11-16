import {memberWallet} from './qx-member-wallet.mjs';
import {chainById} from './chains.mjs';
export const followedWallet=value=>memberWallet(String(value||'').trim(),{allowBareSolana:true})?.key||null;
export function followedAsset(chainId,address){
 const chain=String(chainId),token=String(address||'');
 if(chain==='solana')return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)?{chainId:chain,token}:null;
 return chainById(chain)&&/^0x[\da-f]{40}$/i.test(token)?{chainId:chain,token:token.toLowerCase()}:null;
}
export function followedTradeLinks(trade){
 const a=followedAsset(trade.chainId,trade.token);if(!a)return {buy:null,proof:null};
 return {buy:'/terminal?'+new URLSearchParams({t:a.chainId+':'+a.token,side:'buy'}),proof:'/qproof?'+new URLSearchParams({chain:a.chainId,q:a.token})};
}
export function followedActivityId(raw){
 const wallet=followedWallet(raw.wallet),asset=followedAsset(raw.chainId,raw.token),tx=String(raw.tx||'');
 if(!wallet||!asset||!['buy','sell'].includes(raw.side)||(asset.chainId==='solana'?!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(tx):!/^0x[\da-f]{64}$/i.test(tx)))return null;
 return 'activity:'+asset.chainId+':'+(asset.chainId==='solana'?tx:tx.toLowerCase())+':'+asset.token+':'+wallet+':'+raw.side;
}
export function normalizeFollowedTrade(raw){
 const wallet=followedWallet(raw.wallet),a=followedAsset(raw.chainId,raw.token),at=Number(raw.at),quantity=Number(raw.quantity);
 if(!wallet||!a||!['buy','sell'].includes(raw.side)||!Number.isSafeInteger(at)||at<=0||!Number.isFinite(quantity)||quantity<=0)return null;
 const tx=String(raw.tx||'');if(a.chainId==='solana'?!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(tx):!/^0x[\da-f]{64}$/i.test(tx))return null;
 const usd=typeof raw.usd==='number'&&Number.isFinite(raw.usd)&&raw.usd>=0?raw.usd:null;
 const key=[a.chainId,tx,a.token,wallet,raw.side].join(':');
 return {...a,id:key,wallet,tx,at,quantity,usd,side:raw.side,symbol:String(raw.symbol||'TOKEN').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,32),source:raw.source||'indexed',proofBadge:{state:'unknown',label:'QProof'},...followedTradeLinks(a)};
}
export function mergeFollowedTrades(sources,{limit=40,before=null,now=Date.now()}={}){
 const found=new Map();for(const rows of sources)for(const row of rows||[]){const t=normalizeFollowedTrade(row);if(!t||t.at>now+5000||before&&(t.at>before.at||t.at===before.at&&t.id>=before.id))continue;if(!found.has(t.id))found.set(t.id,t);}
 return [...found.values()].sort((a,b)=>b.at-a.at||(a.id===b.id?0:a.id<b.id?1:-1)).slice(0,limit);
}
export function followedAlertMode(mode,side,firstBuy=false){return mode==='all'||mode===side||mode==='first'&&side==='buy'&&firstBuy;}
