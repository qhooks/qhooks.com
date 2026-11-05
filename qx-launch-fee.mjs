// Studio: the flat platform launch fee (about $0.45 in the chain's coin). It is part of the launch itself: the
// launch-contract deployment carries exactly this amount and the contract forwards it to the fee wallet, so
// there is no separate payment step and no launch on this code can skip it.
import { connectedAddress, onWalletChange, CHAIN_NAME } from '/qx-chain.mjs';
import { chainMap } from '/chains.mjs';

export const FEE_WALLET = '0x2b1cf7c4071a98a59709166dfa73c7acb7e83e71';
// [display amount, symbol, wei]
// From the registry (chains.mjs launchFee / launchFeeWei, which mirror QLaunchBlocks' per-chain constant).
export const LAUNCH_FEE = chainMap(c => [c.launchFee, c.native, BigInt(c.launchFeeWei)]);
const d = document, chainId = () => d.getElementById('ql-chain')?.value || '8453';

const box = d.createElement('div');
box.className = 'qxb-setup qxb-setup-wallet'; box.id = 'qx-launch-fee'; box.hidden = true;
d.getElementById('ql-connection')?.after(box);

function render() {
  const c = chainId(), [amt, sym] = LAUNCH_FEE[c] || LAUNCH_FEE['8453'];
  const cost = d.getElementById('qtd-launch-fee'); if (cost) cost.textContent = amt + ' ' + sym;
  if (!connectedAddress()) { box.hidden = true; return; }
  const b = d.createElement('h3'), p = d.createElement('p');
  b.textContent = 'Launch fee: ' + amt + ' ' + sym;
  p.textContent = 'Paid with the "Deploy launch blocks" step on ' + (CHAIN_NAME[c] || 'this chain') + ': your wallet shows it as that transaction\'s value. Network fees and your initial liquidity are separate.';
  box.replaceChildren(b, p); box.hidden = false;
}
onWalletChange(() => render());
d.getElementById('ql-chain')?.addEventListener('change', () => render());
render();
