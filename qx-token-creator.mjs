const CHAINS={solana:'solana',robinhood:'4663',ethereum:'1',base:'8453',arbitrum:'42161',bnb:'56',elysium:'99901',monad:'143'};
const CREATOR_CHECKS=new Set(['creator-sells','creator-holdings','creator-fees']);
export const creatorChain=value=>CHAINS[String(value).toLowerCase()]||String(value);
const address=(value,chain)=>typeof value==='string'&&(chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value):/^0x[0-9a-f]{40}$/i.test(value)&&BigInt(value)!==0n)?chain==='solana'?value:value.toLowerCase():null;
const at=r=>{const v=Date.parse(r?.retrievedAt||r?.completedAt||'');return Number.isFinite(v)?v:null;};
export function boundCreatorReport(input,chain,token){
 const r=input?.report||input,s=r?.subject;
 return s?.type==='token'&&creatorChain(s.chain)===chain&&address(s.address,chain)===token?r:null;
}
// Creator identity is scoped to the token. A fee authority or a generic owner of
// an outside token is not substituted for its creator. Raw reports stay intact.
export function tokenCreatorTruth({chainId,token,market=null,reports=[]}={}){
 const chain=creatorChain(chainId),target=address(token,chain),bound=target?reports.map(r=>boundCreatorReport(r,chain,target)).filter(Boolean).sort((a,b)=>(at(b)||0)-(at(a)||0)):[];
 const indexed=target&&!market?.ext&&market?.meta?.kind==='simple'&&creatorChain(market?.meta?.chainId)===chain&&address(market?.meta?.token,chain)===target?address(market.meta.owner,chain):null;
 const candidates=[...(indexed?[{address:indexed,source:'QHooks launch index'}]:[]),...bound.map(r=>({address:address(r.subject.creator,chain),source:'QProof report',report:r})).filter(x=>x.address)];
 const identities=new Set(candidates.map(c=>c.address)),known=identities.size===1,creator=known?[...identities][0]:null;
 const match=known?candidates.find(c=>c.report&&c.address===creator):null,report=match?.report||bound[0]||null;
 const sale=match?.report.checks?.find(c=>c?.id==='creator-sells')||null;
 return {version:1,chainId:chain,token:target,method:known?(match?'qproof-creator-binding':'simple-launch-event'):null,sources:known?candidates.map(c=>({kind:c.report?'qproof-report':'simple-launch-index',reportId:c.report?.id||null,observedAt:c.report?.completedAt||null,address:c.address})):[],conflicts:identities.size>1?[...identities]:[],state:known?'known':'unknown',address:creator,source:known?match?'QProof report':'QHooks launch index':null,
  reason:identities.size>1?'Creator sources disagree':'Creator identity not returned',at:at(report),reportId:report?.id||null,sale:known?sale:null};
}
export function creatorCheckView(check,truth,report){
 if(!CREATOR_CHECKS.has(check?.id))return check;
 const bound=boundCreatorReport(report,truth.chainId,truth.token),who=address(bound?.subject?.creator,truth.chainId);
 if(truth.state==='known'&&who===truth.address)return check;
 const title=String(check.title||'Reported wallet observation').replace(/\bcreator\b/gi,'A wallet');
 return{...check,title:title+' · creator not confirmed',detail:String(check.detail||'').replace(/\bcreator\b/gi,'reported wallet')+' Creator attribution is unconfirmed: '+truth.reason+'.'};
}
export function creatorRiskView(raw,truth){
 if(!raw)return raw;const report=raw.creatorReport||raw,checks=Array.isArray(raw.checks)?raw.checks.map(c=>creatorCheckView(c,truth,report)):raw.checks;
 const flags=Array.isArray(raw.flags)?raw.flags.map(f=>truth.state!=='known'&&/\bcreator\b.*\b(sold|sells|holds|moved)\b/i.test(f)?f.replace(/\bcreator\b/gi,'A wallet')+' · creator not confirmed':f):raw.flags;
 // Keep the original overall risk level and all unrelated checks. Displaying an
 // unknown identity never clears a provider's warning or a sellability guard.
 return{...raw,checks,flags};
}
export function executionRiskView(checks,scan=null){
 if(!checks||checks.verdict!=='danger'||scan?.verdict==='danger')return checks;
 const failed=(checks.checks||[]).some(c=>c?.status==='danger'&&/sell/i.test(c.id));
 return failed?checks:{...checks,verdict:'caution'};
}
