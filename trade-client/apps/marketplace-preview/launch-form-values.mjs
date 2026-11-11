import {LAUNCH_BLOCKS} from '../../../full-launch/packages/multichain-launch/artifact.mjs';
export function readLaunchForm(document, parseAmount, owner = '0x0000000000000000000000000000000000000001') {
  const read = (id) => {
    const el = document.getElementById('ql-' + id);
    if (!el || typeof el.value !== 'string') throw new TypeError('Missing launch input: ' + id);
    return el.value;
  };
  const decimals = read('decimals');
  if (decimals !== '6' && decimals !== '18') throw new TypeError('Invalid decimals');
  const mode = read('mode');
  if (!['0', '1', '2'].includes(mode)) throw new TypeError('Invalid mode');
  return {
    tokenName: read('name'), symbol: read('symbol'), decimals,
    totalSupply: parseAmount(read('supply'), Number(decimals)),
    notice: read('notice'), lpFeePpm: parseAmount(read('fee'), 4),
    tokenAmount: read('token-funding'), quoteAmount: read('quote-funding')||'0',
    ...(document.getElementById('ql-start-tier')?{startTier:read('start-tier'),startSteps:read('start-steps'),...(document.getElementById('ql-start-usd')?{startUsd:read('start-usd')}:{})}:{ }),
    graduationMode: mode, threshold: mode === '0' ? read('threshold') : '0',
    destinationFeePpm: parseAmount(read('destination-fee'), 4),
    ...(LAUNCH_BLOCKS ? { blocks: (document.getElementById('ql-blocks')?.value ?? '').replaceAll('"@owner"', JSON.stringify(owner)) } : {})
  };
}
