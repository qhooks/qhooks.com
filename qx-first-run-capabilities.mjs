// Lazy, explicit actions only. No key material, sessions or wallet calls at import time.
import {memberWallet} from './qx-member-wallet.mjs';
import {EMBEDDED_RDNS} from './embedded-wallet-provider.mjs';
export function firstRunReferralLink(owner){
 const identity=memberWallet(owner);if(!identity||identity.family!=='evm')return null;
 // Existing EVM referral links normalize hex. Individual Solana attribution is not proven in this flow.
 return {owner:identity.key,family:identity.family,url:'https://qhooks.com/terminal?ref='+encodeURIComponent(identity.address)};
}
export function createFirstRunCapabilities({hub,sessions,target=globalThis,loadProfile=()=>import('./qx-member-profile.mjs')}={}){
 const active=ctx=>{ctx?.assertCurrent?.();const connection=hub?.snapshot?.().current,identity=memberWallet(connection?.owner);if(!identity||identity.key!==memberWallet(ctx?.owner)?.key||ctx?.signal?.aborted)throw Object.assign(Error('Your wallet changed.'),{name:'AbortError'});return {connection,identity};};
 const canRevealKey=ctx=>{try{const {connection,identity}=active(ctx);return identity.family==='evm'&&connection.entry?.rdns===EMBEDDED_RDNS;}catch{return false;}};
 return Object.freeze({canRevealKey,
  async revealKey(ctx){
   if(!canRevealKey(ctx))throw Error('Manage recovery in your connected wallet.');
   const {identity}=active(ctx),controls=target.qhooksPrivySignerControls||await target.qhooksEnsurePrivyControls?.();
   const next=active(ctx);if(next.identity.key!==identity.key||!canRevealKey(ctx)||!controls?.state?.authenticated||controls.wallet?.walletClientType!=='privy'||memberWallet(controls.wallet?.address)?.key!==identity.key||typeof controls.exportWallet!=='function')throw Error('Wallet recovery is unavailable. Reopen your wallet and try again.');
   await controls.exportWallet({address:identity.address});active(ctx);
   // The SDK resolves after its isolated export UI closes. Never return a value from it.
  },
  referralLink(ctx){const {identity}=active(ctx);return firstRunReferralLink(identity.key);},
  async mountProfile(element,ctx){
   active(ctx);if(!sessions||typeof ctx.runNativeAction!=='function')throw Error('Profile editing is unavailable.');
   const {mountMemberProfileEditor}=await loadProfile();active(ctx);const editor=mountMemberProfileEditor(element,{hub,sessions,document:element.ownerDocument,idPrefix:'first-run-profile',setupPhase:ctx.profilePhase||null,...(typeof ctx.runNativeAction==='function'?{runNativeAction:ctx.runNativeAction}:{})});
   try{await editor.setWallet(memberWallet(ctx.owner).key);active(ctx);editor.open();const dispose=()=>editor.dispose();dispose.setPhase=phase=>{active(ctx);return editor.setPhase(phase);};Object.defineProperty(dispose,'pending',{get:()=>editor.pending});return dispose;}catch(error){editor.dispose();throw error;}
  }
  // No room action: the supplied QMessenger host has no private room-wallet ACL/share API.
 });
}
