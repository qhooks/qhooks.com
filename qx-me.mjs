import {profileUrl} from './qx-profile-address.mjs';
// My QHooks (/me): everything the connected wallet has across the ecosystem, on every chain.
// Launches it created (income waiting, its own share, vesting streams, keys), tokens it holds, stakes and raffle
// entries in marketplace modules, module builder earnings, and terminal cashback and referral rewards.
// Data: /api/account/<w>/launches and /api/terminal/wallet/<w> (the worker's Markets directory and indexer), then
// on-chain reads through the public RPCs. Every button sends the same call as the launch page's own panel.
import { connectedAddress, onWalletChange, CHAIN_NAME, h } from '/qx-chain.mjs';
import { loadEarnings, renderEarnings, rewardsSection, section } from '/qx-earnings.mjs';
import '/qx-account-wallet.mjs';
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {mountAccountQuantum} from './qx-account-quantum-control.mjs';
const quantumHub=getWalletHub(window),quantum=mountAccountQuantum(document.getElementById('qm-key-panel'),{hub:quantumHub,id:'qm',mode:'account'});
quantumHub.subscribe(()=>void quantum.refresh());
void quantum.refresh();
window.addEventListener('pagehide',()=>quantum.lock());

const $ = id => document.getElementById(id);
let seq = 0, rewardSeq = 0, lastData = null, lastRewards = null;

