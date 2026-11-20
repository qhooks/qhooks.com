/* live-norm.js: turns live qhooks.com answers into the token shape the screens already use
   (symbol, name, address, ageSec, price, mcap, liquidity, volume, holders, top10, qProof, candles, trades ...).
   Unknown numbers stay null so every screen shows an em dash, never a made-up value. Written by Claude.
   Server-filled fields (eco-fill): feed rows carry qproof {level,label,checkedAt} from stored reports, holders (our index
   or the stored report), feeTierPct and fees24hUsd (24h volume x the pool's LP fee tier); each is null when unknown. */
(function () {
  "use strict";
  var CHAINS = {
    "4663": { name: "Robinhood", key: "robinhood", native: "ETH" },
    "8453": { name: "Base", key: "base", native: "ETH" },
    "solana": { name: "Solana", key: "solana", native: "SOL" },
    "56": { name: "BNB", key: "bnb", native: "BNB" },
    "1": { name: "Ethereum", key: "ethereum", native: "ETH" },
    "42161": { name: "Arbitrum", key: "arbitrum", native: "ETH" },
    "99901": { name: "Elysium", key: "elysium", native: "HYPE" },
    "143": { name: "Monad", key: "monad", native: "MON" }
  };
  var BY_NAME = {};
  Object.keys(CHAINS).forEach(function (id) { BY_NAME[CHAINS[id].name.toLowerCase()] = id; });

  function num(v) { if (v == null || v === "") return null; var x = Number(v); return isFinite(x) ? x : null; }
  function addrKey(chainId, a) { a = String(a || ""); return String(chainId) === "solana" ? a : a.toLowerCase(); }
  function key(chainId, a) { return String(chainId) + ":" + addrKey(chainId, a); }
  function chain(id) { return CHAINS[String(id)] || { name: String(id || ""), key: String(id || ""), native: "ETH" }; }
  function href(chainId, a) { return "#/token/" + encodeURIComponent(String(chainId)) + "/" + encodeURIComponent(addrKey(chainId, a)); }
  function img(u) { if (!u || typeof u !== "string" || u.indexOf("data:") === 0 && u.length > 200000) return null; return u.charAt(0) === "/" ? window.QH_API + u : u; }
  function ageFrom(ms) { ms = num(ms); if (!ms) return null; if (ms < 1e12) ms *= 1000; return Math.max(0, (Date.now() - ms) / 1000); }
  function pct(f) { f = num(f); return f == null ? null : f * 100; }

  function verdict(level) {
    level = String(level || "").toLowerCase();
    if (level === "clear" || level === "safe" || level === "pass") return "Clear";
    if (level === "watch" || level === "caution" || level === "warn") return "Watch";
    if (level === "danger" || level === "fail" || level === "high") return "Danger";
    if (level === "incomplete" || level === "partial") return "Partial";
    return "Not checked";
  }

  /* Stored QProof verdict sent with a feed row: {level, label, checkedAt} or null (never checked). */
  function stored(o, q) {
    if (!q || !q.level) return;
    o.qProof = verdict(q.level); o.qProofLabel = q.label || null; o.qProofAt = Date.parse(q.checkedAt || "") || null;
  }

  function base(chainId, address, kind) {
    var c = chain(chainId);
    return {
      id: key(chainId, address), key: key(chainId, address), live: true, kind: kind, chainId: String(chainId), chain: c.name,
      native: c.native, address: addrKey(chainId, address), href: href(chainId, address),
      symbol: "", name: "", logo: null, ageSec: null, price: null, mcap: null, liquidity: null, volume: null,
      change24: null, holders: null, top10: null, dev: null, sniper: null, insider: null, bundler: null,
      buys: null, sells: null, qProof: "Not checked", qProofAt: null, fees: null, feeTier: null, badge: "", stage: null, progress: null,
      candles: [], trades: [], observedAt: 0
    };
  }

  /* /api/terminal/market/feed row */
  function feedRow(r) {
    var t = r.token || {}, lc = r.lifecycle || {}, tx = (r.txns || {}).h24 || {};
    var o = base(r.chainId, t.address, "market");
    o.symbol = t.symbol || ""; o.name = t.name || ""; o.logo = img(t.logo || t.logoURI); o.pool = r.pool || null;
    o.ageSec = ageFrom(r.createdAt); o.price = num(r.priceUsd); o.mcap = num(r.marketCapUsd) || num(r.fdvUsd);
    o.liquidity = num(r.liquidityUsd); o.volume = num((r.volumeUsd || {}).h24); o.change24 = pct((r.change || {}).h24);
    o.buys = num(tx.buys); o.sells = num(tx.sells); o.stage = lc.stage || null; o.progress = pct(lc.progress);
    if (r.safety && (r.safety.level || r.safety.verdict)) o.qProof = verdict(r.safety.level || r.safety.verdict);
    stored(o, r.qproof);
    o.holders = num(r.holders); o.fees = num(r.fees24hUsd); o.feeTier = num(r.feeTierPct);
    o.observedAt = num(r.priceAt) || num(r.observedAt) || 0;
    if (o.stage === "bonding" && o.progress != null) o.badge = "";
    return o;
  }

  /* /api/terminal/feed market (QHooks launches) */
  function launch(m) {
    var s = m.summary || {}, o = base(m.chainId, m.token, "qhooks");
    o.controller = String(m.controller || m.token || "").toLowerCase();
    o.symbol = m.symbol || ""; o.name = m.name || ""; o.logo = img(m.logo || m.logoURI || m.profileImage);
    o.ageSec = ageFrom(m.launchedAt || m.listedAt); o.price = num(s.priceUsd); o.mcap = num(s.mcapUsd);
    o.volume = num(s.volume24Usd); o.change24 = pct(s.change24); o.holders = num(s.holders); o.top10 = pct(s.top10);
    o.buys = num(s.buys24); o.sells = num(s.sells24); o.observedAt = num(s.priceAt) || 0;
    stored(o, m.qproof);
    var graduated = (m.pools || []).indexOf("graduated") >= 0 || m.bonded === true;
    o.stage = graduated ? "migrated" : "bonding";
    o.progress = m.progressBps != null ? num(m.progressBps) / 100 : null;
    o.badge = "";
    return o;
  }

  /* /api/terminal/market/<chain>/<controller> (QHooks pool index): header, trades, holders, traders */
  function market(b, prev) {
    var m = b.meta || {}, s = b.summary || {}, o = prev || launch({ chainId: m.chainId, token: m.token, controller: m.controller, symbol: m.symbol, name: m.name, logo: m.logo || m.logoURI, launchedAt: m.launchedAt, summary: s, pools: [] });
    if (!prev) { o.stage = null; o.progress = null; }
    var trades = (b.trades || []).map(function (t) {
      return { time: (num(t.ts) || 0) * 1000, type: t.buy ? "buy" : "sell", price: num(t.priceUsd), amount: num(t.token), usd: num(t.valueUsd), trader: t.trader, tx: t.tx, id: t.id || t.tx };
    });
    var last = trades.length ? trades[0].price : null;
    o.symbol = m.symbol || o.symbol; o.name = m.name || o.name; o.logo = img(m.logo || m.logoURI) || o.logo;
    o.price = num(s.priceUsd) || last || o.price;
    o.supply = num(s.supply); o.mcap = num(s.mcapUsd) || (o.price && o.supply ? o.price * o.supply : o.mcap);
    o.volume = num(s.volume24Usd); o.change24 = s.change24 != null ? pct(s.change24) : o.change24;
    o.holders = num(s.holders); o.top10 = pct(s.top10); o.buys = num(s.buys24); o.sells = num(s.sells24);
    o.burned = num(s.burned); o.locked = num(s.locked); o.quoteSymbol = m.quoteSymbol || null;
    o.trades = trades;
    o.holderRows = (b.holders || []).map(function (h) {
      return { wallet: h.holder, amount: num(h.units), share: o.supply ? num(h.units) / o.supply * 100 : null, label: h.label || null };
    });
    o.traderRows = (b.traders || []).map(function (t) {
      return { wallet: t.trader, bought: num(t.bought), sold: num(t.sold), spent: num(t.spent), received: num(t.received), trades: num(t.n), last: num(t.last) };
    });
    o.observedAt = num(b.observedAt) || o.observedAt;
    return o;
  }

  /* /api/terminal/x/token/<chain>/<addr> (outside tokens) */
  function outside(b, prev) {
    var o = prev || base(b.chainId, b.address, "market");
    var pool = (b.pools || [])[0] || {};
    o.symbol = b.symbol || o.symbol; o.name = b.name || o.name; o.logo = img(b.logo || b.logoURI) || o.logo;
    o.price = num(b.priceUsd) || o.price; o.mcap = num(b.mcapUsd) || num(b.fdvUsd) || o.mcap;
    var pl = 0; (b.pools || []).forEach(function (p) { pl += num(p.liquidityUsd) || 0; });
    o.liquidity = num(b.liquidityUsd) || pl || o.liquidity; o.volume = num(b.volume24Usd) || o.volume;
    o.change24 = b.change24 != null ? pct(b.change24) : o.change24;
    o.buys = num(b.buys24); o.sells = num(b.sells24); o.pool = pool.address || o.pool; o.quoteSymbol = pool.quoteSymbol || null;
    o.links = b.links || null; o.ageSec = ageFrom(b.createdAt) || o.ageSec;
    o.observedAt = num(b.priceAt) || o.observedAt;
    return o;
  }
  function outsideTrades(list) {
    return (list || []).map(function (t) {
      return { time: num(t.ts) > 1e12 ? num(t.ts) : (num(t.ts) || 0) * 1000, type: t.side === "sell" ? "sell" : "buy", price: num(t.priceUsd), amount: num(t.amountToken), usd: num(t.valueUsd), trader: t.wallet, tx: t.tx, id: t.tx };
    });
  }
  /* Chart bars from the trade tape when no candle feed exists for a pool. */
  function barsFromTrades(trades, sec) {
    var map = {}, out = [];
    trades.slice().reverse().forEach(function (t) {
      if (!(t.price > 0) || !t.time) return;
      var k = Math.floor(t.time / 1000 / sec) * sec, b = map[k];
      if (!b) { b = map[k] = { time: k * 1000, open: t.price, high: t.price, low: t.price, close: t.price, volume: 0 }; out.push(b); }
      b.high = Math.max(b.high, t.price); b.low = Math.min(b.low, t.price); b.close = t.price; b.volume += t.usd || 0;
    });
    return out.sort(function (a, b) { return a.time - b.time; });
  }
  function bars(list) {
    return (list || []).map(function (c) {
      var t = num(c.time) || 0;
      return { time: t < 1e12 ? t * 1000 : t, open: num(c.open), high: num(c.high), low: num(c.low), close: num(c.close), volume: num(c.volume) };
    }).filter(function (c) { return c.open > 0 && c.close > 0 && c.high > 0 && c.low > 0; });
  }
  /* Search hit (/api/terminal/x/search) */
  function hit(r) {
    var o = base(r.chainId, r.address, "market");
    o.symbol = r.symbol || ""; o.name = r.name || ""; o.logo = img(r.logo || r.logoURI);
    o.price = num(r.priceUsd); o.liquidity = num(r.liquidityUsd); o.volume = num(r.volume24Usd); o.change24 = pct(r.change24);
    return o;
  }

  var EXPLORER = { "4663": "https://robinhoodchain.blockscout.com", "8453": "https://basescan.org", "1": "https://etherscan.io", "42161": "https://arbiscan.io", "56": "https://bscscan.com", "solana": "https://solscan.io" };
  function txUrl(chainId, tx) { var e = EXPLORER[String(chainId)]; return e && tx ? e + "/tx/" + tx : null; }
  /* /api/portfolio/<family>/<w> -> priced holdings, biggest first */
  function holdings(body) {
    var out = [];
    (body.chains || []).forEach(function (c) {
      var nat = c.native || {}, cn = chain(c.chainId).name;
      if (num(nat.valueUsd) >= 0.01) out.push({ chainId: String(c.chainId), chain: cn, symbol: nat.symbol, name: nat.symbol, amount: num(nat.balance) / 1e18, value: num(nat.valueUsd), price: num(nat.priceUsd), change: null, pnl: null, native: true });
      (c.tokens || []).forEach(function (t) {
        if (t.spam || !(num(t.valueUsd) >= 0.01)) return;
        var q = t.qhooks || null, cost = t.cost || {};
        out.push({ chainId: String(c.chainId), chain: cn, symbol: t.symbol, name: t.displayName || t.name, address: t.address, amount: num(t.units), value: num(t.valueUsd),
          price: num(t.priceUsd), change: num(t.change24) != null ? num(t.change24) * 100 : null, pnl: num(cost.pnlUsd), cost: cost.spentQuote != null ? { spent: num(cost.spentQuote), quote: cost.quoteSymbol || "" } : null,
          logo: img(q && (q.logo || q.logoURI)), href: href(c.chainId, (q && q.controller) || t.address), qhooks: !!q });
      });
    });
    return out.sort(function (a, b) { return b.value - a.value; });
  }

  window.QHNorm = {
    CHAINS: CHAINS, BY_NAME: BY_NAME, chain: chain, key: key, addrKey: addrKey, href: href, img: img, num: num,
    verdict: verdict, feedRow: feedRow, launch: launch, market: market, outside: outside, outsideTrades: outsideTrades,
    barsFromTrades: barsFromTrades, bars: bars, hit: hit, holdings: holdings, txUrl: txUrl
  };
})();
