import {C}from'./safe-lock-core.mjs';
import {OWNERS}from'./safe-lock-safe-reader.mjs';
import {safeExecData}from'./qdrops-core.mjs';
import {proposalIdentity,walletAction}from'./safe-lock-read.mjs';
// Every consequential call is owner-initiated. No signature or approval is kept in browser storage.
export async function prepareOwnerAction({kind,displayed,review,read,reader,hub}){
 if(!['approve','exec'].includes(kind))throw Error('Unknown owner action');
 let c=hub.snapshot().current;if(!c)throw Error('Connect the designated owner wallet.');
 const current=()=>hub.snapshot().current,identity=proposalIdentity(displayed);
 const s=await reader.withHash(await read());
 if(proposalIdentity(s)!==identity||identity!==review||walletAction(s,c,review)!==kind)throw Error('The proposal, lock readiness or designated owner changed. Refresh and review.');
 const originalOwner=c.owner,originalEntry=c.entry;
 if(String(c.chainId)!==C.chain){await hub.switchChain(C.chain);c=current();}
 if(!c||c.owner!==originalOwner||c.entry!==originalEntry||String(c.chainId)!==C.chain)throw Error('The wallet changed. Refresh before any action.');
 const expected=kind==='approve'?OWNERS[0].a:OWNERS[1].a;if(c.owner.toLowerCase()!==expected)throw Error('Use the designated owner for this step.');
 const data=kind==='exec'?safeExecData(s.tx,OWNERS.map(o=>o.a)):'0xd4d9bdcd'+s.hash.slice(2),tx={from:c.owner,to:C.safe,data,value:'0x0'};
 const simulated=await reader.call(C.safe,data,c.owner);
 if(kind==='exec'&&(!/^0x[0-9a-f]{64}$/i.test(simulated)||BigInt(simulated)!==1n))throw Error('The exact Safe execution did not simulate successfully. Nothing was sent.');
 const gas=await reader.rpc('eth_estimateGas',[tx]);if(!/^0x[0-9a-f]+$/i.test(gas)||BigInt(gas)<=0n)throw Error('Gas estimate is unavailable. Nothing was sent.');
 tx.gas='0x'+(BigInt(gas)*13n/10n).toString(16);
 const final=await reader.withHash(await read()),latest=current();
 if(proposalIdentity(final)!==identity||walletAction(final,latest,review)!==kind||latest?.owner!==originalOwner||latest?.entry!==originalEntry||String(latest?.chainId)!==C.chain)throw Error('State or wallet changed during checks. Nothing was sent.');
 return {tx,safeHash:s.hash,kind,provider:latest.entry.provider,proposal:identity};
}
