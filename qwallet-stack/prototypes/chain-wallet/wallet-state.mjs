// Canonical six-chain account state. Candidate crypto executes only in isolated VM.
import {poolCalldata,poolHash,poolBytes} from '../qpools/client/pool-calldata.mjs';
import {abiEncode} from '../../packages/launchpad/abi-encode.mjs';
import {ensure,address,quantity} from '../../apps/marketplace-preview/mainnet-fees.mjs';
import {assertWalletBinding,checkWalletRuntime} from './wallet-binding.mjs';
import {requireRpcChain,networkProfile} from '../../packages/multichain/profiles.mjs';
export const ZERO='0x'+'00'.repeat(20),MODULE='0x51484f4f4b532f51504f4f4c2f534c48313238532f5631'.padEnd(66,'0'),word=n=>BigInt(n).toString(16).padStart(64,'0');
const hash=s=>typeof s==='string'&&/^0x[0-9a-f]{64}$/.test(s),text=new TextEncoder();
export async function readWalletAccount({provider,binding,owner,publicKey,asset=ZERO,live}){
 assertWalletBinding(binding);ensure(owner===binding.owner&&address(owner)&&owner!==binding.pool&&hash(publicKey)&&BigInt(publicKey)>0n&&typeof live==='function'&&(asset===ZERO||binding.tokens.includes(asset)),'Wallet account or asset identity');
 const rpc=async(method,params=[])=>{const value=await provider.request({method,params});await live();return value;};
 requireRpcChain(binding.chainId,await rpc('eth_chainId'));
 const block=await rpc('eth_getBlockByNumber',['latest',false]);ensure(block&&quantity(block.number)&&quantity(block.timestamp)&&hash(block.hash),'Canonical wallet block');
 ensure(BigInt(block.timestamp)<(1n<<64n)-900n,'Wallet timestamp bound');await checkWalletRuntime(provider,binding,live,block.number);
 const call=(target,sig,types=[],values=[])=>rpc('eth_call',[{to:target,data:poolCalldata(sig,types,values)},block.number]);
 const integer=raw=>{ensure(hash(raw),'Wallet integer response');return BigInt(raw).toString();};
 ensure(await call(binding.pool,'verifier()')==='0x'+binding.verifier.slice(2).padStart(64,'0'),'Wallet verifier identity');
 const policyHash=await call(binding.pool,'policyHash()');ensure(hash(policyHash)&&BigInt(policyHash)>0n,'Wallet asset policy');
 const accountId=poolHash(poolBytes(abiEncode(['uint256','address','address','bytes32','bytes32'],[binding.chainId,binding.pool,owner,publicKey,policyHash])));
 ensure(await call(binding.pool,'accountIdFor(address,bytes32)',['address','bytes32'],[owner,publicKey])===accountId,'Wallet chain domain mismatch');
 const account=await call(binding.pool,'account(bytes32)',['bytes32'],[accountId]);ensure(typeof account==='string'&&/^0x[0-9a-f]{192}$/.test(account),'Wallet account response');
 const registered=account!=='0x'+'0'.repeat(192),nonce=BigInt('0x'+account.slice(-64)).toString();
 if(registered)ensure(account==='0x'+owner.slice(2).padStart(64,'0')+publicKey.slice(2)+word(nonce)&&BigInt(nonce)>0n,'Wallet owner/key/nonce mismatch');
 const balance=integer(await call(binding.pool,'balance(bytes32,address)',['bytes32','address'],[accountId,asset]));
 let allowance='0',spendable;
 if(asset===ZERO){const raw=await rpc('eth_getBalance',[owner,block.number]);ensure(quantity(raw),'Native wallet balance');spendable=BigInt(raw).toString();}
 else{ensure(await call(binding.pool,'supported(address)',['address'],[asset])==='0x'+word(1),'Asset policy mismatch');allowance=integer(await call(asset,'allowance(address,address)',['address','address'],[owner,binding.pool]));spendable=integer(await call(asset,'balanceOf(address)',['address'],[owner]));}
 const canonical=await rpc('eth_getBlockByNumber',[block.number,false]);ensure(canonical?.hash===block.hash&&canonical?.number===block.number,'Wallet read reorganized');
 const state={chainId:binding.chainId,owner,publicKey,pool:binding.pool,accountId,policyHash,registered,nonce,asset,balance,allowance};
 return Object.freeze({...state,fingerprint:poolHash(text.encode(JSON.stringify(state))),spendable,timestamp:BigInt(block.timestamp).toString(),blockNumber:block.number,blockHash:block.hash});
}
export function walletActionFromState(state,fields){
 const enroll=fields.kind==='enroll';networkProfile(state.chainId);ensure(enroll?!state.registered:fields.kind==='withdraw'&&state.registered,'Wallet enrollment state');
 ensure(enroll||state.asset===fields.asset&&BigInt(state.balance)>=BigInt(fields.amount)&&BigInt(state.nonce)<(1n<<256n)-1n&&fields.recipient!==state.pool,'Wallet withdrawal state');
 return Object.freeze({schemaVersion:1n,chainId:BigInt(state.chainId),pool:state.pool,moduleId:MODULE,actionType:enroll?1n:2n,accountId:state.accountId,owner:state.owner,publicKey:state.publicKey,policyHash:state.policyHash,nonce:enroll?0n:BigInt(state.nonce),asset:enroll?ZERO:fields.asset,amount:enroll?0n:BigInt(fields.amount),recipient:enroll?state.owner:fields.recipient,validAfter:BigInt(state.timestamp),validUntil:BigInt(state.timestamp)+900n});
}
export function validateWalletAction(action,{binding,owner,publicKey}){
 assertWalletBinding(binding);
 ensure(action.schemaVersion===1n&&action.chainId===BigInt(binding.chainId)&&action.pool===binding.pool&&action.moduleId===MODULE&&action.owner===owner&&action.publicKey===publicKey&&(action.asset===ZERO||binding.tokens.includes(action.asset))&&[1n,2n].includes(action.actionType),'Protected wallet domain');
 ensure(action.validUntil>action.validAfter&&action.validUntil-action.validAfter<=900n,'Wallet approval window');
 if(action.actionType===1n)ensure(action.nonce===0n&&action.amount===0n&&action.asset===ZERO&&action.recipient===owner,'Wallet enrollment fields');
 else ensure(action.nonce>0n&&action.nonce<(1n<<256n)-1n&&action.amount>0n&&address(action.recipient)&&action.recipient!==binding.pool,'Wallet withdrawal fields');
 const id=poolHash(poolBytes(abiEncode(['uint256','address','address','bytes32','bytes32'],[binding.chainId,binding.pool,owner,publicKey,action.policyHash])));ensure(id===action.accountId,'Wallet action account ID');return action;
}
