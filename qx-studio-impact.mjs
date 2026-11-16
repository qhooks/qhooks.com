import {planStartLiquidity} from './qx-guided-start-core.mjs';
export function previewRate(c, minutes, isBuy, size, {on,quoteDecimals=18,now=Date.now()/1000,sinceBuySeconds=minutes*60}={}) {
    const t = minutes * 60, n = k => Number(c[k]), parts = [];
    if (on('antiSnipe') && isBuy && t < n('guardSeconds')) {
      const r = n('snipeDecay') === 0 ? n('snipeBps') : t >= n('snipeDecay') ? n('snipeFloorBps') : n('snipeBps') - Math.floor((n('snipeBps') - n('snipeFloorBps')) * t / n('snipeDecay'));
      if (r) parts.push(['Snipe tax', r]);
    }
    if (on('exitClock') && !isBuy) { const r = sinceBuySeconds >= n('exitHorizon') ? n('exitFloorBps') : n('exitTopBps') - Math.floor((n('exitTopBps') - n('exitFloorBps')) * sinceBuySeconds / n('exitHorizon')); if (r) parts.push(['Exit clock', r]); }
    if (on('stormFee') && n('stormFloorBps')) parts.push(['Storm floor', n('stormFloorBps')]);
    if (on('sessionFee')) { const s = session(now), r = [n('regularBps'), n('extendedBps'), n('overnightBps'), n('closedBps')][s]; if (r) parts.push([['Regular hours', 'Extended hours', 'Overnight', 'Weekend'][s], r]); }
    if (on('tax')) { let base = isBuy ? n('buyTaxBps') : n('sellTaxBps'); if (n('launchTaxBps') && t < n('taxDecay')) base = n('launchTaxBps') - Math.floor((n('launchTaxBps') - base) * t / n('taxDecay')); if (base) parts.push([isBuy ? 'Buy tax' : 'Sell tax', base]); }
    if (on('sizeTiers')) { const q = BigInt(Math.floor(Math.max(0,size)*10**quoteDecimals)); const r = q >= BigInt(c.tier2) ? n('tier2Bps') : q >= BigInt(c.tier1) ? n('tier1Bps') : 0; if (r) parts.push(['Whale tier', r]); }
    let total = parts.reduce((s, p) => s + p[1], 0);
    if (total > 5000) { parts.push(['Capped at 50%', 5000 - total]); total = 5000; }
    if (on('autoBurn') && isBuy) parts.push(['Burned from tokens', n('burnBps')]);
    return parts;
  }
  function session(ts) {
    const y = new Date(ts * 1000).getUTCFullYear();
    const sunday = (m, nth) => { const first = new Date(Date.UTC(y, m, 1)); const day = 1 + (7 - first.getUTCDay()) % 7 + 7 * (nth - 1); return Date.UTC(y, m, day) / 1000; };
    const dst = ts >= sunday(2, 2) + 7 * 3600 && ts < sunday(10, 1) + 6 * 3600;
    const local = new Date((ts - (dst ? 4 : 5) * 3600) * 1000), dow = local.getUTCDay(), minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (dow === 6) return 3; if (dow === 0) return minute >= 1200 ? 2 : 3; if (dow === 5 && minute >= 1200) return 3;
    if (minute < 240 || minute >= 1200) return 2; if (minute >= 570 && minute < 960) return 0; return 1;
  }


