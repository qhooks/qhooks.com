// Progressive copy enhancement only; no wallet, API request or automatic sharing.
export function mountCallSharing({document:doc=globalThis.document,clipboard=globalThis.navigator?.clipboard}={}){
 const button=doc?.querySelector('[data-copy-call]');if(!button)return{dispose(){}};
 const status=doc.querySelector('.qcall-copy-status'),url=button.getAttribute('data-permalink');
 if(!/^https:\/\/qhooks\.com\/call\/p[0-9a-v]{12}$/.test(url||''))return{dispose(){}};
 let disposed=false;button.hidden=false;
 const copy=async()=>{button.disabled=true;try{if(!clipboard?.writeText)throw Error('Clipboard unavailable');await clipboard.writeText(url);if(!disposed&&status)status.textContent='Call link copied. Ready to share.';}catch{if(!disposed&&status)status.textContent='Select and copy the call link below.';}finally{if(!disposed)button.disabled=false;}};
 button.addEventListener('click',copy);return{dispose(){disposed=true;button.removeEventListener('click',copy);}};
}
if(globalThis.document)mountCallSharing();
