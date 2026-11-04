import {readPublicConfig,projectLabel,canonicalUint} from './public-config-input.mjs';

export const circuitFields = Object.freeze(['projectName','chainId','poolFee','tickSpacing','cooldownSeconds','initialThreshold0For1','initialThreshold1For0']);

export function buildCircuitDraft(input) {
  const c = readPublicConfig(input, circuitFields);
  if (c.chainId !== '31337') throw new Error('chainId must be 31337');
  canonicalUint(c.poolFee, 'poolFee', 0n, 1000000n);
  canonicalUint(c.tickSpacing, 'tickSpacing', 1n, 32767n);
  canonicalUint(c.cooldownSeconds, 'cooldownSeconds', 1n, 18446744073709551615n);
  canonicalUint(c.initialThreshold0For1, 'initialThreshold0For1', 1n, 340282366920938463463374607431768211455n);
  canonicalUint(c.initialThreshold1For0, 'initialThreshold1For0', 1n, 340282366920938463463374607431768211455n);
  return Object.freeze({
    ...c,
    projectName: projectLabel(c.projectName),
    schemaVersion: 1,
    kind: 'qhooks-circuit-draft',
    templateId: 'qcircuit-recovery-pq-resume',
    profile: 'ML-DSA-65'
  });
}
