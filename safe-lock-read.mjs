import {C,word,addressWord,callData,strictLock,operationState,stateHash}from'./safe-lock-core.mjs';
import {CODE_PINS,FORK_ACCEPTANCE}from'./safe-lock-pins.mjs';
import {keccakHex}from'./qdrops-core.mjs';
const uint=h=>{if(!/^0x[0-9a-f]{64}$/i.test(h))throw Error('Incomplete on-chain integer');return BigInt(h);};
const addr=h=>{if(uint(h)>=2n**160n)throw Error('Incomplete on-chain address');return '0x'+h.slice(-40).toLowerCase();};
export function createOperationRead({kind,reader}){
 if(!['treasury','drops'].includes(kind))throw Error('Unknown Safe operation');
 return async()=>{
  const common=await reader.common(),block=common.blockTag,id=kind==='treasury'?2:4;
  const fields=[['rawLock',C.locks,callData('get(uint256)',word(id))],['vested',C.locks,callData('vested(uint256)',word(id))],['safeBalance',C.token,callData('balanceOf(address)',addressWord(C.safe))],['allowance',C.token,callData('allowance(address,address)',addressWord(C.safe),addressWord(C.drops))],['singleton',C.safe,'0xa619486e']];
  if(kind==='drops')fields.push(['listed',C.drops,callData('listed(address)',addressWord(C.token))],['dropsOwner',C.drops,callData('owner()')],['funded',C.drops,callData('funded(address)',addressWord(C.token))]);
  const codeNames=kind==='treasury'?['locks','token','safe','singleton','tokenImplementation']:['locks','token','safe','singleton','tokenImplementation','drops','multi'];
  const values=await reader.batch([...fields.map(([,to,data])=>['eth_call',[{to,data},block]]),...codeNames.map(k=>['eth_getCode',[CODE_PINS[k].address,block]])]);
  const v=Object.fromEntries(fields.map(([k],i)=>[k,values[i]]));
  if(addr(v.singleton)!==C.singleton)throw Error('Safe implementation changed.');
  for(let i=0;i<codeNames.length;i++){
   const name=codeNames[i],code=values[fields.length+i],pin=CODE_PINS[name];if(!/^0x(?:[0-9a-f]{2})+$/i.test(code)||code.length!==pin.bytes*2+2||keccakHex(Uint8Array.from(code.slice(2).match(/../g),x=>parseInt(x,16)))!==pin.keccak)throw Error('Contract code changed: '+name+'. Nothing can be approved or sent.');
  }
  const lock=strictLock(v.rawLock),vested=uint(v.vested),allowance=uint(v.allowance),safeBalance=uint(v.safeBalance),listed=kind==='drops'?uint(v.listed)===1n:true,dropsOwner=kind==='drops'?addr(v.dropsOwner):C.safe;
  const operation=operationState(kind,{lock,now:common.now,vested,allowance,listed,dropsOwner}),forkAccepted=FORK_ACCEPTANCE[kind];
  return {...common,...operation,kind,lock,vested,allowance,safeBalance,funded:v.funded?uint(v.funded):null,stateHash:stateHash(kind,lock),forkAccepted,ready:operation.ready&&forkAccepted,blockedReason:!forkAccepted?'The atomic execution check is pending. Wallet actions stay disabled.':!operation.ready?operation.reason:'',contractCodesVerified:true};
 };
}
export function proposalIdentity(s){return s?.hash?[s.kind,String(s.nonce),s.hash.toLowerCase(),s.stateHash].join(':'):null;}
export function readProposalHint(search){const q=new URLSearchParams(search),keys=['nonce','safeHash','stateHash'],present=keys.filter(k=>q.has(k));if(!present.length)return null;if(present.length!==3||!/^\d{1,30}$/.test(q.get('nonce'))||keys.slice(1).some(k=>!/^0x[0-9a-f]{64}$/i.test(q.get(k)||'')))throw Error('The proposal link is incomplete. Review current state before any wallet action.');return {nonce:BigInt(q.get('nonce')),hash:q.get('safeHash').toLowerCase(),stateHash:q.get('stateHash').toLowerCase()};}
export function sharedProposalLink(href,s){if(!s.hash||!s.tx)throw Error('No proposal to share');const u=new URL(href);u.search='';u.searchParams.set('nonce',String(s.nonce));u.searchParams.set('safeHash',s.hash);u.searchParams.set('stateHash',s.stateHash);return u.href;}
export function walletAction(s,connection,review){
 if(!s?.tx||!s.ready||!s.forkAccepted)return null;
 if(proposalIdentity(s)!==review)throw Error('The proposal changed. Review the current nonce, hash and lock state.');
 if(!connection)return 'connect';
 const owner=String(connection.owner).toLowerCase();
 if(owner==='0x88db60586866294409e47bbbb0b436104f09c1b5')return s.approved[0]?null:'approve';
 if(owner==='0x9b13398df547c18e68d1cfe086ff1cb5f1a84127')return s.approved[0]?'exec':null;
 return null;
}
