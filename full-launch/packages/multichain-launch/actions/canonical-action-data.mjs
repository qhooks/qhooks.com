export function assertCanonicalLaunchData(root) {
  let count = 0;
  const activeWeakSet = new WeakSet();
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(v));
  function visit(v, depth) {
    if (++count > 128 || depth > 10) throw new TypeError('Recursion limit exceeded');
    if (typeof v === 'string') {
      if (v.length === 0 || v.length > 78) throw new TypeError('String length must be 1..78');
      if (v.startsWith('0x')) {
        if (![42, 66].includes(v.length) || /[^0-9a-f]/.test(v.slice(2))) throw new TypeError('Canonical lowercase hex required');
        return;
      }
      const numStr = v.startsWith('-') ? v.slice(1) : v;
      if (numStr.length === 0 || /[^0-9]/.test(numStr) || BigInt(v).toString() !== v) throw new TypeError('Canonical decimal required');
      return;
    }
    if (!plain(v)) throw new TypeError('Plain object required');
    if (activeWeakSet.has(v)) throw new TypeError('Circular reference');
    activeWeakSet.add(v);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') throw new TypeError('String key required');
      const desc = descriptors[key];
      if (!Object.hasOwn(desc, 'value') || !desc.enumerable) throw new TypeError('Enumerable data required');
      visit(desc.value, depth + 1);
    }
    activeWeakSet.delete(v);
  }
  if (!plain(root)) throw new TypeError('Plain root required');
  visit(root, 0);
  return root;
}
