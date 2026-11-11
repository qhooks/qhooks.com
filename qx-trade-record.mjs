// Trading visibility is optional. Recording never changes or repeats an executed trade.
import {authHeaders} from './qx-board-session.mjs';
export function tradeRecordHeaders(chainId,owner,{storage=()=>localStorage,now=Date.now}={}){
 if(String(chainId)!=='solana')return authHeaders();
 try{const s=JSON.parse(storage().getItem('qhooks:trader-session:v1')||'null');if(s?.wallet==='solana:'+String(owner).replace(/^solana:/,'')&&s.expiresAt>now()&&/^tp1_[0-9a-f]{64}$/.test(s.token||''))return {authorization:'Bearer '+s.token};}catch{}return {};
}
export function validateTradeThesis(value,side='buy'){
 if(!value)return '';
 if(side!=='buy'||typeof value!=='string'||/[\r\n\u2028\u2029]/.test(value)||[...value].length>140)throw Error('Keep the buy thesis to one line of 140 characters.');
 return value.trim();
}
export async function prepareTradeThesis({chainId,owner,token,side,thesis},{fetcher=(...a)=>globalThis.fetch(...a),headers=tradeRecordHeaders(chainId,owner)}={}){
 const text=validateTradeThesis(thesis,side);if(!text)return '';
 const response=await fetcher('/api/traders/thesis',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({token,side,thesis:text})});const b=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(response.status===401?'Sign in and turn on your public trading profile in Community to attach a thesis.':'This thesis cannot be posted. Remove other addresses, contact details or abusive text.');
 return b.thesis;
}
export async function recordTerminalTrade(trade,{fetcher=(...a)=>globalThis.fetch(...a),headers=tradeRecordHeaders(trade.chainId,trade.owner)}={}){
 if(!headers.authorization)return {recorded:false};
 const response=await fetcher('/api/traders/trades',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(trade)});
 return response.ok?response.json():{recorded:false};
}
