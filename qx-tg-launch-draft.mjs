import {launchChain,launchName,launchTicker} from './qx-launch-prefill.mjs';
export function readTelegramLaunchDraft(search){const p=new URLSearchParams(search);if(p.get('via')!=='telegram')return null;try{
 const chain=launchChain(p.get('launchChain')||p.get('chain'));if(!chain)return null;
 const name=launchName(p.get('launchName')||p.get('name')),ticker=launchTicker(p.get('launchTicker')||p.get('ticker')),brief=p.get('launchBrief')||'';
 if(brief.length>400||/[\p{C}<>]/u.test(brief)||/\b(?:private\s*key|seed\s*phrase|recovery\s*phrase|mnemonic)\b|(?:^|\s)(?:0x)?[0-9a-f]{64}(?:$|\s)/i.test(brief))return null;
 return{name,ticker,chain:chain.id,chainName:chain.name,brief};
 }catch{return null;}}
export function mountTelegramLaunchDraft(doc=document,loc=location){const draft=readTelegramLaunchDraft(loc.search);if(!draft)return;
 const design=doc.getElementById('qc-d');if(design){design.value=(draft.name+' ('+draft.ticker+'). '+draft.brief+' On '+draft.chainName+'.').slice(0,600);return;}
 const host=doc.getElementById('qq-quick')||doc.getElementById('qc-screen-1');if(!host)return;
 const box=doc.createElement('aside');box.className='qtl-draft';box.setAttribute('aria-label','Launch link draft');
 const k=doc.createElement('p');k.className='qtl-draft__k';k.textContent='LINK → CREATE';
 const title=doc.createElement('h2');title.textContent=draft.name+' · $'+draft.ticker;
 const brief=doc.createElement('p');brief.textContent=draft.chainName;
 const note=doc.createElement('p');note.textContent='This link filled in your draft below. Add your art, review the rules, then sign with your wallet.';
 const clear=doc.createElement('button');clear.type='button';clear.textContent='Hide draft note';clear.onclick=()=>box.remove();box.append(k,title,brief,note,clear);host.before(box);
 if(!doc.querySelector('link[href="/qx-tg-launch-draft.css"]'))doc.head.append(Object.assign(doc.createElement('link'),{rel:'stylesheet',href:'/qx-tg-launch-draft.css'}));
}
if(typeof document!=='undefined')mountTelegramLaunchDraft();
