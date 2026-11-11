import {tradeRecordHeaders} from './qx-trade-record.mjs';
const dollars=v=>v==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumSignificantDigits:5}).format(v);
const gain=(usd,pct)=>dollars(usd)+(pct==null?'':' · '+(pct>0?'+':'')+pct.toFixed(2)+'%');
export function mountMarketPosition({h,after,getSelection,getOwner,ticket,onChange=()=>{},fetcher=(...a)=>fetch(...a),now=Date.now,headersFor=tradeRecordHeaders}) {
  const panel=h('section',{class:'qxt-card qxt-market-position',ariaLabel:'My position',hidden:true});after.after(panel);
  let key='',value=null,flight=0,lastRead=0;
  function clear(){key='';value=null;flight++;lastRead=0;panel.hidden=true;panel.replaceChildren();onChange(null);}
  async function refresh({force=false}={}) {
    const s=getSelection(),owner=getOwner();
    if(!s?.token||!owner){if(key)clear();return;}
    const external=s.kind==='external',account=s.chainId==='solana'?'solana:'+owner:owner;
    const same=(a,b)=>s.chainId==='solana'?a===b:a?.toLowerCase()===b?.toLowerCase();
    const next=[s.chainId,s.controller,s.token,account].join(':');
    if(next!==key){clear();key=next;}
    if(!force&&now()-lastRead<5000)return;
    lastRead=now();const turn=++flight;
    try {
      const headers=headersFor(s.chainId,owner);
      const r=await fetcher('/api/terminal/position/'+s.chainId+'/'+(s.controller||s.token)+'?wallet='+encodeURIComponent(account)+(external?'&kind=token':''),{headers,cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(turn!==flight||next!==key)return;
      if(!r.ok){if(r.status===401||r.status===403)clear();return;}
      const p=await r.json();if(turn!==flight||next!==key||!same(p.wallet,account)||String(p.chainId)!==String(s.chainId)||!same(p.token,s.token))return;
      value=p;panel.hidden=!(p.quantity>0);panel.replaceChildren();
      if(!panel.hidden){
        const cell=(label,text,cls='')=>h('div',{},h('dt',{},label),h('dd',{class:cls},text));
        const actions=h('div',{class:'qxt-position-actions'},...[25,50,100].map(percent=>h('button',{type:'button',onclick:async()=>{
          if(next!==key||!same(getOwner(),owner))return;
          const buttons=actions.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
          try{await ticket.prefillSell({percent,owner,chainId:s.chainId,token:s.token,controller:s.controller,run:true});}
          finally{buttons.forEach(b=>b.disabled=false);}
        }},'Sell '+percent+'%')));
        panel.append(h('h2',{},'My position'),h('p',{class:'qxt-position-size'},p.quantity.toLocaleString('en-US',{maximumSignificantDigits:8})+' '+s.symbol,h('strong',{},dollars(p.valueUsd))),
          h('dl',{},cell('Avg entry',dollars(p.averageEntryUsd)),cell((p.complete?'':'Est. ')+'Unrealised PnL',gain(p.unrealizedUsd,p.unrealizedPercent),p.unrealizedUsd<0?'down':'up'),cell((p.complete?'':'Est. ')+'Realised PnL',gain(p.realizedUsd,p.realizedPercent),p.realizedUsd<0?'down':'up')),actions);
      }
      onChange(value);
    }catch{} // Retain an already received position during a transient read failure.
  }
  return {refresh,clear,get value(){return value;},element:panel};
}
