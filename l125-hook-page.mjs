import {hookIntegration,integrationId} from './l125-hook-integrations.mjs';
import {renderIntegration} from './l125-integration-view.mjs';
export function bindHookIntegration({document:d=document,search=location.search}={}){
 const root=d.getElementById('hook-page'),model=hookIntegration(integrationId(search));
 if(!root)throw new TypeError('Missing hook page');
 if(!model){
  const title=d.createElement('h1'),copy=d.createElement('p'),link=d.createElement('a');
  title.textContent='Choose a hook';copy.textContent='Find a hook in the collection, then configure it for your project.';link.href='hooks.html';link.textContent='Explore hooks';
  root.replaceChildren(title,copy,link);delete root.dataset.hookName;d.title='Explore hooks | QHooks';return null;
 }
 renderIntegration(d,root,model);d.title=model.name+' | QHooks';return model.id;
}
