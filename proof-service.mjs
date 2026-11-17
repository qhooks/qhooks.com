// Progressive enhancement only. Reports and their canonical verdict render without JS.
for(const form of document.querySelectorAll('[data-proof-find]'))form.addEventListener('submit',event=>{
 event.preventDefault();const data=new FormData(form),token=String(data.get('token')||'').trim(),chain=String(data.get('chain')||'');
 const valid=chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token):/^0x[0-9a-fA-F]{40}$/.test(token)&&BigInt(token)!==0n;
 if(!valid){form.querySelector('[data-form-status]').textContent='Enter an exact token address for this chain.';form.querySelector('[name="token"]').focus();return;}
 location.assign('/proof/'+encodeURIComponent(chain)+'/'+encodeURIComponent(token));
});
let state=null;try{state=JSON.parse(document.getElementById('proof-state')?.textContent||'null');}catch{}
const announce=message=>{const target=document.querySelector('[data-action-status]');if(target)target.textContent=message;};
for(const button of document.querySelectorAll('[data-copy]'))button.addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(button.dataset.copy);announce(button.dataset.copy===state?.url?'Report link copied.':'Address copied.');}
 catch{announce('Copy is unavailable in this browser. Select the address or copy the page URL.');}
});
document.querySelector('[data-share]')?.addEventListener('click',async()=>{
 if(!state?.url)return;
 try{if(navigator.share)await navigator.share({title:document.title,url:state.url});else{await navigator.clipboard.writeText(state.url);announce('Report link copied.');}}
 catch(e){if(e.name!=='AbortError')announce('Sharing is unavailable. Copy the report link instead.');}
});
document.querySelector('[data-refresh]')?.addEventListener('click',()=>{
 if(!state||state.cachedOnly||state.id)return;
 const u=new URL(state.url);if(u.origin!==location.origin)return;u.searchParams.set('request','true');location.assign(u.pathname+u.search);
});
