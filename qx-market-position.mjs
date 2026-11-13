import {tradeRecordHeaders} from './qx-trade-record.mjs';
import {priceDigits} from './qx-price.mjs'; // the site's one price format
// walletpos (2026-11-12, Randall: "I don't see my buys on the chart either for rooq. Nor do I see my average entry or pnl.
// Or balance / held token amount and % of supply"). The panel now also takes chainPosition (qx-wallet-pnl.mjs: the
// connected wallet's own on-chain trades in this token, any venue, read on this device): held amount and % of supply read
// now, average entry, unrealised PnL in USD and in the quote, realised PnL from sells, and each trade as a "You" marker.
// A complete chain history (it explains the whole balance) leads; otherwise the signed-in ledger (QHooks trades) leads
// and the chain still gives the live balance and supply share. noticeTrades(): a trade by this wallet seen in the token's
// tape (any venue) re-reads the position at once.
const dollars=v=>v==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumSignificantDigits:5}).format(v);
const gain=(usd,pct)=>dollars(usd)+(pct==null?'':' · '+(pct>0?'+':'')+pct.toFixed(2)+'%');
const amount=(v,sym)=>v==null||!Number.isFinite(v)?null:(v>0?'+':v<0?'−':'')+Math.abs(v).toLocaleString('en-US',{maximumSignificantDigits:4})+' '+sym;
const perUnit=(v,sym)=>v==null||!Number.isFinite(v)?null:priceDigits(v)+' '+sym;
const percentOf=(v,held=0)=>v==null||!Number.isFinite(v)?'—':((v>0||held>0)&&v<0.0001?'<0.0001':v.toLocaleString('en-US',{maximumSignificantDigits:4}))+'%';
const sameTx=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();
// walletchains: what the chain position can say about its basis (qx-wallet-pnl.mjs costState)
const NOTE={complete:sym=>'From this wallet’s on-chain buys and sells of '+sym+', any venue. Approximate.',
  pending:sym=>'Balance read now. Entry and PnL refreshing: reading this wallet’s '+sym+' history.',
  limited:sym=>'Balance read now. This chain’s free endpoint doesn’t serve history this old, so entry and PnL aren’t available here.',
  none:sym=>'Balance read now. No buy of '+sym+' found in this wallet’s history (received by transfer, or bought with another token).'};
