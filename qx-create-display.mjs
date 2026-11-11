// Presentation only: never used to build a transaction or authorize a launch.
import {chainById} from './chains.mjs';
import {human} from './qx-create-plan.mjs';
const amount=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
const dollars=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
export function createCostView(config,cost=null,prices={}){
 const chain=chainById(config.chainId),liquidity=amount(config.liquidity),fee=amount(chain.launchFee);
 const nativeRate=chain.native==='USDC'?1:amount(prices[chain.native]);
 const rate=nativeRate>0?nativeRate:null,quoteRate=chain.quote.symbol==='USDC'?1:chain.quote.wrapNative?rate:null;
 let gas=null;try{if(cost?.networkGasWei!=null)gas=amount(human(cost.networkGasWei));}catch{}
 const gasKnown=gas!==null,total=liquidity!==null&&quoteRate!==null&&fee!==null&&rate!==null?liquidity*quoteRate+fee*rate+(gasKnown?gas*rate:0):null;
 return{
  total:Number.isFinite(total)?total:null,
  headline:total!==null&&Number.isFinite(total)?'≈ '+dollars(total)+' total'+(gasKnown?'':' + network gas'):'Estimated $ total unavailable'+(gasKnown?'':' · + network gas'),
  liquidity:String(config.liquidity)+' '+chain.quote.symbol+(liquidity!==null&&quoteRate!==null?' · ≈ '+dollars(liquidity*quoteRate):''),
  fee:chain.launchFee+' '+chain.native+(rate!==null?' · ≈ '+dollars(fee*rate):''),
  gas:gasKnown?human(cost.networkGasWei)+' '+chain.native+(rate!==null?' · ≈ '+dollars(gas*rate):''):'Unknown · + network gas',
  note:chain.quote.symbol==='USDC'||chain.native==='USDC'?'Entered liquidity is a limit. Unused assets stay in your wallet. Dollar estimates value USDC at $1.':'Entered liquidity is a limit. Unused assets stay in your wallet.'
 };
}
export function walletStepLabel(record,steps){
 if(!record||record.status==='done')return '';
 const index=record.current?steps.findIndex(step=>step.id===record.current):steps.findIndex(step=>record.steps?.[step.id]?.status!=='done');
 return index<0?'':'Step '+(index+1)+' of '+steps.length+' · '+steps[index].label;
}
export const QUANTUM_EXPLANATION='Every launch on the current engine uses both keys.';
export function showRequiredQuantum(input){input.checked=true;input.disabled=true;input.setAttribute('aria-describedby','qc-quantum-note');}
export function bindFundWallet(link,{hub,chainId,note,loadMove=()=>import('./qx-move-funds.mjs')}){
 const open=async event=>{
  event.preventDefault();
  if(!hub.snapshot().current){hub.open();note('Connect your wallet, then choose Fund wallet.');return;}
  try{const move=await loadMove();await move.openMoveFunds({to:Number(chainId())});}
  catch{note('Open your wallet options to move funds, or send funds to your wallet address.',true);hub.open();}
 };
 link.addEventListener('click',open);return()=>link.removeEventListener('click',open);
}

// The executor covers one-tap launches from the factory it trusts and every Studio
// launch (each proven on chain), and refuses launches running a KING or CLOCK pot.
const GAME_BLOCKS=new Set(['king','clockPot']);
// factory: the Simple-launch factory a one-tap launch goes to (the executor trusts
// exactly one, arbRecapture.simpleLaunch), or 'studio' for a guided Studio launch.
export function arbRecaptureLine(chain,blocks=[],factory=null){
 const own=chain?.arbRecapture?.simpleLaunch;
 if(!chain?.arbRecapture?.executor||!/^0x[0-9a-f]{40}$/i.test(own||'')||!factory||factory!=='studio'&&String(factory).toLowerCase()!==own.toLowerCase()||blocks.some(b=>GAME_BLOCKS.has(b?.id??b)))return null;
 return "Arb recapture: on — when your token's price drifts apart between pools, a shared contract brings it back in line and burns your token with the difference.";
}
export function appendArbRecaptureLine(container,chain,blocks=[],factory=null){
 const text=arbRecaptureLine(chain,blocks,factory);if(!text)return null;
 const line=container.ownerDocument.createElement('p');line.className='qxc-fine';line.textContent=text;container.append(line);return line;
}
