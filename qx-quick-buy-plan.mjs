import{chainById}from'./chains.mjs';
import{QUICK_DEFAULTS}from'./qx-trade-settings-store.mjs';
import{stockPair}from'./full-launch/packages/multichain-launch/stock-pairs.mjs';
import{externalTradingNote}from'./qx-external-trading.mjs';
const EVM=/^0x[0-9a-f]{40}$/i,SOL=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const classes={ETH:'eth',WETH:'eth',BNB:'bnb',WBNB:'bnb',SOL:'sol',WSOL:'sol',HYPE:'hype',WHYPE:'hype',USDC:'usd',USDT:'usd',USDG:'usd'};
export const quickPaymentClass=symbol=>classes[String(symbol||'').toUpperCase()]||null;
const positive=value=>typeof value==='string'&&/^(?:0|[1-9]\d{0,11})(?:\.\d{1,18})?$/.test(value)&&/[1-9]/.test(value);
const symbol=value=>String(value||'').trim().toUpperCase();
const address=(family,value)=>typeof value==='string'&&(family==='solana'?SOL:EVM).test(value)?family==='solana'?value:value.toLowerCase():null;
const validPayment=value=>value&&['evm','solana'].includes(value.family)&&(value.family==='solana'?String(value.chainId)==='solana':/^[1-9]\d*$/.test(String(value.chainId)))&&Number.isInteger(value.decimals)&&value.decimals>=0&&value.decimals<=36&&(value.kind==='native'?value.address===null:value.kind==='token'&&!!address(value.family,value.address))&&!!quickPaymentClass(value.symbol);
export function sameQuickPayment(a,b){return !!(validPayment(a)&&validPayment(b)&&String(a.chainId)===String(b.chainId)&&a.family===b.family&&a.kind===b.kind&&a.decimals===b.decimals&&symbol(a.symbol)===symbol(b.symbol)&&(a.kind==='native'||address(a.family,a.address)===address(b.family,b.address)));}
/** One configured amount/currency per chain. Values keep the established quick
 * keys; this describes an asset, never converts an amount or proves a route. */
export function chainQuickCurrency(chainId){
 const chain=String(chainId);
 if(chain==='solana')return{cls:'sol',unit:'SOL',payment:{chainId:chain,family:'solana',kind:'native',address:null,decimals:9,symbol:'SOL'}};
 const c=chainById(chain);if(!c)return null;
 const cls={ETH:'eth',BNB:'bnb',HYPE:'hype'}[c.native];
 if(cls)return{cls,unit:c.native,payment:{chainId:chain,family:'evm',kind:'native',address:null,decimals:18,symbol:c.native}};
 // Arc's existing USD quick amount is its ERC-20 USDC quote, distinct from
 // native USDC gas units. Monad's launch factory likewise accepts USDC, not ETH.
 const q=c.simpleLaunchMulti?.quotes?.find(q=>q[1]==='USDC'),usdc=c.native==='USDC'&&c.quote?.symbol==='USDC'?{address:c.quote.address,decimals:c.quote.decimals}:c.native==='MON'&&q?{address:q[2],decimals:q[3]}:null;
 return usdc?{cls:'usd',unit:'USDC',payment:{chainId:chain,family:'evm',kind:'token',address:usdc.address.toLowerCase(),decimals:usdc.decimals,symbol:'USDC'}}:null;
}
export function quickBuyPlan({chainId,token=null,kind='external'}={},quick={}){
 const chain=String(chainId),currency=chainQuickCurrency(chain),stock=!!stockPair(chain,token),reason=!currency?'Quick buy is unavailable on this chain. Open the trade ticket.':kind==='external'&&chain!=='solana'?externalTradingNote(chain):null;
 if(!currency)return{cls:null,unit:'',value:'',payment:null,stock,supported:false,reason};
 const raw=String(quick[currency.cls]??''),value=positive(raw)?raw:QUICK_DEFAULTS[currency.cls];
 return{...currency,value,stock,supported:!reason,reason};
}
/** Enumerate only payment choices the mounted ticket actually exposes. */
export function quickBuyPaymentOptions(state,options,nativeSymbol){
 if(!state)return[];const chainId=String(state.chainId),family=chainId==='solana'?'solana':'evm',native=family==='solana'?'SOL':nativeSymbol;
 return Array.from(options||[]).filter(o=>!o.disabled).flatMap(o=>{
  const pay=String(o.value);
  if(pay==='native')return[{pay,payment:{chainId,family,kind:'native',address:null,decimals:family==='solana'?9:18,symbol:native}}];
  const quote=pay==='quote'&&!state.multi?state:state.multi?(state.pools||[]).find(p=>p.quote===pay):null;
  if(!quote)return[];
  const payment={chainId,family,kind:'token',address:address(family,quote.quote),decimals:quote.quoteDecimals,symbol:quote.quoteSymbol};
  return validPayment(payment)?[{pay,payment}]:[];
 }).filter(o=>validPayment(o.payment));
}
export function resolveQuickBuyPayment({cls,value,payment=null}={},options=[],{chainId,noRoute=null,symbol:token='this token'}={}){
 const fail=reason=>({ok:false,reason});
 if(noRoute)return fail(noRoute);
 if(!['usd','eth','bnb','sol','hype'].includes(cls)||!positive(String(value??'')))return fail('Choose a valid quick-buy amount and currency in Trade settings.');
 const available=options.filter(o=>validPayment(o.payment)&&String(o.payment.chainId)===String(chainId)&&quickPaymentClass(o.payment.symbol)===cls);
 let selected;
 if(payment){if(!validPayment(payment)||quickPaymentClass(payment.symbol)!==cls)return fail('The quick-buy currency changed. Choose Buy again.');selected=available.find(o=>sameQuickPayment(payment,o.payment));}
 else{
  // Preserve the valid two-argument API: an exposed native choice is explicit;
  // otherwise require one unambiguous token choice. Unknown classes fail closed.
  selected=available.find(o=>o.payment.kind==='native')||(available.length===1?available[0]:null);
 }
 if(!selected)return fail((payment?.symbol||cls.toUpperCase())+' quick buy is unavailable for '+token+'. Choose a payment currency in the trade ticket.');
 return{ok:true,pay:selected.pay,payment:{...selected.payment},value:String(value)};
}
export function quickBuyContext({chainId,token,controller,symbol:tokenSymbol},plan){
 const chain=String(chainId),name=chain==='solana'?'Solana':chainById(chain)?.name||chain,label=String(tokenSymbol||'').trim().slice(0,80)||'this token';
 return{title:'Buy '+label,line:plan.value+' '+plan.unit+' · '+name,address:token||controller||'',chainId:chain};
}
