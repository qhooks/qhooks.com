import {FEE_BPS, tradeFee, cashbackShare} from './qx-trade-fee-policy.mjs';
export const COST_MAX_AGE_MS = 30000;
const UINT = /^(?:0|[1-9][0-9]{0,77})$/;
export function atomic(value) {
  if (typeof value === 'bigint') return value >= 0n && value < 1n << 256n ? value : null;
  if (!['string','number'].includes(typeof value)) return null;
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  return UINT.test(String(value)) && BigInt(value) < 1n << 256n ? BigInt(value) : null;
}
export function amountText(value, asset, exact = false) {
  const a = atomic(value), d = asset?.decimals;
  if (a === null || !Number.isInteger(d) || d < 0 || d > 36) return 'Unavailable';
  const s = a.toString().padStart(d + 1, '0'), whole = d ? s.slice(0, -d) : s;
  let fraction = d ? s.slice(-d).replace(/0+$/, '') : '';
  if (!exact && fraction) {
    const first = fraction.search(/[1-9]/), keep = whole === '0' ? Math.max(6, first + 6) : 6;
    fraction = fraction.slice(0, keep).replace(/0+$/, '');
  }
  return whole + (fraction ? '.' + fraction : '') + ' ' + String(asset.symbol || '').slice(0, 40);
}
export const sameAsset = (a, b) => !!a && !!b && a.family === b.family && a.chainId === b.chainId && a.id === b.id && a.decimals === b.decimals;
export function costContext(c, assets, family) {
  return Object.freeze({revision:c.revision,selection:c.selection,owner:c.owner,family,
    chainId:c.chainId,token:c.token,side:c.side,pay:c.pay,amount:c.a,
    toleranceBps:c.toleranceBps,input:assets.input,output:assets.output,readAt:c.readAt});
}
export function costIsCurrent(record, context, now = Date.now()) {
  const validAt=at=>typeof at==='number'&&Number.isFinite(at)&&at>0&&at<=now;
  if (!record?.context || !context || !Number.isFinite(now) || !validAt(record.context.readAt) || !validAt(context.readAt) || context.readAt!==record.context.readAt || now-record.context.readAt>COST_MAX_AGE_MS) return false;
  const a = record.context, b = context;
  return ['revision','selection','owner','family','chainId','token','side','pay','amount','toleranceBps'].every(k => a[k] === b[k]) && sameAsset(a.input,b.input) && sameAsset(a.output,b.output);
}
export function tradeCosts({context, received, minimum, grossOutput, impactPct, route, solOrder = null}) {
  const a = atomic(context.amount), gross = atomic(grossOutput);
  const evm = context.family === 'evm';
  // Sell fees are captured before the existing cut. Never reconstruct gross from rounded net proceeds.
  const base = context.side === 'buy' ? a : gross;
  const fee = evm && base !== null ? tradeFee(base) : null;
  const feeAsset = context.side === 'buy' ? context.input : context.output;
  const platform = evm ? {amount:fee,asset:feeAsset,bps:Number(FEE_BPS),included:context.side === 'buy'?'input':'output'} : solPlatform(solOrder,context);
  return Object.freeze({context,received:atomic(received),minimum:atomic(minimum),
    impactPct:Number.isFinite(impactPct) ? Math.abs(impactPct) : null,
    route:String(route || 'Pool route').slice(0,160),platform,
    cashback:evm && fee !== null ? {amount:cashbackShare(fee),asset:feeAsset,share:30,kind:'claimable'} : null,
    network:context.family === 'solana' ? solNetwork(solOrder,context.owner) : {state:'loading'},
    pool:'Included in quote · separate amount unavailable',
    mev:'Private orderflow protection not confirmed'});
}
function solPlatform(order, context) {
  if (order?.route === 'dbc') return {amount:null,asset:null,bps:null,note:'DBC pool charges included in quote · QHooks share not itemized'};
  const bps = Number(order?.feeBps), mint = order?.feeMint;
  const asset = [context.input,context.output].find(a=>a.id===mint);
  const amount = validSolCosts(order,context.owner) && order.costs.feeMint===mint ? atomic(order.costs.platformAmount) : null;
  if (order?.platformFee !== true || ![60,70].includes(bps) || !asset) return {amount:null,asset:null,bps:null,note:'Jupiter fee not itemized · review wallet'};
  return {amount,asset,bps,note:amount===null?'Fee '+bps/100+'% · included in quote':'Included in quote',discountShare:bps===60?40:30};
}
function solNetwork(order, owner) {
  if (order?.route === 'dbc') {
    const amount = order.prepared?.owner === owner ? atomic(order.prepared?.networkLamports) : null;
    return amount === null ? {state:'unknown',reason:'Network estimate unavailable'} : {state:'sol',amount,setup:null,reason:'Prepared message network fee · account rent not itemized'};
  }
  const c = order?.costs;
  if (!validSolCosts(order,owner)) return {state:'unknown',reason:'Network and account rent not itemized'};
  const sig = atomic(c.signature), priority = atomic(c.priority), rent = atomic(c.rent);
  // A payer other than this wallet is not silently interpreted as a free trade.
  const own = key => c[key+'Payer'] === 'wallet';
  return {state:'sol',amount:sig!==null&&priority!==null&&own('signature')&&own('priority')?sig+priority:null,
    setup:rent!==null&&own('rent')?rent:null,
    reason:c.gasless===true?'Provider reports gasless · payer details shown when available':'Provider estimate for this order'};
}
// Display-only summation; buy platform fees are already within the entered amount.
export function walletSpend(record, network) {
  if (record.context.side !== 'buy' || network?.state !== 'estimated' || network.fullSpend === false || !sameAsset(record.context.input,network.asset)) return null;
  return record.context.amount + network.amount + (network.setup || 0n) + (network.approval || 0n);
}

