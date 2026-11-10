// Read-only host entrypoints. Wallet connection, signing and launch records remain owned by their existing flows.
import {mountRepoProofCheck} from './qx-repoproof.mjs';
import {chainById} from './chains.mjs';

const CHAINS=new Set(['1','8453','42161','56','4663','99901']);
const evm=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value)&&BigInt(value)>0n?value.toLowerCase():null;
const sol=value=>typeof value==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)?value:null;
const same=(a,b)=>a?.kind===b?.kind&&a?.chainId===b?.chainId&&a?.address===b?.address;
const el=(doc,tag,text,attrs={})=>{const node=doc.createElement(tag);if(text!=null)node.textContent=text;for(const[key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
export function entrypointStyles(doc){if(doc.getElementById('qx-repoproof-entrypoint-styles'))return;const link=el(doc,'link',null,{id:'qx-repoproof-entrypoint-styles',rel:'stylesheet',href:'/qx-repoproof-entrypoints.css'});doc.head.append(link);}

export function completedLaunchSubject(container,{origin=globalThis.location?.origin||'https://qhooks.com'}={}){
  for(const anchor of container.querySelectorAll('a')){
    let url;try{url=new URL(anchor.getAttribute('href'),origin);}catch{continue;}
    if(![origin,'https://qhooks.com'].includes(url.origin)||!['/board','/board.html'].includes(url.pathname)||url.search||url.username||url.password)continue;
    const hash=new URLSearchParams(url.hash.slice(1));if(hash.getAll('m').length!==1||[...hash.keys()].some(key=>!['m','compose'].includes(key)))continue;
    const match=/^(\d+):(0x[0-9a-f]{40})$/i.exec(hash.get('m'));if(!match||!CHAINS.has(match[1]))continue;
    const address=evm(match[2]);if(address)return{kind:'launch',chainId:match[1],address};
  }
  return null;
}

export function mountCompletedLaunchProof(container,{document:doc=container.ownerDocument,mount=mountRepoProofCheck,observe=globalThis.MutationObserver,origin,fetcher}={}){
  entrypointStyles(doc);let active=null,proof=null,host=null,revision=0,dead=false;
  const current=()=>completedLaunchSubject(container,{origin});
  function refresh(){
    if(dead)return;const next=current();if(same(active,next)&&host?.parentElement===container)return;
    revision++;proof?.dispose();proof=null;host?.remove();host=null;active=next;
    if(!next)return;
    host=el(doc,'section',null,{class:'qre-launch','aria-label':'Completed launch check'});host.append(el(doc,'h3','Check your public launch'),el(doc,'p','Review the live launch’s public contract findings before sharing its market.'));
    const target=el(doc,'div');host.append(target);container.append(host);const ownedRevision=revision;
    proof=mount(target,{subject:{...next,revision:ownedRevision},getSubject:()=>{const value=current();return !dead&&ownedRevision===revision&&value?{...value,revision}:null;},document:doc,fetcher});
  }
  const observer=observe?new observe(refresh):null;observer?.observe(container,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});refresh();
  return{refresh,dispose(){dead=true;revision++;observer?.disconnect();proof?.dispose();host?.remove();}};
}

export function walletProofSubject(connection,family='evm'){
  if(family==='solana'){const address=sol(connection);return address?{kind:'wallet',chainId:'solana',address}:null;}
  const chainId=String(connection?.chainId||''),address=evm(connection?.owner);return CHAINS.has(chainId)&&address?{kind:'wallet',chainId,address}:null;
}

export function mountAccountProofs(container,{document:doc=container.ownerDocument,getEvm=()=>null,getSol=()=>null,subscribeEvm=()=>()=>{},subscribeSol=()=>()=>{},mount=mountRepoProofCheck,fetcher}={}){
  entrypointStyles(doc);const element=el(doc,'section',null,{class:'qa-section qre-account',id:'qa-wallet-checks','aria-labelledby':'qa-wallet-checks-h'});
  element.append(el(doc,'h2','Wallet checks',{id:'qa-wallet-checks-h'}),el(doc,'p','Review public permissions and delegate findings for your connected wallets. Changing wallets replaces the report.'));
  const slots=['evm','solana'].map(family=>{const box=el(doc,'section',null,{class:'qre-wallet','aria-label':family==='evm'?'EVM wallet check':'Solana wallet check'});element.append(box);return{family,box,key:null,proof:null,revision:0};});container.append(element);let dead=false;
  function refresh(){
    if(dead)return;
    for(const slot of slots){const read=()=>walletProofSubject(slot.family==='evm'?getEvm():getSol(),slot.family),next=read();if(same(slot.key,next)&&slot.box.childNodes?.length)continue;
      slot.revision++;slot.proof?.dispose();slot.proof=null;slot.key=next;slot.box.replaceChildren(el(doc,'h3',slot.family==='evm'?'EVM wallet':'Solana wallet'));
      if(!next){slot.box.append(el(doc,'p',slot.family==='evm'?'Connect an EVM wallet with the account controls to review its public permissions.':'Connect Solana with the account controls to review its public permissions.'));continue;}
      slot.box.append(el(doc,'p',(slot.family==='evm'?(chainById(next.chainId)?.name||next.chainId)+' · ':'')+next.address,{class:'qre-address'}));const target=el(doc,'div');slot.box.append(target);const revision=slot.revision;
      slot.proof=mount(target,{subject:{...next,revision},getSubject:()=>{const value=read();return !dead&&revision===slot.revision&&value?{...value,revision}:null;},document:doc,fetcher});
    }
  }
  const stopEvm=subscribeEvm(refresh),stopSol=subscribeSol(refresh);refresh();
  return{element,refresh,dispose(){dead=true;stopEvm?.();stopSol?.();for(const slot of slots){slot.revision++;slot.proof?.dispose();}element.remove();}};
}

export async function bootRepoProofEntrypoints(doc=globalThis.document){
  if(!doc)return;
  const share=doc.getElementById('qc-share-pack');if(share)mountCompletedLaunchProof(share,{document:doc});
  const root=doc.getElementById('qa-root');if(!root||!doc.getElementById('qa-evm-panel')||doc.getElementById('qa-wallet-checks'))return;
  const container=el(doc,'div',null,{class:'qre-account-host'});root.before(container);
  try{
    const [{getWalletHub},{solAddress,onSolChange}]=await Promise.all([import('./wallet-hub.mjs'),import('./qx-solana.mjs')]);
    if(!container.isConnected)return;
    const hub=getWalletHub(window);mountAccountProofs(container,{document:doc,getEvm:()=>hub.snapshot().current,getSol:solAddress,subscribeEvm:cb=>hub.subscribe(cb),subscribeSol:onSolChange});
    const nav=doc.querySelector('.qa-account-nav');if(nav&&!nav.querySelector('a[href="#qa-wallet-checks"]'))nav.append(el(doc,'a','Wallet checks',{href:'#qa-wallet-checks'}));
  }catch{container.append(el(doc,'p','Wallet checks could not load. Refresh the account to retry.',{role:'status'}));}
}
if(globalThis.document)void bootRepoProofEntrypoints();
