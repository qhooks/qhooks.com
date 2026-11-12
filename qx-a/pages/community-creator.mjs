// /creator in System A: the site shell, and the launch's own art as the page light. Presentation only: qx-creator.mjs and
// the shared launch panels still read every number and run every action.
import { ambient, setArt, coin } from '/qx-a/components.mjs';
import { laneShell, QHOOKS_ART, readMarkets, marketFor, tokenArt, h } from '/qx-a/pages/community-common.mjs';

laneShell({ active: 'portfolio', title: 'Creator dashboard', back: '/me' });
document.body.prepend(ambient()); setArt({ blur: QHOOKS_ART.blur });
// the page's own Connect button reads as the quiet account button once a wallet is connected
const connect = document.querySelector('.qc-hero-actions [data-qa-connect]');
if (connect) new MutationObserver(() => connect.classList.toggle('is-connected', /^0x/i.test(connect.textContent.trim()))).observe(connect, { childList: true, characterData: true, subtree: true });

async function paint() {
  const m = /^#m=(\d{1,6}):(0x[0-9a-fA-F]{40})/.exec(location.hash);
  const slot = document.getElementById('qc-coin'); if (!slot) return;
  if (!m) { slot.replaceChildren(); return; }
  await readMarkets();
  const board = { kind: 'launch', chainId: m[1], controller: m[2].toLowerCase() }, art = tokenArt(board), mk = marketFor(board);
  slot.replaceChildren(art.logo ? coin(art.logo, { size: 'md', alt: '' }) : h('span', { class: 'cx-tok' }, String(mk?.symbol || '?').slice(0, 1)));
  if (art.blur || art.banner || art.logo) setArt({ blur: art.blur || art.banner || art.logo });
}
addEventListener('hashchange', paint); paint();
