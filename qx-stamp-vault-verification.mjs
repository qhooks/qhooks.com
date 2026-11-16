import {STAMP} from './qx-stamp-vault-artifact.mjs';
const explorer='https://robinhoodchain.blockscout.com';
export async function verifySource(address,{fetchImpl=fetch}={}){
  if(!/^0x[0-9a-f]{40}$/i.test(address))throw Error('Verify the deployed vault first.');
  const path=explorer+'/api/v2/smart-contracts/'+address;
  const before=await fetchImpl(path,{signal:AbortSignal.timeout(12000)});
  if(before.ok){const j=await before.json();if(j.is_verified===true||j.compiler_version&&j.source_code)return 'verified';}
  else if(before.status!==404)throw Error('Blockscout is unavailable. Use the verification link below.');
  const input=await fetchImpl('/full-launch/stamp-vault-v2-standard-input.json',{signal:AbortSignal.timeout(10000)});if(!input.ok)throw Error('Verification source could not be loaded.');
  const source=await input.text();
  const body=new FormData();body.append('compiler_version',STAMP.compiler);body.append('license_type','mit');body.append('contract_name','src/QStampVault.sol:QStampVault');body.append('autodetect_constructor_args','false');body.append('constructor_args',STAMP.constructorArgs);body.append('files[0]',new Blob([source],{type:'application/json'}),'QStampVault-v2-standard-input.json');
  const r=await fetchImpl(path+'/verification/via/standard-input',{method:'POST',body,signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Blockscout did not accept source verification. Use the manual verification link; no new deployment is needed.');
  const result=await r.json();if(!/verification started/i.test(String(result.message||'')))throw Error('Source verification was not confirmed. Check Blockscout before retrying.');
  return 'submitted';
}
