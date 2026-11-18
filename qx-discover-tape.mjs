// Adapt shared coverage cards on this page; keep diagnostic detail in their title.
import {simplifyTapeCard} from './qx-discover-tape-data.mjs';
const root = document.getElementById('qd-coverage');
if (root) {
  const paint = () => { for (const card of root.querySelectorAll('[data-tape-chain]')) simplifyTapeCard(card); };
  const observer = new MutationObserver(paint); observer.observe(root, {childList: true, subtree: true, characterData: true}); paint();
  const timer = setInterval(paint, 30000);
  addEventListener('pagehide', event => { if (!event.persisted) { observer.disconnect(); clearInterval(timer); } });
}
