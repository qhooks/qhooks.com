// Elysium in System A: the shell (no wallet: these are read-only public tools). Everything else stays in /qx-elysium.mjs.
// The latest block flashes gold when a new observation lands.
import { laneShell } from './markets-shell.mjs';
import { RM } from '/qx-a/components.mjs';

laneShell({ active: 'hooks', wallet: null });
const head = document.getElementById('ey-network-head');
let last = head?.textContent;
if (head) new MutationObserver(() => {
  const now = head.textContent;
  if (now !== last && /\d/.test(now) && /\d/.test(last || '') && !RM) { head.classList.remove('is-tick'); void head.offsetWidth; head.classList.add('is-tick'); setTimeout(() => head.classList.remove('is-tick'), 60); }
  last = now;
  head.classList.toggle('is-number', /\d/.test(now));
}).observe(head, { childList: true, characterData: true, subtree: true });
