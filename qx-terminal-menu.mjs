// Terminal's phone disclosure uses the same link groups as the site header.
export function mountTerminalMenu({button,nav,header,document:doc=globalThis.document,media=globalThis.matchMedia?.('(max-width:880px)')}={}){
 if(!button||!nav||!header)return null;
 let open=false;
 const close=(restoreFocus=false)=>{open=false;nav.hidden=true;button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Site menu');if(restoreFocus)button.focus();};
 const toggle=()=>{if(open){close(true);return;}if(media&&!media.matches)return;header.style.setProperty('--qxt-menu-top',Math.max(8,header.getBoundingClientRect().bottom+4)+'px');open=true;nav.hidden=false;button.setAttribute('aria-expanded','true');button.setAttribute('aria-label','Close site menu');nav.querySelector('a')?.focus();};
 const escape=event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopImmediatePropagation();close(true);}};
 const outside=event=>{if(open&&!nav.contains(event.target)&&!button.contains(event.target))close();};
 const navigate=event=>{if(event.target.closest('a'))close();};
 const resize=()=>{if(media&&!media.matches)close(nav.contains(doc.activeElement));};
 button.setAttribute('aria-controls',nav.id);close();
 button.addEventListener('click',toggle);nav.addEventListener('click',navigate);
 // Run before the terminal's Escape-to-tokens handler; retain the selected market.
 doc.addEventListener('keydown',escape,true);doc.addEventListener('click',outside);doc.addEventListener('focusin',outside);media?.addEventListener?.('change',resize);
 return {close,dispose(){close();button.removeEventListener('click',toggle);nav.removeEventListener('click',navigate);doc.removeEventListener('keydown',escape,true);doc.removeEventListener('click',outside);doc.removeEventListener('focusin',outside);media?.removeEventListener?.('change',resize);}};
}
if(globalThis.document)mountTerminalMenu({button:document.getElementById('qxt-site-menu-toggle'),nav:document.getElementById('qxt-site-menu'),header:document.querySelector('.qxt-top')});
