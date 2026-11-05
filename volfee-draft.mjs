// Volatility fee hook (a regular Uniswap v4 hook, no keys): validated configuration draft. Same field rules as the
// other Lab drafts: every value a string, decimals without leading zeros, currencies in pool order.
export const volfeeFields = Object.freeze(['projectName', 'chainId', 'currency0', 'currency1', 'tickSpacing', 'baseFee', 'maxFee', 'feePerTickCentiPips', 'halfLife']);
export const buildVolfeeDraft = (input) => {
  const decimal = (key, min, max) => {
    const val = input[key];
    if (typeof val !== 'string' || !/^(0|[1-9][0-9]*)$/.test(val) || val.length > 78) throw new Error(key);
    const num = BigInt(val);
    if (num < BigInt(min) || num > BigInt(max)) throw new Error(key);
    return val;
  };
  const address = (key) => {
    const val = input[key];
    if (typeof val !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(val) || BigInt(val) <= 0n) throw new Error(key);
    return val.toLowerCase();
  };
  if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw new Error('input');
  const keys = Reflect.ownKeys(input);
  if (keys.length !== volfeeFields.length || !keys.every(k => volfeeFields.includes(k))) throw new Error('input');
  if (keys.some(key => typeof Object.getOwnPropertyDescriptor(input, key).value !== 'string')) throw new Error('All fields must be strings');
  const projectName = input.projectName;
  if (projectName.trim().length < 1 || projectName.trim().length > 64) throw new Error('projectName');
  const chainId = decimal('chainId', 1, (1n << 64n) - 1n);
  const currency0 = address('currency0');
  const currency1 = address('currency1');
  if (BigInt(currency0) >= BigInt(currency1)) throw new Error('currency0');
  const tickSpacing = decimal('tickSpacing', 1, 32767);
  const maxFee = decimal('maxFee', 0, 100000);
  const baseFee = decimal('baseFee', 0, Number(maxFee));
  const feePerTickCentiPips = decimal('feePerTickCentiPips', 0, 4294967295);
  const halfLife = decimal('halfLife', 12, 604800);
  return {schemaVersion: 1, templateId: 'qvolatility-fee-hook', kind: 'qhooks-configuration-draft', projectName: projectName.trim(), chainId, currency0, currency1, tickSpacing, baseFee, maxFee, feePerTickCentiPips, halfLife, status: 'configuration-only', deploymentEnabled: false};
};
