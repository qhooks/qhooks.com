// QCaster page (System A): Ask / Design / Ideas over /api/qcaster/*. The product name comes from qcaster-name.mjs only.
// Answers, sources and idea cards come from the server, which reads only QHooks data. This page signs nothing:
// Design ends at a "Review in Create" link.
import {QCASTER} from '/qcaster-name.mjs';
import {h, tabs, button, state, tag} from '/qx-a/components.mjs';
import {artPanel} from '/qx-qcaster-art.mjs';

const d = document, $ = id => d.getElementById(id), N = QCASTER.name;
d.title = N + ' · Beta | QHooks';
$('qc-name').textContent = N;
$('qc-q').placeholder = 'Ask ' + N + '…';

const ASK_TRY = ['Which hooks stop snipers?', 'What are the fees?', 'How does adaptive liquidity work?', 'What does Bundle shield do?', 'Solana fees'];
const DESIGN_TRY = ['A meme token on Robinhood Chain, anti-snipe, small burn, liquidity that grows', 'Holders earn from every trade, on Base', 'A fair sale first on BNB Chain', 'Plain token, no tax, $20K start'];
const HERO = {ask: ['Ask about any ', 'hook.'], design: ['Design a launch in ', 'plain words.'], ideas: ['Find your next ', 'launch idea.']};

// ---- tabs (deep link: #ask, #design, #ideas) ----
const panels = {ask: $('qc-ask'), design: $('qc-design'), ideas: $('qc-ideas')};
let current = Object.hasOwn(panels, location.hash.slice(1)) ? location.hash.slice(1) : 'ask';
const t = tabs([{id: 'ask', label: 'Ask'}, {id: 'design', label: 'Design'}, {id: 'ideas', label: 'Ideas'}], {active: current, label: N, onChange: show});
$('qc-tabs').append(t.el);
function show(id) {
 current = id; for (const [k, el] of Object.entries(panels)) el.hidden = k !== id;
 const [a, b] = HERO[id]; $('qc-title').replaceChildren(a, h('span', {class: 'hl-gold'}, b));
 history.replaceState(null, '', '#' + id);
 if (id === 'ideas' && !ideasLoaded) loadIdeas();
}
addEventListener('hashchange', () => { const id = location.hash.slice(1); if (Object.hasOwn(panels, id) && id !== current) { t.set(id); show(id); } });

