// The competition owns awards and signing. This page adapter explains unavailable display values.
import {explainPrizeEstimates} from './qx-compete-data.mjs';
const root = document.getElementById('competition');
if (root) {
  const paint = () => explainPrizeEstimates(root), observer = new MutationObserver(paint);
  observer.observe(root, {childList: true, subtree: true, characterData: true}); paint();
  addEventListener('pagehide', event => { if (!event.persisted) observer.disconnect(); });
}
