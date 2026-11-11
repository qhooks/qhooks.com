import {solWallet} from './qx-solana-identity.mjs';
const EVM=/^0x[0-9a-f]{40}$/i;
export function memberWallet(value,{allowBareSolana=false}={}){
 if(typeof value!=='string')return null;
 if(EVM.test(value)){const address=value.toLowerCase();return{family:'evm',address,key:address,path:'/api/community/profile/'+address};}
 const address=value.startsWith('solana:')?value.slice(7):allowBareSolana?value:null;
 return address&&solWallet(address)?{family:'solana',address,key:'solana:'+address,path:'/api/community/profile/solana/'+address}:null;
}
export const memberWalletKey=value=>memberWallet(value)?.key||null;
export function solanaProfileMessage({wallet,id,issuedAt,expiresAt,audienceOrigin='https://qhooks.com'}){
 return['QHooks Solana profile sign-in v1','Domain: '+new URL(audienceOrigin).host,'URI: '+audienceOrigin+'/profile/solana/'+wallet,'Wallet: '+wallet,'Scope: profile:write','Nonce: '+id,'Issued: '+new Date(issuedAt).toISOString(),'Expires: '+new Date(expiresAt).toISOString(),'Signing allows this browser to edit only this public QHooks profile for 7 days. It does not authorize community posts, calls, trading, rewards or transfers.'].join('\n');
}
