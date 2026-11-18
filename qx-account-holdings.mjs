import {mountPortfolioSelling} from './qx-portfolio-row-trade.mjs';
import {keyedReplace} from './qx-keyed-rows.mjs';
import {portfolioReader} from './qx-portfolio-read.mjs';
import {mergePortfolios,renderHoldingRows,money,liveFeed,applyLive,portfolioReadLabel} from './qx-portfolio.mjs';
import {allocatePortfolioBasis} from './qx-holding-basis.mjs';
import {isTestRow} from './qx-portfolio-tabs.mjs';
import {outsideCosts} from './qx-wallet-pnl.mjs';
// The same report, cost allocation and actual row renderer as /portfolio.
export function mountAccountHoldings({h,owner,connected,root,total,fetchImpl=globalThis.fetch,solAddress=()=>null,storage,costs=outsideCosts()}={}){
 const reader=portfolioReader({fetchImpl,storage}),list=h('div',{class:'pf6-list',role:'list','aria-label':'Your holdings'}),status=h('p',{class:'qa-status',role:'status'}),filters=h('div',{class:'pf6-filters'});
 total.textContent='Reading total…';
 const seller=mountPortfolioSelling({h,getOwner:()=>connected()===owner()?owner():null,fetchImpl});
 let hideDust=true,hideTests=true,current=null,serial=0,disposed=false,activeOwner=null,activeSol=null,targetsNow=[],progressive=new Map();
 const dust=h('button',{type:'button',class:'pf6-chip','aria-pressed':'true',onclick:()=>{hideDust=!hideDust;dust.setAttribute('aria-pressed',String(hideDust));paint();}},'Hide dust');
 const tests=h('button',{type:'button',class:'pf6-chip','aria-pressed':'true',onclick:()=>{hideTests=!hideTests;tests.setAttribute('aria-pressed',String(hideTests));paint();}},'Hide tests');
 const refresh=h('button',{type:'button',class:'qa-btn',onclick:()=>void load(true)},'Refresh');filters.append(dust,tests,refresh);root.replaceChildren(filters,status,list);
 function paint(){if(!current)return;const natives=Object.fromEntries(current.chains.map(c=>[c.chainId,c.native])),rows=current.rows.filter(r=>r.units>0&&!r.spam&&(!hideDust||r.valueUsd==null||r.valueUsd>=1)&&(!hideTests||!isTestRow(r)));
  keyedReplace(list,(rows.length?renderHoldingRows(rows,{h,natives,owner:owner(),mine:connected()===owner(),chain:'all',onSell:(row,p,trigger)=>seller.begin(row,p,trigger)}):[h('p',{class:'qa-empty'},'No holdings match these filters.')])); // G2: keyed rows, logos kept
  seller.attach(list);total.textContent=money(current.valueUsd)+' · all chains';status.textContent=portfolioReadLabel(current.at)+(current.partial?' · Partial reading: some balances or prices are unavailable.':'');
 }
 const stopReports=reader.subscribe(({family,owner:who,report})=>{if(disposed||activeOwner!==owner()||activeSol!==solAddress()||!targetsNow.some(([f,a])=>f===family&&a===who))return;
  const local=structuredClone(report);if(who===activeOwner)costs?.apply(local);progressive.set(who,local);current=mergePortfolios([...progressive.values()].map(allocatePortfolioBasis));if(progressive.size<targetsNow.length)current.partial=true;paint();
 });
 async function load(force=false){const mine=++serial,w=owner(),s=solAddress(),changed=w!==activeOwner||s!==activeSol;activeOwner=w;activeSol=s;
  if(changed){current=null;targetsNow=[];progressive=new Map();list.replaceChildren();total.textContent='Reading total…';seller.changed();}
  if(!w&&!s){current=null;targetsNow=[];progressive=new Map();total.textContent='Connect to see your total';status.textContent='Connect your wallet to see your holdings.';list.replaceChildren();return;}
  const targets=targetsNow=[w&&['evm',w],s&&['solana',s]].filter(Boolean),cached=targets.map(([f,a])=>reader.cached(f,a)?.report).filter(Boolean);for(const r of cached)if(r.address===w)costs?.apply(r);if(cached.length){current=mergePortfolios(cached.map(allocatePortfolioBasis));paint();}else status.textContent='Reading holdings…';
  progressive=new Map(cached.map(r=>[r.address,r]));
  const results=await Promise.allSettled(targets.map(([f,a])=>reader.read(f,a,{force})));if(disposed||mine!==serial||w!==owner()||s!==solAddress())return;
  const reports=results.map((r,i)=>r.status==='fulfilled'?r.value:reader.cached(...targets[i])?.report).filter(Boolean);if(!reports.length){status.textContent='Holdings could not be read. Refresh to retry.';return;}
  for(const r of reports)if(r.address===w)costs?.apply(r);
  current=mergePortfolios(reports.map(allocatePortfolioBasis));paint();
  const evm=reports.find(r=>r.address===w);
  if(evm&&costs)void costs.refresh(evm).then(changed=>{if(!changed||disposed||mine!==serial||w!==owner()||s!==solAddress())return;const accepted=reader.accept('evm',w,allocatePortfolioBasis(evm),{derived:true,refreshing:!!evm.refreshing});current=mergePortfolios(reports.map(r=>r===evm?accepted:r));paint();},()=>{});
  try{const r=await fetchImpl('/api/terminal/feed?chain=all',{cache:'no-store'});if(r.ok){const d=await r.json();if(disposed||mine!==serial||w!==owner())return;applyLive(current,liveFeed(d.markets));paint();}}catch{}
 }
 const changed=()=>{if(globalThis.document?.visibilityState==='visible')void load(true);};globalThis.document?.addEventListener('qhooks:traded',changed);
 void load();return{refresh:()=>load(true),dispose(){seller.dispose();disposed=true;stopReports();serial++;globalThis.document?.removeEventListener('qhooks:traded',changed);}};
}
