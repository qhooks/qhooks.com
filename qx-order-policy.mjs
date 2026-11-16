// Only QHooks' pinned Permit2 order executor is eligible for the existing one-click press.
export const EXECUTOR='0x5500f24e75ebb84ae8380d03e933678cf8322500';
export const LEGACY_TRIGGER='0x2a20cdbdf1fcac340ef1e8653f688502ef712862';
export const PERMIT2='0x000000000022d473030f116ddee9f6b43ac78ba3';
export const ORDER_CHAINS=Object.freeze(['4663','8453','42161','56','99901','1']);
export const ORDER_FIELDS=Object.freeze([['trader','address'],['tokenIn','address'],['tokenOut','address'],['amountIn','uint256'],['minOutPerIn','uint256'],['triggerPool','bytes32'],['triggerSqrtPriceX96','uint160'],['triggerBelow','bool'],['feeOnInput','bool'],['keeperFeeBps','uint16'],['referrer','address'],['nonce','uint256'],['deadline','uint256']].map(Object.freeze));
const DOMAIN=[['name','string'],['chainId','uint256'],['verifyingContract','address']],PERMIT=[['permitted','TokenPermissions'],['spender','address'],['nonce','uint256'],['deadline','uint256'],['witness','Order']],TOKEN=[['token','address'],['amount','uint256']];
const address=a=>typeof a==='string'&&/^0x[0-9a-f]{40}$/i.test(a),nonzero=a=>address(a)&&BigInt(a)!==0n,same=(a,b)=>typeof a==='string'&&a.toLowerCase()===String(b).toLowerCase();
const keys=(o,n)=>o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).sort().join('|')===[...n].sort().join('|');
const uint=(v,b=256)=>{try{return(typeof v==='number'?Number.isSafeInteger(v):typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v))&&BigInt(v)>=0n&&BigInt(v)<1n<<BigInt(b);}catch{return false;}};
const fields=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&actual.every((f,i)=>keys(f,['name','type'])&&f.name===expected[i][0]&&f.type===expected[i][1]);
export function orderRequestAllowed({method,params}={},chain,owner,now=Date.now()){
 const id=String(Number(String(chain).replace(/^eip155:/,'')));if(!ORDER_CHAINS.includes(id)||!nonzero(owner))return false;
 if(method==='eth_sendTransaction'){
  const tx=params?.[0],data=String(tx?.data||'').toLowerCase();let value;try{value=BigInt(tx?.value||0);}catch{return false;}
  if(!nonzero(tx?.to)||value!==0n||tx.from&&!same(tx.from,owner)||tx.chainId!==undefined&&Number(tx.chainId)!==Number(id))return false;
  if(/^0x095ea7b30{24}[0-9a-f]{104}$/.test(data)){const spender='0x'+data.slice(34,74),amount=BigInt('0x'+data.slice(74));return same(spender,PERMIT2)||same(spender,LEGACY_TRIGGER)&&amount>0n&&amount<(1n<<128n);}
  // Existing escrow TP/SL only: pinned contract, place selector, canonical static ABI. Cancel/execute stay outside a press.
  if(!same(tx.to,LEGACY_TRIGGER)||!/^0x953a6fc6[0-9a-f]{896}$/.test(data))return false;
  const word=i=>BigInt('0x'+data.slice(10+i*64,74+i*64));return word(0)>0n&&word(0)<(1n<<160n)&&word(6)<=1n&&word(7)>0n&&word(7)<(1n<<128n)&&word(8)<(1n<<160n)&&word(9)<(1n<<128n)&&word(10)<(1n<<160n)&&word(11)<(1n<<128n)&&word(12)>BigInt(Math.floor(now/1000))&&word(12)<=BigInt(Math.floor(now/1000)+30*86400+60)&&[10n,30n,100n].includes(word(13));
 }
 if(method!=='eth_signTypedData_v4'||params?.length!==2||typeof params[1]!=='string'||!same(params[0],owner))return false;
 try{
  const d=typeof params[1]==='string'?JSON.parse(params[1]):params[1];if(!keys(d,['domain','types','primaryType','message'])||d.primaryType!=='PermitWitnessTransferFrom')return false;
  const types=d.types;if(!keys(types,['EIP712Domain','PermitWitnessTransferFrom','TokenPermissions','Order'])||!fields(types.EIP712Domain,DOMAIN)||!fields(types.PermitWitnessTransferFrom,PERMIT)||!fields(types.TokenPermissions,TOKEN)||!fields(types.Order,ORDER_FIELDS))return false;
  if(!keys(d.domain,['name','chainId','verifyingContract'])||d.domain.name!=='Permit2'||Number(d.domain.chainId)!==Number(id)||!same(d.domain.verifyingContract,PERMIT2))return false;
  const m=d.message,o=m?.witness;if(!keys(m,['permitted','spender','nonce','deadline','witness'])||!keys(m.permitted,['token','amount'])||!same(m.spender,EXECUTOR)||!keys(o,ORDER_FIELDS.map(f=>f[0])))return false;
  if(!same(o.trader,owner)||!nonzero(o.tokenIn)||!nonzero(o.tokenOut)||same(o.tokenIn,o.tokenOut)||!same(m.permitted.token,o.tokenIn)||String(m.permitted.amount)!==String(o.amountIn)||String(m.nonce)!==String(o.nonce)||String(m.deadline)!==String(o.deadline))return false;
  if(!uint(o.amountIn)||BigInt(o.amountIn)<=0n||!uint(o.minOutPerIn)||BigInt(o.minOutPerIn)<=0n||!uint(o.nonce)||!uint(o.deadline)||BigInt(o.deadline)<=BigInt(Math.floor(now/1000))||BigInt(o.deadline)>BigInt(Math.floor(now/1000)+30*86400+60))return false;
  if(!/^0x[0-9a-f]{64}$/i.test(o.triggerPool)||!uint(o.triggerSqrtPriceX96,160)||typeof o.triggerBelow!=='boolean'||typeof o.feeOnInput!=='boolean'||Number(o.keeperFeeBps)!==30||!address(o.referrer))return false;
  return true;
 }catch{return false;}
}
