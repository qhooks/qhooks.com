import {privyAccessToken} from './qx-privy-access-token.mjs';
// Read the current session only at record/retry time; never persist the access token.
export function solLaunchRecordBody(signature,{storage}={}){
 if(storage===undefined)try{storage=globalThis.localStorage;}catch{}
 const token=privyAccessToken(storage);
 return token&&token.length<=4096?{signature,privyToken:token}:{signature};
}
export async function recordSolLaunch(signature,{storage,fetchImpl=globalThis.fetch}={}){
 const response=await fetchImpl('/api/sol-launch/record',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(solLaunchRecordBody(signature,{storage})),cache:'no-store'}),result=await response.json();
 if(!response.ok)throw Error(result.error||'Solana request failed.');return result;
}
