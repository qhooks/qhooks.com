// Browser-local public intent, never a signature, key, transaction or authorization.
import {normalizeLaunchRecipe,exactRecipeData,recipeLimit} from './l124-launch-recipe.mjs';
export const handoffPrefix='qhooks:lab:launch:v1:';
export const handoffLifetime=24*60*60*1000;
const ensure=(ok,message)=>{if(!ok)throw new TypeError(message);};
const validId=id=>typeof id==='string'&&/^[0-9a-f]{32}$/.test(id)&&!/^[0]+$/.test(id);
const storageKey=id=>{ensure(validId(id),'Invalid Lab draft reference');return handoffPrefix+id;};
function time(now){ensure(Number.isSafeInteger(now)&&now>0&&now<=Number.MAX_SAFE_INTEGER-handoffLifetime,'Valid current time required');return now;}
function envelope(text,now){
 ensure(typeof text==='string'&&text.length>0&&text.length<=recipeLimit,'This Lab draft is missing or too large');
 let parsed;try{parsed=JSON.parse(text);}catch{throw new TypeError('Invalid public Lab handoff JSON');}
 const d=exactRecipeData(parsed,['schemaVersion','kind','createdAt','expiresAt','recipe']);
 ensure(d.schemaVersion===1&&d.kind==='qhooks-lab-launch-handoff','Unsupported Lab handoff');
 ensure(Number.isSafeInteger(d.createdAt)&&d.createdAt>0&&Number.isSafeInteger(d.expiresAt)&&d.expiresAt===d.createdAt+handoffLifetime,'Invalid Lab draft lifetime');
 ensure(time(now)>=d.createdAt&&now<d.expiresAt,'This handoff expired or its date is invalid. Open the recipe in the Lab again.');
 return Object.freeze({...d,recipe:normalizeLaunchRecipe(d.recipe)});
}
export function saveLaunchHandoff({storage,id,recipe,now}){
 const key=storageKey(id);time(now);const normalized=normalizeLaunchRecipe(recipe);
 ensure(storage&&typeof storage.getItem==='function'&&typeof storage.setItem==='function','Browser session storage is required');
 ensure(storage.getItem(key)===null,'A Lab draft already uses this reference');
 const text=JSON.stringify({schemaVersion:1,kind:'qhooks-lab-launch-handoff',createdAt:now,expiresAt:now+handoffLifetime,recipe:normalized});
 ensure(text.length<=recipeLimit,'Lab draft exceeds the handoff limit');storage.setItem(key,text);ensure(storage.getItem(key)===text,'Lab draft could not be saved. Download the recipe instead.');
 return Object.freeze({id,url:'launch-workspace.html?chain='+normalized.chainId+'#lab='+id,text});
}
export function readLaunchHandoff({storage,id,chainId,now}){
 ensure(storage&&typeof storage.getItem==='function','Browser session storage is required');
 const key=storageKey(id),text=storage.getItem(key),draft=envelope(text,now);
 ensure(draft.recipe.chainId===chainId,'Lab draft and selected launch chain do not match');return Object.freeze({id,key,text,...draft});
}
export function assertUnchangedHandoff({storage,loaded,chainId,now}){
 const current=readLaunchHandoff({storage,id:loaded.id,chainId,now});ensure(current.text===loaded.text,'The Lab draft changed. Reopen it from the Lab before applying.');return current.recipe;
}
export function handoffIdFromLocation(location){
 const hash=location?.hash||'';if(!hash)return null;
 const p=new URLSearchParams(hash.slice(1));if(!p.has('lab'))return null;
 ensure([...p.keys()].length===1&&p.getAll('lab').length===1,'Ambiguous Lab draft reference');const id=p.get('lab');storageKey(id);return id;
}
