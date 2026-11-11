// /token-profile page: creator edits and publishes a launch's icon, banner and links (external module: the site CSP blocks inline scripts).
import {mountTokenProfileEditor,profilePublicationControl,tokenProfileDraft} from '/qx-token-profile.mjs';
import {getWalletHub} from '/wallet-hub-fresh.mjs';
import {mountGetListed} from './qx-get-listed.mjs';
const hub=getWalletHub(window);
const msg=document.getElementById('tp-msg');
const m=(new URLSearchParams(location.search).get('m')||'').split(':');
const chain=m[0],controller=(m[1]||'').toLowerCase();
if(!/^\d+$/.test(chain)||!/^0x[0-9a-f]{40}$/.test(controller)){msg.textContent='Open this page from your token link: /token-profile?m=CHAIN:CONTROLLER';}
else{
  let market=null;
  try{const r=await fetch('/api/v1/markets/'+chain+'/'+controller,{cache:'no-store'});if(r.ok){const j=await r.json();market=j.meta||j.market||j;}}catch{}
  const name=market?.name||'Your token',symbol=market?.symbol||'TICKER',scope='tp-'+chain+'-'+controller;
  document.getElementById('tp-sub').textContent='$'+symbol+' on chain '+chain+'. Connect the wallet that created it, add an icon and banner, then publish with a free signature. No funds move.';
  document.getElementById('tp-editor').append(mountTokenProfileEditor({id:'tp-profile',imageRequired:true,chain:()=>chain,name:()=>name,symbol:()=>symbol,scope:()=>scope}));
  const pool={chainId:chain,controller,token:market?.token};
  const slot=document.createElement('div');document.getElementById('tp-publish').after(slot);
  const showListing=profile=>{const panel=mountGetListed({chainId:chain,token:market?.token||controller,pool:market?.poolId||market?.pools?.[0]?.id,profile:profile||{}});slot.replaceChildren(...(panel?[panel]:[]));};
  let published=null;try{const r=await fetch('/api/token-profiles/'+chain+'/'+controller);if(r.ok)published=(await r.json()).profile;}catch{}
  showListing(published);
  document.getElementById('tp-publish').append(profilePublicationControl({chain:()=>chain,share:()=>'/trade#pool='+encodeURIComponent(JSON.stringify(pool)),profile:()=>tokenProfileDraft(chain,scope),getConnection:()=>hub.snapshot().current,onPublished:j=>showListing(j.profile)}));
}
