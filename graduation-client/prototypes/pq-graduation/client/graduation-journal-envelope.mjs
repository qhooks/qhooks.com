import { parseGraduationActionFields } from './graduation-action-fields.mjs';
function plain(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(x));
}
function helper(x, names) {
  if (!plain(x)) return false;
  const ds = Object.getOwnPropertyDescriptors(x), keys = Reflect.ownKeys(ds);
  return keys.length === names.length && keys.every(k => names.includes(k)) &&
    names.every(k => ds[k].enumerable && Object.hasOwn(ds[k], 'value'));
}
export function parseGraduationJournalEnvelope(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > 250000) throw new TypeError('Bounded journal text required');
  let root;
  try { root = JSON.parse(text); } catch { throw new TypeError('Invalid JSON'); }
  if (!helper(root, 'schemaVersion kind setupPlanId fields action request proof stage'.split(' '))) throw new TypeError('Root keys mismatch');
  if (root.schemaVersion !== 1 || root.kind !== 'qhooks-graduation-action-journal') throw new TypeError('Invalid envelope metadata');
  if (typeof root.setupPlanId !== 'string' || !/^0x[0-9a-f]{64}$/.test(root.setupPlanId)) throw new TypeError('Invalid setupPlanId');
  const fields = parseGraduationActionFields(root.fields);
  if (fields.kind === 'approve-token') {
    if (root.action !== null || root.request !== null || root.proof !== null) throw new TypeError('Allowance proof fields must be null');
  } else {
    const actionKeys = 'schemaVersion chainId controller moduleId profileId accountId owner publicKey actionType authEpoch policyVersion policyHash operationHash nonce validAfter validUntil'.split(' ');
    if (!helper(root.action, actionKeys)) throw new TypeError('Action keys mismatch');
    for (const k of actionKeys) if (typeof root.action[k] !== 'string' || root.action[k].length === 0 || root.action[k].length > 78) throw new TypeError('Invalid action field');
    if (!plain(root.request)) throw new TypeError('Invalid operation request');
    if (!helper(root.proof, ['walletSignatureHex', 'pqSignatureHex'])) throw new TypeError('Proof keys mismatch');
    if (typeof root.proof.walletSignatureHex !== 'string' || !/^0x[0-9a-f]{130}$/.test(root.proof.walletSignatureHex) || typeof root.proof.pqSignatureHex !== 'string' || !/^0x[0-9a-f]{15712}$/.test(root.proof.pqSignatureHex)) throw new TypeError('Invalid proof signatures');
  }
  if (!helper(root.stage, 'schemaVersion planId transaction expectedContractAddress status hash'.split(' '))) throw new TypeError('Stage keys mismatch');
  if (root.stage.schemaVersion !== 1 || root.stage.expectedContractAddress !== null) throw new TypeError('Invalid call stage metadata');
  if (!helper(root.stage.transaction, 'chainId from to input value nonce gas'.split(' '))) throw new TypeError('Transaction keys mismatch');
  return { ...root, fields };
}
