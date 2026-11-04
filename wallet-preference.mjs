export function readWalletPreference(text){
 if(typeof text!=='string'||text.length>1000)return null;
 let obj;try{obj=JSON.parse(text);}catch{return null;}
 if(!obj||typeof obj!=='object'||Array.isArray(obj))return null;
 if(Object.keys(obj).sort().join(',')!=='chainId,owner,rdns,version'||obj.version!==1)return null;
 if(typeof obj.rdns!=='string'||obj.rdns.length<3||obj.rdns.length>253||!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(obj.rdns))return null;
 if(typeof obj.owner!=='string'||!/^0x[0-9a-f]{40}$/.test(obj.owner)||/^0x0{40}$/.test(obj.owner))return null;
 if(typeof obj.chainId!=='string'||!/^[1-9][0-9]{0,19}$/.test(obj.chainId))return null;
 return Object.freeze({version:1,rdns:obj.rdns,owner:obj.owner,chainId:obj.chainId});
}
export function walletPreferenceText(pref){
 if(!pref||typeof pref!=='object')throw TypeError('Invalid wallet preference');
 const obj={version:1};for(const key of ['rdns','owner','chainId']){const d=Object.getOwnPropertyDescriptor(pref,key);if(!d||!Object.hasOwn(d,'value'))throw TypeError('Invalid wallet preference');obj[key]=d.value;}
 const text=JSON.stringify(obj);if(!readWalletPreference(text))throw TypeError('Invalid wallet preference');return text;
}
