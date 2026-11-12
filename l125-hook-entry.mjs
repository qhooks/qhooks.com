import {bindHookIntegration} from './l125-hook-page.mjs';
import {hookIntegration,integrationId} from './l125-hook-integrations.mjs';
// The shared view only accepts relative links, but every integration's builder link is a site path (/lab, /circuit-lab),
// so it throws and /hook?id=… stayed blank. When it does, render the same model here with site paths allowed.
try { bindHookIntegration(); } catch { renderModel(); }

function renderModel() {
  const d = document, root = d.getElementById('hook-page'), model = hookIntegration(integrationId(location.search));
  if (!root || !model) return;
  const text = (tag, value, className) => { const el = d.createElement(tag); if (className) el.className = className; el.textContent = String(value ?? ''); return el; };
  const safe = href => typeof href === 'string' && /^\/?[a-z0-9][a-z0-9./?=&_-]*$/i.test(href) && !href.includes('//') && !href.includes('..');
  const link = (spec, className) => { const el = text('a', spec?.label, className); if (safe(spec?.href)) el.href = spec.href; return el; };
  const badges = d.createElement('div'); badges.className = 'market-badges'; badges.append(text('span', model.profile), text('span', model.availability));
  const download = link(model.download, 'secondary'); download.download = '';
  const actions = d.createElement('div'); actions.className = 'market-actions'; actions.append(link(model.builder, 'primary'), download);
  const steps = d.createElement('ol'); for (const step of model.steps || []) steps.append(text('li', step));
  const details = d.createElement('details'); details.append(text('summary', 'Integration details'), text('p', model.scope), link(model.reference));
  root.replaceChildren(text('p', model.category, 'eyebrow'), text('h1', model.name), text('p', model.summary, 'lead'), badges, actions,
    text('p', 'No upfront hook purchase fee. Network fees and optional ML-DSA enrollment are separate.', 'market-price'),
    text('h2', 'Make it yours'), steps, text('h2', 'Protection'), text('p', model.protectedAction), details);
  root.dataset.hookName = model.name; d.title = model.name + ' | QHooks';
}
