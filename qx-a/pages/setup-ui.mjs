import { h, icon, ambient, setArt, initTheme, toast } from '/qx-a/components.mjs';
import { addressPattern, shortAddress, stateTone, choosePrimary } from './setup-model.mjs';

const preferred = /^(?:Connect|Switch|Send|Set up|Create|Prepare|Review verifier|Approve|Step|Turn on|Deposit|Load unsigned|Register|Record|Seed|Add the|Lower|Execute|Settle|Claim)/i;
const utility = /^(?:Copy|Refresh|Disconnect|Decline|Cancel|Clear|Detect|Lock key|Turn off|Check|Download|Import|Retry|Restore|Recover)/i;
const textTargets = 'dd, code, .qxc-number, .qfw2-address, .qhlm-address, .qxp-address, .qfw2-approvals li, .qhlm-approvals li, .qtb-note';

export function mountSetup({ title, back, solana = false } = {}) {
  const main = document.querySelector('main');
  if (!main || main.dataset.setupMounted) return;
  main.dataset.setupMounted = 'true';
  initTheme();
  setArt({ banner: '/qx-a/img/qhooks-banner.jpg', blur: '/qx-a/img/qhooks-banner-blur.jpg' });
  document.body.prepend(ambient());
  const flow = main.querySelector('.setup-flow');
  let observer;
  const watch = () => observer.observe(main, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'open', 'data-state', 'data-tone'] });

  function addresses() {
    for (const target of flow.querySelectorAll(textTargets)) {
      // Preserve exact transaction reviews and status text used by the Solana completion listener.
      if (target.closest('pre, [role="status"], a, button, .setup-address')) continue;
      const walk = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, { acceptNode(node) {
        return node.parentElement.closest('a,button,select,textarea,.setup-address') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      } });
      const nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode);
      for (const node of nodes) {
        const value = node.textContent, matches = [...value.matchAll(addressPattern())];
        if (!matches.length) continue;
        const parts = []; let start = 0;
        for (const match of matches) {
          parts.push(value.slice(start, match.index));
          const full = match[0];
          // The full address remains the text node; CSS displays the short form.
          // Copy uses this exact public output, never an input or a transaction field.
          parts.push(h('span', { class: 'setup-address', title: full, dataset: { setupShort: shortAddress(full) } }, full,
            h('button', { type: 'button', class: 'setup-copy', 'aria-label': 'Copy address ' + full, onclick: event => copyAddress(full, event.currentTarget) }, icon('copy'))));
          start = match.index + full.length;
        }
        parts.push(value.slice(start));
        node.replaceWith(...parts);
      }
    }
  }

  function decorate() {
    observer?.disconnect();
    for (const dl of flow.querySelectorAll('dl')) {
      if (dl.children.length < 12 || dl.closest('details') || dl.classList.contains('qxc-sol-rules')) continue;
      const details = h('details', { class: 'setup-facts' }, h('summary', null, 'Review transaction details'));
      dl.before(details); details.append(dl);
    }
    addresses();
    for (const element of flow.querySelectorAll('dd, .qfw2-state, .qhlm-state, .qas-status, .fw-checks li span')) {
      const tone = stateTone(element.textContent);
      element.classList.toggle('setup-state', !!tone);
      if (tone) element.dataset.setupState = tone; else delete element.dataset.setupState;
    }
    const controls = [...flow.querySelectorAll('button:not(.setup-copy),a.qas-go,a.qxc-primary')];
    const key = choosePrimary(controls.map((el, key) => ({ key, disabled: el.disabled, hidden: !!el.closest('[hidden],details:not([open])'), utility: utility.test(el.textContent.trim()), preferred: preferred.test(el.textContent.trim()) })));
    controls.forEach((el, i) => {
      el.classList.add('qa-btn');
      el.classList.toggle('setup-primary', i === key);
      el.classList.toggle('qa-btn--primary', i === key);
      el.classList.toggle('qa-btn--secondary', i !== key);
    });
    watch();
  }

  async function copyAddress(value, opener) {
    try { await navigator.clipboard.writeText(value); toast({ kind: 'info', title: 'Address copied' }); }
    catch {
      const field = h('textarea', { readonly: true, 'aria-label': 'Full address' }, value);
      const close = h('button', { type: 'button', class: 'qa-btn qa-btn--secondary' }, 'Done');
      const dialog = h('dialog', { 'aria-label': 'Copy address' }, h('h2', null, 'Copy address'), h('p', null, 'Select the address to copy it.'), field, close);
      document.body.append(dialog);
      close.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); }, { once: true });
      dialog.showModal(); field.focus(); field.select();
    }
  }

  observer = new MutationObserver(decorate);
  decorate();
  // Import separately: the existing page modules and fallback wallet remain usable
  // if shared shell loading fails. No page-hiding first-paint guard is used.
  import('/qx-a/shell.mjs').then(({ mountShell }) => {
    const trigger = document.getElementById('qhc-trigger');
    const shell = mountShell({ mode: 'detail', title, back, active: solana ? 'launch' : 'portfolio', logo: '/qx-a/img/qhooks-icon.jpg', wallet: trigger || h('span', { class: 'qa-tag' }, 'Solana') });
    document.querySelector('.setup-fallback').hidden = true;
    document.body.dataset.setupShell = 'mounted';
    if (trigger) trigger.classList.add('qa-btn', 'qa-btn--secondary', 'qa-wallet__btn');
    // The page owns its primary action; the header keeps a quiet wallet control.
    shell.slots.wallet.querySelector('button')?.classList.add('qa-btn--secondary');
  }).catch(() => { document.body.dataset.setupShell = 'fallback'; });
  return { dispose() { observer.disconnect(); } };
}
