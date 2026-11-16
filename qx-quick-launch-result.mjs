import {marketPath} from './qx-quick-launch-core.mjs';
import {launchPostLink} from './qx-launch-prefill.mjs';
// Receipt presentation only. Called after a confirmed successful factory receipt.
export function paintQuickLaunchResult({doc=globalThis.document,chain,name,symbol,image,token,hash}){
 const $=id=>doc.getElementById('qq-'+id);
 $('done').hidden=false;$('launch').hidden=true;
 $('done-name').textContent=name.trim()+' ('+symbol.trim().toUpperCase()+') · '+chain.name;
 $('token').textContent=token;$('open-market').href=marketPath(chain.id,token);$('tx').href=chain.explorer+'/tx/'+hash;
 const x=launchPostLink({name,ticker:symbol,chainName:chain.name,chainId:chain.id,token}),post=$('post-x');if(post){post.hidden=!x;if(x)post.href=x;}
 const art=$('share-image');if(art){art.src=image;art.hidden=!image;}
}
