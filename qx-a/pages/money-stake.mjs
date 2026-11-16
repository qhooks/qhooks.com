// A stable staking destination using the same vault panel and wallet controls as the terminal.
import '/qx-trade-staking.mjs';
import '/qx-trade-stakelock.mjs';

const card = document.getElementById('qtz');
const chain = card?.dataset.stakingChain, token = card?.dataset.stakingToken;
// Public canonical QHOOKS market identity, recorded 2026-11-13. This is discovery metadata only: the inner staking
// module still reads the setup on chain and confirms vault code before a transaction. No balances/config are supplied.
const knownMarket = Object.freeze({chainId: '4663', controller: '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195',
  constructor: Object.freeze({blocks: '0xf14965a00bb489b8cddfb31bf7687cc7babc5606'})});
const knownIdentity = chain === knownMarket.chainId && token === knownMarket.controller;

function retryButton() {
  const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'qtx-mini'; retry.textContent = 'Retry';
  retry.addEventListener('click', open); return retry;
}

function pending() {
  const heading = document.createElement('h2'); heading.id = 'qtz-heading'; heading.textContent = 'Staking';
  const status = document.createElement('p'); status.className = 'qtb-note'; status.setAttribute('role', 'status');
  status.textContent = 'Refreshing QHOOKS staking. Actions become available after the setup and staking contract can be checked.';
  const actions = document.createElement('div'); actions.className = 'qtx-actions';
  for (const label of ['Stake', 'Unstake', 'Claim rewards']) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'qtx-mini'; button.disabled = true; button.textContent = label; actions.append(button);
  }
  card.replaceChildren(heading, status, actions, retryButton());
}

function open() {
  if (!card || !knownIdentity || card.querySelector('.qtz-claim')) return;
  card.setAttribute('aria-busy', 'true');
  pending();
  // These panels need only chain/controller/blocks. Avoid making their known destination wait for /api/markets:
  // each module owns fresh setup/code reads and its own request/owner guards before any action can run.
  document.dispatchEvent(new CustomEvent('qhooks:pool', {detail: knownMarket}));
  // show() draws disabled controls synchronously, then reads setup. Keep Retry available during that wait;
  // the inner panel replaces it on success and provides its own retry after a failed setup read.
  if (!card.querySelector('.qtz-claim')) card.append(retryButton());
}
open();
