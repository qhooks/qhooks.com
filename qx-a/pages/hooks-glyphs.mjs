// HOOKS lane: one glyph per launch block, hook and module. Line marks on a 24 grid, drawn in currentColor.
const G = {
  openingAuction: '<path d="M3.5 6.5l7 5.5M3.5 12h7M3.5 17.5l7-5.5"/><circle cx="14" cy="12" r="2.6"/><path d="M16.6 12h4"/>',
  openDelay: '<path d="M6 16.5v-5a6 6 0 0112 0v5l1.6 2H4.4z"/><path d="M10 21h4M12 3.5v1.6"/>',
  antiSnipe: '<circle cx="12" cy="12" r="6.6"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3"/><path d="M7.4 16.6l9.2-9.2"/>',
  walletCap: '<path d="M3.5 5.5h17" stroke-dasharray="2.2 2.2"/><path d="M7 20v-8M12 20V5.5M17 20v-5"/>',
  maxTrade: '<path d="M4.5 4.5h15"/><path d="M12 20V8.5M8 12.5l4-4 4 4"/>',
  cooldown: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5.4 8 8.5s-8 3.5-8 8.5M16 3.5c0 5-8 5.4-8 8.5s8 3.5 8 8.5"/>',
  holderGate: '<path d="M4.5 20.5V9l7.5-5 7.5 5v11.5"/><path d="M9 20.5v-6.5h6v6.5"/>',
  sandwich: '<path d="M12 3l7 3v5.2c0 4.4-3 8-7 9.8-4-1.8-7-5.4-7-9.8V6z"/><path d="M8.6 10h6.8M8.6 14h6.8"/>',
  exitClock: '<circle cx="10.5" cy="12.5" r="7"/><path d="M10.5 8.5v4l2.6 1.6M17 4.5l3.5-1M20.5 3.5v3.6"/>',
  impactFee: '<path d="M2.5 12.5h4l2.2-5.5 3.3 11 2.4-6.5 1.4 2.5h5.7"/>',
  stormFee: '<path d="M13.5 2.5L5.5 13.5h5.5l-1.4 8 8.4-11.5h-5.6z"/>',
  sessionFee: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7"/>',
  sizeTiers: '<path d="M3.5 20.5h4v-4.5h4.5v-4.5h4.5V7h4"/><path d="M3.5 20.5h17"/>',
  tax: '<path d="M6 18L18 6"/><circle cx="7.5" cy="7.5" r="2.4"/><circle cx="16.5" cy="16.5" r="2.4"/>',
  payees: '<path d="M12 21v-7.5M12 13.5L5.5 6.5M12 13.5l6.5-7"/><path d="M5.5 10.5v-4h4M18.5 10.5v-4h-4"/>',
  referrals: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.2-1.2"/>',
  autoBurn: '<path d="M12.4 2.8c.6 3.2-1.4 4.9-2.9 6.7-1.4 1.6-2.6 3.3-2.6 5.9a5.1 5.1 0 0010.2 0c0-1.7-.6-3-1.4-4.1-.2 1.3-.9 2.3-1.9 2.6.9-3.8-.2-8.1-1.4-11.1z"/>',
  buyback: '<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3"/><path d="M19.5 3.5v4h-4"/><path d="M12 9.2c.3 1.6-.7 2.4-1.4 3.2-.5.6-.9 1.2-.9 2a2.3 2.3 0 004.6 0c0-.8-.3-1.3-.7-1.8"/>',
  king: '<path d="M4 18.5h16"/><path d="M4.6 15.5L3.5 7.5l4.8 3.6L12 4.5l3.7 6.6 4.8-3.6-1.1 8z"/>',
  clockPot: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9.5M10 3h4M12 3v3.5M18 6.5l1.5-1.5"/>',
  points: '<path d="M12 3.2l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.1l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z"/>',
  // built into every launch
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5M12 14.5v2.5"/>',
  graduation: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.3c1.4 1.4 3.3 2.2 5.5 2.2s4.1-.8 5.5-2.2v-4.3M21.5 9.5v5"/>',
  keys: '<circle cx="8" cy="9" r="4"/><path d="M10.8 11.8l8.7 8.7M16.5 17.5l2-2M14 15l2-2"/>',
  bell: '<path d="M6.5 15.5v-4.5a5.5 5.5 0 0111 0v4.5l1.5 2h-14z"/><path d="M10 20.5h4"/>',
  fee: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  chains: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.6 10.6l6.8-3.4M8.6 13.4l6.8 3.4"/>',
  // beside every pool, Lab, modules
  eth: '<path d="M12 2.5l6 9.7-6 3.5-6-3.5z"/><path d="M6 13.6l6 7.9 6-7.9-6 3.5z"/>',
  limit: '<path d="M3.5 17.5l5-5 3.5 3 8.5-8.5"/><path d="M3.5 7.5h17" stroke-dasharray="2.4 2.4"/>',
  pool2: '<circle cx="8.5" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/>',
  stream: '<path d="M3 7.5c3 0 3 3 6 3s3-3 6-3 3 3 6 3M3 14.5c3 0 3 3 6 3s3-3 6-3 3 3 6 3"/>',
  stake: '<ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5M5 11.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5"/>',
  raffle: '<path d="M4 8a2 2 0 002-2h12a2 2 0 002 2v2.5a1.5 1.5 0 000 3V16a2 2 0 00-2 2H6a2 2 0 00-2-2v-2.5a1.5 1.5 0 000-3z"/><path d="M14 6v12" stroke-dasharray="1.8 1.8"/>',
  band: '<path d="M3 7h18M3 17h18"/><path d="M3 13l4-3 4 2.5 4-4 6 4.5"/>',
  circuit: '<path d="M3 12h5l2-4 4 8 2-4h5"/><circle cx="12" cy="12" r="9.5"/>',
  dynamic: '<path d="M4 18c4 0 4-12 8-12s4 12 8 12"/><path d="M4 21h16"/>',
  directional: '<path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4"/>',
  hook: '<path d="M13 2.5v11.2a4.2 4.2 0 11-8.4 0v-1.4l2.6 2"/><circle cx="13" cy="2.8" r="1.3"/>',
  code: '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
  grant: '<path d="M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.2l5.4-.8z"/>',
  review: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3l5.2 5.2M7.8 10.6l2 2 3.6-3.8"/>',
  tools: '<path d="M14.5 5.5a4 4 0 00-5.3 5.3l-5.7 5.7 2.8 2.8 5.7-5.7a4 4 0 005.3-5.3l-2.4 2.4-2.8-.6-.6-2.8z"/>',
  module: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><path d="M17 13.5v7M13.5 17h7"/>',
  shield: '<path d="M12 2.8l7.5 3v5.6c0 4.6-3.1 8.4-7.5 9.8-4.4-1.4-7.5-5.2-7.5-9.8V5.8z"/><path d="M8.6 12.1l2.3 2.3 4.6-4.8"/>',
  doc: '<path d="M6 2.5h8l4 4v15H6z"/><path d="M14 2.5v4h4M9 12h6M9 16h6"/>',
};
const NS = 'http://www.w3.org/2000/svg';
let sprite = null;
export function ensureGlyphs() { ensure(); }
function ensure() {
  if (sprite || document.getElementById('hl-glyphs')) return;
  sprite = document.createElementNS(NS, 'svg');
  sprite.id = 'hl-glyphs'; sprite.setAttribute('class', 'qa-sprite'); sprite.setAttribute('aria-hidden', 'true');
  sprite.innerHTML = Object.entries(G).map(([k, v]) => `<symbol id="hl-g-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`).join('');
  document.body.prepend(sprite);
}
export const hasGlyph = (id) => id in G;
/** glyph('antiSnipe') returns an inline SVG that uses the sprite. */
export function glyph(id, cls = 'hl-g') {
  ensure();
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); s.setAttribute('viewBox', '0 0 24 24');
  const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#hl-g-' + (id in G ? id : 'hook')); s.append(u);
  return s;
}
/** Fill every [data-hl-glyph] placeholder in static HTML. */
export function fillGlyphs(root = document) {
  for (const el of root.querySelectorAll('[data-hl-glyph]')) if (!el.firstElementChild) el.append(glyph(el.dataset.hlGlyph));
}
