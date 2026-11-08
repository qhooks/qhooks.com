// Ticker folding for the anti-copycat block (Randall, 2026-11-08: "Anti copycat ticker block yes"). The exact rules the
// trust layer uses for its copy labels (fold3 in the community engine): NFKD, accents stripped, lowercase, a leading $
// dropped, look-alike digits/symbols and Cyrillic/Greek letters mapped to Latin, letters only, repeats collapsed.
// So "QH00KS", "$qhooks", "QНООКЅ" and "QHOOOKS" all fold to "qhoks". lead/ticker-guard checks it matches the engine.
export const CONFUSABLE = Object.freeze({
  '0': 'o', '1': 'i', 'l': 'i', '|': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g', '2': 'z', '6': 'g',
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'к': 'k', 'м': 'm', 'т': 't',
  'в': 'b', 'н': 'h', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ο': 'o', 'α': 'a', 'ν': 'v', 'ι': 'i', 'κ': 'k',
  'ρ': 'p', 'τ': 't', 'χ': 'x', 'υ': 'u'
});
export function foldTicker(text) {
  const s = String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^\$+/, '');
  let out = '';
  for (const ch of s) { const c = CONFUSABLE[ch] ?? ch; if (/[a-z]/.test(c)) out += c; }
  return out.replace(/(.)\1+/g, '$1');
}
