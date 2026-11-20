import {rowEvidence} from './qx-discovery-evidence.mjs';
export function discoveryBadges(row,{h,compact=false}={}){
 const v=rowEvidence(row),chain=String(row.chainId),token=row.token?.address||'',supported=new Set(['1','8453','42161','56','4663','99901','solana']),proof=supported.has(chain)?'/proof/'+encodeURIComponent(chain)+'/'+encodeURIComponent(token):'/qproof?'+new URLSearchParams({q:token}),items=[];
 const add=(label,detail,href=proof,tone='')=>items.push(h('a',{class:'qxd-badge '+tone,href,title:detail},label));
 if(row.safety?.flag==='danger'||row.safety?.flag==='warn')add('Safety finding',[row.safety.source,...(row.safety.reasons||[])].filter(x=>typeof x==='string').join(' · '),proof,row.safety.flag==='danger'?'down':'warn');
 if(v.qproof)add('QProof · '+v.qproof.label,v.qproof.reason+' · '+new Date(v.qproof.at).toISOString(),proof,v.qproof.level==='danger'?'down':v.qproof.level==='watch'?'warn':'');
 if(v.lp)add('LP locked','Verified launch LP position has no remove or withdraw function. Other positions are not covered.','/lp-proof?'+new URLSearchParams({chain,pool:v.lp.poolId}));
 if(v.guard?.active)add('Anti-snipe on','Observed opening guard ends '+new Date(v.guard.until).toISOString());
 if(v.agent?.ready)add('Agent-ready','Route capability: '+v.agent.route+' · Your wallet still signs.','/agents');
 const risk=v.qproof?.label||'Checks';
 const detail=h('details',{class:'qxd-checks'+(v.qproof?.level==='danger'?' down':v.qproof?.level==='watch'?' warn':'')},h('summary',{'aria-label':'Safety checks'},compact?risk:'Safety checks'));
 const table=h('dl',{});for(const [name,value]of [['QProof',v.qproof?v.qproof.label+' · '+v.qproof.reason:'Partly checked'],['LP position',v.lp?'Locked · observed launch position':'Not verified for this pool'],['Anti-snipe',v.guard?v.guard.active?'On · opening guard':'Opening guard inactive':'Not observed'],['Agent route',v.agent?v.agent.ready?'Available · wallet signs':'Not available':'Not verified']])table.append(h('div',{},h('dt',{},name),h('dd',{},value)));
 detail.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();detail.open=false;detail.querySelector('summary').focus();}});
 detail.append(h('div',{class:'qxd-checks-panel'},table,h('a',{href:proof},'Check with QProof →')));return h('div',{class:'qxd-badges'+(compact?' qxd-compact':'')},...items,detail);
}
