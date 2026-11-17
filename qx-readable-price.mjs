// Presentation only: reveal the original numeric observation without zero-count
// shorthand. Never parse this string back into an amount, quote or transaction.
export function fullPriceDigits(value) {
  if (value == null || value === '') return null;
  if (typeof value!=='number' && (typeof value!=='string' || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number=Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  if (number===0) return '0';
  const [coefficient,power]=String(number).toLowerCase().split('e');
  if (power==null) return coefficient;
  const [whole,fraction='']=coefficient.split('.'),digits=whole+fraction,point=whole.length+Number(power);
  if (point<=0) return '0.'+'0'.repeat(-point)+digits;
  if (point>=digits.length) return digits+'0'.repeat(point-digits.length);
  return digits.slice(0,point)+'.'+digits.slice(point);
}

const openByDocument=new WeakMap();
function ensureStyles(doc) {
  if (doc.querySelector('link[data-qx-readable-price]')) return;
  const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('./qx-readable-price.css',import.meta.url).href;link.dataset.qxReadablePrice='';doc.head.append(link);
}

// The caller inserts el beside its compact price, not inside a value node that
// another UI reads. update() receives only the caller's usable observation.
export function createReadablePrice({document:doc=globalThis.document}={}) {
  ensureStyles(doc);
  const el=doc.createElement('details'),summary=doc.createElement('summary'),panel=doc.createElement('div'),label=doc.createElement('span'),value=doc.createElement('span');
  el.className='qx-readable-price';el.hidden=true;
  summary.textContent='Full';summary.setAttribute('aria-label','Full price');
  panel.className='qx-readable-price__panel';panel.setAttribute('role','region');panel.setAttribute('aria-label','Full price');
  label.className='qx-readable-price__label';label.textContent='Full price';value.className='qx-readable-price__value';
  panel.append(label,value);el.append(summary,panel);
  let disposed=false,listening=false;
  const view=doc.defaultView;
  const stop=event=>event.stopPropagation();
  const close=()=>{el.open=false;detach();};
  const outside=event=>{if(!el.contains(event.target))close();};
  const scroll=event=>{if(!panel.contains(event.target))close();};
  const escape=event=>{if(event.key==='Escape'&&el.open){event.preventDefault();event.stopPropagation();close();summary.focus({preventScroll:true});}};
  function detach(){
    if(!listening)return;listening=false;
    doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('keydown',escape,true);doc.removeEventListener('scroll',scroll,true);view?.removeEventListener('resize',close);
    if(openByDocument.get(doc)===el)openByDocument.delete(doc);
  }
  function position(){
    const rect=summary.getBoundingClientRect(),width=Math.min(320,Math.max(0,view.innerWidth-24)),left=Math.max(12,Math.min(rect.left,view.innerWidth-width-12));
    panel.style.width=width+'px';panel.style.left=left+'px';
    const below=view.innerHeight-rect.bottom-8;
    panel.style.top=below>=100?Math.min(rect.bottom+6,view.innerHeight-100)+'px':'auto';
    panel.style.bottom=below>=100?'auto':Math.max(12,view.innerHeight-rect.top+6)+'px';
  }
  const toggle=()=>{
    if(!el.open){detach();return;}
    const previous=openByDocument.get(doc);if(previous&&previous!==el)previous.open=false;
    openByDocument.set(doc,el);position();
    if(!listening){listening=true;doc.addEventListener('pointerdown',outside,true);doc.addEventListener('keydown',escape,true);doc.addEventListener('scroll',scroll,true);view?.addEventListener('resize',close);}
  };
  el.addEventListener('click',stop);el.addEventListener('toggle',toggle);
  return {el,summary,update({value:input,unit='USD'}={}){
    if(disposed)return;
    const digits=fullPriceDigits(input);
    if(digits==null){close();el.hidden=true;value.textContent='';summary.removeAttribute('title');summary.setAttribute('aria-label','Full price');return;}
    el.hidden=false;
    const display=unit==='USD'?'$'+digits:digits+(unit?' '+String(unit):'');
    value.textContent=display;summary.title='Full price: '+display;summary.setAttribute('aria-label','Full price: '+display);
    if(el.open)position();
  },dispose(){if(disposed)return;disposed=true;close();el.removeEventListener('click',stop);el.removeEventListener('toggle',toggle);el.remove();}};
}
