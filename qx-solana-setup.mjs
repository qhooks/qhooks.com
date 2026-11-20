import {solAddress,onSolChange} from './qx-solana.mjs';
import {setupSolWallet} from './qx-sol-setup-wallet.mjs';
import {solReferralRuntime} from './qx-sol-referral-client.mjs';
import {prepareSolTransaction,sendPreparedSol} from './qx-sol-launch-client.mjs';
import {SETUP_TREASURY,SETUP_FEE_PAYER,SETUP_USDC,SETUP_FUND_LAMPORTS,SETUP_MIN_FEE_PAYER_LAMPORTS,sol,requireTreasury,usdcAccount,buildCreateUsdcAccount,buildFundFeePayer} from './qx-solana-setup-core.mjs';
// No server writes: reads go through the existing Solana RPC proxy; the wallet signs and sends.
const $=id=>document.getElementById('qss-'+id);
$('treasury').textContent=SETUP_TREASURY;
let busy=false,state={ata:null,feeLamports:null},runtime=null;
const rt=async()=>runtime||(runtime=await solReferralRuntime());
const walletRender=setupSolWallet($,t=>{$('ata-status').textContent=t;},()=>busy);
async function refresh(){
 const r=await rt(),ata=usdcAccount(r.PublicKey);
 const [info,bal]=await Promise.all([r.connection.getAccountInfo(new r.PublicKey(ata),'confirmed'),r.connection.getBalance(new r.PublicKey(SETUP_FEE_PAYER),'confirmed')]);
 state={ata:!!info,feeLamports:BigInt(bal)};
 $('ata-detail').textContent='Account: '+ata+' (USDC, owner '+SETUP_TREASURY+'). Status: '+(state.ata?'created':'not created yet')+'.';
 $('fund-detail').textContent='Send '+sol(SETUP_FUND_LAMPORTS)+' SOL from '+SETUP_TREASURY+' to '+SETUP_FEE_PAYER+'. Current balance of the fee wallet: '+sol(state.feeLamports)+' SOL'+(state.feeLamports>=SETUP_MIN_FEE_PAYER_LAMPORTS?' (enough).':' (needs at least '+sol(SETUP_MIN_FEE_PAYER_LAMPORTS)+' SOL).');
 render();
}
function render(){
 walletRender();const me=solAddress(),ok=me===SETUP_TREASURY;
 $('refuse').hidden=!me||ok;
 $('ata').disabled=busy||!ok||state.ata!==false;
 $('fund').disabled=busy||!ok||state.feeLamports===null||state.feeLamports>=SETUP_FUND_LAMPORTS;
 if(state.feeLamports!==null&&state.feeLamports>=SETUP_FUND_LAMPORTS)$('fund').textContent='Fee wallet funded';
 if(state.ata===true)$('ata').textContent='USDC account created';
}
async function tap(statusId,build,confirmText,doneText){
 if(busy)return;busy=true;render();const status=t=>{$(statusId).textContent=t;};
 try{
  const owner=solAddress();requireTreasury(owner);
  const r=await rt();status('Building and simulating the transaction…');
  const prepared=await prepareSolTransaction(r,build(r,owner),[],owner);
  requireTreasury(solAddress());
  status(confirmText+' Network fee: '+sol(prepared.networkLamports)+' SOL. Approve it in your wallet.');
  const sent=await sendPreparedSol(r,prepared);
  status('Sent. Waiting for final confirmation… Transaction '+sent.signature);
  await sent.confirm();
  status(doneText+' Transaction '+sent.signature);
 }catch(e){status((e&&e.message)||'Nothing was sent. Please try again.');}
 finally{busy=false;try{await refresh();}catch{render();}}
}
$('ata').onclick=()=>void tap('ata-status',buildCreateUsdcAccount,'Creates USDC account '+'for '+SETUP_TREASURY+' (mint '+SETUP_USDC+'), paid by the treasury.','Done. The USDC account is created.');
$('fund').onclick=()=>void tap('fund-status',buildFundFeePayer,'Sends exactly '+sol(SETUP_FUND_LAMPORTS)+' SOL to '+SETUP_FEE_PAYER+'.','Done. The fee wallet is funded.');
onSolChange(render);render();refresh().catch(()=>{$('ata-detail').textContent='Could not read the accounts. Reload the page.';});
