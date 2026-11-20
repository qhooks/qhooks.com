/* pf-data.js: the Portfolio's one data adapter. Written by Claude.
   Fixture mode: stable seeded numbers built on the same tokens Discover shows (window.QHView.tokens()).
   Live mode: when window.QHLive has a connected or watched wallet, rewards come from Rewards.earned();
   positions and wallets stay on this adapter until live-data exposes parsed shapes for them. */
window.PfData = (function () {
  "use strict";
  var V = window.QHView, memo = null;
  var BUCKETS = [
    { l: ">500%", lo: 500, hi: Infinity, c: "var(--up)" },
    { l: "200-500%", lo: 200, hi: 500, c: "rgba(76,195,138,.7)" },
    { l: "0-200%", lo: 0, hi: 200, c: "rgba(76,195,138,.4)" },
    { l: "0 to -50%", lo: -50, hi: 0, c: "rgba(242,105,92,.5)" },
    { l: "<-50%", lo: -Infinity, hi: -50, c: "var(--dn)" }
  ];

  function hex(rand, n) { var s = ""; for (var i = 0; i < n; i++) s += "0123456789abcdef".charAt(Math.floor(rand() * 16)); return s; }
  function b58(rand, n) { var a = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", s = ""; for (var i = 0; i < n; i++) s += a.charAt(Math.floor(rand() * a.length)); return s; }
  function dayKey(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }

  /* Realized PnL for one calendar day (0 when no trades closed that day; future days are null). */
  function daily(d) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    if (d > today) return null;
    var r = V.rng(V.hash("day" + dayKey(d)));
    if (r() < 0.22) return 0;
    var size = Math.pow(10, 1 + r() * 2.6);
    return (r() < 0.58 ? 1 : -1) * size;
  }
  function series(days) {
    var out = [], d = new Date(); d.setHours(0, 0, 0, 0);
    for (var i = days - 1; i >= 0; i--) { var x = new Date(d); x.setDate(d.getDate() - i); out.push({ d: x, v: daily(x) || 0 }); }
    return out;
  }

  function build() {
    var rand = V.rng(4663), rows = V.tokens().filter(function (r) { return V.ok(r.mcap); });
    var picks = rows.slice(0, 7);
    var q = V.row({ symbol: "QHOOKS", name: "QHooks", chain: "Robinhood", address: "0xqhooks", mcap: 2.4e6, volume: 3.1e5, candles: [] }, true);
    q.href = "#/rewards";
    picks.unshift(q);
    var positions = picks.map(function (r, i) {
      var bought = Math.round(80 + rand() * 2400), sold = i % 3 === 0 ? Math.round(bought * rand() * 0.8) : 0;
      var mult = i === 0 ? 1.42 : Math.pow(10, rand() * 1.4 - 0.6);
      var remaining = Math.max(0, (bought - sold) * mult), pnl = remaining + sold - bought;
      return { r: r, sym: r.sym, chain: r.chain, href: r.href, native: r.native, bought: bought, sold: sold, remaining: remaining,
        qty: V.ok(r.price) && r.price > 0 ? remaining / r.price : remaining / 0.012, pnl: pnl, pnlPct: (pnl / bought) * 100,
        heldSec: Math.round(3600 + rand() * 40 * 86400), pricing: i === 5 };
    });
    var history = [];
    for (var h = 0; h < 34; h++) {
      var src = rows[(h * 7 + 3) % Math.max(1, rows.length)] || q, p = Math.pow(rand(), 1.6) * 900 - 80;
      if (rand() < 0.35) p = -rand() * 95;
      var cost = Math.round(50 + rand() * 1500);
      history.push({ r: src, sym: src.sym, chain: src.chain, href: src.href, pnlPct: p, pnl: (cost * p) / 100, cost: cost, closed: Date.now() - Math.round(rand() * 30 * 86400000) });
    }
    history.sort(function (a, b) { return b.closed - a.closed; });
    var activity = [];
    for (var a = 0; a < 24; a++) {
      var t = picks[Math.floor(rand() * picks.length)];
      activity.push({ r: t, side: rand() < 0.6 ? "buy" : "sell", usd: Math.round(20 + rand() * 900), mcap: t.mcap, time: Date.now() - Math.round(a * (600000 + rand() * 4000000)) });
    }
    var wallets = [
      { family: "SOL", name: "Main", addr: b58(rand, 44), native: 12.4, nativeSym: "SOL", px: 152, vol: 148400, tokens: 31, stable: 220.5 },
      { family: "SOL", name: "Snipes", addr: b58(rand, 44), native: 3.11, nativeSym: "SOL", px: 152, vol: 22100, tokens: 12, stable: 0 },
      { family: "SOL", name: "Cold", addr: b58(rand, 44), native: 40.02, nativeSym: "SOL", px: 152, vol: 0, tokens: 2, stable: 1500 },
      { family: "EVM", name: "Main", addr: "0x" + hex(rand, 40), native: 1.84, nativeSym: "ETH", px: 2840, vol: 61800, tokens: 18, stable: 410 },
      { family: "EVM", name: "Robinhood", addr: "0x" + hex(rand, 40), native: 0.42, nativeSym: "ETH", px: 2840, vol: 9300, tokens: 7, stable: 1250 }
    ];
    var tradeable = 0; wallets.forEach(function (w) { w.usd = w.native * w.px + w.stable; tradeable += w.usd; });
    var held = 0, unreal = 0; positions.forEach(function (p) { held += p.remaining; unreal += p.remaining - (p.bought - p.sold); });
    return { positions: positions, history: history, activity: activity, wallets: wallets, tradeable: tradeable, held: held, unreal: unreal,
      rewards: { cash: 184.32, ref: 61.9, claim: 97.4, live: false }, buys: 412, sells: 287 };
  }
  function get() { if (!memo) memo = build(); return memo; }

  function buckets(list) {
    var out = BUCKETS.map(function (b) { return { l: b.l, c: b.c, n: 0 }; });
    list.forEach(function (x) { for (var i = 0; i < BUCKETS.length; i++) if (x.pnlPct > BUCKETS[i].lo && x.pnlPct <= BUCKETS[i].hi || (i === 2 && x.pnlPct === 0)) { out[i].n++; return; } });
    return out;
  }
  /* Real rewards when a wallet is known; the fixture values stay on screen until they arrive (v1.1 #12). */
  function liveRewards(cb) {
    var L = window.QHLive, w = L && L.wallet ? L.wallet() : null;
    if (!w || !window.Rewards || !window.Rewards.earned) return;
    window.Rewards.earned(w).then(function (s) { if (s) cb({ cash: s.cash, ref: s.ref, claim: s.claim, live: true }); }).catch(function () {});
  }
  return { get: get, daily: daily, series: series, buckets: buckets, liveRewards: liveRewards };
})();
