import {readPublicConfig, projectLabel, canonicalUint} from './public-config-input.mjs';

export const volumeEpochFields = Object.freeze([
  'projectName',
  'chainId',
  'poolFee',
  'tickSpacing',
  'epochSeconds',
  'initialStartsAt',
  'initialEndsAt',
  'initialCap0For1',
  'initialCap1For0'
]);

export function buildVolumeEpochDraft(input) {
  const c = readPublicConfig(input, volumeEpochFields);
  if (c.chainId !== '31337') throw new Error('chainId must equal 31337');

  const fee = canonicalUint(c.poolFee, 'poolFee', 0n, 1000000n);
  const spacing = canonicalUint(c.tickSpacing, 'tickSpacing', 1n, 32767n);
  const duration = canonicalUint(c.epochSeconds, 'epochSeconds', 1n, 18446744073709551615n);
  const start = canonicalUint(c.initialStartsAt, 'initialStartsAt', 0n, 18446744073709551615n);
  const end = canonicalUint(c.initialEndsAt, 'initialEndsAt', 1n, 18446744073709551615n);
  const cap0 = canonicalUint(c.initialCap0For1, 'initialCap0For1', 1n, 340282366920938463463374607431768211455n);
  const cap1 = canonicalUint(c.initialCap1For0, 'initialCap1For0', 1n, 340282366920938463463374607431768211455n);

  if (end <= start) throw new Error('Epoch window must equal epochSeconds');
  if (end - start !== duration) throw new Error('Epoch window must equal epochSeconds');

  return Object.freeze({
    ...c,
    projectName: projectLabel(c.projectName),
    schemaVersion: 1,
    kind: 'qhooks-volume-epoch-draft',
    templateId: 'qvolume-epochs-pq-renewal',
    profile: 'ML-DSA-65'
  });
}