// ---- shared ----
// A signed-in community session (same token the boards use) lets the server apply the per-wallet limits too.
function sessionHeader() { try { const v = JSON.parse(localStorage.getItem('qhooks:board-session:v1') || 'null'); return v && /^[0-9a-f]{64}$/.test(v.token || '') && v.expiresAt > Date.now() ? {authorization: 'Bearer ' + v.token} : {}; } catch { return {}; } }
async function post(path, body) {
 const r = await fetch('/api/qcaster/' + path, {method: 'POST', headers: {'content-type': 'application/json', accept: 'application/json', ...sessionHeader()}, body: JSON.stringify(body)});
 let j = null; try { j = await r.json(); } catch {}
 if (!j) throw Error('Could not reach ' + N + '. Try again.');
 if (!r.ok) throw Error(j.answer || 'Try again.');
 return j;
}
const busy = (form, on) => { const b = form.querySelector('button[type=submit]'); if (b) { b.disabled = on; b.classList.toggle('is-busy', on); } };
const chips = (box, list, onPick) => box.replaceChildren(...list.map(q => h('button', {type: 'button', class: 'qc-chip', onclick: () => onPick(q)}, q)));
// "[2]" in an answer becomes a link to its source.
function cited(text, sources) {
 const by = new Map(sources.map(s => [s.n, s])), out = [];
 for (const part of String(text).split(/(\[\d+\])/)) {
  const m = /^\[(\d+)\]$/.exec(part), s = m && by.get(Number(m[1]));
  out.push(s ? h('a', {class: 'qc-ref', href: s.href, title: s.title}, m[1]) : part);
 }
 return out;
}
function paragraphs(text, sources) {
 const lines = String(text).split(/\n+/).map(l => l.trim()).filter(Boolean), list = lines.filter(l => /^[-•]\s/.test(l));
 if (list.length && list.length === lines.length - (lines[0] && !/^[-•]\s/.test(lines[0]) ? 1 : 0)) {
  const head = /^[-•]\s/.test(lines[0]) ? null : lines[0];
  return [head ? h('p', null, cited(head, sources)) : null, h('ul', {class: 'qc-list'}, list.map(l => h('li', null, cited(l.replace(/^[-•]\s/, ''), sources))))];
 }
 return lines.map(l => h('p', null, cited(l, sources)));
}
function sourceList(sources) {
 if (!sources?.length) return null;
 return h('div', {class: 'qc-src'}, h('p', {class: 'qc-src__h'}, 'Sources'),
  h('ol', null, sources.map(s => h('li', null, h('a', {href: s.href}, h('span', {class: 'qc-src__n'}, s.n ?? ''), h('span', {class: 'qc-src__t'}, s.title), h('span', {class: 'qc-src__u'}, 'qhooks.com' + s.href.replace(/#.*$/, '')))))));
}
const modeNote = j => j.limited ? tag(j.limit === 'budget' ? 'At today’s limit · from search' : 'Limit reached · from search', 'warn') : j.mode === 'search' ? tag('From search') : j.mode === 'model' ? tag(j.cached ? 'From QHooks data · just asked' : 'From QHooks data', 'gold') : null;

// ---- Ask ----
const askForm = $('qc-ask-form'), askOut = $('qc-ask-out'), q = $('qc-q');
chips($('qc-ask-chips'), ASK_TRY, v => { q.value = v; askForm.requestSubmit(); });
q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askForm.requestSubmit(); } });
askForm.addEventListener('submit', async e => {
 e.preventDefault(); const question = q.value.trim(); if (question.length < 2) { q.focus(); return; }
 busy(askForm, true); askOut.replaceChildren(h('p', {class: 'qc-q'}, question), state('loading', {title: 'Reading QHooks pages…'}));
 try {
  const j = await post('ask', {question});
  const body = [h('p', {class: 'qc-q'}, question), h('div', {class: 'qc-a'}, paragraphs(j.answer, j.sources || []))];
  if (j.excerpts?.length) body.push(h('div', {class: 'qc-ex'}, j.excerpts.map(x => h('blockquote', null, h('p', null, x.text), h('a', {href: x.href}, x.title)))));
  body.push(h('div', {class: 'qc-meta'}, modeNote(j)), sourceList(j.excerpts?.length ? null : j.sources));
  askOut.replaceChildren(...body.filter(Boolean));
 } catch (err) { askOut.replaceChildren(state('error', {title: err.message})); }
 finally { busy(askForm, false); }
});

// ---- Design ----
const designForm = $('qc-design-form'), designOut = $('qc-design-out'), dIn = $('qc-d');
chips($('qc-design-chips'), DESIGN_TRY, v => { dIn.value = v; designForm.requestSubmit(); });
designForm.addEventListener('submit', async e => {
 e.preventDefault(); const text = dIn.value.trim(); if (text.length < 3) { dIn.focus(); return; }
 busy(designForm, true); designOut.replaceChildren(state('loading', {title: 'Matching it to Create…'}));
 try { renderDesign(await post('design', {text})); }
 catch (err) { designOut.replaceChildren(state('error', {title: err.message})); }
 finally { busy(designForm, false); }
});
function renderDesign(j) {
 if (!j.plan) { designOut.replaceChildren(h('div', {class: 'qc-a'}, h('p', null, j.answer)), h('div', {class: 'qc-meta'}, modeNote(j))); return; }
 const p = j.plan, START = {standard: 'Standard', floor: '$20K start', high: '$50K start'};
 const panel = artPanel(p, j.link, {post});
 const rows = [['Chain', p.chainName], ['Idea', p.idea.name], ['Rules', p.idea.blocks?.length ? p.idea.blocks.map(b => b.name).join(' · ') : p.idea.id === 'sale-first' ? 'Fair sale, then a locked pool' : 'No tax, caps or launch games'],
  p.start ? ['Start', START[p.start]] : null, p.pq ? ['Quantum key', 'On'] : null].filter(Boolean);
 designOut.replaceChildren(...[
  h('div', {class: 'qc-plan'},
   h('p', {class: 'qc-plan__k'}, j.outcome === 'partial' ? 'Closest match' : 'Your launch'),
   h('h2', {class: 'qc-plan__t'}, p.idea.name, h('span', null, ' on ' + p.chainName)),
   h('p', {class: 'qc-plan__w'}, p.idea.what),
   h('dl', {class: 'qc-dl'}, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
   p.wants?.length ? h('ul', {class: 'qc-wants'}, p.wants.map(w => h('li', {class: w.met ? 'is-met' : 'is-miss'}, (w.met ? '' : 'Not in this idea: ') + w.label))) : null,
   panel.el,
   h('div', {class: 'qc-plan__go'}, panel.go, p.studio ? button('Every rule in Studio', {kind: 'secondary', href: p.studio}) : null),
   h('p', {class: 'qc-plan__note'}, j.review)),
  p.alternatives?.length ? h('p', {class: 'qc-alt'}, 'Also close: ', p.alternatives.map((a, i) => [i ? ' · ' : '', h('a', {href: a.href}, a.name)])) : null,
  h('div', {class: 'qc-meta'}, modeNote(j)), sourceList(j.sources)].filter(Boolean));
 panel.start();
}

// ---- Ideas ----
let ideasLoaded = false, ideasRun = 0, steerTimer = 0;
const steer = $('qc-steer'), chainSel = $('qc-chain'), ideasOut = $('qc-ideas-out');
async function loadIdeas() {
 ideasLoaded = true; const run = ++ideasRun;
 const qs = new URLSearchParams({chain: chainSel.value || '4663', steer: steer.value.trim()});
 try {
  const r = await fetch('/api/qcaster/ideas?' + qs, {headers: {accept: 'application/json'}}); const j = await r.json(); if (run !== ideasRun) return;
  if (!chainSel.options.length) { chainSel.replaceChildren(...j.chains.map(c => h('option', {value: c.id}, c.name))); chainSel.value = j.chainId; }
  ideasOut.replaceChildren(h('ol', {class: 'qc-ideas'}, j.ideas.map((i, n) => h('li', {class: 'qc-idea' + (steer.value.trim() && i.match > 0 && n < 3 ? ' is-top' : '')},
   h('div', {class: 'qc-idea__main'}, h('h3', null, i.name, i.group === 'kits' ? h('span', {class: 'qc-kit'}, 'Kit') : null), h('p', null, i.what), h('p', {class: 'qc-idea__why'}, i.why),
    i.blocks?.length ? h('p', {class: 'qc-idea__b'}, i.blocks.map(b => b.name).join(' · ')) : null),
   button('Use this', {kind: 'secondary', size: 'sm', href: i.href})))));
 } catch { if (run === ideasRun) ideasOut.replaceChildren(state('error', {title: 'Could not load the ideas. Try again.', action: 'Retry', onAction: loadIdeas})); }
}
steer.addEventListener('input', () => { clearTimeout(steerTimer); steerTimer = setTimeout(loadIdeas, 220); });
chainSel.addEventListener('change', loadIdeas);
$('qc-ideas-form').addEventListener('submit', e => { e.preventDefault(); loadIdeas(); });

// ---- foot + start ----
$('qc-foot').textContent = N + ' is in beta. It answers from QHooks pages and data only, never gives price predictions or financial advice, and never signs or launches anything.';
const pre = new URLSearchParams(location.search).get('q');
show(current);
if (pre && current === 'ask') { q.value = pre.slice(0, 400); askForm.requestSubmit(); }
