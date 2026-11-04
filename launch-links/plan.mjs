import {effectiveSettings, normalizeRequest, selectedBlocks} from './rules.mjs';
export const FORM_IDS = Object.freeze(['ql-chain','ql-name','ql-symbol','ql-decimals','ql-supply','ql-token-funding','ql-quote-funding','ql-fee','ql-mode','ql-threshold','ql-notice','ql-destination-fee','ql-blocks']);
export function prefillGate({blocked=false,dirty=false,existingDraft=false,initialFingerprint,currentFingerprint,snapshot={}} = {}) {
  if (blocked || dirty || existingDraft || initialFingerprint !== currentFingerprint || snapshot.connected || snapshot.busy || snapshot.launch || snapshot.wrap) return 'Keep your current launch unchanged. Use a fresh Studio tab before connecting, restoring or editing a configuration.';
  return null;
}
// The real block picker's preset action preserves its payees. Even with every
// block disabled, a saved revenue recipient/vesting choice must not carry into
// a new social link silently. This reads PUBLIC configuration only.
export function neutralBlockDraft(text) {
  if(text === null)return true;
  try{
    if(typeof text!=='string'||text.length>40000)return false;
    const s=JSON.parse(text),p=s.payees;
    return s.preset==='none'&&Array.isArray(s.on)&&s.on.length===0&&Array.isArray(p)&&p.length===1&&p[0].addr==='@owner'&&p[0].pct===100&&Object.keys(p[0]).length===2;
  }catch{return false;}
}
export function prefillPlan(input) {
  const request = normalizeRequest(input), s = effectiveSettings(request);
  return Object.freeze({
    fields:Object.freeze({'ql-chain':s.chainId,'ql-name':s.name,'ql-symbol':s.ticker,'ql-decimals':s.decimals,'ql-supply':s.supply,'ql-token-funding':s.tokens || '','ql-quote-funding':s.quote || '','ql-fee':s.fee,'ql-mode':({manual:'1',target:'0',stay:'2'})[s.graduation],'ql-threshold':s.threshold,'ql-notice':s.notice,'ql-destination-fee':s.destinationFee}),
    preset:request.preset || 'none', blocks:request.blocks === undefined ? null : Object.freeze(selectedBlocks(request)),
    auctionMinutes:request.auctionMinutes, image:request.image
  });
}
export function describePlan(plan) {
  const f=plan.fields;
  return [
    ['Total supply',f['ql-supply']],['Decimals',f['ql-decimals']],
    ['Tokens for liquidity',f['ql-token-funding']||'Choose in Studio'],['Quote assets for liquidity',f['ql-quote-funding']||'Choose in Studio'],
    ['Creator LP fee',f['ql-fee']+'%'],['Destination LP fee',f['ql-destination-fee']+'%'],
    ['Graduation',({'0':'Quote-inflow target','1':'Owner-approved','2':'Keep original pool'})[f['ql-mode']]],
    ['Quote-inflow target',f['ql-threshold']],['Policy change notice',f['ql-notice']+' seconds'],
    ['Launch blocks',plan.blocks?plan.blocks.join(', ')||'None':plan.preset],
    ...(plan.auctionMinutes?[['Opening auction',plan.auctionMinutes+' minutes']]:[])
  ];
}
