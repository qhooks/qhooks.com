// Launchpad bonding curves the terminal trades (curves, 2026-11-12). Plain data, no imports, no network: the browser,
// the worker (server/curve-market.mjs) and the Node tests all read this file.
//
// A token launched on one of these trades on its own bonding curve first, then "graduates" into a normal pool. While it is
// on the curve, DexScreener and GeckoTerminal list only third-party pools (AEON's: a 56.1%-fee v4 pool holding $4.56), so
// the terminal reads the launchpad itself: where the token trades, how far along the curve is, its price and its trades.
//
// Pons V2 (Robinhood Chain), from the protocol's own integration docs (docs.ponsfamily.com/v2, read 2026-11-12) and checked
// on-chain the same day (getLaunchedToken(AEON).curve = 0xe364…8875, BULW 0x44ec…14cd, ROOQ graduated to v4 pool 0x921f…db2):
//  - factory.getLaunchedToken(token) → the launch record; phase 0 curve, 1 swept (graduating), 2 pool, 3 rescued.
//  - curve.buy(quoteIn, minTokensOut, recipient) payable / curve.sell(tokensIn, minQuoteOut, recipient). Native-quote buys
//    send quoteIn as value. A buy past the curve's last token is clamped and the rest refunded to msg.sender.
//  - graduated pool: Uniswap v4, currencies (token, pairToken) sorted, fee 0, the record's tickSpacing, the Pons hook.
//  - The public Robinhood RPC serves eth_getLogs for one named address across up to 10,000,000 blocks.
// allowanceHolder: 0x's AllowanceHolder on that chain. QFeeRouter.swapVia only hands a trade to it, and its exec() forwards
// the call (with the value) to any non-token contract: that is how a curve buy goes through our fee router unchanged.
export const ALLOWANCE_HOLDER = Object.freeze({'4663': '0x0000000000001ff3684f28c67538d4d072c22734'});

export const CURVE_VENUES = Object.freeze({
  '4663': Object.freeze([Object.freeze({
    id: 'pons-v2', name: 'Pons', kind: 'pons-v2',
    factory: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
    hook: '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044',
    stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',
    multicall: '0xca11bde05977b3631167028862be2a173976ca11',
    // eth_getLogs span the chain's public RPC accepts for one named address (it refuses 10,000,001).
    logSpan: 9990000,
    // Buys go straight to the curve (through QFeeRouter → AllowanceHolder.exec). Sells go through 0x, whose Robinhood
    // routing lists the Pons V2 curves as a source ("Pons_V2_1"); a sell quote from any other source is refused.
    zeroExSource: /^pons/i,
  })]),
});

export const curveVenuesFor = chainId => CURVE_VENUES[String(chainId)] || [];
export const hasCurveVenue = chainId => curveVenuesFor(chainId).length > 0;
