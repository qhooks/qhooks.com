// Reuse the existing /lp-proof browser record. Holder mounts never start an LP RPC scan.
const ADDRESS=/^0x[0-9a-f]{40}$/,POOL=/^0x[0-9a-f]{64}$/,ZERO_SALT='0x'+'0'.repeat(64);
export const HOLDER_LP_MAX_AGE_MS=300000;
export function holderLpProof({chainId,token,factory,poolId=null,registry,storage,now=Date.now()}={}){
 const chain=String(chainId),asset=String(token||'').toLowerCase(),owner=String(factory||'').toLowerCase(),pool=POOL.test(String(poolId||'').toLowerCase())?String(poolId).toLowerCase():null;
 if(!/^\d{1,6}$/.test(chain)||!ADDRESS.test(asset)||!ADDRESS.test(owner)||!Number.isSafeInteger(now)||!(registry?.chains?.[chain]||[]).some(c=>String(c.address).toLowerCase()===owner))return null;
 try{storage??=globalThis.localStorage;}catch{return null;}if(!storage?.getItem)return null;
 const keys=[...(pool?[chain+':'+pool]:[]),chain+':'+asset,'official'];
 for(const key of keys){try{
  const raw=storage.getItem('qhooks.lpp.v1:'+key);if(!raw||raw.length>262144)continue;const saved=JSON.parse(raw),body=saved?.body?.one?.ok===true?saved.body.one.body:null;
  if(!body||body.version!==1||!Number.isSafeInteger(saved.at)||saved.at>now+5000||now-saved.at>HOLDER_LP_MAX_AGE_MS)continue;
  const readAt=typeof body.readAt==='string'?Date.parse(body.readAt):NaN;if(!Number.isSafeInteger(readAt)||readAt>now+5000||now-readAt>HOLDER_LP_MAX_AGE_MS||readAt>saved.at+5000)continue;
  const candidates=Array.isArray(body.pools)?body.pools:[body];if(candidates.length>25)continue;const matches=new Map();let conflict=false;
  for(const p of candidates){
   if(String(p?.chain)!==chain||p.token!==asset||!POOL.test(p.poolId||'')||pool&&p.poolId!==pool||p.launchContract!==owner||p.removePath!==false||p.position?.owner!==owner||p.position.salt!==ZERO_SALT||! /^(?:[1-9]\d{0,99})$/.test(p.position.liquidity||''))continue;
   const record={chainId:chain,token:asset,poolId:p.poolId,factory:owner,liquidity:p.position.liquidity,readAt,source:'/api/v1/lp-proof',text:'No remove or withdraw function',href:'/lp-proof?'+new URLSearchParams({chain,pool:p.poolId})},prior=matches.get(p.poolId);if(prior&&prior.liquidity!==record.liquidity)conflict=true;matches.set(p.poolId,record);
  }
  if(!conflict&&matches.size===1)return [...matches.values()][0];
 }catch{}}
 return null;
}
