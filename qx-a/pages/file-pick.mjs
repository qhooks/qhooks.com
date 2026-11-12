// File pickers (audit 2026-11-12 #27): every <input type="file"> on the page shows as a secondary button plus a
// filename line instead of the browser's "Choose File / No file chosen". The input itself is kept (same id, name,
// accept, multiple, disabled and handlers); it is only visually hidden inside the button, so clicks, keyboard focus,
// screen readers and the page's own change handlers all still go to it. Inputs added later (lab.js) are picked up too.
// Used by /lab, /qwallets, /deploy, /list-market and /market-submit.
const CSS = `
/* Tripled class: page rules such as .qwd .lab-form label (block, padding, rule line) must not reshape the picker. */
.qfp.qfp.qfp { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 8px 0 0; padding: 0; min-width: 0; max-width: 100%; box-shadow: none; cursor: pointer; }
.qfp > .qfp__input { position: absolute !important; left: 0; top: 0; width: 1px !important; height: 1px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; opacity: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.qfp > .qfp__btn { flex: none; cursor: pointer; }
.qfp > .qfp__name { min-width: 0; flex: 1 1 140px; font-size: 13.5px; line-height: 1.35; font-weight: 560; color: var(--qa-tx-3); overflow-wrap: anywhere; }
.qfp.is-picked > .qfp__name { color: var(--qa-tx); }
.qfp:hover > .qfp__btn { background: var(--qa-rule-2); }
.qfp:has(> .qfp__input:focus-visible) > .qfp__btn { outline: 2px solid var(--qa-gold-hi); outline-offset: 2px; }
.qfp:has(> .qfp__input:disabled) { cursor: not-allowed; }
.qfp:has(> .qfp__input:disabled) > .qfp__btn { opacity: .45; cursor: not-allowed; }
`;
const valueOf = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

function label(input, name, wrap) {
  const files = input.files ? [...input.files] : [];
  name.textContent = !files.length ? 'No file chosen' : files.length === 1 ? files[0].name : `${files.length} files`;
  wrap.classList.toggle('is-picked', files.length > 0);
}

function enhance(input) {
  if (input.dataset.qfp) return;
  input.dataset.qfp = '1';
  // Inside an existing <label> (market-submit), a nested label is invalid: a span is enough, the outer label opens it.
  const wrap = document.createElement(input.closest('label') ? 'span' : 'label');
  wrap.className = 'qfp';
  const btn = document.createElement('span');
  btn.className = 'qa-btn qa-btn--secondary qa-btn--sm qfp__btn';
  btn.setAttribute('aria-hidden', 'true');
  btn.textContent = input.multiple ? 'Choose files' : 'Choose file';
  const name = document.createElement('span');
  name.className = 'qfp__name';
  name.setAttribute('aria-hidden', 'true');
  input.before(wrap);
  input.classList.add('qfp__input');
  wrap.append(input, btn, name);
  const sync = () => label(input, name, wrap);
  input.addEventListener('change', sync);
  input.addEventListener('input', sync);
  input.form?.addEventListener('reset', () => setTimeout(sync));
  // Pages clear the picker in code (input.value = ''): keep the filename line in step.
  if (valueOf) Object.defineProperty(input, 'value', { configurable: true, get() { return valueOf.get.call(this); }, set(v) { valueOf.set.call(this, v); sync(); } });
  sync();
}

function scan(node) {
  if (node.nodeType !== 1) return;
  if (node.matches('input[type="file"]')) enhance(node);
  else node.querySelectorAll?.('input[type="file"]').forEach(enhance);
}

if (!document.getElementById('qfp-style')) {
  const style = document.createElement('style');
  style.id = 'qfp-style';
  style.textContent = CSS;
  document.head.append(style);
}
scan(document.body);
new MutationObserver((list) => { for (const m of list) m.addedNodes.forEach(scan); }).observe(document.body, { childList: true, subtree: true });
