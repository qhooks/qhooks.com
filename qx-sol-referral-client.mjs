import {QHOOKS_SOL_TREASURY,requireSolTreasury} from './qx-sol-treasury.mjs';
import {REFERRAL_PROGRAM,REFERRAL_PROJECT,REFERRAL_NAME,SOL_MINT,USDC_MINT,referralAccountAddress,referralTokenAddresses} from './qx-sol-referral-policy.mjs';
import {solAddress} from './qx-solana.mjs';
import {prepareSolTransaction,sendPreparedSol} from './qx-sol-launch-client.mjs';

const TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export function requireReferralWallet(owner){requireSolTreasury();if(owner!==QHOOKS_SOL_TREASURY)throw Error('Connect the QHooks treasury wallet.');}
export async function solReferralRuntime(){
 const s=await import('/vendor/referral.mjs'),connection=new s.Connection(new URL('/api/sol-launch/rpc',location.origin).href,'confirmed');
 
 return {...s,connection};
}
export function referralSetupAddresses(PublicKey){const referral=referralAccountAddress(PublicKey);return {referral,tokens:referralTokenAddresses(PublicKey,referral)};}
export async function recordFinalizedSolReferral(signature,{fetcher=(...a)=>fetch(...a)}={}){
 const response=await fetcher('/api/sol-referral/record',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({signature}),cache:'no-store'}),result=await response.json();
 if(!response.ok||!result.ready||!result.referral||!result.feeAccounts)throw Error('Could not record the referral. Tap Record referral to retry.');
 return {referral:result.referral,tokens:result.feeAccounts};
}
function checkAccounts(r,provider,addresses,infos,owner){
 const [account,...tokens]=infos;
 if(account){
  if(account.owner.toBase58()!==REFERRAL_PROGRAM)throw Error('Referral account program mismatch. Tell the team.');
  const state=provider.program.coder.accounts.decode('referralAccount',account.data);
  if(state.partner.toBase58()!==owner||state.project.toBase58()!==REFERRAL_PROJECT||state.name!==REFERRAL_NAME)throw Error('The referral name belongs to another wallet. Tell the team.');
 }
 for(let i=0;i<tokens.length;i++)if(tokens[i]){
  const info=tokens[i],mint=[SOL_MINT,USDC_MINT][i];
  if(info.owner.toBase58()!==TOKEN_PROGRAM||info.data.length!==165||new r.PublicKey(info.data.subarray(0,32)).toBase58()!==mint||new r.PublicKey(info.data.subarray(32,64)).toBase58()!==addresses.referral||info.data[108]!==1)throw Error('Referral token account mismatch. Tell the team.');
 }
}
async function readAccounts(r,addresses){return r.connection.getMultipleAccountsInfo([addresses.referral,...Object.values(addresses.tokens)].map(a=>new r.PublicKey(a)),'finalized');}
export async function buildSolReferral(r,owner){
 requireReferralWallet(owner);
 if(r.PROGRAM_ID.toBase58()!==REFERRAL_PROGRAM)throw Error('Referral SDK program mismatch. Tell the team.');
 const provider=new r.ReferralProvider(r.connection),addresses=referralSetupAddresses(r.PublicKey),infos=await readAccounts(r,addresses);
 checkAccounts(r,provider,addresses,infos,owner);
 const payer=new r.PublicKey(owner),project=new r.PublicKey(REFERRAL_PROJECT),referral=new r.PublicKey(addresses.referral),tx=new r.Transaction();
 if(!infos[0]){
  const created=await provider.initializeReferralAccountWithName({payerPubKey:payer,partnerPubKey:payer,projectPubKey:project,name:REFERRAL_NAME});
  if(created.referralAccountPubKey.toBase58()!==addresses.referral)throw Error('Referral SDK address mismatch. Tell the team.');
  tx.add(...created.tx.instructions);
 }
 // The SDK convenience method fetches the referral before it exists. Build its identical
 // IDL instruction directly so creation and both token accounts fit in one transaction.
 for(const [i,mint]of [SOL_MINT,USDC_MINT].entries())if(!infos[i+1])tx.add(await provider.program.methods.initializeReferralTokenAccount().accounts({payer,project,referralAccount:referral,referralTokenAccount:new r.PublicKey(addresses.tokens[mint]),mint:new r.PublicKey(mint),systemProgram:r.SystemProgram.programId,tokenProgram:new r.PublicKey(TOKEN_PROGRAM)}).instruction());
 return {transaction:tx,addresses,provider};
}
export async function setupSolReferral({runtime=solReferralRuntime,owner=solAddress(),prepare=prepareSolTransaction,send=sendPreparedSol,onStatus=()=>{},onSent=()=>{}}={}){
 requireReferralWallet(owner);
 const r=await runtime(),built=await buildSolReferral(r,owner);
 if(built.transaction.instructions.length){
  onStatus('Building and simulating the referral accounts…');
  const prepared=await prepare(r,built.transaction,[],owner);
  requireReferralWallet(solAddress());
  onStatus('Simulation passed. Approve one transaction in your wallet. Network fee: '+prepared.networkLamports+' lamports, plus account rent.');
  const sent=await send(r,prepared);onSent({signature:sent.signature,lastValidBlockHeight:prepared.last.lastValidBlockHeight});
  onStatus('Waiting for final confirmation…');await sent.confirm();
 }
 const final=await readAccounts(r,built.addresses);checkAccounts(r,built.provider,built.addresses,final,owner);
 if(final.length!==3||final.some(a=>!a))throw Error('Referral accounts are still confirming. Check again shortly.');
 return built.addresses;
}
