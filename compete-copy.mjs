import {perpsCopyTarget} from './compete-perps-copy.mjs';
import {copyReviewHref} from './qx-copy-review-core.mjs';
// Navigation only. Manual copy reviews default to a signature for each buy; PERPS keeps its existing ticket.
export function competitionCopyTarget(entry){
 const target=wallet=>{const href=copyReviewHref(wallet);return href?{wallet:new URLSearchParams(href.split('?')[1]).get('w'),href}:null;};
 const primary=target(entry?.wallet);if(primary)return primary;
 const aliases=[...new Map((Array.isArray(entry?.publicWallets)?entry.publicWallets:[]).map(target).filter(Boolean).map(x=>[x.wallet,x])).values()];
 return aliases.length===1?aliases[0]:null;
}
export function competitionCopyControl(doc,entry){
 const perp=perpsCopyTarget(entry),target=entry?.perp?(perp?{href:perp,perp:entry.perp}:null):competitionCopyTarget(entry),button=doc.createElement(target?'a':'button');button.className='compete-copy';button.textContent='Copy';
 if(target){button.href=target.href;button.title=target.perp?'Review '+target.perp+' in the perps ticket':'Set limits for '+target.wallet;button.setAttribute('aria-label',target.perp?'Review '+target.perp+' perp; choose size and sign in your wallet':'Set up copy trading for '+(entry.name||target.wallet));}
 else{button.textContent='Copy unavailable';button.type='button';button.disabled=true;button.title='Choose one wallet on the trader’s profile.';button.setAttribute('aria-label','Choose a wallet to copy');}
 return button;
}
