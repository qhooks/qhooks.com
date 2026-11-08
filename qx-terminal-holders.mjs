// One presentation contract for complete balances and partial account samples.
// Amount kinds are explicit: ERC-20 balance/rawAmount are raw; projection
// balances and Solana amount are already token units. No reads happen here.
const ZERO='0x'+'0'.repeat(40),DEAD='0x'+'0'.repeat(36)+'dead';
const decimalsOf=v=>{const n=typeof v==='string'&&/^\d{1,2}$/.test(v)?Number(v):v;return Number.isInteger(n)&&n>=0&&n<=36?n:null;};
const address=v=>typeof v==='string'&&v.startsWith('0x')?v.toLowerCase():v;
export const holderSource=(value,fallback='Public RPC')=>typeof value==='string'&&value.trim()?value.trim().slice(0,100):fallback;
function decimal(value){
 if(typeof value==='number')value=Number.isFinite(value)&&value>=0?value.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:36}):null;
 if(typeof value!=='string'||!/^\d{1,100}(?:\.\d{1,36})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.'),f=fraction.replace(/0+$/,'');
 return {n:BigInt(whole+f),scale:f.length,text:whole.replace(/^0+(?=\d)/,'')+(f?'.'+f:'')};
}
function raw(value,decimals){
 if(decimals===null||typeof value!=='string'||!/^\d{1,100}$/.test(value))return null;
 const s=value.padStart(decimals+1,'0');return decimal(decimals?s.slice(0,-decimals)+'.'+s.slice(-decimals):s);
}
export function formatHolderAmount(amount){
 if(!amount)return '—';const [whole,fraction='']=amount.text.split('.');const big=whole!=='0';let f=big?fraction.slice(0,2):(()=>{const lead=fraction.match(/^0*/)[0].length;return lead>=6?'':fraction.slice(0,Math.min(fraction.length,lead+4));})();f=f.replace(/0+$/,'');if(!big&&!f&&fraction&&/[1-9]/.test(fraction))return '<0.000001';return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(f?'.'+f:'');
}
const sum=values=>{const scale=Math.max(0,...values.map(v=>v.scale));return {n:values.reduce((n,v)=>n+v.n*10n**BigInt(scale-v.scale),0n),scale};};
const compare=(a,b)=>{const scale=Math.max(a.scale,b.scale),x=a.n*10n**BigInt(scale-a.scale),y=b.n*10n**BigInt(scale-b.scale);return x===y?0:x>y?-1:1;};
function share(amount,supply){
 if(!amount||!supply||supply.n===0n)return '—';
 const n=amount.n*10n**BigInt(supply.scale)*10000n/(supply.n*10n**BigInt(amount.scale));
 if(!n&&amount.n>0n)return '<0.01%';return (n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0')+'%';
}
function age(at,now){
 if(!Number.isSafeInteger(at)||at<=0||at>now+60000)return 'age not available';
 const s=Math.max(0,Math.floor((now-at)/1000));return(s<60?s+'s':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d')+' ago';
}
function labelsOf(market){
 const m=market.meta||{},labels={};
 const add=(value,label)=>{for(const a of Array.isArray(value)?value:[value])if(typeof a==='string')labels[address(a)]=label;};
 for(const [a,label]of Object.entries(m.holderLabels||{}))if(typeof label==='string'&&label.trim())add(a,label);
 for(const [key,label]of [['engine','Blocks engine'],['factory','Factory / hook'],['locks','Locked (QLocks)'],['auction','Opening auction'],['round','Contributor round'],['stakersVault','Stakers vault']])add(m[key],label);
 if(m.controller!==m.token)add(m.controller,'Launch contract');
 for(const [key,label]of [['locks','Locked (QLocks)'],['round','Contributor round'],['stakersVault','Stakers vault']])add(m.roles?.[key],label);
 for(const p of [...(m.pools||[]),...(market.token?.pools||[])]){add(p.address,'Pool / LP');add(p.key?.hooks,'Factory / hook');}
 add(m.manager,'Pool');add(market.token?.pool,'Pool / LP');add(ZERO,'Burned');add(DEAD,'Burned');
 return labels;
}
export function holderView({market={},sample=null,snapshot=null,now=Date.now()}={}){
 const kind=snapshot?'solana':sample?'evm':'own',m=market.meta||{},decimals=decimalsOf(snapshot?.decimals??m.decimals??market.token?.decimals??sample?.decimals),coverage=market.holderCoverage;
 const labels=labelsOf(market),input=snapshot?.rows||sample?.rows||market.holders||[];
 const complete=kind==='own'&&(coverage?.complete===true||!coverage&&market.complete===true)||kind==='evm'&&sample?.complete===true;
 let supply=snapshot?(raw(snapshot.rawSupply,decimals)||decimal(snapshot.supply)):null;
 supply||=decimal(market.summary?.supply??market.token?.supply??sample?.supply);
 if(!supply&&kind==='own')supply=raw(m.supply,decimals);
 const rows=input.map(row=>{
  const holder=address(row.holder||row.owner),account=row.account||null;
  let amount;
  if(kind==='solana')amount=raw(row.rawAmount,decimals)||decimal(row.amount);
  else if(kind==='own')amount=raw(row.balance,decimals)||decimal(row.units);
  else amount=row.balanceKind==='raw'||row.rawBalance!=null?raw(row.rawBalance??row.balance,decimals):decimal(row.balance??row.units);
  const explicit=typeof row.label==='string'&&row.label.trim()?row.label:null;
  const label=labels[address(account)]||labels[holder]||explicit;
  const providerShare=!supply&&Number.isFinite(row.sharePct)?(row.sharePct>0&&row.sharePct<0.01?'<0.01%':row.sharePct.toFixed(2)+'%'):null;
  return {...row,holder,account,amount,label,excluded:!!label||row.excludedFromHolderCount===true,amountText:formatHolderAmount(amount),shareText:providerShare||share(amount,supply)};
 });
 // Several Solana token accounts can have the same owner. Concentration ranks
 // owners, never accounts, and a labelled balance never enters their total.
 const owners=new Map();let unknown=false;
 for(const r of rows){if(r.excluded)continue;if(!r.amount){unknown=true;continue;}const values=owners.get(r.holder)||[];values.push(r.amount);owners.set(r.holder,values);}
 const top=[...owners.values()].map(sum).sort(compare).slice(0,10);
 const providerTop10=kind==='evm'&&Number.isFinite(sample?.top10Pct)?sample.top10Pct.toFixed(2)+'%':null;
 const top10=providerTop10||(unknown||!supply?'—':share(sum(top),supply));
 const count=complete&&Number.isSafeInteger(market.summary?.holders)&&market.summary.holders>=0?market.summary.holders:
  snapshot?.coverage?.globalHolderCount===true&&Number.isSafeInteger(snapshot.holderCount)&&snapshot.holderCount>=0?snapshot.holderCount:
  kind==='evm'&&Number.isSafeInteger(sample?.count)&&sample.count>=0?sample.count:null;
 const at=snapshot?.observedAt??sample?.observedAt??coverage?.observedAt??market.observedAt??market.synced?.at;
 const source=holderSource(snapshot?.source??sample?.source??coverage?.source??market.source,kind==='own'?'QHooks pool index':'Public RPC');
 const block=sample?.throughBlock??coverage?.throughBlock;
 const partial=!complete||count===null||new Set(rows.filter(r=>!r.excluded).map(r=>r.holder)).size<count;
 const shownCount=new Set(rows.map(r=>r.holder)).size;
 const scope=kind==='solana'?'Partial list from the largest token accounts':kind==='evm'&&sample?.label?sample.label+(partial&&count!==null?' · '+shownCount.toLocaleString('en-US')+' of '+count.toLocaleString('en-US')+' shown':''):partial?'Partial list: '+(block!=null?'holders seen at block '+block:'holder balances observed'):'Exact holder list'+(block!=null?' through block '+block:'');
 return {kind,rows,supply,count,partial,source,at,scope,summary:(count===null?'Holder count not available':'Holder wallets: '+count.toLocaleString('en-US'))+' · '+(providerTop10?'Top 10 holders: ':partial?'Top 10 non-labelled holders shown: ':'Top 10 (non-labelled): ')+top10+' of supply',detail:scope+' · '+age(at,now)+((snapshot?.stale||sample?.stale||coverage?.stale)?' · stale':''),next:kind==='evm'?sample?.next||null:null};
}
export function renderHolderView({h,who,link,short,chainId,view,onMore=null}){
 const sol=view.kind==='solana';
 if(!view.rows.length)return [h('p',{class:'qxt-empty'},'Refreshing holders…')];
 const cell=r=>{const td=who(chainId,r.holder,null,r.label);if(r.label&&!td.textContent.includes(r.label))td.append(h('span',{class:'qxt-tag'},r.label));return td;};
 return [h('p',{class:'qxt-data-scope'},view.summary),h('p',{class:'qxt-panel-freshness',role:'status'},view.detail),
  h('table',{class:'qxt-table'},h('thead',{},h('tr',{},...['#',sol?'Owner':'Holder',...(sol?['Token account']:[]),'Share','Amount',...(sol?['State']:[])].map(t=>h('th',{},t)))),
   h('tbody',{},...view.rows.map((r,i)=>h('tr',{},h('td',{},String(i+1)),cell(r),...(sol?[h('td',{},link(chainId,'/address/'+r.account,short(r.account)))]:[]),h('td',{},h('span',{class:'qxt-bar',style:'--w:'+Math.min(100,parseFloat(r.shareText.replace('<',''))||0)+'%'},r.shareText)),h('td',{title:r.amountText},r.amountText),...(sol?[h('td',{},r.state==='frozen'?'Frozen':'—')]:[]))))),
  ...(view.next&&onMore?[h('button',{type:'button',class:'qxt-more',onclick:event=>{event.currentTarget.disabled=true;event.currentTarget.textContent='Loading…';onMore();}},'Show next 100 holders')]:[])];
}
export function renderMarketHolders(options){return renderHolderView({...options,view:holderView(options)});}
