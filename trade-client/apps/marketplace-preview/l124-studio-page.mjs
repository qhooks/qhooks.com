// Public configuration editor. No wallet/client/signer/contract imports.
import {recipeChain,createLaunchRecipe,readLaunchRecipe,writeLaunchRecipe,recipeLimit} from './l124-launch-recipe.mjs';
import {saveLaunchHandoff} from './l124-draft-handoff.mjs';
import {fillRecipeForm,renderRecipeSummary} from './l124-recipe-form.mjs';
import {readLaunchForm} from './launch-form-values.mjs';
import {parseDecimalAmount} from '../../packages/crosschain/decimal-amount.mjs';
export const recipeStorePrefix='qhooks:lab:graduation-recipe:v1:';
export function bindGraduationStudio({document:d=document,target=window,downloadFile,clock=Date.now,makeId}={}){
 const $=id=>d.getElementById('ql-'+id),controls=['preview','save','restore','download','import','continue','example'];
 let busy=false,dead=false,revision=0;const listeners=[];
 const note=(message,error=false)=>{$('feedback').textContent=message;$('feedback').dataset.error=String(error);};
 function listen(node,event,fn){node.addEventListener(event,fn);listeners.push([node,event,fn]);}
 function hint(){const c=recipeChain($('chain').value);$('quote-unit').textContent='Liquidity uses '+c.quoteSymbol+' ('+c.quoteDecimals+' decimals). Keep '+c.nativeSymbol+' for network fees.';$('threshold-label').hidden=$('mode').value!=='0';}
 function read(){return createLaunchRecipe($('chain').value,readLaunchForm(d,parseDecimalAmount,undefined,{includeBlocks:false}));}
 function show(recipe){renderRecipeSummary(d,$('summary'),recipe);$('result').hidden=false;}
 function changed(){revision++;$('result').hidden=true;hint();note('Settings changed. Preview to check your recipe.');}
 function applyForm(recipe){fillRecipeForm(d,recipe);$('chain').dispatchEvent(new (target.Event||Event)('change',{bubbles:true}));}
 function download(text,name){if(downloadFile)return downloadFile(text,name);const url=target.URL.createObjectURL(new Blob([text],{type:'application/json'})),a=d.createElement('a');a.href=url;a.download=name;d.body.appendChild(a);a.click();a.remove();target.setTimeout(()=>target.URL.revokeObjectURL(url),30000);}
 async function run(fn){if(dead||busy)return;busy=true;for(const id of controls)$(id).disabled=true;try{await fn();}catch(e){if(!dead)note(e?.message||'Check your recipe settings and try again.',true);}finally{busy=false;if(!dead)for(const id of controls)$(id).disabled=false;}}
 const actions={
  preview(){show(read());note('Recipe checked. No wallet or transaction needed.');},
  save(){const recipe=read(),text=writeLaunchRecipe(recipe),key=recipeStorePrefix+recipe.chainId;target.localStorage.setItem(key,text);if(target.localStorage.getItem(key)!==text)throw new TypeError('Recipe did not save. Download it instead.');show(recipe);note('Recipe saved in this browser for '+recipeChain(recipe.chainId).name+'.');},
  restore(){const recipe=readLaunchRecipe(target.localStorage.getItem(recipeStorePrefix+$('chain').value));if(recipe.chainId!==$('chain').value)throw new TypeError('Saved recipe chain does not match');applyForm(recipe);show(recipe);note('Saved recipe restored.');},
  download(){const recipe=read();download(writeLaunchRecipe(recipe),'qhooks-qgraduation-'+recipe.chainId+'-recipe.json');show(recipe);note('Recipe download requested. It contains public settings only.');},
  async import(){const f=$('recipe-file').files?.[0],rev=revision;if(!f||!Number.isInteger(f.size)||f.size<=0||f.size>recipeLimit)throw new TypeError('Select a public recipe JSON file up to 8192 bytes.');let text;try{text=await f.text();}catch{throw new TypeError('The recipe file could not be read.');}if(dead||rev!==revision)throw new TypeError('Settings changed while reading the file. Import it again.');const recipe=readLaunchRecipe(text);applyForm(recipe);show(recipe);$('recipe-file').value='';note('Recipe imported for '+recipeChain(recipe.chainId).name+'. Review before continuing.');},
  continue(){const recipe=read(),id=makeId?makeId():Array.from(target.crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');const saved=saveLaunchHandoff({storage:target.sessionStorage,id,recipe,now:clock()});show(recipe);target.location.assign(saved.url);},
  example(){const c=recipeChain($('chain').value),recipe=createLaunchRecipe(c.id,{tokenName:'Lab Example',symbol:'QLAB',decimals:'18',totalSupply:'1000000000000000000000000',notice:'86400',lpFeePpm:'10000',tokenAmount:'1000',quoteAmount:'0.1',graduationMode:'1',threshold:'0',destinationFeePpm:'5000'});applyForm(recipe);show(recipe);note('Example settings loaded. Change them for your token before launching.');}
 };
 for(const id of controls)listen($(id),'click',()=>run(actions[id]));
 for(const id of ['chain','name','symbol','decimals','supply','notice','fee','token-funding','quote-funding','mode','threshold','destination-fee']){listen($(id),'input',changed);listen($(id),'change',changed);}
 function dispose(){dead=true;for(const[n,e,fn]of listeners)n.removeEventListener(e,fn);target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);hint();return Object.freeze({dispose,snapshot:()=>({busy,revision})});
}
