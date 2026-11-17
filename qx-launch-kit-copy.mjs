// Presentation only. Full rules remain the canonical card.what/card.why/block catalog.
// No preset, fee, duration, encoding or readiness value is supplied by this module.
const TRADEOFFS=Object.freeze({
 'locked-pool':'Locked pool + opening guards; add a buy wall after launch.',
 'auto-range':'Reinvest LP fees around the price; adds range setup.',
 'bundle-shield':'Longer opening protection; shared buy caps.',
 plain:'No extra token rules; trading opens immediately.',
 fair:'Opening protection; temporary caps and cooldown.',
 'fair-slow':'Longer protected start; temporary caps and cooldown.',
 hours:'Session and volatility fees; trading costs vary.',
 burn:'Burns and buybacks; adds trade charges.',
 community:'Rewards longer holds; early exits pay more.',
 arena:'Buyer prize pots; adds launch taxes.',
 stakers:'Funds stakers and buybacks; adds a trade tax.',
 'arb-burns':'Uses cross-pool price gaps to burn tokens.',
 'sale-first':'Raise funds before trading; the sale must meet its minimum.'
});
export const kitTradeoff=card=>TRADEOFFS[card?.id]||String(card?.what||'');
