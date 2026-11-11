import {requireSolTreasury} from './qx-sol-treasury.mjs';
import {waitSolFinalized} from './qx-sol-launch-confirm.mjs';
// SDK and transaction primitives load only after a Solana action.
import {SOL_LAUNCH_CONFIG as C} from './qx-sol-launch-config.mjs';
import {solAddress,signSol} from './qx-solana.mjs';
const b64=b=>{let s='';for(const v of b)s+=String.fromCharCode(v);return btoa(s);};
export async function solApi(path,body){const r=await fetch('/api/sol-launch/'+path,{...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),cache:'no-store'}),v=await r.json();if(!r.ok)throw Error(v.error||'Solana request failed.');return v;}
export async function solRuntime(){const s=await import('/vendor/dbc.mjs'),connection=new s.Connection(new URL('/api/sol-launch/rpc',location.origin).href,'confirmed');if(await connection.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')throw Error('Use Solana mainnet.');return {...s,connection,client:new s.DynamicBondingCurveClient(connection,'confirmed')};}
export async function prepareSolTransaction(runtime,transaction,signers=[],owner=solAddress()){
 if(!owner||owner!==solAddress())throw Error('Connect the wallet for this transaction.');
 const {connection,PublicKey}=runtime,last=await connection.getLatestBlockhash('confirmed');transaction.feePayer=new PublicKey(owner);transaction.recentBlockhash=last.blockhash;if(signers.length)transaction.partialSign(...signers);
 const serialized=b64(transaction.serialize({requireAllSignatures:false,verifySignatures:false}));
 const r=await fetch('/api/sol-launch/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'simulateTransaction',params:[serialized,{encoding:'base64',sigVerify:false,commitment:'confirmed'}]})}),j=await r.json();
 if(!r.ok||j.error||!j.result?.value||j.result.value.err)throw Error('Simulation failed. Nothing was sent. Check your SOL balance and retry.');
 const fee=await connection.getFeeForMessage(transaction.compileMessage(),'confirmed');if(fee.value==null)throw Error('Network cost unavailable. Refresh review.');
 return {transaction,serialized,last,networkLamports:fee.value,owner,units:j.result.value.unitsConsumed||null};
}
export async function sendPreparedSol(runtime,prepared){
 if(solAddress()!==prepared.owner)throw Error('The wallet changed. Review again.');
 const signed=await signSol(prepared.serialized);if(solAddress()!==prepared.owner)throw Error('The wallet changed. Review again.');
 const signature=await runtime.connection.sendRawTransaction(Uint8Array.from(atob(signed),c=>c.charCodeAt(0)),{skipPreflight:false,maxRetries:2});
 return {signature,confirm:()=>waitSolFinalized(runtime.connection,signature,{lastValidBlockHeight:prepared.last.lastValidBlockHeight})};
}
export async function buildSolLaunch(runtime,{config,mint,owner,name,symbol,uri,buy,lamports}){
 requireSolTreasury();
 const {PublicKey,BN,client,SystemProgram,buildSolLaunchParameters}=runtime,creator=new PublicKey(owner),key=new PublicKey(config);
 let minimum=new BN(0);if(buy>0n){const quote=client.pool.getQuoteFromInputAmount({config:buildSolLaunchParameters(),amountIn:new BN(buy.toString()),swapBaseForQuote:false,slippageBps:100,hasReferral:false,eligibleForFirstSwapWithMinFee:false});minimum=quote.minimumAmountOut;}
 const tx=await client.creator.createPoolWithFirstBuy({createPoolParam:{name,symbol,uri,payer:creator,poolCreator:creator,config:key,baseMint:mint.publicKey},...(buy>0n?{firstBuyParam:{buyer:creator,buyAmount:new BN(buy.toString()),minimumAmountOut:minimum,referralTokenAccount:null}}:{})});
 tx.add(SystemProgram.transfer({fromPubkey:creator,toPubkey:new PublicKey(C.treasury),lamports:BigInt(lamports)}));
 return tx;
}
export async function claimSolFees(mint,{partner=false,onStatus=()=>{}}={}){
 if(partner)requireSolTreasury();
 const owner=solAddress();if(!owner)throw Error('Connect a Solana wallet first.');if(partner&&owner!==C.treasury)throw Error('Connect the QHooks treasury wallet.');
 const [r,status,cfg]=await Promise.all([solRuntime(),solApi('token/'+mint),solApi('config')]);if(!cfg.ready||status.config!==cfg.config||!status.qhooksLaunch)throw Error('Not a verified QHooks launch.');
 const pool=new r.PublicKey(status.pool),actual=await r.client.state.getPool(pool);if(actual?.poolState?.config.toBase58()!==cfg.config)throw Error('Pool config mismatch.');
 if(!partner&&actual.poolState.creator.toBase58()!==owner)throw Error('Connect this coin’s creator wallet.');
 onStatus('Preparing the fee claim…');const payer=new r.PublicKey(owner),params={payer,pool,maxBaseAmount:r.U64_MAX,maxQuoteAmount:r.U64_MAX};
 const tx=partner?await r.client.partner.claimPartnerTradingFee({...params,feeClaimer:payer,receiver:payer}):await r.client.creator.claimCreatorTradingFee({...params,creator:payer,receiver:payer});
 if(status.graduated){const {CpAmm}=await import('/vendor/damm.mjs'),amm=new CpAmm(r.connection),poolKey=new r.PublicKey(status.graduatedPool),poolState=await amm.fetchPoolState(poolKey),positions=await amm.getUserPositionByPool(poolKey,payer);if(poolState.tokenAMint.toBase58()!==mint||poolState.tokenBMint.toBase58()!==C.quoteMint)throw Error('Migrated pool token mismatch.');for(const position of positions)tx.add(await amm.claimPositionFee({owner:payer,position:position.position,pool:poolKey,positionNftAccount:position.positionNftAccount,tokenAMint:poolState.tokenAMint,tokenBMint:poolState.tokenBMint,tokenAVault:poolState.tokenAVault,tokenBVault:poolState.tokenBVault,tokenAProgram:new r.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),tokenBProgram:new r.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),receiver:payer}));}
 const prepared=await prepareSolTransaction(r,tx,[],owner);onStatus('Confirm the fee claim in your wallet.');const sent=await sendPreparedSol(r,prepared);onStatus('Waiting for final confirmation…');await sent.confirm();return sent.signature;
}
// Permissionless migration still needs a wallet to pay network/rent costs; no unattended signer.
export async function migrateSolLaunch(mint,onStatus=()=>{}){
 const owner=solAddress();if(!owner)throw Error('Connect a Solana wallet.');
 const [r,cfg,status]=await Promise.all([solRuntime(),solApi('config'),solApi('token/'+mint)]);
 if(!cfg.ready||status.config!==cfg.config||status.graduated||BigInt(status.quoteReserve)<BigInt(C.migrationQuoteThresholdLamports))throw Error('This curve has not reached 85 SOL or has already graduated.');
 const result=await r.client.migration.migrateToDammV2({payer:new r.PublicKey(owner),pool:new r.PublicKey(status.pool),dammConfig:r.DAMM_V2_MIGRATION_FEE_ADDRESS[C.migrationFeeOption]});
 const prepared=await prepareSolTransaction(r,result.transaction,[result.firstPositionNftKeypair,result.secondPositionNftKeypair],owner);onStatus('Simulation passed. Confirm migration and network/rent costs in your wallet.');const sent=await sendPreparedSol(r,prepared);await sent.confirm();return sent.signature;
}
