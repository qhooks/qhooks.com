import {solAddress,onSolChange} from './qx-solana.mjs';
import {dlmmApi,reviewDlmm} from './qx-sol-dlmm-client.mjs';
import {positionPreferences,savePositionPreferences,reviewGate,formatDlmmUnits} from './qx-sol-dlmm-state.mjs';
const prefsStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};
const asset=mint=>mint==='So11111111111111111111111111111111111111112'?'SOL':mint?.slice(0,4)+'…'+mint?.slice(-4);
const el=(tag,text,attrs={})=>{const e=document.createElement(tag);if(text!==null)e.textContent=text;for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
function styles(){if(document.querySelector('link[data-dlmm]'))return;const l=el('link',null,{rel:'stylesheet',href:'/qx-sol-dlmm-panel.css','data-dlmm':''});document.head.append(l);}
function manager(host){
 let busy=false,review=null;const gate=reviewGate();
 const status=el('p','',{'role':'status','aria-live':'polite'}),confirm=el('div',null,{'class':'qxdl-review',hidden:''});host.append(confirm,status);
 const message=s=>{status.textContent=s;};
 async function act(body,refresh){if(busy)return;busy=true;const mine=gate.begin();review=null;confirm.hidden=true;message('Preparing review…');
  try{const result=await reviewDlmm(body);if(!gate.current(mine))return;review=result;const current=review,s=current.summary;confirm.replaceChildren(el('p','Range: '+s.bins.lower+' to '+s.bins.upper+(s.transactionCount>1?' · '+s.transactionCount+' transactions, one batch approval':'')),el('p',formatDlmmUnits(s.amounts.x,s.decimals[0])+' '+asset(s.mints[0])+' / '+formatDlmmUnits(s.amounts.y,s.decimals[1])+' '+asset(s.mints[1])),el('p','Claim charge: '+formatDlmmUnits(s.fee.x,s.decimals[0])+' / '+formatDlmmUnits(s.fee.y,s.decimals[1])));
   const yes=el('button','Confirm and sign',{type:'button'}),cancel=el('button','Cancel',{type:'button'});confirm.append(yes,cancel);confirm.hidden=false;message('Review the amounts before signing.');
   cancel.onclick=()=>{review=null;confirm.hidden=true;message('Cancelled.');};
   yes.onclick=async()=>{if(busy||review!==current)return;busy=true;yes.disabled=true;cancel.disabled=true;try{message('Waiting for your wallet…');const sent=await current.send();review=null;confirm.hidden=true;status.replaceChildren(el('span','Submitted. '),el('a','View transaction',{href:'https://solscan.io/tx/'+sent.signature,target:'_blank',rel:'noopener noreferrer'}));await sent.confirm();savePositionPreferences(prefsStorage(),current.owner,current.summary);message('Confirmed.');await refresh();}catch(e){message(e.message);review=null;confirm.hidden=true;}finally{busy=false;}};
  }catch(e){message(e.message);}finally{busy=false;}
 }
 onSolChange(()=>{gate.cancel();review=null;confirm.hidden=true;});
 return {act,message,cancel(){gate.cancel();review=null;confirm.hidden=true;}};
}
function positionCard(p,actions,refresh){
 const preferences=positionPreferences(prefsStorage(),p.owner,p.address);p={...p,lastRebalance:preferences.lastRebalance||p.lastRebalance,rebalance:{...p.rebalance,shape:preferences.shape||p.rebalance?.shape||'bidask'}};
 const card=el('article',null,{'class':'qxdl-position'}),state=p.inRange?'In range':p.rebalance?.outOfRangeSince?'Out of range since '+Math.floor((Date.now()-p.rebalance.outOfRangeSince)/60000)+' min':'Out of range';
 card.append(el('h4','Manual · '+state),el('p','Pool '+p.pool.slice(0,5)+'…'+p.pool.slice(-4)+' · Bins '+p.lower+' to '+p.upper),el('p',formatDlmmUnits(p.amountX,p.decimalsX)+' '+asset(p.mintX)+' / '+formatDlmmUnits(p.amountY,p.decimalsY)+' '+asset(p.mintY)),el('p','Unclaimed: '+formatDlmmUnits(p.feeX,p.decimalsX)+' / '+formatDlmmUnits(p.feeY,p.decimalsY)),el('p','Last rebalance: '+(p.lastRebalance?new Date(p.lastRebalance).toLocaleString():'—')));
 const row=el('div',null,{'class':'qxdl-actions'});for(const [action,label] of [['claim','Claim fees'],['remove','Withdraw'],['close','Close position'],...(p.rebalance?.due?[['rebalance','Rebalance']]:[])]){const b=el('button',label,{type:'button'});b.onclick=()=>actions.act({action,pool:p.pool,position:p.address,shape:p.rebalance?.shape||'bidask'},refresh);row.append(b);}card.append(row);return card;
}
export async function mountDlmmToken({getToken,host=document.getElementById('qxt-trade')}={}){
 if(!host)return;try{await dlmmApi('config');}catch{return;}styles();
 const box=el('details',null,{'class':'qxdl-panel'}),title=el('summary','Earn · LP');box.append(title);host.append(box);
 const form=el('div',null,{'class':'qxdl-form'}),poolSelect=el('select',null,{'aria-label':'Liquidity pool'}),sol=el('input',null,{type:'text',inputmode:'decimal',value:'0.01','aria-label':'SOL amount'}),token=el('input',null,{type:'text',inputmode:'decimal','aria-label':'Token amount',placeholder:'0'}),chips=el('div',null,{'class':'qxdl-actions','aria-label':'Shape'});
 let shape='bidask',selectedMint=null,revision=0;const label=(text,input)=>{const l=el('label',text);l.append(input);return l;};
 for(const [id,text] of [['spot','Spot'],['curve','Curve'],['bidask','Bid-ask']]){const b=el('button',text,{type:'button','aria-pressed':String(shape===id)});b.onclick=()=>{shape=id;for(const c of chips.children)c.setAttribute('aria-pressed',String(c===b));actions.cancel();};chips.append(b);}
 const lower=el('input',null,{type:'range',min:'-90',max:'50',step:'1',value:'-35','aria-label':'Lower range percent'}),upper=el('input',null,{type:'range',min:'-90',max:'50',step:'1',value:'-1','aria-label':'Upper range percent'}),rangeLabel=el('output','-35% to -1%'),add=el('button','Add liquidity',{type:'button'}),list=el('div');
 form.append(label('Pool',poolSelect),label('SOL',sol),label('Token',token),chips,label('Lower range',lower),label('Upper range',upper),rangeLabel,add);box.append(form,list);const actions=manager(box);
 for(const input of [sol,token,lower,upper,poolSelect])input.addEventListener('input',()=>{rangeLabel.textContent=lower.value+'% to '+upper.value+'%';actions.cancel();});
 async function positions(){const who=solAddress(),mint=selectedMint,mine=revision;if(!who){list.replaceChildren(el('p','Connect your Solana wallet.'));return;}try{const {positions}=await dlmmApi('positions?owner='+encodeURIComponent(who));if(mine!==revision||solAddress()!==who)return;list.replaceChildren(...positions.filter(p=>[p.mintX,p.mintY].includes(mint)).map(p=>positionCard(p,actions,positionsRefresh)));}catch(e){actions.message(e.message);}}
 async function positionsRefresh(){await positions();}
 async function load(){const target=getToken();revision++;selectedMint=target?.chainId==='solana'?target.mint:null;actions.cancel();box.hidden=!selectedMint;list.replaceChildren();poolSelect.replaceChildren();if(!selectedMint||!box.open)return;const mine=revision;add.disabled=true;actions.message('Loading pools…');try{const {pools}=await dlmmApi('pools?mint='+encodeURIComponent(selectedMint));if(mine!==revision)return;for(const p of pools){poolSelect.append(el('option',p.binStep+' bps · '+p.address.slice(0,5)+'…'+p.address.slice(-4),{value:p.address}));}add.disabled=!pools.length;actions.message(pools.length?'':'No supported pools found.');await positions();}catch(e){if(mine===revision)actions.message(e.message);}}
 add.onclick=()=>actions.act({action:'add',pool:poolSelect.value,amountSol:sol.value||undefined,amountToken:token.value||undefined,shape,range:{lowerPct:Number(lower.value),upperPct:Number(upper.value)}},positionsRefresh);
 box.addEventListener('toggle',()=>{if(box.open)void load();});document.addEventListener('qxt:token',()=>void load());document.addEventListener('qxt:clear',()=>{revision++;selectedMint=null;box.hidden=true;actions.cancel();});onSolChange(()=>{actions.cancel();if(box.open)void positions();});void load();setInterval(()=>{if(!document.hidden&&box.isConnected&&box.open&&!box.hidden&&solAddress())void positions();},60000);
}
export async function mountDlmmPortfolio({host=document.querySelector('main')}={}){
 if(!host)return;try{await dlmmApi('config');}catch{return;}styles();const box=el('details',null,{'class':'qxdl-panel'});box.append(el('summary','Liquidity'));host.append(box);const list=el('div');box.append(list);const actions=manager(box);let revision=0;
 async function refresh(){const mine=++revision;actions.cancel();if(!box.open)return;const who=solAddress();if(!who){list.replaceChildren(el('p','Connect your Solana wallet.'));return;}try{const {positions}=await dlmmApi('positions?owner='+encodeURIComponent(who));if(mine!==revision||who!==solAddress())return;list.replaceChildren(...positions.map(p=>positionCard(p,actions,refresh)));if(!positions.length)list.append(el('p','No liquidity positions.'));}catch(e){actions.message(e.message);}}
 box.addEventListener('toggle',()=>void refresh());onSolChange(()=>{list.replaceChildren();void refresh();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&box.open)void refresh();});setInterval(()=>{if(!document.hidden&&box.isConnected&&box.open&&solAddress())void refresh();},60000);
}
