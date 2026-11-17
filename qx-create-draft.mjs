import {profileImage} from './qx-token-profile-core.mjs';
// One local identity draft across launch chains. No transaction configuration,
// wallet identity, signatures, pending receipts or fee values belong here.
export const CREATE_DRAFT_KEY='qhooks:create:identity-draft:v1';
const limits={chain:40,name:256,symbol:40,description:1000,x:500,telegram:500,website:500,discord:500,image:220000,bannerData:440000,banner:128,bannerSource:20};
const clone=value=>JSON.parse(JSON.stringify(value));
export function createLaunchDraftStore({storage=()=>localStorage,onChange=()=>{}}={}){
 let loaded=false,value=null,persistent=true;
 const normalize=input=>{if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid launch draft.');const out={};for(const[k,max]of Object.entries(limits)){const text=input[k]??'';if(typeof text!=='string'||text.length>max)throw Error('The launch draft is too large.');out[k]=text;}out.image=profileImage(out.image,'image');out.bannerData=profileImage(out.bannerData,'banner');if(out.banner&&!/^[a-f0-9]{64}$/.test(out.banner))throw Error('Invalid banner reference.');return out;};
 function get(){if(!loaded){loaded=true;try{const text=storage().getItem(CREATE_DRAFT_KEY);if(text){if(text.length>710000)throw Error('oversize');value=normalize(JSON.parse(text));}}catch{persistent=false;}}return value?clone(value):null;}
 return{get,saved:()=>persistent,replace(next){get();value=normalize(next);try{const target=storage(),encoded=JSON.stringify(value);target.setItem(CREATE_DRAFT_KEY,encoded);persistent=target.getItem(CREATE_DRAFT_KEY)===encoded;}catch{persistent=false;}onChange({value:clone(value),saved:persistent});return persistent;}};
}
let shared;
export function launchIdentityDraft(){return shared??=createLaunchDraftStore({onChange:detail=>document.dispatchEvent(new CustomEvent('qhooks:create-draft',{detail}))});}
export const draftTokenProfile=d=>({description:d?.description||'',image:d?.image||'',banner:d?.bannerData||'',links:{x:d?.x||'',telegram:d?.telegram||'',website:d?.website||'',discord:d?.discord||''}});
