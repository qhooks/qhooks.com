// Presentation only. Keep the accepted workspace's controls, listeners and
// disabled states intact. Navigation never invokes a wallet or transaction.
export const STUDIO_STEPS=Object.freeze(['Wallet & network','Token & liquidity','QHooks','Key backup','Review & launch']);
const get=(d,id)=>d.getElementById(id);
function make(d,tag,klass,text){const node=d.createElement(tag);if(klass)node.className=klass;if(text!==undefined)node.textContent=text;return node;}
export function placeSelectSymbols(d=globalThis.document){
 for(const id of ['ql-chain','qw-chain']){const select=get(d,id),badge=select?.nextElementSibling;if(!badge?.classList.contains('chain-select-symbol')||select.parentElement.classList.contains('chain-select-control'))continue;
  const row=make(d,'div','chain-select-control');select.parentElement.insertBefore(row,select);row.append(select,badge);
 }
}
export function launchDraftView(values){
 const short=(value,fallback,max=64)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):fallback;
 const modes={'0':'Quote-target eligible','1':'Owner-approved','2':'Keep source pool'};
 const match=typeof values.fee==='string'&&values.fee.length<=10?/^(0|[1-9][0-9]*)(?:\.([0-9]{1,4}))?$/.exec(values.fee):null;
 const ppm=match&&match[0]===values.fee?BigInt(match[1])*10000n+BigInt((match[2]||'').padEnd(4,'0')):null;
 const percent=value=>{const fraction=(value%10000n).toString().padStart(4,'0').replace(/0+$/,'');return value/10000n+(fraction?'.'+fraction:'')+'%';};
 const fees=ppm!==null&&ppm>0n&&ppm<=100000n?percent(ppm)+' creator LP + '+percent(ppm/5n)+' protocol = '+percent(ppm+ppm/5n)+' nominal; not a swap quote':'Choose a valid LP fee to preview trading rates';
 return Object.freeze({name:short(values.name,'Your next token'),symbol:short(values.symbol,'TOKEN',12),supply:short(values.supply,'Choose supply',100),mode:modes[values.mode]||'Choose graduation',fees,network:short(values.network,'Choose network',80)});
}
export function bindLaunchStudio(d=globalThis.document){
 const main=get(d,'launch-workspace'),grid=main?.querySelector('.qwallet-grid');
 if(!main||!grid||main.dataset.studioBound==='true')return null;
 const connect=get(d,'ql-connect-heading')?.closest('section.qwallet-panel'),key=get(d,'ql-key-heading')?.closest('section.qwallet-panel'),progress=get(d,'ql-progress-heading')?.closest('section.qwallet-panel');
 const groups=[[connect],[get(d,'ql-token-panel')],[get(d,'ql-graduation-panel')],[key],[get(d,'ql-wrap-panel'),progress,get(d,'ql-review-panel')]];
 if(groups.some(group=>group.some(node=>!node)))return null;
 main.dataset.studioBound='true';grid.classList.add('launch-studio-grid');
 const nav=make(d,'nav','studio-steps');nav.setAttribute('aria-label','Launch setup steps');
 const panels=[],buttons=[],listeners=[];let current=0;
 const feedback=get(d,'ql-feedback');if(feedback)main.insertBefore(feedback,grid);
 const preview=make(d,'aside','studio-preview');preview.setAttribute('aria-label','Launch draft preview');
 const coin=make(d,'span','studio-token-mark','◇');coin.setAttribute('aria-hidden','true');
 const title=make(d,'strong'),symbol=make(d,'span','studio-ticker'),network=make(d,'span','studio-network'),detail=make(d,'p');
 const identity=make(d,'div','studio-token-identity');identity.append(title,symbol);preview.append(coin,identity,network,detail);
 main.insertBefore(preview,grid);main.insertBefore(nav,grid);
 function updatePreview(){
  const select=get(d,'ql-chain'),v=launchDraftView({name:get(d,'ql-name').value,symbol:get(d,'ql-symbol').value,supply:get(d,'ql-supply').value,mode:get(d,'ql-mode').value,fee:get(d,'ql-fee').value,network:select.selectedOptions?.[0]?.textContent});
  title.textContent=v.name;symbol.textContent='$'+v.symbol;network.textContent=v.network;
  detail.textContent='Draft · '+v.supply+' total tokens · '+v.mode+' · '+v.fees;
 }
 const learn=make(d,'section','studio-included');const heading=make(d,'h2',null,'Included QHooks');const explanation=make(d,'p',null,'QGraduation protects these pool actions with your wallet and a separate post-quantum key.');
 const cards=make(d,'div','studio-protections');
 for(const [name,copy]of [['Liquidity controls','Dual approval for initialization, migration and destination withdrawals.'],['Fee claims','Both keys authorize collection to the recipient you choose.'],['Graduation policy','Choose a target, owner-approved migration or a pool that stays put.']]){const card=make(d,'article');card.append(make(d,'span','studio-included-label','Included'),make(d,'h3',null,name),make(d,'p',null,copy));cards.append(card);}
 learn.append(heading,explanation,cards,make(d,'p','studio-note','One included protection bundle. Other marketplace hooks are separate integrations.'));
 function listen(node,event,fn){node.addEventListener(event,fn);listeners.push([node,event,fn]);}
 function select(index,focus=false){
  current=index;for(let i=0;i<panels.length;i++){panels[i].hidden=i!==index;buttons[i].setAttribute('aria-current',i===index?'step':'false');}
  updatePreview();if(focus){panels[index].focus();panels[index].scrollIntoView({block:'start',behavior:'auto'});}
 }
 groups.forEach((nodes,index)=>{
  const button=make(d,'button','studio-step');button.type='button';button.id='studio-step-'+index;button.setAttribute('aria-controls','studio-panel-'+index);
  button.append(make(d,'span','studio-step-number',String(index+1)),make(d,'span',null,STUDIO_STEPS[index]));nav.append(button);buttons.push(button);
  const panel=make(d,'section','studio-panel');panel.id='studio-panel-'+index;panel.tabIndex=-1;panel.setAttribute('aria-labelledby',button.id);
  if(index===2)panel.append(learn);for(const node of nodes)panel.append(node);
  const controls=make(d,'div','studio-navigation');
  if(index>0){const back=make(d,'button','studio-back','← Back');back.type='button';listen(back,'click',()=>select(index-1,true));controls.append(back);}
  if(index<groups.length-1){const next=make(d,'button','workspace-button','Continue to '+STUDIO_STEPS[index+1].toLowerCase()+' →');next.type='button';listen(next,'click',()=>select(index+1,true));controls.append(next);}
  panel.append(controls);panels.push(panel);grid.insertBefore(panel,get(d,'ql-manage'));listen(button,'click',()=>select(index,true));
 });
 // Exact signed fields, transaction, cost and consent stay visible together in
 // the review step. Moving between steps never implies approval/completion.
 for(const id of ['ql-name','ql-symbol','ql-supply','ql-fee','ql-mode','ql-chain']){const node=get(d,id);listen(node,'input',updatePreview);listen(node,'change',updatePreview);}
 select(0);
 return Object.freeze({get step(){return current;},dispose(){for(const [node,event,fn]of listeners)node.removeEventListener(event,fn);}});
}
if(globalThis.document){placeSelectSymbols();bindLaunchStudio();}
