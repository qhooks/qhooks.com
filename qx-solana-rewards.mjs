import {solAddress,signSolMessage,onSolChange} from './qx-solana.mjs';
import {connectedAddress,signMessage,onWalletChange} from './qx-chain.mjs';
import {createSwapRewardRecovery} from './qx-solana-reward-recovery.mjs';
import {rewardAmount,rewardClaimState,sameRewardOwner} from './qx-reward-state.mjs';
const BASE='/api/terminal/sol/rewards',SOL='So11111111111111111111111111111111111111112',USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else e.setAttribute(k,v);}e.append(...kids.flat().filter(x=>x!=null));return e;};
let panel=null,loading=0,poll=null,polls=0,actionClass='qxt-mini';
const notices=new Map(),busy=new Set();
const refValue=()=>{try{return localStorage.getItem('qhooks:sol-referrer:v1')||localStorage.getItem('qhooks:ref')||'';}catch{return '';}};
const validRef=value=>/^0x[0-9a-fA-F]{40}$/.test(value||'')||/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value||'');
try{const ref=new URLSearchParams(location.search).get('ref');if(validRef(ref))localStorage.setItem('qhooks:sol-referrer:v1',ref);}catch{}
async function api(path='',body){const r=await fetch(BASE+path,{cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw Error(j.detail||({wallet_signature_invalid:'Sign with the wallet that owns these rewards.',claim_below_minimum:'This claim is below the network-cost minimum.',rewards_wallet_needs_funding:'Rewards are recorded. Claims are temporarily unavailable.',claims_not_configured:'Rewards are recorded. Claims are temporarily unavailable.'})[j.error]||'Rewards are unavailable right now. Try again.');return j;}
export async function enrollSolanaReferrer(){const wallet=solAddress(),ref=refValue();if(!wallet||!validRef(ref)||ref===wallet)return;const current=await api('?wallet='+wallet);if(!current.enabled||current.referrer)return;const challenge=await api('/challenge',{purpose:'enroll',wallet,referrer:ref});const signature=await signSolMessage(challenge.message);await api('/enroll',{id:challenge.id,signature});}
const recovery=createSwapRewardRecovery({reconcile:row=>api('/reconcile',row)});
export function recordSolanaRewards(requestId,result) {
 recovery.record(requestId,result);polls=0;void refresh();
}
const format=rewardAmount;

async function claim(owner,balance) {
 const key=owner+':'+balance.mint;if(busy.has(key))return;
 busy.add(key);notices.set(owner,'Sign this rewards claim. Your wallet is not being asked to send funds.');void refresh();
 try {
  const destination=solAddress();if(!destination)throw Error('Connect your Solana wallet to receive rewards.');
  const challenge=await api('/challenge',{purpose:'claim',wallet:owner,mint:balance.mint,amount:balance.amount,destination});
  if(solAddress()!==destination)throw Error('Your receiving wallet changed. Start the claim again.');
  const signature=owner.startsWith('0x')?await signMessage(challenge.message):await signSolMessage(challenge.message);
  const result=await api('/claim',{id:challenge.id,signature});
  notices.set(owner,result.status==='confirmed'?'Rewards paid to your Solana wallet.':'Your payout is being confirmed. You can return here to check it.');
 } catch(e) { notices.set(owner,e.message); }
 finally {busy.delete(key);polls=0;void refresh();}
}
async function refresh() {
 clearTimeout(poll);poll=null;
 if(!panel?.isConnected)return;
 const serial=++loading,wallet=solAddress();
 if(!wallet){panel.replaceChildren(h('p',{},'Connect your Solana wallet to check reward availability and any recorded balances.'));return;}
 let unsettled=false;
 try {
  await recovery.run();
  const evm=connectedAddress(),owners=[wallet,...(evm?[evm]:[])];
  let all=await Promise.all(owners.map(w=>api('?wallet='+w)));
  if(serial!==loading)return;
  if(!all[0].enabled){panel.replaceChildren(h('p',{},'Trade Solana through Jupiter · 1% trading fee. Solana cashback and referral rewards are not active.'));return;}
  const claims=all.flatMap(value=>value.claims||[]);
  let changed=false;
  await Promise.all(claims.map(async claim=>{
   try {
    const result=await api('/claims/'+claim.id);
    if(result&&['confirmed','failed'].includes(result.status)) {
     changed=true;
     notices.set(claim.owner,result.status==='confirmed'?'Rewards paid to your Solana wallet.':'The payout failed or expired. Your rewards balance was restored.');
    }
   } catch { /* Keep the reserved payout visible and offer another check. */ }
  }));
  if(changed)all=await Promise.all(owners.map(w=>api('?wallet='+w)));
  if(serial!==loading)return;
  const active=all.flatMap(value=>value.claims||[]);
  unsettled=active.length>0||recovery.read().length>0;
  const status=h('p',{role:'status','aria-live':'polite'});
  const copy=h('button',{type:'button',class:actionClass},'Copy Solana referral link');
  copy.onclick=async()=>{
   try {await navigator.clipboard.writeText('https://qhooks.com/terminal?ref='+wallet);status.textContent='Referral link copied. You earn 20% of the fee from referred Solana trades.';}
   catch {status.textContent='https://qhooks.com/terminal?ref='+wallet;}
  };
  const rows=[];
  for(let i=0;i<all.length;i++)for(const balance of all[i].balances) {
   if(BigInt(balance.amount)<=0n)continue;
   const reserved=active.some(claim=>sameRewardOwner(claim.owner,owners[i])&&claim.mint===balance.mint);
   const symbol=balance.mint===SOL?'SOL':'USDC',decimals=balance.mint===SOL?9:6;
   const state=rewardClaimState({...balance,symbol,decimals},{reserved,busy:busy.has(owners[i]+':'+balance.mint)}),eligible=state.eligible;
   const button=h('button',{type:'button',class:actionClass,...(eligible?{}:{disabled:''})},'Claim');
   button.onclick=()=>void claim(owners[i],balance);
   rows.push(h('div',{class:'qsr-row'},h('div',{},h('span',{},format(balance.amount,decimals)+' '+symbol+(i?' · EVM referral wallet':'')),h('small',{},state.label+'. '+state.detail)),button));
  }
  const pendingRows=active.map(claim=>h('p',{},format(claim.amount,claim.mint===SOL?9:6)+' '+(claim.mint===SOL?'SOL':'USDC')+' payout pending. This amount is reserved until the payment confirms or safely expires.'));
  const check=h('button',{type:'button',class:actionClass,onclick:()=>{polls=0;void refresh();}},'Check rewards');
  panel.replaceChildren(h('h3',{},'Solana rewards'),h('p',{},'30% of the trading fee back to you. 20% to the referrer. Jupiter’s share comes from the same 1% fee.'),...rows,...pendingRows,...(!rows.length&&!pendingRows.length?[h('p',{},recovery.read().length?'Confirming your recent swap before crediting rewards…':'Your cashback appears after a confirmed trade.')]:[]),copy,check,status);
  const notice=owners.map(owner=>notices.get(owner)).filter(Boolean).join(' ');
  if(notice)status.textContent=notice;
  else if(all.some(value=>value.balances.some(balance=>!balance.enabled)))status.textContent='Rewards are recorded. Claims are temporarily unavailable.';
  else status.textContent='Claim minimums: '+all[0].balances.map(balance=>format(balance.minimum,balance.mint===SOL?9:6)+' '+(balance.mint===SOL?'SOL':'USDC')).join(' or ')+'. QHooks pays the payout network cost.';
 } catch(e) {
  if(serial===loading)panel.replaceChildren(h('p',{},e.message),h('button',{type:'button',class:actionClass,onclick:()=>{polls=0;void refresh();}},'Retry rewards'));
 } finally {
  if(serial===loading&&unsettled&&polls++<12)poll=setTimeout(()=>void refresh(),6000);
 }
}
export function renderSolanaRewards(target,{buttonClass='qxt-mini'}={}){actionClass=buttonClass;if(!panel||!panel.isConnected){panel=h('section',{class:'qsr','aria-label':'Solana cashback and referral rewards'});target.replaceChildren(panel);}void refresh();}
onSolChange(()=>void refresh());onWalletChange(()=>void refresh());document.addEventListener('qhooks:traded',()=>void refresh());
