// Public configuration editor. No wallet/client/signer/contract imports.
import {recipeChain,createLaunchRecipe,readLaunchRecipe,writeLaunchRecipe,recipeLimit} from './l124-launch-recipe.mjs';
import {saveLaunchHandoff} from './l124-draft-handoff.mjs';
import {fillRecipeForm,renderRecipeSummary} from './l124-recipe-form.mjs';
import {readLaunchForm} from './launch-form-values.mjs';
import {parseDecimalAmount} from '../../packages/crosschain/decimal-amount.mjs';
// launchfix 2026-11-27: plain-words checks that name the field, run before the strict recipe validators.
const NUM=/^(?:\d+\.?\d*|\.\d+)$/;
export function studioFieldProblem(d){
 const v=id=>(d.getElementById('ql-'+id)?.value??'').trim();
 const name=v('name');if(!name||new TextEncoder().encode(name).length>64)return {id:'name',message:'Enter a token name (1–64 characters).'};
 if(!/^[A-Za-z0-9]{1,10}$/.test(v('symbol')))return {id:'symbol',message:'Enter a symbol: 1–10 letters or digits, no spaces or symbols.'};
 const supply=v('supply');if(!NUM.test(supply)||!(Number(supply)>0))return {id:'supply',message:'Enter a total supply above 0, in whole tokens (for example 1000000).'};
 const tokens=v('token-funding');if(!NUM.test(tokens)||!(Number(tokens)>0))return {id:'token-funding',message:'Enter how many tokens go into initial liquidity (more than 0).'};
 if(Number(tokens)>Number(supply))return {id:'token-funding',message:'Tokens for initial liquidity can’t be more than the total supply.'};
 const quote=v('quote-funding');if(quote&&!NUM.test(quote))return {id:'quote-funding',message:'Enter the quote amount as a plain number, or leave it empty.'};
 const fee=v('fee');if(!NUM.test(fee)||!(Number(fee)>0))return {id:'fee',message:'Enter a creator LP fee in percent, above 0 (for example 1).'};
 if(v('mode')==='0'){const t=v('threshold');if(!NUM.test(t)||!(Number(t)>0))return {id:'threshold',message:'Enter a net quote-inflow target above 0.'};}
 const dest=v('destination-fee');if(!NUM.test(dest)||!(Number(dest)>0))return {id:'destination-fee',message:'Enter a destination LP fee in percent, above 0 (for example 0.5).'};
 return null;
}
const FRIENDLY=[[/tokenName/i,'name','Enter a token name (1–64 characters).'],[/symbol/i,'symbol','Enter a symbol: 1–10 letters or digits, no spaces or symbols.'],[/decimals/i,'decimals','Choose 6 or 18 decimals.'],[/notice/i,'notice','Choose a one-hour, one-day or seven-day notice.'],[/liquidity within total supply|destination fee/i,'token-funding','Check the liquidity amounts: tokens for liquidity must be above 0 and within the total supply, and the destination LP fee above 0.'],[/threshold|quote target/i,'threshold','Enter a net quote-inflow target above 0, or pick another mode.'],[/Plain decimal|Canonical|Numeric|bounded|out of bounds/i,null,'Check the number fields: use plain numbers like 1000000 or 0.5.']];
export function friendlyStudioError(message){for(const [re,id,text]of FRIENDLY)if(re.test(String(message||'')))return {id,message:text};return null;}
export const recipeStorePrefix='qhooks:lab:graduation-recipe:v1:';
export function bindGraduationStudio({document:d=document,target=window,downloadFile,clock=Date.now,makeId}={}){
 const $=id=>d.getElementById('ql-'+id),controls=['preview','save','restore','download','import','continue','example'];
 let busy=false,dead=false,revision=0;const listeners=[];
 const note=(message,error=false)=>{$('feedback').textContent=message;$('feedback').dataset.error=String(error);};
 // Error next to the button that was pressed, naming the field; the field is marked and focused.
 let inline=null;const continueBtn=$('continue');
 if(continueBtn){inline=d.createElement('p');inline.id='ql-continue-error';inline.className='ql-inline-error';inline.setAttribute('role','alert');inline.hidden=true;inline.style.cssText='margin:8px 0 0;color:#e8a89a;font-size:14px;line-height:1.4';(continueBtn.closest('p')||continueBtn).after(inline);}
 const clearProblem=()=>{if(inline){inline.hidden=true;inline.textContent='';}for(const el of d.querySelectorAll('[id^="ql-"][aria-invalid="true"]'))el.removeAttribute('aria-invalid');};
 const showProblem=(problem,near)=>{note(problem.message,true);const field=problem.id&&$(problem.id);if(field){field.setAttribute('aria-invalid','true');}if(near==='continue'&&inline){inline.textContent=problem.message;inline.hidden=false;}};
 const checked=()=>{const p=studioFieldProblem(d);if(p){const e=new TypeError(p.message);e.problem=p;throw e;}};
 function listen(node,event,fn){node.addEventListener(event,fn);listeners.push([node,event,fn]);}
 function hint(){const c=recipeChain($('chain').value);$('quote-unit').textContent='Liquidity uses '+c.quoteSymbol+' ('+c.quoteDecimals+' decimals). Keep '+c.nativeSymbol+' for network fees.';$('threshold-label').hidden=$('mode').value!=='0';}
 function read(){return createLaunchRecipe($('chain').value,readLaunchForm(d,parseDecimalAmount,undefined,{includeBlocks:false}));}
 function show(recipe){renderRecipeSummary(d,$('summary'),recipe);$('result').hidden=false;}
 function changed(){revision++;clearProblem();$('result').hidden=true;hint();note('Settings changed. Preview to check your recipe.');}
 function applyForm(recipe){fillRecipeForm(d,recipe);$('chain').dispatchEvent(new (target.Event||Event)('change',{bubbles:true}));}
 function download(text,name){if(downloadFile)return downloadFile(text,name);const url=target.URL.createObjectURL(new Blob([text],{type:'application/json'})),a=d.createElement('a');a.href=url;a.download=name;d.body.appendChild(a);a.click();a.remove();target.setTimeout(()=>target.URL.revokeObjectURL(url),30000);}
 async function run(fn,which){if(dead||busy)return;busy=true;for(const id of controls)$(id).disabled=true;clearProblem();try{await fn();}catch(e){if(!dead){const p=e?.problem||friendlyStudioError(e?.message)||{id:null,message:e?.message||'Check your recipe settings and try again.'};showProblem(p,which);}}finally{busy=false;if(!dead)for(const id of controls)$(id).disabled=false;}}
 const actions={
  preview(){checked();show(read());note('Recipe checked. No wallet or transaction needed.');},
  save(){checked();const recipe=read(),text=writeLaunchRecipe(recipe),key=recipeStorePrefix+recipe.chainId;target.localStorage.setItem(key,text);if(target.localStorage.getItem(key)!==text)throw new TypeError('Recipe did not save. Download it instead.');show(recipe);note('Recipe saved in this browser for '+recipeChain(recipe.chainId).name+'.');},
  restore(){const recipe=readLaunchRecipe(target.localStorage.getItem(recipeStorePrefix+$('chain').value));if(recipe.chainId!==$('chain').value)throw new TypeError('Saved recipe chain does not match');applyForm(recipe);show(recipe);note('Saved recipe restored.');},
  download(){checked();const recipe=read();download(writeLaunchRecipe(recipe),'qhooks-qgraduation-'+recipe.chainId+'-recipe.json');show(recipe);note('Recipe download requested. It contains public settings only.');},
  async import(){const f=$('recipe-file').files?.[0],rev=revision;if(!f||!Number.isInteger(f.size)||f.size<=0||f.size>recipeLimit)throw new TypeError('Select a public recipe JSON file up to 8192 bytes.');let text;try{text=await f.text();}catch{throw new TypeError('The recipe file could not be read.');}if(dead||rev!==revision)throw new TypeError('Settings changed while reading the file. Import it again.');const recipe=readLaunchRecipe(text);applyForm(recipe);show(recipe);$('recipe-file').value='';note('Recipe imported for '+recipeChain(recipe.chainId).name+'. Review before continuing.');},
  continue(){checked();const recipe=read(),id=makeId?makeId():Array.from(target.crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');const saved=saveLaunchHandoff({storage:target.sessionStorage,id,recipe,now:clock()});show(recipe);target.location.assign(saved.url);},
  example(){const c=recipeChain($('chain').value),recipe=createLaunchRecipe(c.id,{tokenName:'Lab Example',symbol:'QLAB',decimals:'18',totalSupply:'1000000000000000000000000',notice:'86400',lpFeePpm:'10000',tokenAmount:'1000',quoteAmount:'0.1',graduationMode:'1',threshold:'0',destinationFeePpm:'5000'});applyForm(recipe);show(recipe);note('Example settings loaded. Change them for your token before launching.');}
 };
 for(const id of controls)listen($(id),'click',()=>run(actions[id],id));
 for(const id of ['chain','name','symbol','decimals','supply','notice','fee','token-funding','quote-funding','mode','threshold','destination-fee']){listen($(id),'input',changed);listen($(id),'change',changed);}
 function dispose(){dead=true;for(const[n,e,fn]of listeners)n.removeEventListener(e,fn);target.removeEventListener('pagehide',dispose);}
 target.addEventListener('pagehide',dispose);hint();return Object.freeze({dispose,snapshot:()=>({busy,revision})});
}
