// Public native-wrap progress only. Never contains a key or spending approval.
import {ensure,shape,address,hash} from '../token-launch/artifact.mjs';
import {walletFeePolicy} from '../chain-wallet/fees.mjs';
import {rpcQuantity} from '../multichain/fee-math.mjs';
export const WRAP_GAS_LIMIT=500000n;
const txKeys=['type','chainId','from','to','data','value','nonce','gas','maxFeePerGas','maxPriorityFeePerGas'];
export function readWrapJournal(text,{chainId,owner,quote}){
 ensure(['4663','56'].includes(chainId)&&address(owner)&&address(quote),'Admitted native-wrap identity required');
 ensure(typeof text==='string'&&text.length<=20000,'Bounded public wrapping progress required');const j=JSON.parse(text),p=walletFeePolicy(chainId);
 ensure(shape(j,['version','kind','chainId','owner','quote','amount','stage'])&&j.version===1&&j.kind==='qhooks-native-wrap'&&j.chainId===chainId&&j.owner===owner&&j.quote===quote,'Wrapping progress identity mismatch');
 ensure(typeof j.amount==='string'&&j.amount.length<=78&&/^[1-9][0-9]*$/.test(j.amount)&&BigInt(j.amount)<(1n<<256n),'Canonical positive wrapping amount required');
 if(j.stage!==null){
  const s=j.stage;ensure(shape(s,['transaction','status','hash'])&&['pending','rejected','submitting','unknown','submitted','confirmed','reverted'].includes(s.status),'Wrapping stage required');
  ensure(['submitted','confirmed','reverted'].includes(s.status)?hash(s.hash):s.hash===null,'Wrapping hash/status mismatch');
  const t=s.transaction;ensure(shape(t,txKeys)&&t.type==='0x2'&&t.chainId===p.hexId&&t.from===owner&&t.to===quote&&t.data==='0xd0e30db0'&&t.value==='0x'+BigInt(j.amount).toString(16),'Only the exact native wrapping call is allowed');
  const n=rpcQuantity(t.nonce),g=rpcQuantity(t.gas),f=rpcQuantity(t.maxFeePerGas),tip=rpcQuantity(t.maxPriorityFeePerGas);
  ensure(n<(1n<<64n)-1n&&g>0n&&g<=WRAP_GAS_LIMIT&&f>0n&&f<=p.maxPrice&&tip<=f,'Wrapping transaction bounds');
  if(s.status==='submitting')s.status='unknown';
 }
 return j;
}
