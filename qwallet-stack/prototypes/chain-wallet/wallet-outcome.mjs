import {poolHash} from '../qpools/client/pool-calldata.mjs';
import {checkWalletRuntime,assertWalletBinding} from './wallet-binding.mjs';
import {requireNativeEvent} from '../mainnet-account/native-event-match.mjs';
import {ensure} from '../../apps/marketplace-preview/mainnet-fees.mjs';
import {word} from './wallet-state.mjs';
const topic=s=>poolHash(new TextEncoder().encode(s)),padded=s=>'0x'+s.slice(2).padStart(64,'0');
export async function walletOutcome({provider,binding,identity,fields,action,receipt,live}){
 assertWalletBinding(binding);const {accountId,owner,publicKey}=identity;
 let topics,data,target=binding.pool;
 if(fields.kind==='enroll'){topics=[topic('AccountEnrolled(bytes32,address,bytes32)'),accountId,padded(owner)];data=publicKey;}
 else if(fields.kind==='approve-token'){target=fields.asset;topics=[topic('Approval(address,address,uint256)'),padded(owner),padded(binding.pool)];data='0x'+word(fields.amount);}
 else if(fields.kind==='deposit'){topics=[topic('Deposited(bytes32,address,address,uint256)'),accountId,padded(fields.asset),padded(owner)];data='0x'+word(fields.amount);}
 else{topics=[topic('Withdrawn(bytes32,address,address,uint256,uint256)'),accountId,padded(fields.asset),padded(fields.recipient)];data='0x'+word(fields.amount)+word(action.nonce);}
 const event=requireNativeEvent(receipt,{address:target,topics,data});
 await checkWalletRuntime(provider,binding,live,receipt.blockNumber);await checkWalletRuntime(provider,binding,live);
 const block=await provider.request({method:'eth_getBlockByNumber',params:[receipt.blockNumber,false]});await live();ensure(block?.hash===receipt.blockHash&&block.number===receipt.blockNumber&&Array.isArray(block.transactions)&&block.transactions.includes(receipt.transactionHash),'Wallet outcome reorganized');
 return Object.freeze({kind:fields.kind,asset:fields.asset,accountId,amount:fields.amount,recipient:fields.recipient,transactionHash:receipt.transactionHash,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber,logIndex:event.logIndex});
}
