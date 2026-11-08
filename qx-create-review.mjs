// A launch confirmation belongs to the exact public draft and connected wallet
// that opened it. No provider requests, signing, storage or launch execution.
const serialized=value=>JSON.stringify(value);
const error=()=>Error('Your wallet, key, costs or draft changed. Review the launch again before confirming.');
function stateOf(read){
 const s=read(),c=s.connection;
 if(s.busy||!c?.owner||!c.entry?.provider||!s.cost||!s.signer?.backupVerified||s.signer.locked||!s.backupConfirmed)throw error();
 return {connection:c,owner:c.owner.toLowerCase(),chainId:String(c.chainId),provider:c.entry.provider,uuid:c.entry.uuid,rdns:c.entry.rdns,
  config:serialized(s.config),cost:s.cost,costText:serialized(s.cost),signer:s.signer,publicKey:s.signer.publicKeyHex,
  record:s.record,recordId:s.record?.id||null,recordStatus:s.record?.status||null,recordCurrent:s.record?.current||null};
}
function same(a,b){return a.owner===b.owner&&a.chainId===b.chainId&&a.provider===b.provider&&a.uuid===b.uuid&&a.rdns===b.rdns&&a.config===b.config&&a.cost===b.cost&&a.costText===b.costText&&a.signer===b.signer&&a.publicKey===b.publicKey&&a.record===b.record&&a.recordId===b.recordId&&a.recordStatus===b.recordStatus&&a.recordCurrent===b.recordCurrent;}
export function createLaunchReviewGate({getState,onInvalidate=()=>{}}){
 let reviewed=null;
 function invalidate(reason=error().message){if(!reviewed)return false;reviewed=null;onInvalidate(reason);return true;}
 return Object.freeze({
  prepare(){reviewed=stateOf(getState);return true;},
  check(){if(!reviewed)return false;try{if(same(reviewed,stateOf(getState)))return true;}catch{}invalidate();return false;},
  consume(){if(!reviewed)throw error();let current;try{current=stateOf(getState);if(!same(reviewed,current))throw error();}catch{invalidate();throw error();}reviewed=null;return current.connection;},
  invalidate,clear(){reviewed=null;},
 });
}
