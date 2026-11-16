import {mountAccountHoldings} from './qx-account-holdings.mjs';
import {solAddress,onSolChange} from './qx-solana.mjs';
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

// One holdings component across My QHooks and Portfolio.
let holdings=null,holdingsPanel=null,holdingsOwner=null;
const total=h('a',{class:'qa-btn qa-me-total',href:'/portfolio'},'Connect to see your total');
document.querySelector('.mn-me-hero')?.append(total);
function holdingsSection(){return [h('div',{id:'qa-shared-holdings'})];}
function mountHoldings(){holdings?.dispose();const root=$('qa-shared-holdings');if(root)holdings=mountAccountHoldings({h,root,total,owner:connectedAddress,connected:connectedAddress,solAddress});}
onSolChange(()=>holdings?.refresh());

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
 const me=connectedAddress(),mine=++seq,root=$('qa-root');document.querySelector('main.mn-me')?.classList.toggle('qa-me-connected',!!me);total.hidden=!me;rewardSeq++;lastData=null;lastRewards=null;tiles();
 if(!me){
  holdings?.dispose();holdings=null;holdingsPanel=null;holdingsOwner=null;total.textContent='Connect to see your total';
  $('qa-evm-panel').replaceChildren(disconnectedRewards());
  root.replaceChildren(section('qa-launches','Your launches','Connect your EVM wallet to read launches you created and their income.',[h('button',{type:'button',class:'qx-btn qx-btn-primary','data-qa-connect':''},'Connect')]),section('qa-holdings','Holdings',null,[h('p',{},'Connect your EVM wallet to see indexed launch positions. Use Portfolio for your wider wallet holdings.'),h('a',{class:'qa-btn',href:'/portfolio'},'Open portfolio →')]),section('qa-keys','Wallet and keys',null,[h('p',{},'Your launch dashboard holds creator controls and key recovery. Connect your launch wallet to find it.')]));const firstHolding=$('qa-holdings');if(firstHolding)root.prepend(firstHolding);return;
 }
 void loadRewards(me,mine);
 const first=holdingsOwner!==me||!holdingsPanel;if(first){holdings?.dispose();holdingsOwner=me;holdingsPanel=section('qa-holdings','Holdings',null,holdingsSection());}
 if(!quiet)root.replaceChildren(h('p',{class:'qa-loading',role:'status'},'Reading your launches…'),holdingsPanel);else if(!holdingsPanel.isConnected)root.append(holdingsPanel);if(first)mountHoldings();
 try{
  const data=await loadEarnings(me,{refresh:()=>void load(true),includeRewards:false});if(mine!==seq||connectedAddress()!==me)return;
  lastData=data;
  const sections=await renderEarnings(me,data,{refresh:()=>void load(true),includeRewards:false});if(mine!==seq||connectedAddress()!==me)return;
  root.replaceChildren(...[holdingsPanel,
   ...(data.partial?[h('div',{class:'qa-partial',role:'status'},h('p',{},'Some account reads did not answer. Available data is shown; refresh to check again.'),h('button',{type:'button',class:'qa-btn',onclick:()=>void load()},'Refresh account'))]:[]),...sections,
   section('qa-keys','Wallet and keys',null,[h('p',{class:'qa-muted'},'Connected: ',h('span',{title:me},me.slice(0,6)+'…'+me.slice(-4)),'. Protected creator actions use this wallet and your saved second key. Open a launch dashboard to manage keys or recovery.'),h('div',{class:'qa-actions'},h('a',{class:'qa-btn qa-btn-primary',href:profileUrl({wallet:me,edit:true})},'Edit profile →'),h('a',{class:'qa-btn',href:'/qwallets'},'qWallets'),h('button',{type:'button',class:'qa-btn','data-qa-connect':''},'Wallet details'))])]);tiles();
 }catch(error){if(mine!==seq)return;root.replaceChildren(h('div',{class:'qa-partial',role:'status'},h('h2',{},'Your account could not be read'),h('p',{},'Your rewards are checked separately. Refresh the account to try again.'),h('button',{type:'button',class:'qa-btn',onclick:()=>void load()},'Retry account')),holdingsPanel);}
}

onWalletChange(() => load());
load();