// Holdings carry their token art and stay live: every 15 s in view, the terminal feed's last trade price (in the
// pool's quote) re-values each position and its result; a changed value flashes green or red.
let feedMap = null, liveTimer = 0;
const feedKey = (chainId, controller) => chainId + ':' + String(controller || '').toLowerCase();
async function readFeed() {
  try {
    const r = await fetch('/api/terminal/feed?chain=all', { cache: 'no-store' }); if (!r.ok) return false;
    const d = await r.json(); if (!Array.isArray(d.markets)) return false;
    feedMap = new Map(d.markets.filter(m => m && m.controller).map(m => [feedKey(m.chainId, m.controller), { logo: typeof m.logo === 'string' && m.logo ? m.logo.replace(/^https:\/\/qhooks\.com(?=\/)/, '') : null, price: Number.isFinite(m.summary?.price) && m.summary.price > 0 ? m.summary.price : null }]));
    return true;
  } catch { return false; }
}
function coin(p) {
  const el = h('span', { class: 'qp-art qp-art--sm', 'aria-hidden': 'true' }); el.dataset.letter = String(p.symbol || '?').charAt(0).toUpperCase();
  const logo = feedMap?.get(feedKey(p.chainId, p.controller))?.logo;
  if (logo) { const img = h('img', { src: logo, alt: '', loading: 'lazy' }); img.addEventListener('error', () => img.remove()); el.append(img); }
  return el;
}
const valueOf = p => Number.isFinite(p.price) && Number.isFinite(p.balance) ? p.balance * p.price : null;
const resultOf = (p, value) => value !== null && Number.isFinite(p.spent) && p.spent > 0 && Number.isFinite(p.received) ? p.received + value - p.spent : null;
const valueText = (p, value) => value === null ? 'Refreshing' : value.toLocaleString(undefined, { maximumSignificantDigits: 4 }) + ' ' + (p.quoteSymbol || '');
const resultText = (p, pnl) => pnl === null ? 'No cost basis yet' : (pnl >= 0 ? '+' : '') + pnl.toLocaleString(undefined, { maximumSignificantDigits: 3 }) + ' ' + (p.quoteSymbol || '');
function holdingsSection(positions) {
  const held = positions.filter(p => p.balance > 0).sort((a, b) => b.balance * b.price - a.balance * a.price);
  if (!held.length) return [h('p', { class: 'qa-empty' }, 'No QHooks launch tokens in this wallet. ', h('a', { href: '/terminal' }, 'Open the terminal'), '.')];
  const rows = held.map(p => {
    const value = valueOf(p), pnl = resultOf(p, value);
    const v = h('span', { role: 'cell', class: 'qa-me-value' }, valueText(p, value));
    const r = h('span', { role: 'cell', class: pnl === null ? 'qa-muted' : pnl >= 0 ? 'qa-up' : 'qa-down' }, resultText(p, pnl));
    const row = h('a', { class: 'qa-tr', role: 'row', href: '/terminal#m=' + p.chainId + ':' + p.controller },
      h('span', { role: 'cell', class: 'qa-me-tok' }, coin(p), h('b', {}, p.symbol || '?')), h('span', { role: 'cell' }, CHAIN_NAME[p.chainId] || p.chainId),
      h('span', { role: 'cell' }, p.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })), v, r);
    row.dataset.key = feedKey(p.chainId, p.controller); row.__p = p; row.__v = v; row.__r = r;
    return row;
  });
  const table = h('div', { class: 'qa-table', role: 'table' },
    h('div', { class: 'qa-tr qa-th', role: 'row' }, ...['Token', 'Chain', 'Holding', 'Value', 'Result'].map(t => h('span', { role: 'columnheader' }, t))), ...rows);
  startLive(table);
  return [table];
}
function startLive(table) {
  clearInterval(liveTimer);
  const tick = async () => {
    if (!table.isConnected) { clearInterval(liveTimer); return; }
    if (document.visibilityState !== 'visible' || !await readFeed()) return;
    for (const row of table.querySelectorAll('a.qa-tr[data-key]')) {
      const p = row.__p, live = feedMap.get(row.dataset.key);
      const ic = row.querySelector('.qp-art'); if (live?.logo && ic && !ic.querySelector('img')) { const img = h('img', { src: live.logo, alt: '', loading: 'lazy' }); img.addEventListener('error', () => img.remove()); ic.append(img); }
      if (!live?.price || live.price === p.price) continue;
      const dir = Number.isFinite(p.price) ? Math.sign(live.price - p.price) : 0; p.price = live.price;
      const value = valueOf(p), pnl = resultOf(p, value);
      row.__v.textContent = valueText(p, value); row.__r.textContent = resultText(p, pnl); row.__r.className = pnl === null ? 'qa-muted' : pnl >= 0 ? 'qa-up' : 'qa-down';
      if (dir && !matchMedia('(prefers-reduced-motion: reduce)').matches) { row.classList.remove('is-up', 'is-down'); void row.offsetWidth; row.classList.add(dir > 0 ? 'is-up' : 'is-down'); }
    }
  };
  void tick(); liveTimer = setInterval(tick, 15000);
}

const tile = (k, v, sub) => h('div', { class: 'qa-tile' }, h('span', {}, k), h('b', {}, v), sub ? h('small', {}, sub) : null);

