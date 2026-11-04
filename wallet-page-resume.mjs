// All workspaces deliberately dispose keys and authority on pagehide. Recreate
// controllers when a browser restores the document from its back-forward cache.
export function bindWalletPageResume(target){
 const resume=event=>{if(event.persisted===true)target.location.reload();};
 target.addEventListener('pageshow',resume);
 return ()=>target.removeEventListener('pageshow',resume);
}
if(typeof window!=='undefined')bindWalletPageResume(window);
