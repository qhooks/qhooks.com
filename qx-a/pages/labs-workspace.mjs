import {mountShell} from '/qx-a/shell.mjs';
import {h, icon, setTheme} from '/qx-a/components.mjs';
import {projectReadout} from './labs-readout.mjs';

export function mountLabs({kind, fields = {}, title, contexts = []}) {
  const main = document.querySelector('main');
  const instrument = main?.querySelector('[data-labs-instrument]');
  if (!main || !instrument) return;
  const wallet = document.getElementById('qhc-trigger');
  if (wallet) wallet.classList.add('qa-btn', 'qa-btn--secondary', 'qa-wallet__btn');
  mountShell({active: 'hooks', title, wallet, logo: '/qhooks-logo.jpg'});
  const onWallet = () => wallet?.click();
  addEventListener('qa:wallet', onWallet);
  // Preserve the older theme controls in the complete-tools disclosure.
  for (const button of main.querySelectorAll('[data-theme-toggle]')) {
    button.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  }
  instrument.querySelector('[data-labs-icon]').append(icon(kind === 'upgrade' || kind === 'setup' ? 'shield' : 'hook'));
  const readouts = instrument.querySelector('[data-labs-readouts]');
  const name = instrument.querySelector('[data-labs-name]');
  const state = instrument.querySelector('[data-labs-state]');
  const note = instrument.querySelector('[data-labs-note]');
  const passive = ['deployed', 'overview', 'setup', 'upgrade'].includes(kind);
  state.textContent = passive ? (kind === 'deployed' ? 'Deployment' : 'How it works') : 'Draft settings';
  if (passive) note.textContent = kind === 'deployed' ? 'Contract and chain checks appear alongside owner actions.' : 'Review the controls and current state before approving an action.';
  let previous = '', pending = false, pulseTimer;
  let activeKind = kind, activeFields = fields;
  function publicValue(selector) {
    const element = main.querySelector(selector);
    if (!element) return '';
    if (element.matches('input[type=password], input[type=file], input[autocomplete=current-password], input[autocomplete=new-password]')) return '';
    if (element.tagName === 'SELECT' && ['family', 'chain', 'action'].some(key => activeFields[key] === selector)) return element.selectedOptions?.[0]?.textContent?.trim() || '';
    return 'value' in element ? element.value : element.textContent.trim();
  }
  function enhance() {
    for (const control of main.querySelectorAll('.labs-editor input, .labs-editor select, .labs-editor textarea')) {
      if (control.matches('input[type=radio], input[type=checkbox]')) continue;
      control.classList.add(control.tagName === 'SELECT' ? 'qa-select' : control.tagName === 'TEXTAREA' ? 'qa-textarea' : 'qa-input');
    }
    for (const button of main.querySelectorAll('.labs-editor button')) button.classList.add('qa-btn');
  }
  function update() {
    pending = false;
    enhance();
    const values = Object.fromEntries(Object.entries(activeFields).map(([key, selector]) => [key, publicValue(selector)]));
    const model = projectReadout(activeKind, values), next = JSON.stringify(model);
    if (next === previous) return;
    name.textContent = model.name;
    readouts.replaceChildren(h('dl', {class: 'labs-readout-list'}, model.rows.map(row => h('div', {class: 'labs-readout'}, h('dt', null, row.label), h('dd', null, row.value)))));
    if (previous) {
      instrument.setAttribute('data-updated', '');
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => instrument.removeAttribute('data-updated'), 650);
    }
    previous = next;
  }
  const queue = event => {
    const context = contexts.find(item => event?.target?.closest?.(item.selector));
    if (context) { activeKind = context.kind; activeFields = context.fields; }
    if (!pending) { pending = true; queueMicrotask(update); }
  };
  for (const event of ['input', 'change', 'click', 'reset', 'focusin']) main.addEventListener(event, queue);
  const observer = new MutationObserver(queue);
  observer.observe(main, {childList: true, subtree: true});
  update();
  addEventListener('pagehide', () => {
    observer.disconnect(); clearTimeout(pulseTimer);
    removeEventListener('qa:wallet', onWallet);
    for (const event of ['input', 'change', 'click', 'reset', 'focusin']) main.removeEventListener(event, queue);
  }, {once: true});
}
