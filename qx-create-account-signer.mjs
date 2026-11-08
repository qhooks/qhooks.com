// A launch workspace may invalidate its own signer when it closes. The account
// handle remains unlocked for this tab until account change or pagehide.
export function createLaunchSignerLease(signer){
 let closed=false;
 const live=()=>{if(closed||signer.locked)throw Error('This launch key session is closed. Open the launch again.');};
 const lease={publicKeyHex:signer.publicKeyHex,keyId:signer.keyId,get locked(){return closed||signer.locked;},get backupVerified(){return !closed&&signer.backupVerified;},lock(){closed=true;}};
 for(const name of ['signAction','signKeyAction','signLabAction'])lease[name]=(...args)=>{live();return signer[name](...args);};
 return Object.freeze(lease);
}
