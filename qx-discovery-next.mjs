// Empty/sparse discovery actions. Read-only destinations; no wallet or data reads.
export const TRENDING_DISCOVERY_HREF='/terminal?discover=trending';
export function discoveryNextModel({count=0,loading=false,failed=false,filtered=false,kind='feed',threshold=4}={}){
 if(!Number.isInteger(count)||count<0||count>=threshold||loading&&!count)return null;
 return {title:count?'Keep exploring':failed?'This list is unavailable':filtered?'No matches in this view':kind==='markets'?'No QHooks markets here yet':kind==='launches'?'The next launch could be yours':'No tokens here yet',body:count?count+' '+(count===1?'result':'results')+' in this view. Find more or start something new.':failed?'Retry this list, or explore another route.':'Launch a token, share a call or explore what’s trading.',actions:[['Launch a token','/create'],['Call a token','/community#make-a-call'],['Browse trending',TRENDING_DISCOVERY_HREF],['Explore hooks','/hooks']]};
}
export function mountDiscoveryNext({document:doc=globalThis.document,onTrending}={}){
 if(!doc.querySelector('link[href="/qx-discovery-next.css"]')){const css=doc.createElement('link');css.rel='stylesheet';css.href='/qx-discovery-next.css';doc.head.append(css);}
 const root=doc.createElement('section'),title=doc.createElement('h2'),copy=doc.createElement('p'),links=doc.createElement('nav');root.className='qx-discovery-next';root.hidden=true;links.setAttribute('aria-label','Explore next');root.append(title,copy,links);let key='';
 return{element:root,update(options={}){const model=discoveryNextModel(options),next=JSON.stringify([model,!!options.compact]);root.hidden=!model;if(!model||next===key)return;key=next;title.hidden=!!options.compact;copy.hidden=!!options.compact;title.textContent=model.title;copy.textContent=model.body;links.replaceChildren(...model.actions.map(([label,href],index)=>{const a=doc.createElement('a');a.className='qxn-link'+(index===0?' qxn-primary':'');a.href=href;a.textContent=label;if(href===TRENDING_DISCOVERY_HREF&&onTrending)a.addEventListener('click',event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;event.preventDefault();onTrending();});return a;}));}};
}
