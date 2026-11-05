// l162-qtoken-presets.mjs
// Dependency-free implementation of qTokenPresetValues
// Reference: reference.txt
import {BUILT} from './chains.mjs';

/**
 * Returns frozen preset values for qToken launch forms.
 * @param {string} chainId - Exact chain ID: 8453, 4663, 1, 42161, 56, 5042, 99801
 * @param {string} presetId - Exact preset ID: manual, target, stay
 * @returns {Object} Frozen object with mode, fee, notice, destinationFee, threshold
 * @throws {TypeError} If chainId or presetId is not allowed
 */
export function qTokenPresetValues(chainId, presetId) {
  const allowedChains = new Set(BUILT.map(c => c.id));
  const allowedPresets = new Set(['manual', 'target', 'stay']);

  if (!allowedChains.has(chainId)) {
    throw new TypeError('Invalid chainId');
  }
  if (!allowedPresets.has(presetId)) {
    throw new TypeError('Invalid presetId');
  }

  const mode = presetId === 'manual' ? '1' : presetId === 'target' ? '0' : '2';
  const fee = '1';
  const notice = '86400';
  const destinationFee = '0.5';

  const threshold = presetId === 'target' 
    ? (['8453', '1', '42161', '5042'].includes(chainId) ? '100' : '1')
    : '0';

  return Object.freeze({
    mode,
    fee,
    notice,
    destinationFee,
    threshold
  });
}
