import {cashbackShare} from './qx-trade-fee-policy.mjs';
import {amountText,costIsCurrent,walletSpend,totalTicketFees} from './qx-ticket-cost-core.mjs';
export function mountTicketCosts({h,now=Date.now}) {
  if(!document.querySelector('link[href="/qx-ticket-cost.css"]'))document.head.append(h('link',{rel:'stylesheet',href:'/qx-ticket-cost.css'}));
  const element=h('section',{class:'qxt-costs',hidden:true,ariaLabel:'Trade costs'});
  const heading=h('strong',{class:'qxt-cost-heading'},'Trade costs'),list=h('dl',{class:'qxt-cost-summary'}),note=h('p',{class:'qxt-cost-note'});
  const full=h('dl',{}),detailNote=h('p',{class:'qxt-cost-note'}),details=h('details',{class:'qxt-cost-details'},h('summary',{},'Fee breakdown'),full,detailNote);
  element.append(heading,list,note,details);let record=null,network=null,context=null,rebate=null;
  const pair=(target,name,value,title='')=>target.append(h('dt',{},name),h('dd',{title},value));
  function paint(){
    element.hidden=!record;if(!record)return;
    list.replaceChildren();full.replaceChildren();
    const valid=costIsCurrent(record,context,now());details.hidden=!valid;heading.hidden=valid;
    if(!valid){heading.textContent='Refresh costs';note.textContent='Quote changed or is over 30s old. Refresh quote for current costs.';return;}
    heading.textContent='Trade costs';const c=record.context,p=record.platform,n=network||record.network,total=totalTicketFees(record,n);
    pair(list,'Minimum received',amountText(record.minimum,c.output),amountText(record.minimum,c.output,true));
    // The original ticket already shows known impact immediately above this card.
    // Only add the summary line if that original line is absent; do not alter trade output.
    const existing=element.parentElement?.querySelector('.qxt-out .qxt-impact');
    if(!existing?.getClientRects().length)pair(list,'Price impact',record.impactPct===null?'Unavailable':record.impactPct.toFixed(2)+'% · estimate');
    pair(list,'Total fees · '+total.state,total.groups.length?total.groups.map(g=>amountText(g.amount,g.asset)).join(' + '):'Not itemized',total.scope);
    if(record.cashback){const r=rebate||record.cashback;pair(list,'Cashback · claimable',amountText(r.amount,r.asset)+' · '+r.share+'% of fee');}
    else if(p.discountShare)pair(list,'Cashback',p.discountShare+'% of fee · already discounted');
    else pair(list,'Cashback','Not itemized for this route');
    note.textContent=total.scope+(total.state==='budget'?' Current gas price; transaction not simulated.':'');
    pair(full,'Route',record.route);
    pair(full,c.family==='evm'?'QHooks fee':'Platform fee',p.amount!==null?amountText(p.amount,p.asset)+' · '+(p.bps/100)+'%'+(p.included==='input'?' · within spend':p.included==='output'?' · from proceeds':' · included'):p.note||'Not itemized',p.amount!==null?amountText(p.amount,p.asset,true):'');
    pair(full,'Pool / route charges',record.pool);
    if(n.state==='loading')pair(full,'Network','Estimating…');
    else if(n.state==='estimated'){
      pair(full,'Network · '+(n.kind==='budget'?'gas-price budget':'estimate'),amountText(n.amount,n.asset),n.reason);
      if(n.setup)pair(full,'First-time setup',amountText(n.setup,n.asset)+' · budget');
      if(n.approval)pair(full,'Token approval',amountText(n.approval,n.asset)+' · budget');
      const spend=walletSpend(record,n);if(spend!==null)pair(full,'Wallet spend · estimate',amountText(spend,c.input),'Entered amount + network/setup/approval. Platform fee is already inside the amount.');
    }else if(n.state==='sol'){
      const sol={decimals:9,symbol:'SOL'};pair(full,'Network · estimate',n.amount===null?'Not itemized':amountText(n.amount,sol));
      pair(full,'Account rent / setup',n.setup===null?'Not itemized':amountText(n.setup,sol)+' · may be refundable');
    }else pair(full,'Network / setup',n.reason||'Unavailable · check wallet');
    detailNote.textContent=(n.reason?n.reason+'. ':'')+record.mev+'. Estimates can change before signing.';
  }
  return {element,set(value){record=value;network=null;rebate=null;context=value?.context;paint();},network(value,forRecord){if(record!==forRecord)return;network=value;paint();},cashback(share,forRecord){if(record!==forRecord||!record.cashback)return;rebate={...record.cashback,share,amount:cashbackShare(record.platform.amount,share===40)};paint();},context(value){context=value;paint();},tick(){paint();},clear(){record=null;network=null;context=null;paint();}};
}