function tiles(){
 const target=$('qa-tiles');if(!lastData){target.replaceChildren();return;}
 const {launches,positions,earn,vests,partial}=lastData,held=positions.filter(p=>p.balance>0).length;
 target.replaceChildren(tile('Your launches',partial?'—':String(launches.length),partial?'Refreshing some reads':'created by this wallet'),tile('Launch tokens held',partial?'—':String(held),'from the launch index'),tile('Earning',partial?'—':String(earn.length+vests.length),'stakes, raffles, vesting'),tile('Reward assets',lastRewards?String(lastRewards.rows.length):'—',lastRewards?.partial?'Refreshing some reads':'balances available to review'));
}
function disconnectedRewards(){return h('div',{},h('p',{},'Connect your EVM wallet to see cashback and referral balances.'),h('button',{type:'button',class:'qa-btn','data-qa-connect':''},'Connect EVM wallet'));}
async function loadRewards(me,mine){
 if(mine!==seq||connectedAddress()!==me)return;
 const serial=++rewardSeq,target=$('qa-evm-panel');
 target.replaceChildren(h('p',{class:'qa-loading',role:'status'},'Reading EVM reward balances…'));
 try{
  const rewards=await rewardsSection(me,()=>void loadRewards(me,mine));if(mine!==seq||serial!==rewardSeq||connectedAddress()!==me)return;
  lastRewards=rewards;
  target.replaceChildren(h('p',{class:'qa-reward-owner'},'Rewards wallet: '+me),...(rewards.rows.length?rewards.rows:[h('p',{class:'qa-empty'},rewards.partial?'Refreshing some reward balances. Refresh to try again.':'No claimable balance in the checked assets yet.')]),rewards.coverage,rewards.ref);tiles();
 }catch(error){if(mine!==seq||serial!==rewardSeq)return;target.replaceChildren(h('p',{class:'qa-status',role:'status'},'Reward balances could not be read. '+(error.message||'')),h('button',{type:'button',class:'qa-btn',onclick:()=>void loadRewards(me,mine)},'Retry reward balances'));}
}
async function load(quiet=false){
 const me=connectedAddress(),mine=++seq,root=$('qa-root');rewardSeq++;lastData=null;lastRewards=null;tiles();
 if(!me){
  $('qa-evm-panel').replaceChildren(disconnectedRewards());
  root.replaceChildren(section('qa-launches','Your launches','Connect your EVM wallet to read launches you created and their income.',[h('button',{type:'button',class:'qx-btn qx-btn-primary','data-qa-connect':''},'Connect wallet')]),section('qa-holdings','Holdings',null,[h('p',{},'Connect your EVM wallet to see indexed launch positions. Use Portfolio for your wider wallet holdings.'),h('a',{class:'qa-btn',href:'/portfolio'},'Open portfolio →')]),section('qa-keys','Wallet and keys',null,[h('p',{},'Your launch dashboard holds creator controls and key recovery. Connect your launch wallet to find it.')]));return;
 }
 void loadRewards(me,mine);
 if(!quiet)root.replaceChildren(h('p',{class:'qa-loading',role:'status'},'Reading your launches and holdings…'));
 try{
  const data=await loadEarnings(me,{refresh:()=>void load(true),includeRewards:false});if(mine!==seq||connectedAddress()!==me)return;
  lastData=data;
  const sections=await renderEarnings(me,data,{refresh:()=>void load(true),includeRewards:false});if(mine!==seq||connectedAddress()!==me)return;
  root.replaceChildren(...[
   ...(data.partial?[h('div',{class:'qa-partial',role:'status'},h('p',{},'Some account reads did not answer. Available data is shown; refresh to check again.'),h('button',{type:'button',class:'qa-btn',onclick:()=>void load()},'Refresh account'))]:[]),...sections,
   section('qa-holdings','Holdings','Indexed launch positions at the last recorded trade price. Results cover indexed buys and sells; transfers and other venues may be missing.',data.coverage?.positions==='unavailable'?[h('p',{class:'qa-empty'},'Your holdings could not be read. Refresh the account to retry.')]:holdingsSection(data.positions)),
   section('qa-keys','Wallet and keys',null,[h('p',{class:'qa-muted'},'Connected: '+me+'. Protected creator actions use this wallet and your saved second key. Open a launch dashboard to manage keys or recovery.'),h('div',{class:'qa-actions'},h('a',{class:'qa-btn qa-btn-primary',href:profileUrl({wallet:me,edit:true})},'Edit profile →'),h('a',{class:'qa-btn',href:'/qwallets'},'qWallets'),h('button',{type:'button',class:'qa-btn','data-qa-connect':''},'Wallet details'))])]);tiles();
 }catch(error){if(mine!==seq)return;root.replaceChildren(h('div',{class:'qa-partial',role:'status'},h('h2',{},'Your account could not be read'),h('p',{},'Your rewards are checked separately. Refresh the account to try again.'),h('button',{type:'button',class:'qa-btn',onclick:()=>void load()},'Retry account')));}
}

onWalletChange(() => load());
load();
