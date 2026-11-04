// Applies public form settings only. It cannot connect, create keys or send.
import {handoffIdFromLocation,readLaunchHandoff,assertUnchangedHandoff} from './l124-draft-handoff.mjs';
import {renderRecipeSummary} from './l124-recipe-form.mjs';
export function labApplyBlock(s){
 if(!s||!s.connected)return 'Connect your wallet on the selected chain to use this recipe.';
 if(s.busy||s.held)return 'Finish the current operation before applying a recipe.';
 if(s.workspace||s.existingProgress)return 'This wallet already has launch progress. Keep that launch unchanged.';
 if(s.key)return 'A quantum key is already loaded. Keep this launch unchanged.';
 return '';
}
export function bindLabLaunchReceiver({document:d,target,snapshot,apply,clock=Date.now}){
 const panel=d.getElementById('qhl-panel');if(!panel)return Object.freeze({render(){},dispose(){}});
 const button=d.getElementById('qhl-apply'),status=d.getElementById('qhl-status'),summary=d.getElementById('qhl-summary');
 if(!button||!status||!summary)throw new TypeError('Lab receipt controls missing');
 let loaded=null,applied=false,dead=false;
 const message=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
 function current(){
  const id=handoffIdFromLocation(target.location);if(!id){if(loaded)throw new TypeError('The Lab draft reference changed. Reopen it from the Lab.');return null;}
  const s=snapshot();
  if(!loaded){loaded=readLaunchHandoff({storage:target.sessionStorage,id,chainId:s.chainId,now:clock()});renderRecipeSummary(d,summary,loaded.recipe);}
  if(id!==loaded.id)throw new TypeError('The Lab draft reference changed. Reopen it from the Lab.');
  const recipe=assertUnchangedHandoff({storage:target.sessionStorage,loaded,chainId:s.chainId,now:clock()});
  return {s,recipe};
 }
 function render(){
  if(dead)return;button.disabled=true;
  try{const value=current();panel.hidden=!value;if(!value)return;
   if(applied){message('Lab recipe applied. Review your settings, then create and verify your key backup.');return;}
   const block=labApplyBlock(value.s);button.disabled=!!block;message(block||'Review this recipe. Applying it replaces only the unsaved settings below.');
  }catch{panel.hidden=false;message('This Lab recipe cannot be used here. Reopen it from the Lab on its original chain. Existing launch progress is unchanged.',true);}
 }
 function onApply(){
  if(dead||applied)return;
  try{const value=current();if(!value)throw new TypeError('No Lab recipe selected');const block=labApplyBlock(value.s);if(block)throw new TypeError(block);
   apply(value.recipe);applied=true;render();
  }catch(e){button.disabled=true;message(e?.message||'The recipe was not applied.',true);}
 }
 button.addEventListener('click',onApply);target.addEventListener('hashchange',render);
 return Object.freeze({render,dispose(){dead=true;button.removeEventListener('click',onApply);target.removeEventListener('hashchange',render);}});
}
