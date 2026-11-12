// System A, /launch-options (create lane): shell, page light, and the chain rail's letter marks swapped for the site's
// own chain icons (the letters stay for screen readers' sake as hidden text). The package editor is /qx-launch-options.mjs.
import { laneShell, watch } from '/qx-a/pages/create-common.mjs';
laneShell();
const BY_NAME = [[/robinhood/i, 'robinhood'], [/^base/i, 'base'], [/bnb/i, 'bnb'], [/arbitrum/i, 'arbitrum'], [/ethereum/i, 'ethereum'], [/elysium/i, 'elysium'], [/^arc/i, 'arc'], [/monad/i, 'monad'], [/solana/i, 'solana']];
const paint = () => {
  for (const b of document.querySelectorAll('#qcp-app .qcp-chain')) {
    const icon = b.querySelector('.qcp-chain-icon'); if (!icon || icon.querySelector('img')) continue;
    const name = b.querySelector('strong')?.textContent || '', hit = BY_NAME.find(([re]) => re.test(name));
    if (!hit) continue;
    const letters = document.createElement('span'); letters.className = 'qa-vh'; letters.textContent = icon.textContent;
    const img = document.createElement('img'); img.src = '/chain-symbol-icons/' + hit[1] + '.svg'; img.alt = ''; img.width = 32; img.height = 32;
    icon.replaceChildren(img, letters); icon.classList.add('has-img');
  }
};
watch(document.getElementById('qcp-app'), paint, { childList: true, subtree: true });
paint();
