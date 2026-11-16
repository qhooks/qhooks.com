// Pure presentation of the configuration already produced by the launch builder.
import {normalizeBlocks,STAKERS_PAYEE} from './full-launch/packages/multichain-launch/launch-blocks.mjs';
export function guidedSplitPreview(blocks,owner){
 const b=JSON.parse(normalizeBlocks(blocks));return b.payees.map(([address,bps])=>({address,bps:Number(bps),label:address===STAKERS_PAYEE?'Stakers':owner&&address===owner.toLowerCase()?'Your launch wallet':!owner?'Launch wallet':address.slice(0,6)+'…'+address.slice(-4)}));
}
export function quickSplitPreview(rangeBps=0){if(!Number.isInteger(rangeBps)||rangeBps<0||rangeBps>10000)throw Error('Invalid LP split');return [{label:'Your launch wallet',bps:10000-rangeBps},{label:'Adaptive liquidity',bps:rangeBps}].filter(v=>v.bps);}
export function splitPreviewNode(rows,{quick=false}={}){
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;},box=el('section',null,'qsp'),h=el('h3','Fee split preview'),bar=el('div',null,'qsp-bar');bar.setAttribute('aria-hidden','true');
 box.append(h,el('p',quick?'Your creator LP fees':'Creator block income, after configured block budgets','qsp-note'));
 rows.forEach((r,i)=>{const seg=el('span',null,'qsp-segment');seg.style.flex=String(r.bps);seg.dataset.tone=String(i%2);bar.append(seg);});box.append(bar);
 for(const r of rows){const line=el('div',null,'qsp-row');line.append(el('span',r.label),el('b',(r.bps/100)+'%'));box.append(line);}
 box.append(el('p',quick?'Allocation of your LP fees; trading volume and fee amounts vary.':'Payee percentages apply to the creator block bucket. LP fees and individual block charges follow the settings shown above.','qsp-note'));return box;
}