export function studioImpact({config:c,on,size,minutes,lpPercent=1,quoteDecimals=18,supply=1e9,tokenAmount=1e9,pricing,quote,tokenDecimals=18,quoteFunding='0',sinceBuy=0,now}={}){
 const n=k=>Number(c[k]||0),t=minutes*60;
 if(!Number.isFinite(size)||size<=0||!Number.isFinite(minutes)||minutes<0||!Number.isFinite(sinceBuy)||sinceBuy<0)return {error:'Enter a positive size and a minute of zero or more.'};
 let reserve=null,price=null;
 try{const plan=planStartLiquidity({token:'0x0000000000000000000000000000000000000001',quote,tokenDecimals,quoteDecimals,tokenAmount:String(tokenAmount),quoteAmount:quoteFunding,totalSupply:String(BigInt(Math.round(supply))*10n**BigInt(tokenDecimals)),pricing});const P=Number(plan.sqrtPriceX96)/2**96,L=Number(plan.position.liquidity);reserve=(plan.tokenIs0?L*P:L/P)/10**quoteDecimals;price=Number(pricing.startCapWei)/10**quoteDecimals/supply;}catch{}
 const cols=[true,false].map(isBuy=>{
  const parts=previewRate(c,minutes,isBuy,size,{on,quoteDecimals,now,sinceBuySeconds:sinceBuy});
  const blockBps=Math.min(5000,parts.filter(p=>p[0]!=='Burned from tokens').reduce((a,p)=>a+p[1],0)),lpBps=lpPercent*100,protocolBps=Math.floor(lpPercent*10000/5)/100;
  const fees=size*(blockBps+lpBps+protocolBps)/10000,net=Math.max(0,size-fees),ratio=reserve>0?net/reserve:null;
  const move=ratio===null?null:(isBuy?(1+ratio)**2-1:1-1/(1+ratio)**2)*100;
  const impact=ratio===null?null:ratio/(1+ratio)*100;
  const hits=[];
  if(on('openDelay')&&t<n('openDelay'))hits.push('Trading opens at minute '+n('openDelay')/60+'.');
  if(isBuy&&on('holderGate')&&t<n('gateSeconds'))hits.push('Buyer must hold the gate token; wallet eligibility is not simulated.');
  if(isBuy&&on('cooldown')&&t<n('guardSeconds')&&sinceBuy<n('cooldownSeconds'))hits.push('Cooldown hit: wait '+Math.ceil(n('cooldownSeconds')-sinceBuy)+'s.');
  if(isBuy&&on('antiSnipe')&&t<n('guardSeconds')&&n('maxBuyPerBlock')>0&&(n('snipeDecay')===0||t<n('snipeDecay'))){const cap=n('maxBuyPerBlock')/10**quoteDecimals*(n('snipeDecay')===0?1:n('snipeDecay')/(n('snipeDecay')-t));if(size>cap)hits.push('Per-block buy cap hit (assuming no earlier buy this block).');}
  const tokenLeg=price>0?net/price/(1+(ratio||0)):null;
  if(isBuy&&on('walletCap')&&t<n('guardSeconds'))hits.push(tokenLeg===null?'Wallet cap: needs starting price.':tokenLeg>supply*n('walletCapBps')/10000?'Wallet cap hit.':'Within wallet cap for a wallet with no prior buys.');
  if(on('maxTrade')&&(n('maxTradeSeconds')===0||t<n('maxTradeSeconds')))hits.push(tokenLeg===null?'Max trade: needs starting price.':tokenLeg>supply*n('maxTradeBps')/10000?'Max trade cap hit.':'Within max trade cap.');
  if(on('impactFee'))hits.push(move===null?'Impact fee needs starting price.':'Impact fee estimate '+Math.min(n('impactCeilBps'),move*100*n('impactSlope')/100)/100+'% of the output leg, in addition.');
  if(on('sandwich'))hits.push('Sandwich charge depends on earlier swaps in this block.');
  if(on('stormFee'))hits.push('Storm floor shown; volatility can raise it.');
  let remaining=10000;const buckets=[];for(const [id,k,label]of [['king','kingShareBps','King pot'],['clockPot','clockShareBps','Last-buyer pot'],['buyback','buybackShareBps','Buyback'],['referrals','referralShareBps','Referrer (when supplied)']])if(on(id)){remaining-=n(k);buckets.push({label,amount:size*blockBps/10000*n(k)/10000});}
  const payees=(c.payees||[]).map(([address,bps])=>({address,amount:size*blockBps/10000*Math.max(0,remaining)/10000*Number(bps)/10000}));
  return {isBuy,parts,blockBps,lpBps,protocolBps,fees,net,impact,move,hits,payees,buckets,lpAmount:size*lpBps/10000,protocolAmount:size*protocolBps/10000};
 });return {cols,reserve,price};
}
