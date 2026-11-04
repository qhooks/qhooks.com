import {ensure,hex} from '../../apps/marketplace-preview/mainnet-fees.mjs';
import {poolCalldata,approvedPoolCalldata} from '../qpools/client/pool-calldata.mjs';
import {assertWalletBinding} from './wallet-binding.mjs';
import {ZERO} from './wallet-state.mjs';
export function checkWalletFunding(state,fields){
 ensure(state.registered&&state.asset===fields.asset,'Enroll the wallet before funding');
 const amount=BigInt(fields.amount);ensure(amount<=BigInt(state.spendable),'Insufficient asset balance');
 if(fields.kind==='approve-token')ensure(fields.asset!==ZERO,'Native assets need no allowance');
 else{ensure(fields.kind==='deposit'&&amount>0n&&BigInt(state.balance)+amount<(1n<<256n),'Wallet deposit bound');if(fields.asset!==ZERO)ensure(amount<=BigInt(state.allowance),'Review the exact token allowance first');}
}
export function walletCall({binding,fields,approval,action,identity}){
 assertWalletBinding(binding);ensure(fields.asset===ZERO||binding.tokens.includes(fields.asset),'Unsupported wallet asset');
 if(action)return Object.freeze({to:binding.pool,data:approvedPoolCalldata(approval,action),value:'0x0'});
 if(fields.kind==='approve-token')return Object.freeze({to:fields.asset,data:poolCalldata('approve(address,uint256)',['address','uint256'],[binding.pool,fields.amount]),value:'0x0'});
 ensure(fields.kind==='deposit','Wallet funding action required');
 return Object.freeze({to:binding.pool,data:fields.asset===ZERO?poolCalldata('depositNative(bytes32)',['bytes32'],[identity.accountId]):poolCalldata('depositToken(bytes32,address,uint256)',['bytes32','address','uint256'],[identity.accountId,fields.asset,fields.amount]),value:fields.asset===ZERO?hex(fields.amount):'0x0'});
}
