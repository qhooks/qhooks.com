import { buildCreatorDraft } from './creator-draft.mjs';

export function buildSplitDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype) throw new Error('input');
  const expected = ['projectName','chainId','owner','currency0','currency1',
    'feeBps','poolFee','tickSpacing','ownerB','shareBps'];
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 10 || keys.some(k => typeof k !== 'string' || !expected.includes(k))) {
    throw new Error('input fields');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (keys.some(k => !Object.hasOwn(descriptors[k], 'value') || typeof descriptors[k].value !== 'string')) {
    throw new Error('string data fields');
  }
  const values = Object.fromEntries(keys.map(k => [k, descriptors[k].value]));
  const draft = buildCreatorDraft(Object.fromEntries(expected.slice(0, 8).map(k => [k, values[k]])));
  const ownerB = values.ownerB.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(ownerB) || BigInt(ownerB) === 0n ||
      [draft.owner,draft.currency0,draft.currency1].includes(ownerB)) throw new Error('ownerB');
  const shareBps = values.shareBps;
  if (!/^(0|[1-9][0-9]*)$/.test(shareBps) || shareBps.length > 4) throw new Error('shareBps');
  const share = BigInt(shareBps);
  if (share < 1n || share > 9999n) throw new Error('shareBps');
  return {...draft, templateId:'qrevenue-split-pq-vaults', ownerB, shareBps,
    secondShareBps:(10000n - share).toString()};
}
