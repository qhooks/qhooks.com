// Wallets in System A: the shell, a podium of the board's top three, and a flash on each new smart-money buy.
// The board, follows, the wallet card and every API call stay in /qx-pro-wallets.mjs and /qx-smart.mjs; this module only
// reads the board they render and never fetches anything itself.
import { laneShell, quietWhenConnected } from './markets-shell.mjs';
import { RM } from '/qx-a/components.mjs';

laneShell({ active: 'trade' });
quietWhenConnected(document.querySelector('[data-qa-connect]'));

const root = document.getElementById('qpw-root'), podium = document.getElementById('mkw-podium');
const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

/* ---------- podium: the board's top three, big ---------- */
let podiumKey = '';
function paintPodium() {
  const rows = [...root.querySelectorAll('.qsm-wide .qsm-tbl tbody tr')].slice(0, 3);
  const key = rows.map((r) => r.querySelector('.qsm-name b')?.textContent + r.querySelector('.qsm-c-pnlUsd')?.textContent).join('|');
  if (key === podiumKey) return;
  podiumKey = key;
  if (!rows.length) { podium.hidden = true; return; }
  const period = root.querySelector('.qsm-period b')?.textContent || '';
  podium.replaceChildren(make('li', 'mkw-podium__h', period ? 'Top wallets · ' + period : 'Top wallets'), ...rows.map((tr, i) => {
    const li = make('li', 'mkw-pod' + (i === 0 ? ' is-first' : '')), btn = make('button', 'mkw-pod__b');
    btn.type = 'button';
    const ident = tr.querySelector('.qsm-ident')?.cloneNode(true);
    if (ident) { ident.setAttribute('width', i === 0 ? 64 : 48); ident.setAttribute('height', i === 0 ? 64 : 48); }
    const pnlCell = tr.querySelector('.qsm-c-pnlUsd'), pctCell = tr.querySelector('.qsm-c-pnlPct');
    const tags = [...tr.querySelectorAll('.qsm-tag')].slice(0, 2).map((t) => make('span', 'mkw-pod__tag ' + [...t.classList].filter((c) => c.startsWith('qsm-tag-')).join(' '), t.textContent));
    btn.append(make('span', 'mkw-pod__rank', String(i + 1)), make('span', 'mkw-pod__ava'), make('span', 'mkw-pod__who'), make('span', 'mkw-pod__pnl'));
    if (ident) btn.children[1].append(ident);
    btn.children[2].append(make('b', null, tr.querySelector('.qsm-name b')?.textContent || ''), ...tags);
    btn.children[3].append(make('b', pnlCell?.className.includes('down') ? 'qa-down' : 'qa-up', pnlCell?.textContent || ''), make('small', pctCell?.className.includes('down') ? 'qa-down' : 'qa-up', pctCell?.textContent || ''));
    btn.setAttribute('aria-label', 'Open ' + (tr.querySelector('.qsm-name b')?.textContent || 'wallet'));
    btn.addEventListener('click', () => tr.click());
    li.append(btn);
    const copy = tr.querySelector('.qsm-acts a');
    if (copy) { const a = make('a', 'qa-btn qa-btn--secondary qa-btn--sm mkw-pod__copy', 'Copy trades'); a.href = copy.getAttribute('href'); li.append(a); }
    if (!RM) li.classList.add('mk-enter');
    return li;
  }));
  podium.hidden = false;
}

/* ---------- new smart-money buys flash in ---------- */
let seenBuys = null;
function markBuys() {
  const items = [...root.querySelectorAll('.qsm-feed a.qsm-buy')];
  if (!items.length) return;
  const key = (a) => a.getAttribute('href') + '|' + (a.querySelector('.qsm-buy-t small')?.textContent || '') + '|' + (a.querySelector('.qsm-buy-v b')?.textContent || '');
  const keys = items.map(key);
  if (seenBuys && !RM) items.forEach((a, i) => { if (!seenBuys.has(keys[i])) a.closest('li')?.classList.add('mk-enter', 'mkw-fresh'); });
  seenBuys = new Set(keys);
}

let queued = false;
new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; paintPodium(); markBuys(); }); }).observe(root, { childList: true, subtree: true });
