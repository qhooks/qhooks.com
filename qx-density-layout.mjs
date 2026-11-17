// Presentation only: existing portfolio nodes/IDs remain the data and action owners.
const mounted=new WeakMap();
export function mountDensityLayout(doc=globalThis.document){
 if(!doc)return()=>{};if(mounted.has(doc))return mounted.get(doc);
 const overview=doc.getElementById('qp-overview'),main=overview?.querySelector('.pf6-hero__main'),side=overview?.querySelector('.pf6-hero__side');
 if(!overview||!main||!side)return()=>{};
 const originals=[],added=[];let disposed=false;
 const make=className=>{const n=doc.createElement('div');n.className=className;added.push(n);return n;};
 const move=(node,to)=>{if(!node)return;const anchor=doc.createComment('density layout');node.before(anchor);originals.push({node,anchor});to.append(node);};
 const primary=make('pf6-summary-primary');main.prepend(primary);move(main.querySelector('.pf6-hero__top'),primary);move(doc.getElementById('qp-total'),primary);
 const pnl=make('pf6-summary-pnl');side.prepend(pnl);move(side.querySelector('.pf6-pnl'),pnl);
 const reading=make('pf6-reading-row');overview.after(reading);move(main.querySelector('.mn-pf-reading'),reading);move(doc.getElementById('qp-allocation'),reading);move(doc.getElementById('qp-pnl-note'),reading);move(doc.getElementById('qp-notes'),reading);
 const owner=overview.closest('main');owner?.classList.add('pf6-dense-overview');
 const priorTabindex=overview.getAttribute('tabindex');if(priorTabindex===null)overview.tabIndex=0;
 function dispose(){if(disposed)return;disposed=true;for(const{node,anchor}of originals.reverse()){if(anchor.isConnected)anchor.replaceWith(node);}for(const n of added)n.remove();owner?.classList.remove('pf6-dense-overview');if(priorTabindex===null)overview.removeAttribute('tabindex');mounted.delete(doc);}
 mounted.set(doc,dispose);return dispose;
}
if(typeof document!=='undefined'){
 const admit=()=>{const stop=mountDensityLayout(document);globalThis.addEventListener?.('pagehide',event=>{if(!event.persisted)stop();},{once:true});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',admit,{once:true});else admit();
}
