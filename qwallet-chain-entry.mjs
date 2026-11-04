// Inert URL-to-select initialization. No wallet, RPC or cryptography access.
const chainIds=Object.freeze(['8453','4663','1','42161','56','5042']);

export function initializeQWalletChainEntry({document:d=document,location=window.location}={}){
 const select=d.getElementById('qw-chain'),provider=d.getElementById('qw-provider'),connect=d.getElementById('qw-connect'),status=d.getElementById('qw-connection');
 if(!select||!provider||!connect||!status)throw new TypeError('QWallet chain controls unavailable');
 let values;
 try{values=new URLSearchParams(location?.search||'').getAll('chain');}catch{values=[''];}
 if(values.length===0)return Object.freeze({status:'default',chainId:select.value});
 const chainId=values[0],valid=values.length===1&&chainIds.includes(chainId)&&[...select.options].some(option=>option.value===chainId);
 if(valid){select.value=chainId;return Object.freeze({status:'selected',chainId});}
 select.disabled=true;provider.disabled=true;connect.disabled=true;select.setAttribute('aria-invalid','true');
 status.textContent='This QWallet link has an invalid or repeated chain. Choose a fresh network link before connecting.';
 return Object.freeze({status:'blocked',chainId:null});
}

export const qwalletChainIds=chainIds;
