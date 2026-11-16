import {copyReviewContext,copyQuoteAllowed} from './qx-copy-review-core.mjs';
import {followedWallet} from './qx-followed-wallets-core.mjs';
export function createCopyTicketReview({search=globalThis.location?.search||'',fetcher=(...a)=>fetch(...a),headers=async(chain,owner)=>(await import('./qx-trade-record.mjs')).tradeRecordHeaders(chain,owner),now=Date.now}={}){
 const q=new URLSearchParams(search),requested=q.has('copy'),id=q.getAll('copy').length===1&&/^cr1_[0-9a-f]{64}$/.test(q.get('copy')||'')?q.get('copy'):null;let context=null,claimed=false,left=false;
 const error=()=>Error('Copy review changed or expired. Choose a new indexed buy in Copy settings.');
 async function request(chain,owner,path,body){const r=await fetcher('/api/copy-review/'+path,{method:body?'POST':'GET',cache:'no-store',credentials:'omit',redirect:'error',headers:{...await headers(chain,owner),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const b=await r.json().catch(()=>null);if(!r.ok)throw error();return b;}
 return {get active(){return requested&&!left;},get context(){return context;},get claimed(){return claimed;},clear(){left=true;context=null;claimed=false;},invalidate(){context=null;claimed=false;},
  async load({chainId,token,owner}){if(!requested||left)return null;if(!id||!owner)throw error();const raw=await request(chainId,owner,'ticket?id='+id),c=copyReviewContext(raw,now());if(!c||c.chainId!==String(chainId)||c.token!==token||c.owner!==followedWallet(owner))throw error();context=c;claimed=false;return c;},
  assert(quote,{owner,silent=false}={}){if(!requested||left)return;const c=context;if(!copyQuoteAllowed(c,quote,{owner,now:now(),silent})||quote.copyReviewId!==c.id)throw error();},
  async claim(quote,options){this.assert(quote,options);if(claimed)throw error();const c=context;const result=await request(c.chainId,options.owner,'claim',{id:c.id,chainId:c.chainId,token:c.token,side:quote.side,pay:quote.pay,amount:quote.a.toString(),slippageBps:quote.toleranceBps});if(!result?.ok||result.id!==c.id||context!==c||left)throw error();claimed=true;return c;}
 };
}
