// Done state for the Solana setup pages: once the server has verified the step, say so plainly and hide the create action.
const page=document.body.dataset.solSetup,go=new URLSearchParams(location.search).get('go')==='solana';
const get=async path=>{try{const r=await fetch(path,{cache:'no-store'});return r.ok?await r.json():null;}catch{return null;}};
function done(prefix,title,href,label){
 const root=document.getElementById(prefix+'-active');if(!root||document.getElementById(prefix+'-done'))return;
 for(const id of ['create','register','recovery'])document.getElementById(prefix+'-'+id)?.setAttribute('hidden','');
 const box=document.createElement('div');box.id=prefix+'-done';box.className='qxc-panel qsc-done';box.setAttribute('role','status');
 const h=document.createElement('h2');h.textContent=title;const a=document.createElement('a');a.className='qsc-done-link';a.href=href;a.textContent=label;
 box.append(h,a);root.prepend(box);
}
async function check(){
 if(!go)return;
 const config=await get('/api/sol-launch/config');
 if(page==='launch'&&config?.ready)return done('qss','Done. Solana launches are open.','/create?chain=solana','Launch a Solana coin');
 if(page==='referral'){const ref=await get('/api/sol-referral');if(ref?.ready)return config?.ready
  ?done('qrs','Done. Solana launches are open.','/create?chain=solana','Launch a Solana coin')
  :done('qrs','Done. The referral is recorded.','/sol-launch-setup?go=solana','Next: create the launch config');}
}
void check();
// Re-check after a successful tap on this page (the page's own status line changes).
for(const id of ['qss-status','qrs-status']){const el=document.getElementById(id);if(el)new MutationObserver(()=>{if(/confirmed|verified|recorded|open/i.test(el.textContent))void check();}).observe(el,{childList:true,characterData:true,subtree:true});}
