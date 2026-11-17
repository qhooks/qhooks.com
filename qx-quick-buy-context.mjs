import{quickBuyContext}from'./qx-quick-buy-plan.mjs';
// UI context only. The existing chooser remains the sole connection owner; a
// connection never resumes or submits this intent automatically.
export function openQuickBuyWallet(target,plan,{document:d=globalThis.document,open}={}){
 open?.();const dialog=d?.getElementById('qhc-dialog');if(!dialog)return false;
 dialog.querySelector('[data-qx-quick-buy-context]')?.remove();
 const context=quickBuyContext(target,plan),note=d.createElement('div');note.dataset.qxQuickBuyContext='';note.setAttribute('aria-label',context.title);note.id='qx-quick-buy-context';note.setAttribute('aria-live','polite');
 const title=d.createElement('strong'),line=d.createElement('p'),address=d.createElement('p');title.textContent=context.title;line.textContent=context.line;address.className='qhc-address';address.textContent=context.address;note.append(title,line,address);
 const content=dialog.querySelector(':scope > .qx-overlay-content'),heading=dialog.querySelector('.qhc-heading');if(content)content.prepend(note);else if(heading)heading.after(note);else dialog.prepend(note);
 const described=(dialog.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);dialog.setAttribute('aria-describedby',[...new Set([...described,note.id])].join(' '));
 const clear=()=>{note.remove();const rest=(dialog.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==note.id);if(rest.length)dialog.setAttribute('aria-describedby',rest.join(' '));else dialog.removeAttribute('aria-describedby');};dialog.addEventListener('close',clear,{once:true});return true;
}
