import {COMPETE_BOARDS} from './compete-core.mjs';
import {prizeView,validSchedule,PRIZE_COPY} from './compete-prizes.mjs';
export const usdPrize=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:c%100?2:0}).format(c/100);
export const qhooksPrize=raw=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(Number(raw)/1e18);
export function renderPrizeCard(doc,plan,{board='pnl',now=Date.now()}={}){
 const ranks=doc.getElementById('prize-ranks'),status=doc.getElementById('prize-status');if(!ranks||!status)return;
 const view=prizeView(plan,board,{now}),valid=validSchedule(view.schedule),name=COMPETE_BOARDS.find(b=>b.id===board)?.name||'Board';
 const el=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
 ranks.replaceChildren(...[0,1,2].map(i=>{const value=view.ranks[i],card=el('div'),label=el('span','',`0${i+1} / PER BOARD`),amount=el('strong','',valid&&value?qhooksPrize(value.qhooksRaw):'—');amount.append(el('small','','QHOOKS'));const estimate=el('p','prize-estimate',value?.qhooksRaw!=null?'Fixed QHOOKS allocation':'Prize configuration pending');card.append(label,amount,estimate);return card;}));
 doc.getElementById('prize-copy').textContent=PRIZE_COPY;
 status.textContent=`${name} · ${!valid?'Prize amounts unavailable':view.schedule.confirmed?'Prizes per board':'Proposed prizes · amounts awaiting confirmation'}`;
 doc.getElementById('prize-average').textContent='No USD conversion. Default QDrops claims have no post-claim token lock; awards require review and funding.';
}
