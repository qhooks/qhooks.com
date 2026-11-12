// Wallet Standard messages for native profile ownership only. No transaction
// feature, RPC, silent connection, terminal state or EVM provider is used here.
import {base58Decode,base58Encode,solWallet} from './qx-solana-identity.mjs';
const bytes=value=>ArrayBuffer.isView(value)&&value.BYTES_PER_ELEMENT===1;
const equal=(a,b)=>bytes(a)&&bytes(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
function account(value){return value&&solWallet(value.address)&&equal(value.publicKey,base58Decode(value.address))&&value.chains?.some(c=>c.startsWith('solana:'))&&value.features?.includes('solana:signMessage')?value:null;}
function usable(wallet){return wallet&&typeof wallet.name==='string'&&wallet.name.trim()&&wallet.name.length<=80&&wallet.chains?.some(c=>c.startsWith('solana:'))&&typeof wallet.features?.['standard:connect']?.connect==='function'&&typeof wallet.features?.['standard:events']?.on==='function'&&typeof wallet.features?.['solana:signMessage']?.signMessage==='function';}
export function createSolanaProfileWallet(target=globalThis.window){
 const wallets=new Map(),watchers=new Set();let serial=0,current=null,busy=false,generation=0,disposed=false,off=()=>{};
 const snapshot=()=>Object.freeze({current,busy,wallets:Object.freeze([...wallets].map(([wallet,id])=>Object.freeze({id,name:wallet.name})))});
 const publish=()=>{for(const fn of [...watchers])try{fn(snapshot());}catch{}};
 function clear(){generation++;current=null;busy=false;off();off=()=>{};publish();}
 function register(...found){const added=[];for(const wallet of found){if(!usable(wallet)||wallets.has(wallet)||wallets.size>=8)continue;wallets.set(wallet,'sol-profile-'+(++serial));added.push(wallet);}publish();return()=>{for(const wallet of added){wallets.delete(wallet);if(current?.wallet===wallet)clear();}publish();};}
 const announce=event=>{try{event.detail?.({register});}catch{}};
 target.addEventListener('wallet-standard:register-wallet',announce);
 target.dispatchEvent(new CustomEvent('wallet-standard:app-ready',{detail:{register}}));
 async function connect(id){
  if(disposed||busy)throw Error('A profile wallet connection is already in progress.');
  const wallet=[...wallets].find(([,key])=>key===id)?.[0];if(!wallet)throw Error('Choose an installed Solana wallet with message signing.');
  clear();busy=true;const mine=generation;publish();
  try{
   const result=await wallet.features['standard:connect'].connect(),selected=account(result?.accounts?.[0]);
   if(disposed||mine!==generation||!wallets.has(wallet))throw Error('Your Solana wallet changed. Connect again.');
   if(!selected||!wallet.accounts?.some(value=>account(value)&&value.address===selected.address))throw Error('The wallet did not share a message-signing Solana account.');
   const connection=Object.freeze({owner:'solana:'+selected.address,address:selected.address,family:'solana',wallet,account:selected});
   current=connection;
   off=wallet.features['standard:events'].on('change',change=>{
    if(current!==connection)return;
    if(change?.accounts!==undefined){const first=account(change.accounts?.[0]);if(!first||first.address!==selected.address)clear();}
   });
   if(typeof off!=='function')throw Error('This wallet cannot report account changes.');
   busy=false;publish();return connection;
  }catch(error){if(mine===generation)clear();throw error;}
 }
 function capture(){
  const connection=current,mine=generation;if(!connection)throw Error('Connect a Solana profile wallet first.');
  const changed=()=>Error('Your Solana wallet changed. Review and sign in again.');
  function assertCurrent(){if(disposed||current!==connection||mine!==generation||!wallets.has(connection.wallet))throw changed();}
  async function check(){assertCurrent();const first=account(connection.wallet.accounts?.[0]);if(!first||first.address!==connection.address){clear();throw changed();}assertCurrent();}
  return Object.freeze({owner:connection.owner,assertCurrent,check,async sign(message){
   await check();if(typeof message!=='string'||!message)throw Error('Refreshing the profile sign-in message. Try again.');
   const messageBytes=new TextEncoder().encode(message),[result]=await connection.wallet.features['solana:signMessage'].signMessage({account:connection.account,message:messageBytes});
   await check();if(!bytes(result?.signature)||result.signature.length!==64||!equal(result.signedMessage,messageBytes))throw Error('The wallet did not sign the exact profile message.');
   return base58Encode(result.signature);
  }});
 }
 return Object.freeze({snapshot,connect,capture,subscribe(fn){watchers.add(fn);fn(snapshot());return()=>watchers.delete(fn);},async disconnect(){const wallet=current?.wallet;clear();try{await wallet?.features?.['standard:disconnect']?.disconnect();}catch{}},dispose(){if(disposed)return;disposed=true;clear();target.removeEventListener('wallet-standard:register-wallet',announce);wallets.clear();watchers.clear();}});
}
