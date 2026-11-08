const num=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
export const tapeIdentity=t=>t.id||[t.tx,t.logIndex??t.index??'',t.trader,t.ts,t.buy,t.token,t.quote,t.pool].join(':');
export function createTradeTape({limit=2000}={}){
 let key=null,rows=new Map(),frozen=null,queued=new Set(),updatedAt=null;
 return {
  ingest(selection,incoming,at=Date.now()){
   if(key!==selection){key=selection;rows=new Map();frozen=null;queued=new Set();updatedAt=null;}
   let received=false;for(const row of incoming){if(!row||!Number.isFinite(row.ts)||row.ts<=0||typeof row.tx!=='string')continue;const id=tapeIdentity(row);if(!rows.has(id)){received=true;if(frozen&&queued.size<limit)queued.add(id);}rows.set(id,{...row,id});}
   rows=new Map([...rows].sort(([,a],[,b])=>b.ts-a.ts).slice(0,limit));if(received)updatedAt=at;
   return this.status();
  },
  pause(){if(!frozen){frozen=[...rows.values()];queued.clear();}return this.status();},
  resume(){frozen=null;queued.clear();return this.status();},
  status(){return {paused:!!frozen,queued:queued.size,received:rows.size,updatedAt,limit};},
  rows(){return [...(frozen||rows.values())];},receivedRows(){return [...rows.values()];},
  filter(filters={},context={}){return filterTape(this.rows(),filters,context);},
 };
}
export function validateTapeFilters(raw={}){
 const out={wallet:String(raw.wallet||'').trim(),minUsd:'',maxUsd:'',minutes:Number(raw.minutes)||0,tracked:!!raw.tracked};
 if(out.wallet&&!/^(?:0x[\da-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(out.wallet))throw Error('Enter a complete wallet address.');
 for(const key of ['minUsd','maxUsd']){const value=String(raw[key]??'').trim();if(value&&!/^\d{1,12}(?:\.\d{1,8})?$/.test(value))throw Error('Use positive USD amounts.');out[key]=value;}
 if(out.minUsd&&out.maxUsd&&Number(out.minUsd)>Number(out.maxUsd))throw Error('Minimum value exceeds maximum.');
 if(![0,5,15,60,360,1440].includes(out.minutes))throw Error('Choose a tape time window.');return out;
}
export function filterTape(rows,raw={},context={}){
 const f=validateTapeFilters(raw),same=(a,b)=>!!a&&!!b&&(context.chainId==='solana'?a===b:String(a).toLowerCase()===String(b).toLowerCase()),now=context.now??Date.now()/1000;
 return rows.filter(t=>{
  if(context.side==='buy'&&!t.buy||context.side==='sell'&&t.buy)return false;
  if(context.side==='me'&&!same(t.trader,context.owner)||context.side==='creator'&&!same(t.trader,context.creator))return false;
  if(f.wallet&&!same(f.wallet,t.trader)||f.tracked&&!context.tracked?.[t.trader])return false;
  if(f.minutes&&(t.ts<now-f.minutes*60||t.ts>now+30))return false;
  const usd=num(t.valueUsd);return (!f.minUsd||usd!==null&&usd>=Number(f.minUsd))&&(!f.maxUsd||usd!==null&&usd<=Number(f.maxUsd));
 });
}
export function recentTraders(rows){
 const wallets=new Map();for(const t of rows){if(!t.trader)continue;let r=wallets.get(t.trader);if(!r){r={trader:t.trader,buys:0,sells:0,bought:0,sold:0,buyUsd:0,sellUsd:0,unknownValues:0,last:0};wallets.set(t.trader,r);}r[t.buy?'buys':'sells']++;r[t.buy?'bought':'sold']+=num(t.token)||0;if(num(t.valueUsd)===null)r.unknownValues++;else r[t.buy?'buyUsd':'sellUsd']+=t.valueUsd;r.last=Math.max(r.last,t.ts);}
 return [...wallets.values()].sort((a,b)=>b.buyUsd+b.sellUsd-a.buyUsd-a.sellUsd||b.last-a.last);
}
export function mountTapeControls({h,container,onChange=()=>{},onPause=()=>{}}){
 const min=h('input',{type:'text',inputmode:'decimal',placeholder:'Min $',ariaLabel:'Tape minimum USD value'}),max=h('input',{type:'text',inputmode:'decimal',placeholder:'Max $',ariaLabel:'Tape maximum USD value'}),wallet=h('input',{type:'text',placeholder:'Wallet address',ariaLabel:'Tape wallet address',autocomplete:'off',spellcheck:false});
 const minutes=h('select',{ariaLabel:'Tape time window'},...[[0,'All received'],[5,'Last 5m'],[15,'Last 15m'],[60,'Last 1h'],[360,'Last 6h'],[1440,'Last 24h']].map(([v,label])=>h('option',{value:String(v)},label))),tracked=h('input',{type:'checkbox',ariaLabel:'Only tracked wallets'}),pause=h('button',{type:'button'},'Pause tape'),apply=h('button',{type:'button'},'Apply'),clear=h('button',{type:'button'},'Clear');
 const status=h('span',{role:'status',ariaLive:'polite',class:'qxt-tape-status'}),message=h('span',{role:'status',ariaLive:'polite',class:'qxt-tape-error'});let filters=validateTapeFilters();
 const fields=h('div',{class:'qxt-tape-fields'},min,max,wallet,minutes,h('label',{},tracked,'Tracked only'),apply,clear),element=h('div',{class:'qxt-tape-tools'},h('details',{},h('summary',{},'Tape filters'),fields),pause,status,message);container.before(element);
 apply.addEventListener('click',()=>{try{filters=validateTapeFilters({minUsd:min.value,maxUsd:max.value,wallet:wallet.value,minutes:minutes.value,tracked:tracked.checked});message.textContent='';onChange();}catch(error){message.textContent=error.message;}});
 clear.addEventListener('click',()=>{min.value=max.value=wallet.value='';minutes.value='0';tracked.checked=false;filters=validateTapeFilters();message.textContent='';onChange();});
 pause.addEventListener('click',onPause);
 return {filters:()=>filters,element,status(value){pause.textContent=value.paused?'Resume · '+value.queued+(value.queued>=value.limit?'+':'')+' new':'Pause tape';pause.setAttribute('aria-pressed',String(value.paused));status.textContent=(value.paused?'Paused · ':'' )+value.received+' received'+(value.received===value.limit?' · limit '+value.limit:'')+' · '+(value.updatedAt?'last received '+new Date(value.updatedAt).toLocaleTimeString():'waiting for trades');},setWallet(value){wallet.value=value;apply.click();}};
}
