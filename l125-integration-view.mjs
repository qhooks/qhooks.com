export function renderIntegration(document,root,model){
 if(!document||!root||!model)throw new TypeError('Invalid arguments');
 function text(tag,value,className){if(typeof value!=='string')throw new TypeError('Display string required');const el=document.createElement(tag);if(className)el.className=className;el.textContent=value;return el;}
 function link(spec,className){
  const href=spec?.href;
  if(typeof href!=='string'||!/^[a-z0-9][a-z0-9./?=&_-]*$/.test(href)||href.includes('//')||href.includes('..')||href.includes(':')||href.includes('\\')||href.startsWith('/'))throw new TypeError('Same-site relative link required');
  const el=text('a',spec.label,className);el.href=href;return el;
 }
 const category=text('p',model.category,'eyebrow'),name=text('h1',model.name),summary=text('p',model.summary,'lead');
 const badges=document.createElement('div');badges.className='market-badges';badges.append(text('span',model.profile),text('span',model.availability));
 const builder=link(model.builder,'primary'),download=link(model.download,'secondary');download.download='';
 const actions=document.createElement('div');actions.className='market-actions';actions.append(builder,download);
 const fee=text('p','No upfront hook purchase fee. Network fees and optional ML-DSA enrollment are separate.','market-price');
 if(!Array.isArray(model.steps)||model.steps.length!==3)throw new TypeError('Three integration steps required');
 const steps=document.createElement('ol');for(const step of model.steps)steps.append(text('li',step));
 const protectionTitle=text('h2','Protection'),protection=text('p',model.protectedAction);
 const details=document.createElement('details');details.append(text('summary','Integration details'),text('p',model.scope),link(model.reference));
 root.replaceChildren(category,name,summary,badges,actions,fee,text('h2','Make it yours'),steps,protectionTitle,protection,details);
 root.dataset.hookName=model.name;return root;
}