// Allowlisted same-response projection; absent or another payer never means zero.
function validSolCosts(order,owner){const c=order?.costs;return c?.version===1&&c.owner===owner&&c.requestId===order.requestId&&c.feeMint===order.feeMint;}
export function projectSolOrderCosts(order,{owner,input,output,platformFee=false}={}) {
  const b58=v=>typeof v==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
  const context=b58(owner)&&order?.taker===owner&&order.inputMint===input&&order.outputMint===output&&typeof order.requestId==='string'&&order.requestId.length>0&&order.requestId.length<=160&&typeof order.transaction==='string'&&!!order.transaction;
  if(!context)return null;
  const number=v=>{const n=atomic(v);return n===null?null:n.toString();};
  const payer=v=>v===owner?'wallet':b58(v)?'other':'unknown';
  const pf=order.platformFee;
  const feeAmount=platformFee&&pf&&typeof pf==='object'&&pf.feeMint===order.feeMint&&Number(pf.feeBps)===Number(order.feeBps)?number(pf.amount):null;
  return {version:1,owner,requestId:order.requestId,feeMint:b58(order.feeMint)?order.feeMint:null,platformAmount:feeAmount,
    signature:number(order.signatureFeeLamports),signaturePayer:payer(order.signatureFeePayer),
    priority:number(order.prioritizationFeeLamports),priorityPayer:payer(order.prioritizationFeePayer),
    rent:number(order.rentFeeLamports),rentPayer:payer(order.rentFeePayer),
    gasless:typeof order.gasless==='boolean'?order.gasless:null};
}

// Platform + network/setup only. No FX, notional fee inversion or cashback deduction.
export function totalTicketFees(record, network = record?.network) {
  const groups=[];let partial=false;
  const add=(amount,asset)=>{const n=atomic(amount);if(n===null||!asset?.id||!asset.family||!asset.chainId||!Number.isInteger(asset.decimals)||asset.decimals<0||asset.decimals>36){partial=true;return;}const found=groups.find(g=>sameAsset(g.asset,asset));if(found)found.amount+=n;else groups.push({asset,amount:n});};
  add(record?.platform?.amount,record?.platform?.asset);
  if(network?.state==='estimated'){
    add(network.amount,network.asset);add(network.approval,network.asset);add(network.setup,network.asset);
    if(network.fullSpend===false)partial=true;
  }else if(network?.state==='sol'){
    const sol={family:'solana',chainId:record.context.chainId,id:'So11111111111111111111111111111111111111112',symbol:'SOL',decimals:9};
    add(network.amount,sol);add(network.setup,sol);
  }else partial=true;
  return {state:groups.length?(partial?'partial':network.kind==='budget'?'budget':'estimate'):'unknown',groups,
    scope:'Platform + network/setup; pool charges stay in receive.'};
}
