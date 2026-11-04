// Preserve the existing catalog/research executable, then present five concise rows.
import './app.js';
import {bindLaunchDesk} from './l170-home-page.mjs';
import {productCopy} from './product.mjs';
const rows=[
 ['qgraduation-pq-liquidity-migration','academic-cap','Choose a quote-inflow target, graduate manually or keep the source pool.'],
 ['qcreator-fee-pq-vault','circle-stack','Collect swap fees in a vault. Withdraw with wallet and post-quantum approval.'],
 ['qrevenue-split-pq-vaults','share','Split fees between two independent vaults, each with its own protected withdrawals.'],
 ['qprice-band-pq-governance','chart-bar','Define a trading range. Update its bounds with wallet and post-quantum approval.'],
 ['qcircuit-recovery-pq-resume','shield-check','Pause at a trade-size threshold. Resume after cooldown with both keys.']
];
const grid=document.getElementById('quantum-listing-grid');
grid.replaceChildren(...rows.map(([id,icon,summary])=>{
 const copy=productCopy[id],row=document.createElement('a');row.className='q170-hook-row';row.href='hook.html?id='+encodeURIComponent(id);row.dataset.listingId=id;
 const image=document.createElement('img');image.src='/l170-icons/'+icon+'.svg';image.alt='';image.setAttribute('aria-hidden','true');image.width=30;image.height=30;
 const title=document.createElement('h3');title.textContent=copy.name;
 const description=document.createElement('p');description.textContent=summary;
 const arrow=document.createElement('img');arrow.src='/l170-icons/arrow-right.svg';arrow.alt='';arrow.setAttribute('aria-hidden','true');arrow.width=22;arrow.height=22;
 row.append(image,title,description,arrow);return row;
}));
bindLaunchDesk();
