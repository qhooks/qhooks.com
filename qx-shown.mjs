// One rule sitewide (walletpos, 2026-11-12: ROOQ's token page printed the literal text "null"): a missing value never
// renders as text. null, undefined, NaN and the strings "null", "undefined", "NaN" or blank are nothing; callers leave
// the element out (or hide it) instead of printing them. Dependency-free so any page module can use it.
export function shown(value) {
  if (value == null || typeof value === 'boolean' || (typeof value === 'number' && !Number.isFinite(value))) return null;
  const text = String(value).trim();
  return text && !/^(?:null|undefined|nan)$/i.test(text) ? text : null;
}
/// Children for DOM append()/replaceChildren(): nodes kept; strings and numbers only when shown(); the rest dropped.
export const shownKids = (...kids) => kids.flat(Infinity).filter(k => k != null && k !== false && (typeof k === 'object' ? !!k.nodeType : shown(k) !== null));
