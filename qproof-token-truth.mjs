// Pure cached-evidence adapter. No fetch, wallet, storage, scan or creator inference.
import {chainById,BUILT} from './chains.mjs';
import {keccak,encode} from './lab-deploy-core.mjs';
import {qproofCheckMeaning,qproofCheckSummary} from './qproof-check-meanings.mjs';
const A=/^0x[0-9a-f]{40}$/i,H=/^0x[0-9a-f]{64}$/i,S=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,U=/^(0|[1-9][0-9]{0,77})$/;
const ZERO='0x'+'0'.repeat(40),SALT='0x'+'0'.repeat(64),MAX_U=(1n<<256n)-1n;
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v),has=(v,k)=>plain(v)&&Object.hasOwn(v,k);
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
const raw=v=>typeof v==='string'&&U.test(v)&&BigInt(v)<=MAX_U?BigInt(v):null;
const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const pct=v=>num(v)!==null&&v<=100?v:null;
const address=(v,chain)=>typeof v==='string'&&(chain==='solana'?S.test(v):A.test(v)&&v.toLowerCase()!==ZERO)?chain==='solana'?v:v.toLowerCase():null;
const same=(a,b,chain)=>address(a,chain)!==null&&address(a,chain)===address(b,chain);
const observed=(v,now)=>{const n=time(v);return n!==null&&n<=now+10000?n:null};
export function truthExplorer(chainId,value,type='address'){
 const id=String(chainId),chain=chainById(id),ok=type==='tx'?(id==='solana'?/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(value||''):H.test(value||'')):address(value,id)!==null;
 if(!ok)return null;
 const base=id==='solana'?'https://solscan.io':chain?.explorer;
 if(!base||!/^https:\/\//.test(base))return null;
 return base.replace(/\/$/,'')+'/'+(type==='tx'?'tx':id==='solana'?'account':'address')+'/'+value;
}
function sourceRefs(report,ids,now){
 const checks=Array.isArray(report?.checks)?report.checks.slice(0,80):[],receipts=Array.isArray(report?.receipts)?report.receipts.slice(0,64):[],out=new Map;
 for(const c of checks.filter(x=>plain(x)&&ids.includes(x.id)))for(const n of Array.isArray(c.evidence)?c.evidence:[]){
  if(!Number.isInteger(n)||n<0||n>=64)continue;
  const r=receipts.find((v,i)=>(Number.isInteger(v?.index)?v.index:i)===n);if(!r)continue;
  const status=r.status??r.httpStatus,hash=r.sha256??r.responseSha256,at=r.capturedAt;
  out.set(n,{receipt:n,provider:typeof r.provider==='string'?r.provider.slice(0,100):null,observedAt:observed(at,now)!==null?new Date(time(at)).toISOString():null,sha256:typeof hash==='string'&&/^[a-f0-9]{64}$/i.test(hash)?hash.toLowerCase():null,status:Number.isInteger(status)?status:null,backed:Number.isInteger(status)&&status>=200&&status<300&&/^[a-f0-9]{64}$/i.test(hash||'')&&observed(at,now)!==null});
 }
 return [...out.values()];
}
const checkList=report=>Array.isArray(report?.checks)?report.checks.slice(0,80).map(c=>plain(c)?c:{}):[];
const checkOf=(report,id)=>checkList(report).find(c=>c?.id===id);
function creatorFact(identity,subject,report){
 const value={state:'unknown',address:null,method:null,sources:[],conflicts:[],reportedRoles:{owner:address(report?.subject?.owner,subject.chainId),launchFeeRole:address(report?.subject?.launch?.creator,subject.chainId)}};
 if(!identity)return value;
 if(identity.version!==1||String(identity.chainId)!==subject.chainId||!same(identity.token,subject.token,subject.chainId))return{...value,conflicts:[{kind:'identity_subject_mismatch'}]};
 if(identity.state==='conflict')return{...value,state:'conflict',conflicts:Array.isArray(identity.conflicts)?identity.conflicts.slice(0,8):[]};
 value.conflicts=Array.isArray(identity.conflicts)?identity.conflicts.slice(0,8):[];
 const who=address(identity.address,subject.chainId),methods=['qproof-creator-binding','simple-launch-event'];
 if(identity.state!=='known'||!who||!methods.includes(identity.method)||!Array.isArray(identity.sources)||!identity.sources.length)return value;
 // Identification belongs to the canonical G4 adapter; this only checks binding.
 return{...value,state:'known',address:who,method:identity.method,sources:identity.sources.slice(0,8),conflicts:Array.isArray(identity.conflicts)?identity.conflicts.slice(0,8):[]};
}
function authority(report,kind,subject,now){
 const id=kind+'-authority',check=checkOf(report,id),sources=sourceRefs(report,[id],now),backed=sources.some(x=>x.backed),key=kind==='mint'?'mintAuthority':'freezeAuthority';
 const value={state:'unknown',label:'Unknown',reportedAt:null,address:null,reported:null,sources,meaning:subject.chainId==='solana'?'Missing authority data is not revoked.':'EVM tokens have no universal '+kind+'-authority getter; selector scans do not enumerate permission holders.'};
 if(subject.chainId!=='solana'){
  const ids=kind==='mint'?['fn-mint','gp-is_mintable']:['fn-blacklist','fn-pause','gp-is_blacklisted','gp-transfer_pausable'];
  return{...value,reported:checkList(report).filter(c=>ids.includes(c.id)).map(c=>({id:c.id,status:c.status,title:c.title})),sources:sourceRefs(report,ids,now)};
 }
 const direct=has(report?.subject,key)?report.subject[key]:has(report?.observations,key)?report.observations[key]:undefined;
 const revoked=check?.status==='clear'&&/\brevoked\b|no one can (?:mint|freeze)/i.test(String(check.title||'')+' '+String(check.detail||'')),at=observed(report?.retrievedAt,now),reportedAt=at===null?null:new Date(at).toISOString();
 const reportedAddress=address(check?.data?.address??check?.address,subject.chainId),reported=check?{id,status:check.status,title:check.title,address:reportedAddress,claim:revoked?'reported_revoked':reportedAddress?'reported_active':'unknown'}:null;
 if(direct!==undefined&&direct!==null&&!address(direct,subject.chainId))return{...value,reported};
 if(direct===null&&reportedAddress)return{...value,state:'conflict',reported,conflicts:[{kind:'authority_null_vs_address',address:reportedAddress}]};
 if(typeof direct==='string'&&reportedAddress&&!same(direct,reportedAddress,subject.chainId))return{...value,state:'conflict',reported,conflicts:[{kind:'authority_address_mismatch',addresses:[direct,reportedAddress]}]};
 if(backed&&address(direct,subject.chainId)&&revoked)return{...value,state:'conflict',reported,conflicts:[{kind:'authority_address_vs_reported_revocation',address:address(direct,subject.chainId)}]};
 if(backed&&direct===null)return{...value,state:'revoked',label:'Revoked',reportedAt,reported};
 if(backed&&direct===undefined&&revoked&&reportedAt)return{...value,state:'reported_revoked',label:'Revoked · per QProof report '+reportedAt,reportedAt,reported,meaning:'The dated QProof check reports revocation; the raw null authority was not retained in this cached report.'};
 if(backed&&(address(direct,subject.chainId)||reportedAddress))return{...value,state:'active',label:'Active',reportedAt,address:address(direct,subject.chainId)||reportedAddress,reported};
 // Missing/unbacked evidence stays unknown. Reported revocation never invents raw null.
 return{...value,reported};
}
function poolIdOf(key){try{return keccak('0x'+encode(['address','address','uint24','int24','address'],[key.currency0,key.currency1,key.fee,key.tickSpacing,key.hooks]))}catch{return null}}
function lpFact(report,subject,evidence,registry,now){
 const pool=report?.subject?.pool?.address??null,sources=sourceRefs(report,['lp-burn','liquidity'],now),value={state:'unknown',asset:null,lockContract:null,custodyContract:null,expiry:{state:'unknown',unixSeconds:null,iso:null},sources,limitations:[],reported:checkOf(report,'lp-burn')?{status:checkOf(report,'lp-burn').status,title:checkOf(report,'lp-burn').title}:null};
 if(!evidence)return{...value,limitations:['The report does not retain a bound LP lock contract, position and expiry.']};
 if(String(evidence.chainId??evidence.chain)!==subject.chainId||!same(evidence.token,subject.token,subject.chainId)||evidence.poolId!==pool&&evidence.pool!==pool)return{...value,conflicts:[{kind:'lp_subject_or_pool_mismatch'}]};
 const at=observed(evidence.readAt??evidence.observedAt,now),stale=at===null||now-at>300000;
 if(evidence.version===1&&evidence.removePath===false&&H.test(pool||'')){
  const owner=address(evidence.launchContract,subject.chainId),position=evidence.position,expected=chainById(subject.chainId)?.contracts?.manager;
  const known=(registry?.chains?.[subject.chainId]||[]).some(x=>same(x.address,owner,subject.chainId));
  if(at===null||!owner||!known||!same(evidence.poolKey?.hooks,owner,subject.chainId)||poolIdOf(evidence.poolKey)!==pool||!same(position?.owner,owner,subject.chainId)||!same(position?.manager,expected,subject.chainId)||position?.salt!==SALT||raw(position?.liquidity)===null||raw(position.liquidity)<=0n||!Number.isInteger(position?.tickLower)||!Number.isInteger(position?.tickUpper)||position.tickLower>=position.tickUpper||!['currency0','currency1'].some(k=>same(evidence.poolKey?.[k],subject.token,subject.chainId)))return{...value,conflicts:[{kind:'lp_position_binding_unavailable'}]};
  return{...value,state:'factory_custody',asset:{type:'v4-position',poolId:pool,manager:expected,owner,salt:SALT,tickLower:position.tickLower,tickUpper:position.tickUpper,liquidityRaw:position.liquidity},custodyContract:owner,expiry:{state:'not_applicable',unixSeconds:null,iso:null},stale,observedAt:at===null?null:new Date(at).toISOString(),sources:[{kind:'cached_lp_proof',path:'/api/v1/lp-proof',observedAt:evidence.readAt??null}],limitations:['This names one launch position; it does not prove every position in the pool is protected.','Factory custody has no dated unlock; no expiry timestamp is invented.']};
 }
 const asset=evidence.asset,lp=address(evidence.lockContract,subject.chainId),unit=evidence.expiry?.unit,seconds=raw(String(evidence.expiry?.value??''));
 const pair=asset?.type==='v2-lp-token'&&A.test(pool||'')&&same(asset.address,pool,subject.chainId),position=['v3-position','v4-position'].includes(asset?.type)&&asset.pool===pool&&address(asset.manager,subject.chainId)&&raw(asset.positionId)!==null;
 if(!lp||!(pair||position)||!Array.isArray(asset?.tokens)||asset.tokens.length!==2||!asset.tokens.some(t=>same(t,subject.token,subject.chainId))||unit!=='unix_seconds'||seconds===null||seconds>253402300799n||at===null||!plain(evidence.source)||evidence.source.kind!=='cached_onchain_lock')return{...value,conflicts:[{kind:'lp_lock_or_expiry_binding_unavailable'}]};
 const iso=new Date(Number(seconds)*1000).toISOString();
 return{...value,state:Number(seconds)*1000<=now?'unlock_time_passed':'position_locked',asset:{type:asset.type,address:asset.address??null,pool:asset.pool??pool,manager:asset.manager??null,positionId:asset.positionId??null,tokens:asset.tokens.slice(0,2)},lockContract:lp,expiry:{state:'known',unixSeconds:String(seconds),iso},observedAt:new Date(at).toISOString(),stale,sources:[evidence.source],limitations:['A named lock is not a claim that all pool liquidity is locked.','An elapsed unlock time does not prove a withdrawal occurred.']};
}
function holdersFact(report,subject,now){
 const h=report?.observations?.holders,supply=raw(report?.subject?.supply),sources=sourceRefs(report,['holders'],now),count={state:'unknown',value:null,basis:null},top10={state:'unknown',percent:null,numeratorRaw:null,denominatorRaw:supply===null?null:String(supply),denominatorBasis:supply===null?null:'reported_total_token_supply',exclusions:[],coverage:'unknown'},value={count,top10,sampledWallets:null,sources};
 const total=h?.holderCount??report?.observations?.holderCount;
 if(Number.isSafeInteger(total)&&total>=0)value.count={state:'reported',value:total,basis:h?.source==='GoPlus'||subject.chainId==='solana'?'provider_reported_holder_count':'reported_holder_count'};
 if(Number.isSafeInteger(h?.walletCount)&&h.walletCount>=0)value.sampledWallets=h.walletCount;
 if(h&&pct(h.top10Share)!==null&&supply!==null&&supply>0n){
  const isSol=subject.chainId==='solana',known=['GoPlus','Helius'].includes(h.source);
  value.top10={...top10,state:'reported',percent:h.top10Share,provider:h.source??null,denominatorRaw:isSol?String(supply):null,referenceSupplyRaw:String(supply),denominatorBasis:isSol?'reported_total_mint_supply':'provider_reported_supply_share_numeric_denominator_not_retained',exclusions:isSol?['pool','curve','burn','program','known_exchange']:['contract','burn','known_exchange'],coverage:known?'provider_returned_candidate_set':'unknown',meaning:'Top 10 eligible wallets in the returned candidate set; not a complete on-chain holder census.'};
  return value;
 }
 const share=(Array.isArray(report?.observations?.shares)?report.observations.shares:[]).find(x=>x?.label==='Top 10 wallets'&&x.source==='QHooks pool index'),numerator=raw(share?.raw);
 if(share&&numerator!==null&&supply!==null&&supply>0n&&numerator<=supply){
  const computed=Number(numerator*100000000n/supply)/1000000,reported=pct(share.share);
  value.top10={...top10,state:reported!==null&&Math.abs(reported-computed)>0.01?'conflict':'reported',percent:computed,reportedPercent:reported,numeratorRaw:String(numerator),denominatorBasis:'reported_total_token_supply',exclusions:['labelled_supply_buckets','excluded_index_accounts'],coverage:'partial_pool_index',meaning:'Indexed eligible wallet balances only; global top-10 coverage was not retained.'};
 }
 return value;
}
export function tokenTruth({subject,report=null,envelope={},creatorIdentity=null,liquidityEvidence=null,registry=null,now=Date.now()}={}){
 const chainId=String(subject?.chainId??''),token=address(subject?.token,chainId),chain=chainId==='solana'?'solana':chainById(chainId)?.key;
 if(!token||!chain||!Number.isFinite(now))throw TypeError('Supply an exact supported token subject.');
 const target={chainId,token},matches=!report||report.subject?.chain===chain&&same(report.subject?.address,token,chainId)&&['token','pool'].includes(report.subject?.type),selected=matches?report:null;
 const at=observed(selected?.retrievedAt,now),snapshot=selected?.snapshot,checkedAt=at===null?null:new Date(at).toISOString(),stale=envelope.stale===true||at===null||now-at>120000;
 const summary=qproofCheckSummary(selected),items=checkList(selected).map(c=>({...qproofCheckMeaning(c.id),title:typeof c.title==='string'?c.title:'Returned check',status:['danger','caution','clear','unknown','info'].includes(c.status)?c.status:'unknown',detail:typeof c.detail==='string'?c.detail:null,evidence:sourceRefs(selected,[c.id],now)}));
 const creator=creatorFact(creatorIdentity,target,selected),authorities={mint:authority(selected,'mint',target,now),freeze:authority(selected,'freeze',target,now)},liquidity=lpFact(selected,target,liquidityEvidence,registry,now),holders=holdersFact(selected,target,now),pool=selected?.subject?.pool?.address;
 return{version:1,kind:'qhooks-token-truth',subject:target,snapshot:{checkedAt,block:Number.isSafeInteger(snapshot?.block)?snapshot.block:null,slot:Number.isSafeInteger(snapshot?.slot)?snapshot.slot:null,stale},creator,authorities,liquidity,holders,checks:{...summary,items},links:{token:truthExplorer(chainId,token),pool:truthExplorer(chainId,pool),poolManager:H.test(pool||'')?truthExplorer(chainId,chainById(chainId)?.contracts?.manager):null,creator:truthExplorer(chainId,creator.address),mintAuthority:truthExplorer(chainId,authorities.mint.address),freezeAuthority:truthExplorer(chainId,authorities.freeze.address),lockContract:truthExplorer(chainId,liquidity.lockContract),custodyContract:truthExplorer(chainId,liquidity.custodyContract)},conflicts:[...(matches?[]:[{kind:'report_subject_mismatch'}]),...(creator.conflicts||[]),...(authorities.mint.conflicts||[]),...(authorities.freeze.conflicts||[]),...(liquidity.conflicts||[]),...(holders.top10.state==='conflict'?[{kind:'top10_reported_share_mismatch'}]:[])]};
}
export function truthSubjectFromReport(report){
 const chainId=report?.subject?.chain==='solana'?'solana':BUILT.find(c=>c.key===report?.subject?.chain)?.id;
 const token=address(report?.subject?.address,chainId);return chainId&&token&&['token','pool'].includes(report?.subject?.type)?{chainId,token}:null;
}