export function mountMarketPosition({h,after,getSelection,getOwner,ticket,onChange=()=>{},fetcher=(...a)=>fetch(...a),now=Date.now,headersFor=tradeRecordHeaders,chainPosition=null}) {
  const panel=h('section',{class:'qxt-card qxt-market-position',ariaLabel:'My position',hidden:true});after.after(panel);
  let key='',value=null,flight=0,lastRead=0,server=null,chain=null,seen=new Set(),seeded=false,paintedSym=null;
  function clear(){key='';value=null;server=null;chain=null;seen=new Set();seeded=false;flight++;lastRead=0;panel.hidden=true;panel.replaceChildren();onChange(null);}
  function combine(){
    if(chain?.complete)return {...chain,markers:mergeMarkers(chain.markers,server?.markers)};
    if(server?.quantity>0)return chain?{...server,quantity:chain.quantity,supplyPct:chain.supplyPct,valueUsd:chain.quantity===server.quantity?server.valueUsd:chain.valueUsd??server.valueUsd,markers:mergeMarkers(server.markers,chain.markers)}:server;
    if(chain?.quantity>0)return chain; // held and share of supply; the basis waits for a history that explains the balance
    return server||chain;
  }
  function mergeMarkers(a=[],b=[]){const out=[...(a||[])];for(const m of b||[])if(!out.some(x=>sameTx(x.tx,m.tx)&&x.side===m.side))out.push(m);return out.sort((x,y)=>x.at-y.at);}
  function paint(s,owner,next){
    const same=(a,b)=>s.chainId==='solana'?a===b:a?.toLowerCase()===b?.toLowerCase();
    const p=combine();value=p;paintedSym=s.symbol||'';panel.hidden=!(p?.quantity>0);panel.replaceChildren();
    const sym=s.symbol||p?.symbol||(s.token?s.token.slice(0,6)+'…'+s.token.slice(-4):'');
    if(!panel.hidden){
      const cell=(label,text,cls='')=>h('div',{},h('dt',{},label),h('dd',{class:cls},text));
      const actions=h('div',{class:'qxt-position-actions'},...[25,50,100].map(percent=>h('button',{type:'button',onclick:async()=>{
        if(next!==key||!same(getOwner(),owner))return;
        const buttons=actions.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
        try{await ticket.prefillSell({percent,owner,chainId:s.chainId,token:s.token,controller:s.controller,run:true});}
        finally{buttons.forEach(b=>b.disabled=false);}
      }},'Sell '+percent+'%')));
      const q=p.source==='chain'?p.quoteSymbol:null,est=p.complete?'':'Est. ';
      // the quote figure beside the dollars (chain positions): "+$108.42 · +20.03% · +0.05408 ETH"
      const withQuote=(text,v)=>[text,amount(v,q)].filter(Boolean).join(' · ');
      const rows=[];
      if(p.supplyPct!=null)rows.push(cell('Of supply',percentOf(p.supplyPct,p.quantity)));
      rows.push(cell('Avg entry',[dollars(p.averageEntryUsd),q&&p.averageEntryQuote!=null?perUnit(p.averageEntryQuote,q):null].filter(Boolean).join(' · ')));
      rows.push(cell(est+'Unrealised PnL',withQuote(gain(p.unrealizedUsd,p.unrealizedPercent),q?p.unrealizedQuote:null),p.unrealizedUsd<0?'down':'up'));
      rows.push(cell(est+'Realised PnL',withQuote(gain(p.realizedUsd,p.realizedPercent),q?p.realizedQuote:null),p.realizedUsd<0?'down':'up'));
      // DOM append() prints null as the text "null": only real nodes go in
      panel.append(...[h('h2',{},'My position'),h('p',{class:'qxt-position-size'},p.quantity.toLocaleString('en-US',{maximumSignificantDigits:8})+' '+sym,h('strong',{},dollars(p.valueUsd))),
        h('dl',{},...rows),
        p.source==='chain'?h('p',{class:'qxt-position-note'},NOTE[p.state||(p.complete?'complete':'pending')](s.symbol||p.symbol||'this token')):null,
        actions].filter(Boolean));
    }
    onChange(value);
  }
  async function refresh({force=false,rescan=false}={}) {
    const s=getSelection(),owner=getOwner();
    if(!s?.token||!owner){if(key)clear();return;}
    const external=s.kind==='external',account=s.chainId==='solana'?'solana:'+owner:owner;
    const same=(a,b)=>s.chainId==='solana'?a===b:a?.toLowerCase()===b?.toLowerCase();
    const next=[s.chainId,s.controller,s.token,account].join(':');
    if(next!==key){clear();key=next;}
    // the market's name can land after the position (an outside token's header loads on its own): repaint, don't re-read
    if(!force&&!rescan&&now()-lastRead<5000){if(value&&paintedSym!==null&&(s.symbol||'')!==paintedSym)paint(s,owner,next);return;}
    lastRead=now();const turn=++flight,live=()=>turn===flight&&next===key;
    const serverRead=(async()=>{
      try {
        const headers=headersFor(s.chainId,owner);
        const r=await fetcher('/api/terminal/position/'+s.chainId+'/'+(s.controller||s.token)+'?wallet='+encodeURIComponent(account)+(external?'&kind=token':''),{headers,cache:'no-store',signal:AbortSignal.timeout(8000)});
        if(!live())return;
        if(!r.ok){if(r.status===401||r.status===403)server=null;return;}
        const p=await r.json();if(!live()||!same(p.wallet,account)||String(p.chainId)!==String(s.chainId)||!same(p.token,s.token))return;
        server=p;
      }catch{} // Retain an already received position during a transient read failure.
    })();
    const chainRead=(async()=>{
      if(!chainPosition||s.chainId==='solana')return;
      try{const c=await chainPosition({chainId:s.chainId,token:s.token,wallet:owner,force:rescan,hintPriceUsd:Number.isFinite(s.priceUsd)?s.priceUsd:null});if(live()&&c)chain=c;}catch{}
    })();
    await Promise.allSettled([serverRead,chainRead]);
    if(!live())return;
    paint(s,owner,next);
  }
  /// The token's recent trades (tape, any venue): one by this wallet that this panel hasn't seen re-reads the position now.
  function noticeTrades(trades){
    const owner=getOwner(),s=getSelection();if(!owner||!s?.token||!Array.isArray(trades)||!lastRead)return false; // the first read checks the balance itself
    const mine=trades.filter(t=>t&&t.tx&&[t.trader,t.wallet,t.maker,t.from].some(w=>w&&String(w).toLowerCase()===String(owner).toLowerCase()));
    const fresh=mine.filter(t=>!seen.has(String(t.tx).toLowerCase())&&!(value?.markers||[]).some(m=>sameTx(m.tx,t.tx)));
    for(const t of mine)seen.add(String(t.tx).toLowerCase());
    if(!seeded){seeded=true;return false;} // trades already in the tape when the page opened are in that first read
    if(!fresh.length)return false;
    void refresh({force:true,rescan:true});
    return true;
  }
  return {refresh,clear,noticeTrades,get value(){return value;},element:panel};
}
