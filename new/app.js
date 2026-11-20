/* js/lazy-img.js */
/* lazy-img.js: token images load when their row is about to be seen, not all at once. Written by Fable (speed).
   A row's <img data-src> gets its src when it comes within 300px of view. Measured before this: 25 to 50 token
   images per Pulse load, 3 to 6.6 MB, most of them far below the fold. */
(function () {
  "use strict";
  if (!("IntersectionObserver" in window)) { window.QHLazy = { watch: function (root) { (root || document).querySelectorAll("img[data-src]").forEach(function (i) { i.src = i.getAttribute("data-src"); i.removeAttribute("data-src"); }); } }; return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var i = e.target; io.unobserve(i);
      var s = i.getAttribute("data-src"); if (s) { i.src = s; i.removeAttribute("data-src"); }
    });
  }, { rootMargin: "300px 0px" });
  function watch(root) { (root || document).querySelectorAll("img[data-src]:not([data-lz])").forEach(function (i) { i.setAttribute("data-lz", "1"); io.observe(i); }); }
  var pending = false;
  new MutationObserver(function () { if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; watch(); }); } })
    .observe(document.documentElement, { childList: true, subtree: true });
  window.QHLazy = { watch: watch };
})();
;
/* js/live-api.js */
/* live-api.js: transport + formatting for live qhooks.com reads. Written by Claude.
   - window.QH_API is the API origin ('' = same origin: qhooks.com after cutover, or dev-server.mjs locally).
   - get(): ETag/304 aware JSON read with a 12 s timeout; never throws, returns {ok, status, body, at, observedAt}.
   - poll(): 10 s while visible, backs off to 30 s while answers repeat, paused while the tab is hidden,
     stops by itself when its element leaves the page.
   - F: one formatter set; anything invalid renders as an em dash. */
(function () {
  "use strict";
  if (typeof window.QH_API !== "string") window.QH_API = "";
  var DASH = "—", memo = {}, stat = { ms: 0, okAt: 0, failAt: 0 };

  function now() { return Date.now(); }
  function get(path, opts) {
    opts = opts || {};
    var url = window.QH_API + path, prev = memo[url], ctl = new AbortController();
    /* A read started by early.js before this file loaded: use it once instead of asking again. (Fable, speed) */
    var early = !opts.method && window.__QH_EARLY && window.__QH_EARLY[url];
    if (early) {
      delete window.__QH_EARLY[url];
      return early.then(function (e) {
        if (!e || !e.ok || e.body == null) return get(path, opts);
        stat.ms = e.ms || stat.ms; stat.okAt = now();
        var res = { ok: true, status: e.status, body: e.body, at: now(), observedAt: e.obs || Number(e.body.observedAt) || 0, same: false };
        memo[url] = { etag: e.etag, body: e.body, observedAt: res.observedAt };
        return res;
      });
    }
    var timer = setTimeout(function () { ctl.abort(); }, opts.timeout || 12000);
    var headers = { accept: "application/json" };
    if (prev && prev.etag && !opts.method) headers["if-none-match"] = prev.etag;
    var init = { method: opts.method || "GET", headers: headers, cache: "no-store", signal: ctl.signal };
    if (opts.body) { init.body = JSON.stringify(opts.body); headers["content-type"] = "application/json"; }
    var t0 = now();
    return fetch(url, init).then(function (r) {
      /* Footer status bar reads these: time of the last good answer and how long it took. (Fable) */
      if (r.ok || r.status === 304) { stat.ms = now() - t0; stat.okAt = now(); } else stat.failAt = now();
      var obs = Number(r.headers.get("x-qhooks-observed-at")) || 0;
      if (r.status === 304 && prev) return { ok: true, status: 304, body: prev.body, at: now(), observedAt: obs || prev.observedAt, same: true };
      return r.json().catch(function () { return null; }).then(function (b) {
        var res = { ok: r.ok && b != null, status: r.status, body: b, at: now(), observedAt: obs || (b && Number(b.observedAt)) || 0 };
        if (res.ok && !opts.method) {
          var sig = r.headers.get("etag") || "";
          res.same = !!prev && (sig ? prev.etag === sig : false);
          memo[url] = { etag: sig, body: b, observedAt: res.observedAt };
        }
        return res;
      });
    }).catch(function () {
      stat.failAt = now();
      return { ok: false, status: 0, body: null, at: now(), observedAt: 0 };
    }).then(function (res) { clearTimeout(timer); return res; });
  }
  function post(path, body) { return get(path, { method: "POST", body: body, timeout: 20000 }); }

  function poll(el, read, onData, opts) {
    opts = opts || {};
    var fast = opts.fast || 10000, slow = opts.slow || 30000, wait = fast, timer = null, stopped = false, busy = false, lastSig = null;
    var seen = false;
    function alive() { if (el && el.isConnected) seen = true; return !stopped && (!el || el.isConnected || !seen); }
    function tick() {
      timer = null;
      if (!alive()) { stop(); return; }
      if (document.hidden) return;
      if (busy) { schedule(); return; }
      busy = true;
      Promise.resolve(read()).then(function (res) {
        busy = false;
        if (!alive()) return;
        var sig = res && res.ok ? (res.same ? lastSig : (res.sig || (JSON.stringify(res.body) || "").length) + ":" + (res.observedAt || "")) : null;
        wait = sig !== null && sig === lastSig ? Math.min(slow, wait + 10000) : fast;
        lastSig = sig;
        try { onData(res); } catch (e) { if (window.console) console.warn("live view", e); }
        schedule();
      });
    }
    function schedule() { if (!stopped && !timer) timer = setTimeout(tick, wait); }
    function vis() { if (!document.hidden && alive() && !busy) { clearTimeout(timer); timer = null; tick(); } }
    function stop() { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", vis); }
    document.addEventListener("visibilitychange", vis);
    if (opts.wait) schedule(); else timer = setTimeout(tick, 0);
    return { stop: stop, now: function () { clearTimeout(timer); timer = null; wait = fast; tick(); } };
  }

  function ok(v) { return typeof v === "number" ? isFinite(v) : v != null && v !== "" && isFinite(Number(v)); }
  function n(v) { return ok(v) ? Number(v) : NaN; }
  function trim(s) { return s.indexOf(".") >= 0 ? s.replace(/0+$/, "").replace(/\.$/, "") : s; }
  var F = {
    DASH: DASH, ok: ok, n: n,
    usd: function (v) {
      v = n(v); if (!isFinite(v)) return DASH;
      var a = Math.abs(v), s = v < 0 ? "-$" : "$";
      if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
      if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
      if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e4 ? 1 : 2) + "K";
      if (a >= 1) return s + a.toFixed(2);
      if (a === 0) return "$0";
      return s + F.small(a);
    },
    small: function (a) {
      if (a >= 0.01) return trim(a.toFixed(4));
      var z = Math.floor(-Math.log10(a)), d = Math.min(z + 3, 14);
      return trim(a.toFixed(d));
    },
    price: function (v) { v = n(v); if (!isFinite(v) || v <= 0) return DASH; return v >= 1 ? "$" + v.toFixed(v >= 1000 ? 0 : 4).replace(/\.?0+$/, "") : "$" + F.small(v); },
    num: function (v) {
      v = n(v); if (!isFinite(v)) return DASH;
      var a = Math.abs(v);
      if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
      if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
      if (a >= 1e3) return (v / 1e3).toFixed(2) + "K";
      if (a >= 1 || a === 0) return trim(v.toFixed(2));
      return (v < 0 ? "-" : "") + F.small(a);
    },
    int: function (v) { v = n(v); return isFinite(v) ? Math.round(v).toLocaleString("en-US") : DASH; },
    pct: function (v, sign) { v = n(v); if (!isFinite(v)) return DASH; return (sign && v > 0 ? "+" : "") + v.toFixed(Math.abs(v) >= 100 ? 0 : 1) + "%"; },
    age: function (sec) {
      sec = n(sec); if (!isFinite(sec) || sec < 0) return DASH;
      if (sec < 60) return Math.floor(sec) + "s";
      if (sec < 3600) return Math.floor(sec / 60) + "m";
      if (sec < 86400) return Math.floor(sec / 3600) + "h";
      return Math.floor(sec / 86400) + "d";
    },
    short: function (a) { a = String(a || ""); return a.length > 12 ? a.slice(0, 4) + "…" + a.slice(-4) : a || DASH; },
    fresh: function (ms) {
      if (!ok(ms) || ms <= 0) return "Refreshing";
      var s = Math.max(0, Math.round((now() - ms) / 1000));
      return s < 30 ? "Live · " + s + "s ago" : "Refreshing";
    },
    esc: function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  };

  function status() { return { ms: stat.ms, okAt: stat.okAt, failAt: stat.failAt }; }
  window.QHApi = { get: get, post: post, poll: poll, status: status };
  window.QHFmt = F;
})();
;
/* js/live-norm.js */
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
    if (level === "incomplete" || level === "partial") return "Partly checked";
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
    o.progress = graduated ? 100 : m.progressBps != null ? num(m.progressBps) / 100 : null;
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
;
/* js/live-data.js */
/* live-data.js: the one data module for live qhooks.com reads (through window.QH_API) with a fixture fallback.
   Every read here is a route the live site already serves and caches; nothing new polls Alchemy-backed routes:
   - feeds (/api/terminal/market/feed, /api/terminal/feed) are colo-cached with ETag/304 (D4);
   - token pages read the QHooks pool index (/api/terminal/market) or the outside-token reader, only while open;
   - wallet, portfolio and rewards reads run once per visit or on Refresh, never on a timer.
   Quote and prepare calls return prices or unsigned transactions; the visitor's own wallet signs. Written by Claude. */
(function () {
  "use strict";
  var A = window.QHApi, N = window.QHNorm, reg = {}, nativeMemo = null;
  var QH_INDEX = { "4663": 1, "99901": 1, "8453": 1, "56": 1, "42161": 1, "1": 1 };
  var state = { mode: "starting", at: 0 };

  function remember(t) {
    var cur = reg[t.key];
    /* A QHooks launch owns its own kind and lifecycle: a market-feed row for the same token (stage "unknown", no progress)
       must not turn a graduated launch back into a curve row (QHOOKS sat in Final stretch at 92%, 2026-11-20). */
    var owned = cur && cur.kind === "qhooks" && t.kind !== "qhooks";
    if (cur && cur !== t) { Object.keys(t).forEach(function (k) { if (owned && (k === "kind" || k === "stage" || k === "progress")) return; if (t[k] != null && !(Array.isArray(t[k]) && !t[k].length && cur[k] && cur[k].length)) cur[k] = t[k]; }); return cur; }
    reg[t.key] = t; return t;
  }
  function find(chainOrAddr, addr) {
    if (addr) return reg[N.key(chainOrAddr, addr)] || null;
    var a = String(chainOrAddr || "").toLowerCase(), hitT = null;
    Object.keys(reg).forEach(function (k) { if (!hitT && reg[k].address.toLowerCase() === a) hitT = reg[k]; });
    return hitT;
  }
  function mark(ok) { state.mode = ok ? "live" : (state.mode === "live" ? "live" : "fixtures"); state.at = Date.now(); }
  function newest(list) { var m = 0; list.forEach(function (t) { if (t.observedAt > m) m = t.observedAt; }); return m; }

  function feed(tab, chainId) {
    var q = "/api/terminal/market/feed?tab=" + encodeURIComponent(tab) + "&chain=" + encodeURIComponent(chainId || "all") + "&window=24h";
    return A.get(q).then(function (r) {
      var rows = r.ok && r.body && Array.isArray(r.body.rows) ? r.body.rows : null;
      mark(!!rows);
      if (!rows) return { ok: false, tokens: [], status: r.status };
      var tokens = rows.map(N.feedRow).filter(function (t) { return t.symbol && t.address; }).map(remember);
      return { ok: true, tokens: tokens, observedAt: newest(tokens), same: r.same, refreshing: !!(r.body.refreshing || r.body.stale) };
    });
  }
  function launches() {
    return A.get("/api/terminal/feed?chain=all").then(function (r) {
      var list = r.ok && r.body && Array.isArray(r.body.markets) ? r.body.markets : null;
      if (!list) return { ok: false, tokens: [] };
      var tokens = list.filter(function (m) { return m.live !== false; }).map(N.launch).map(remember);
      return { ok: true, tokens: tokens, observedAt: newest(tokens), same: r.same };
    });
  }

  /* Token page: QHooks pool index first (launches made here), outside-token reader otherwise. */
  function token(chainId, addr) {
    chainId = String(chainId); var cur = find(chainId, addr), a = N.addrKey(chainId, addr);
    var tryIndex = QH_INDEX[chainId] && (!cur || cur.kind === "qhooks" || chainId === "4663" || chainId === "99901");
    var first = tryIndex ? A.get("/api/terminal/market/" + chainId + "/" + a + "?tf=60", { timeout: 20000 }) : Promise.resolve({ ok: false });
    return first.then(function (r) {
      if (r.ok && r.body && r.body.meta && String(r.body.meta.chainId) === chainId) {
        var t = remember(N.market(r.body, cur && cur.kind === "qhooks" ? cur : null));
        t.kind = "qhooks"; t.controller = String(r.body.meta.controller || a).toLowerCase();
        return { ok: true, token: t, same: r.same, observedAt: t.observedAt, sig: (t.trades[0] && t.trades[0].id) + ":" + t.price + ":" + t.holders };
      }
      return A.get("/api/terminal/x/token/" + chainId + "/" + a).then(function (h) {
        if (!h.ok || !h.body || !h.body.address) return { ok: false, token: cur, status: h.status };
        var t2 = remember(N.outside(h.body, cur && cur.kind !== "qhooks" ? cur : null));
        if (!t2.pool) return { ok: true, token: t2 };
        return A.get("/api/terminal/x/trades/" + chainId + "/" + t2.pool).then(function (tr) {
          if (tr.ok && Array.isArray(tr.body.trades)) t2.trades = N.outsideTrades(tr.body.trades);
          t2.tradesOk = !!(tr.ok && Array.isArray(tr.body.trades));
          if (!t2.price && t2.trades.length) t2.price = t2.trades[0].price;
          return { ok: true, token: t2, same: h.same && tr.same };
        });
      });
    });
  }
  function header(t) {
    return A.get("/api/terminal/x/token/" + t.chainId + "/" + t.address).then(function (h) {
      if (h.ok && h.body) {
        var pl = 0; (h.body.pools || []).forEach(function (p) { pl += N.num(p.liquidityUsd) || 0; });
        t.liquidity = N.num(h.body.liquidityUsd) || pl || t.liquidity; t.links = h.body.links || t.links;
      }
      return t;
    });
  }
  function candles(t, sec) {
    if (t.kind === "qhooks") {
      return A.get("/api/candles?chain=" + t.chainId + "&tf=" + sec + "&controller=" + (t.controller || t.address)).then(function (r) {
        var b = r.ok && r.body && Array.isArray(r.body.bars) ? N.bars(r.body.bars) : null;
        return b && b.length ? { ok: true, bars: b, unit: "USD" } : { ok: true, bars: N.barsFromTrades(t.trades, sec), fromTrades: true };
      });
    }
    if (!t.pool) return Promise.resolve({ ok: true, bars: N.barsFromTrades(t.trades, sec), fromTrades: true });
    return A.get("/api/terminal/x/candles/" + t.chainId + "/" + t.pool + "?tf=" + sec).then(function (r) {
      var b = r.ok && r.body && Array.isArray(r.body.candles) ? N.bars(r.body.candles) : null;
      return b && b.length ? { ok: true, bars: b } : { ok: true, bars: N.barsFromTrades(t.trades, sec), fromTrades: true };
    });
  }
  function holders(t) {
    if (t.kind === "qhooks") return Promise.resolve({ ok: !!(t.holderRows && t.holderRows.length), rows: t.holderRows || [], count: t.holders });
    return A.get("/api/terminal/market/holders/" + t.chainId + "/" + t.address).then(function (r) {
      var b = r.body || {};
      if (!r.ok || ["available", "partial"].indexOf(b.status) < 0) return { ok: false, rows: [], note: (b.coverage && b.coverage.description) || null };
      return { ok: true, count: N.num(b.holderCount), rows: (b.rows || []).map(function (h) { return { wallet: h.owner || h.account, amount: N.num(h.amount), share: N.num(h.share) != null ? N.num(h.share) * 100 : null, label: null }; }) };
    });
  }
  /* Stored QProof report only: /api/qproof/latest never runs a check. */
  function qproof(t) {
    return A.get("/api/qproof/latest?chain=" + N.chain(t.chainId).key + "&address=" + encodeURIComponent(t.address)).then(function (r) {
      var b = r.body || {}, rep = b.report;
      if (!r.ok || !rep) return { ok: r.ok, state: b.state || "unavailable" };
      var v = rep.verdict || {}, level = v.level || rep.level;
      t.qProof = N.verdict(level);
      return { ok: true, state: b.state, verdict: t.qProof, label: v.label || null, headline: v.headline || rep.headline || "", url: rep.url || null,
        checkedAt: Date.parse(b.checkedAt || rep.completedAt || "") || null, checks: (rep.checks || []).slice(0), numbers: b.keyNumbers || null };
    });
  }

  function family(w) { return /^0x[0-9a-fA-F]{40}$/.test(w) ? "evm" : "solana"; }
  function portfolio(w) { return A.get("/api/portfolio/" + family(w) + "/" + encodeURIComponent(w), { timeout: 25000 }); }
  function positions(w) { return A.get("/api/terminal/wallet/" + String(w).toLowerCase()); }
  function activity(w) { return A.get("/api/terminal/activity?w=" + encodeURIComponent(String(w).toLowerCase())); }
  /* Parsed shapes for Portfolio and wallet pages: one row per priced holding (spam and dust left out), newest
     QHooks trades. Both read once per call; callers decide when to read again. */
  /* One read per wallet per visit (Alchemy-backed): tab switches reuse it; Refresh passes fresh. */
  var seen = {};
  function holdings(w, fresh) {
    if (!fresh && seen[w]) return seen[w];
    return (seen[w] = portfolio(w).then(function (r) {
      var b = r.body || {};
      if (!r.ok || !Array.isArray(b.chains)) return { ok: false, rows: [], totals: null };
      return { ok: true, rows: N.holdings(b), totals: b.totals || null, at: N.num(b.at) || 0 };
    }).then(function (res) { if (!res.ok) delete seen[w]; return res; }));
  }
  function trades(w) {
    return activity(w).then(function (r) {
      var list = r.ok && r.body && Array.isArray(r.body.trades) ? r.body.trades : null;
      if (!list) return { ok: false, rows: [] };
      return { ok: true, rows: list.map(function (t) {
        return { chainId: String(t.chainId), chain: N.chain(t.chainId).name, symbol: t.symbol, href: N.href(t.chainId, t.controller), side: t.buy ? "buy" : "sell",
          time: (N.num(t.ts) || 0) * 1000, amount: N.num(t.token), paid: N.num(t.quote), quoteSymbol: t.quoteSymbol || "", tx: t.tx, txUrl: N.txUrl(t.chainId, t.tx) };
      }) };
    });
  }
  function rewards(w) { return A.get("/api/qhooks/rewards?wallet=" + encodeURIComponent(String(w).toLowerCase())); }
  /* QHOOKS holder tier on Robinhood Chain: wallet + staked + locked against the on-chain minimum (server-cached 60 s).
     {ok, total, wallet, staked, locked, threshold, holder (true/false/null), tier, rhHolder (what the RH router pays on)}. */
  function holderTier(w) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(w || ""))) return Promise.resolve({ ok: false });
    return A.get("/api/qhooks/holder-tier?wallet=" + String(w).toLowerCase()).then(function (r) {
      var b = r.body || {};
      if (!r.ok || !b.balances) return { ok: false, status: r.status };
      return { ok: true, total: N.num(b.balances.total), wallet: N.num(b.balances.wallet), staked: N.num(b.balances.staked), locked: N.num(b.balances.locked),
        threshold: N.num(b.threshold), holder: typeof b.holder === "boolean" ? b.holder : null, tier: b.tier || null,
        rhHolder: b.cashback ? !!b.cashback.robinhoodHolder : null, refreshing: !!b.refreshing };
    });
  }
  /* Saved wallet groups for the signed-in owner (the QHooks sign-in session shared with qhooks.com). */
  var SKEY = "qhooks:board-session:v1";
  function session() { try { var s = JSON.parse(localStorage.getItem(SKEY) || "null"); return s && s.token ? s : null; } catch (e) { return null; } }
  function groupsCall(method, body) {
    var s = session();
    if (!s) return Promise.resolve({ ok: false, needsSignIn: true, groups: [] });
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 12000);
    var init = { method: method, cache: "no-store", signal: ctl.signal, headers: { accept: "application/json", authorization: "Bearer " + s.token } };
    if (body) { init.body = JSON.stringify(body); init.headers["content-type"] = "application/json"; }
    return fetch(window.QH_API + "/api/wallets/groups", init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        return r.ok ? { ok: true, groups: b.groups || [], limits: b.limits || null, updatedAt: b.updatedAt || null } : { ok: false, needsSignIn: r.status === 401, status: r.status, error: b.error || null, groups: [] };
      });
    }).catch(function () { return { ok: false, groups: [] }; }).then(function (res) { clearTimeout(t); return res; });
  }
  var groups = { get: function () { return groupsCall("GET"); }, set: function (list) { return groupsCall("PUT", { groups: list }); } };
  function search(q) {
    return A.get("/api/terminal/x/search?q=" + encodeURIComponent(q)).then(function (r) {
      return r.ok && r.body && Array.isArray(r.body.results) ? { ok: true, tokens: r.body.results.map(N.hit).map(remember) } : { ok: false, tokens: [] };
    });
  }
  function natives() {
    if (nativeMemo && Date.now() - nativeMemo.at < 60000) return Promise.resolve(nativeMemo.prices);
    return A.get("/api/funding/native-prices?symbols=ETH,SOL,BNB,HYPE").then(function (r) {
      var p = r.ok && r.body && r.body.prices ? r.body.prices : {};
      nativeMemo = { at: Date.now(), prices: p }; return p;
    });
  }
  function quote(o) {
    var q = "chain=" + o.chain + "&token=" + o.token + "&side=" + o.side + "&amountIn=" + o.amountIn + (o.trader ? "&trader=" + o.trader : "");
    return A.get("/api/v1/agent/quote?" + q, { timeout: 15000 });
  }
  function prepareTrade(o) { return A.post("/api/v1/agent/prepare-trade", o); }
  function prepareLaunch(o) { return A.post("/api/v1/agent/prepare-launch", o); }

  /* The visitor's wallet: an injected wallet that is already connected, or an address they chose to watch. */
  function wallet() {
    var eth = window.ethereum, sel = eth && eth.selectedAddress;
    if (sel) return sel.toLowerCase();
    try { return localStorage.getItem("qh-watch") || null; } catch (e) { return null; }
  }
  function watch(w) { try { if (w) localStorage.setItem("qh-watch", w); else localStorage.removeItem("qh-watch"); } catch (e) {} }
  function connect() {
    var eth = window.ethereum;
    if (!eth || !eth.request) return Promise.resolve(null);
    return eth.request({ method: "eth_requestAccounts" }).then(function (a) { return a && a[0] ? a[0].toLowerCase() : null; }).catch(function () { return null; });
  }

  window.QHLive = {
    state: state, find: find, remember: remember, feed: feed, launches: launches, token: token, header: header,
    candles: candles, holders: holders, qproof: qproof, portfolio: portfolio, positions: positions, activity: activity,
    rewards: rewards, holderTier: holderTier, groups: groups, holdings: holdings, trades: trades, search: search, natives: natives, quote: quote, prepareTrade: prepareTrade,
    prepareLaunch: prepareLaunch, wallet: wallet, watch: watch, connect: connect, family: family,
    all: function () { return Object.keys(reg).map(function (k) { return reg[k]; }); }
  };
})();
;
/* js/live-social.js */
/* live-social.js: profile, community and perps reads added to window.QHLive. Written by Claude.
   Routes are the ones qhooks.com already serves (found in the live release tree):
   - /api/wallets/card/<w>?window=7d|30d|all  PnL, win rate, positions and recent trades on QHooks markets;
   - /api/wallets/activity?w=&tf=             the all-token wallet profile (tags, best and worst trades);
   - /api/community/activity                  published calls; /api/community/boards?kind=qhooks|token boards;
   - /api/community/token/<c>/<a> and /api/community/board/<c>/<controller>  posts on one board;
   - /api/wallets/leaderboard?window=7d       traders ranked by real PnL; /api/community/v2/callers caller ranks.
   Perps: Hyperliquid's public info endpoint (clearinghouseState), no key.
   Every read here runs once per visit (memo below) or when the visitor presses Refresh. No timers. */
(function () {
  "use strict";
  var L = window.QHLive, A = window.QHApi, N = window.QHNorm, memo = {};
  if (!L || !A) return;

  function once(key, fn, fresh) {
    if (!fresh && memo[key]) return memo[key];
    memo[key] = fn().then(function (r) { if (!r || (!r.ok && !r.final)) delete memo[key]; return r; });
    return memo[key];
  }
  function lc(w) { return /^0x/i.test(w) ? String(w).toLowerCase() : String(w); }

  function card(w, win, fresh) {
    return once("card:" + lc(w) + ":" + win, function () {
      return A.get("/api/wallets/card/" + encodeURIComponent(lc(w)) + "?window=" + win, { timeout: 20000 }).then(function (r) {
        var b = r.body || {};
        if (!r.ok || b.realizedUsd === undefined) return { ok: false };
        return { ok: true, win: win, realized: N.num(b.realizedUsd), unrealized: N.num(b.unrealizedUsd), pnl: N.num(b.pnlUsd),
          winRate: N.num(b.winRate), counted: N.num(b.positionsCounted) || 0, avgHold: N.num(b.avgHoldSec), partial: !!b.partial,
          positions: (b.positions || []).map(function (p) {
            return { chainId: String(p.chainId), chain: N.chain(p.chainId).name, symbol: p.symbol, href: N.href(p.chainId, p.controller),
              realized: N.num(p.realizedUsd), unrealized: N.num(p.unrealizedUsd), value: N.num(p.valueUsd), trades: N.num(p.trades) || 0, lastAt: (N.num(p.lastAt) || 0) * 1000 };
          }),
          recent: (b.recent || []).map(function (t) { return { time: (N.num(t.ts) || 0) * 1000, chainId: String(t.chainId) }; }) };
      });
    }, fresh);
  }
  function profile(w, fresh) {
    return once("prof:" + lc(w), function () {
      return A.get("/api/wallets/activity?w=" + encodeURIComponent(lc(w)) + "&tf=30d").then(function (r) {
        var b = r.body || {};
        return r.ok ? { ok: true, tags: b.tags || [], handle: b.handle || null, best: b.best || [], chains: b.chains || [] } : { ok: false };
      });
    }, fresh);
  }

  /* USD for an amount paid in a quote token: stablecoins at 1, natives at the site's native price. */
  var STABLE = { USDC: 1, USDT: 1, USDG: 1, DAI: 1, USD: 1, USDB: 1 };
  function usdOf(amount, sym) {
    sym = String(sym || "").toUpperCase().replace(/^W(?=ETH|BNB|HYPE|SOL|MON)/, "");
    if (STABLE[sym]) return Promise.resolve(amount);
    return L.natives().then(function (p) { var px = N.num(p && p[sym] && (p[sym].usd || p[sym].price || p[sym])); return px && amount != null ? amount * px : null; });
  }

  function calls(fresh) {
    return once("calls", function () {
      return A.get("/api/community/activity").then(function (r) {
        var b = r.body || {};
        if (!r.ok || !Array.isArray(b.calls)) return { ok: false, rows: [] };
        return { ok: true, at: r.at, rows: b.calls.map(function (c) {
          var bd = c.board || {}, addr = bd.address || bd.controller || "", ch = String(bd.chainId || "");
          var cl = c.call || {};
          /* entryPriceUsd / entryMcapUsd: recorded at call time (server eco-fill); null when not recorded. */
          return { id: c.id, wallet: c.author, kind: c.kind, note: c.text || "", at: N.num(c.createdAt) || 0, chainId: ch, address: addr,
            boardKind: bd.kind, href: N.href(ch, addr), entryPrice: N.num(cl.entryPriceUsd != null ? cl.entryPriceUsd : cl.price), entryMc: N.num(cl.entryMcapUsd),
            nowPrice: N.num(cl.nowPrice != null ? cl.nowPrice : cl.priceNow), tx: c.receipt && c.receipt.tx };
        }) };
      });
    }, fresh);
  }
  function boards(fresh) {
    return once("boards", function () {
      return Promise.all([A.get("/api/community/boards?kind=qhooks"), A.get("/api/community/boards?kind=token")]).then(function (rs) {
        var seen = {}, rows = [];
        rs.forEach(function (r) {
          (r.ok && r.body && r.body.boards || []).forEach(function (bd) {
            var a = bd.address || bd.controller, k = bd.chainId + ":" + a; if (!a || seen[k]) return; seen[k] = 1;
            rows.push({ chainId: String(bd.chainId), address: a, kind: bd.kind, symbol: bd.symbol || "", name: bd.name || "", logo: N.img(bd.logo),
              posts: N.num(bd.posts) || 0, replies: N.num(bd.replies) || 0, last: N.num(bd.lastPostAt) || 0, href: N.href(bd.chainId, a) });
          });
        });
        rows.sort(function (x, y) { return y.last - x.last; });
        return { ok: rs.some(function (r) { return r.ok; }), rows: rows };
      });
    }, fresh);
  }
  function leaders(win, fresh) {
    return once("lb:" + win, function () {
      return A.get("/api/wallets/leaderboard?window=" + win).then(function (r) {
        var b = r.body || {};
        if (!r.ok || !Array.isArray(b.rows)) return { ok: false, rows: [] };
        return { ok: true, scope: b.scope || "", rows: b.rows.map(function (x) {
          return { wallet: x.wallet, pnl: N.num(x.pnlUsd), realized: N.num(x.realizedUsd), winRate: N.num(x.winRate), trades: N.num(x.trades) || 0, volume: N.num(x.volumeUsd), tokens: N.num(x.tokens) || 0 };
        }) };
      });
    }, fresh);
  }
  /* A QHooks launch can have a launch board or a token board; try the expected one, then the other once.
     A 404 on both is remembered for the visit (no board yet), so re-renders never re-ask. */
  function board(chainId, addr, kind) {
    var paths = kind === "launch" ? ["/api/community/board/", "/api/community/token/"] : ["/api/community/token/"];
    function ask(i) {
      return A.get(paths[i] + encodeURIComponent(chainId) + "/" + encodeURIComponent(addr)).then(function (r) { return r.status === 404 && paths[i + 1] ? ask(i + 1) : r; });
    }
    return once("board:" + chainId + ":" + addr, function () {
      return ask(0).then(function (r) {
        var b = r.body || {};
        if (!r.ok || !Array.isArray(b.posts)) return { ok: false, final: r.status === 404, posts: [] };
        var m = b.board || {};
        return { ok: true, meta: { symbol: m.symbol || "", name: m.name || "", logo: N.img(m.logo) }, posts: b.posts.filter(function (p) { return !p.hidden; }).map(function (p) {
          return { id: p.id, wallet: p.author, kind: p.kind, text: p.text || "", at: N.num(p.createdAt) || 0, badges: p.badges || [],
            entryPrice: p.call ? N.num(p.call.entryPriceUsd != null ? p.call.entryPriceUsd : p.call.price) : null, entryMc: p.call ? N.num(p.call.entryMcapUsd) : null,
            nowPrice: p.call ? N.num(p.call.priceNow) : null };
        }) };
      });
    });
  }

  /* Hyperliquid perps for an EVM address (public endpoint, CORS open). */
  function perps(user, fresh) {
    return once("hl:" + lc(user), function () {
      return fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "clearinghouseState", user: lc(user) }) })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (b) {
          if (!b || !b.marginSummary) return { ok: false, rows: [] };
          var ms = b.marginSummary;
          return { ok: true, at: Date.now(), value: N.num(ms.accountValue), notional: N.num(ms.totalNtlPos), margin: N.num(ms.totalMarginUsed), withdrawable: N.num(b.withdrawable),
            rows: (b.assetPositions || []).map(function (x) {
              var p = x.position || {}, sz = N.num(p.szi);
              return { coin: p.coin, side: sz < 0 ? "Short" : "Long", size: Math.abs(sz || 0), entry: N.num(p.entryPx), value: N.num(p.positionValue), upnl: N.num(p.unrealizedPnl),
                roe: N.num(p.returnOnEquity), liq: N.num(p.liquidationPx), lev: p.leverage ? N.num(p.leverage.value) : null, funding: p.cumFunding ? N.num(p.cumFunding.sinceOpen) : null };
            }) };
        });
    }, fresh);
  }

  /* The connected wallet only (never a watched one): Sell buttons and other owner actions key off this. */
  function connected() { var e = window.ethereum; return e && e.selectedAddress ? String(e.selectedAddress).toLowerCase() : null; }

  L.card = card; L.profile = profile; L.usdOf = usdOf; L.calls = calls; L.boards = boards; L.leaders = leaders;
  L.board = board; L.perps = perps; L.connected = connected;
})();
;
/* js/live-boot.js */
/* live-boot.js: one shared reader for the market lists, so every screen (Pulse, Discover, Community, search)
   sees the same live rows through window.QHLive.all() and nobody polls the same route twice.
   Lists: trending (24h volume stands in while trending is empty), new, bonding, migrated, and QHooks launches.
   Runs only while a list screen is open (Pulse, Discover, Community, More), 10 s visible / 30 s when nothing
   changed, paused when the tab is hidden. All five routes are colo-cached with ETag/304 on qhooks.com.
   After each read it fires window event "qhlive" with detail {lists, observedAt, ok}. Written by Claude. */
(function () {
  "use strict";
  var L = window.QHLive, last = null, poller = null;
  var LIST_ROUTES = /^#\/(pulse|discover|community|more)?($|[/?])/;

  var IDS = { Robinhood: "4663", Base: "8453", Solana: "solana", BNB: "56", Ethereum: "1", Arbitrum: "42161", Elysium: "99901" };
  function chainId() { return IDS[window.QH_CHAIN || ""] || ""; }
  window.addEventListener("qh-chain", function () { if (poller) poller.now(); });
  function onList() { var h = location.hash || "#/pulse"; return LIST_ROUTES.test(h); }
  function read() {
    if (!onList() && last) return Promise.resolve({ ok: true, body: last, same: true });
    /* With a chain picked in the top bar, read that chain's own lists so its columns are full, not the slice
       of it that happens to sit in the all-chain lists. (Fable) */
    var c = chainId();
    return Promise.all([L.feed("trending", c), L.feed("new", c), L.feed("bonding", c), L.feed("migrated", c), L.launches()]).then(function (r) {
      var trend = r[0];
      var stand = trend.ok && !trend.tokens.length ? L.feed("volume", c) : Promise.resolve(null);
      return stand.then(function (v) {
        var lists = { trending: v && v.ok ? v.tokens : trend.tokens, trendingStandIn: !!(v && v.ok), newPairs: r[1].tokens, bonding: r[2].tokens, migrated: r[3].tokens, launches: r[4].tokens };
        var ok = r.some(function (x) { return x.ok; }), obs = 0;
        r.concat(v ? [v] : []).forEach(function (x) { if (x.observedAt > obs) obs = x.observedAt; });
        var same = r.every(function (x) { return x.same; });
        last = { lists: lists, observedAt: obs, ok: ok };
        return { ok: ok, body: last, observedAt: obs, same: same };
      });
    });
  }
  function emit(res) {
    if (!res || !res.body) return;
    try { window.dispatchEvent(new CustomEvent("qhlive", { detail: res.body })); } catch (e) {}
    if (L.all().length) window.QH_LIVE_TOKENS = L.all();
    /* Discover draws once from whatever rows exist; on a direct load that is the sample set, so swap it for
       the live rows the first time they arrive. */
    var src = document.querySelector(".dc-page .dc-src");
    if (src && window.Discover && L.all().length >= 8 && !/^Live/.test(src.textContent)) window.Discover.render(src.closest(".dc-page").parentNode);
  }
  function start() {
    if (poller) { poller.now(); return; }
    poller = window.QHApi.poll(null, read, emit);
  }
  function latest() { return last; }
  window.addEventListener("hashchange", function () { if (poller && onList()) poller.now(); });
  L.start = start; L.latest = latest;
  start();
})();
;
/* js/wallet-connect.js */
/* wallet-connect.js: one connect sheet and one connected identity for the whole app (contract 1.2.4, 1.3.2). Written by Claude.
   - EVM browser wallets: EIP-6963 announcements, window.ethereum as the fallback.
   - Email/Google wallet and any phone wallet (WalletConnect): the live Privy bundle (/privy/entry.js, mountPrivy), the same
     loader qhooks.com uses (public/wallet-login.mjs). It only loads same-origin, so it works once this app is served from
     qhooks.com; on localhost the sheet says so and links to qhooks.com.
   - Solana: Wallet Standard wallets (Phantom first), as live public/qx-solana.mjs does.
   - Remembered in localStorage "qh-wallet" (kind, wallet name, address; never keys). QHLive.wallet()/connect() read this,
     so the top bar, Portfolio and the trade panel all show the same identity. Connecting never signs or sends anything. */
(function () {
  "use strict";
  var F = window.QHFmt, KEY = "qh-wallet", evm = {}, sol = [], cur = null, saved = null, subs = [], privy = null, privyP = null, pending = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }

  function emit() { subs.forEach(function (f) { try { f(cur); } catch (e) {} }); top(); paint(); }
  function set(c) {
    cur = c; saved = c ? { family: c.family, via: c.via, name: c.name, address: c.address } : null;
    try { if (saved) localStorage.setItem(KEY, JSON.stringify(saved)); else localStorage.removeItem(KEY); } catch (e) {}
    emit(); if (c && pending) { var p = pending; pending = null; close(); p(c.address); }
  }
  function address() { var c = cur || saved; return c && c.address ? c.address : null; }

  /* EVM browser wallets */
  window.addEventListener("eip6963:announceProvider", function (e) {
    var d = e.detail; if (!d || !d.info || !d.provider) return; evm[d.info.uuid] = d; paint(); restore();
  });
  function injected() {
    var list = Object.keys(evm).map(function (k) { return evm[k]; }), eth = window.ethereum;
    if (!list.length && eth && eth.request) list = [{ info: { uuid: "window", name: eth.isMetaMask ? "MetaMask" : "Browser wallet", rdns: "window" }, provider: eth }];
    return list;
  }
  function watchEvm(p, via) {
    if (!p.on || p.__qhw) return; p.__qhw = 1;
    p.on("accountsChanged", function (a) { if (!cur || cur.provider !== p) return; if (!a || !a[0]) set(null); else { cur.address = String(a[0]).toLowerCase(); set(cur); } });
  }
  function useEvm(d, silent) {
    return d.provider.request({ method: silent ? "eth_accounts" : "eth_requestAccounts" }).then(function (a) {
      if (!a || !a[0]) { if (silent) return null; throw new Error("The wallet did not share an account."); }
      watchEvm(d.provider); set({ family: "evm", via: "injected", name: d.info.name, rdns: d.info.rdns, address: String(a[0]).toLowerCase(), provider: d.provider });
      return cur.address;
    });
  }

  /* Solana wallets (Wallet Standard) */
  function usable(w) { return w && w.chains && w.chains.some(function (c) { return c.indexOf("solana:") === 0; }) && w.features && w.features["standard:connect"]; }
  function register() {
    var ws = Array.prototype.slice.call(arguments);
    ws.forEach(function (w) { if (usable(w) && sol.indexOf(w) < 0) sol.push(w); });
    sol.sort(function (a, b) { return (b.name === "Phantom") - (a.name === "Phantom"); }); paint(); restore();
    return function () { sol = sol.filter(function (w) { return ws.indexOf(w) < 0; }); paint(); };
  }
  window.addEventListener("wallet-standard:register-wallet", function (e) { try { e.detail({ register: register }); } catch (x) {} });
  try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: { register: register } })); } catch (x) {}
  function useSol(w, silent) {
    return w.features["standard:connect"].connect(silent ? { silent: true } : undefined).then(function (r) {
      var acct = r && r.accounts && r.accounts[0];
      if (!acct) { if (silent) return null; throw new Error("The wallet did not share an account."); }
      set({ family: "solana", via: "phantom", name: w.name, address: acct.address, wallet: w, account: acct }); return acct.address;
    });
  }
  function phantomLink() { return "https://phantom.app/ul/browse/" + encodeURIComponent(location.href) + "?ref=" + encodeURIComponent(location.origin); }

  /* Email/Google wallet and phone wallets through the live Privy bundle */
  function loadPrivy() {
    if (privyP) return privyP;
    privyP = import(window.QH_PRIVY_ENTRY || "/privy/entry.js").then(function (m) {
      return new Promise(function (res, rej) {
        var box = document.createElement("div"), done = false; box.id = "qhooks-privy-root"; document.body.appendChild(box);
        var t = setTimeout(function () { rej(new Error("Sign-in took too long. Try again.")); }, 30000);
        privy = { state: {}, want: null };
        privy.sdk = m.mountPrivy({ container: box, chainId: "4663",
          onState: function (s) { privy.state = s; if (s.ready && !done) { done = true; clearTimeout(t); res(privy); } },
          onWallet: function (w) { fromPrivy(w, "privy"); }, onPhone: function (w) { fromPrivy(w, "walletconnect"); },
          onError: function (msg) { say(msg + " (Privy)"); } });
      });
    }).catch(function (e) { privyP = null; throw e; });
    return privyP;
  }
  function fromPrivy(w, via) {
    if (!w) { if (cur && cur.via === via) setTimeout(function () { if (cur && cur.via === via && !cur.live) set(null); }, 1500); if (cur && cur.via === via) cur.live = false; return; }
    var want = privy && privy.want === via, again = cur && cur.via === via, known = saved && saved.via === via;
    if (!want && !again && !known) return;
    privy.want = null;
    set({ family: "evm", via: via, live: true, name: via === "privy" ? "QHooks wallet" : "Phone wallet", address: String(w.address).toLowerCase(), provider: w.provider, chainId: String(w.chainId || "").replace(/^eip155:/, "") });
  }
  function privyGo(via) {
    say("Loading secure sign-in");
    loadPrivy().then(function (p) {
      say(""); p.want = via; close(true);
      if (via === "walletconnect") return p.sdk.connectPhone();
      if (!p.state.authenticated) return p.sdk.login(["email", "google"]);
      if (!p.state.hasWallet) return p.sdk.create();
    }).catch(function (e) {
      var local = !/qhooks\.com$/.test(location.hostname);
      say(local ? "Email and phone-wallet sign-in run on qhooks.com. They switch on here when this app is served from qhooks.com." : (e && e.message) || "Sign-in could not open. Try again.", local);
      open();
    });
  }

  /* Remembered connection: silent reconnect, never a popup */
  var tried = {};
  function restore() {
    if (cur || !saved) return;
    if (saved.via === "injected") injected().forEach(function (d) { if (!tried[d.info.uuid] && d.info.name === saved.name) { tried[d.info.uuid] = 1; useEvm(d, true).catch(function () {}); } });
    if (saved.via === "phantom") sol.forEach(function (w) { if (!tried[w.name] && w.name === saved.name) { tried[w.name] = 1; useSol(w, true).catch(function () {}); } });
    if ((saved.via === "privy" || saved.via === "walletconnect") && !tried.privy) { tried.privy = 1; loadPrivy().catch(function () {}); }
  }

  /* The sheet */
  var root = null;
  function say(text, local) {
    var m = root && root.querySelector(".wc-msg"); if (!m) return;
    m.innerHTML = F.esc(text || "") + (local ? ' <a href="https://qhooks.com/terminal" target="_blank" rel="noopener">Open qhooks.com</a>' : "");
  }
  /* A plain phone glyph in brand gold, as a data image so opt() can treat it like any wallet icon. */
  var PHONE_ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#181c1a"/><rect x="8" y="4.5" width="8" height="15" rx="2" fill="none" stroke="#d2ad72" stroke-width="1.6"/><path d="M11 16.8h2" stroke="#d2ad72" stroke-width="1.6" stroke-linecap="round"/></svg>');
  var OPEN_ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#181c1a"/><path d="M9.5 14.5l5-5M10.5 9.5h4v4" fill="none" stroke="#d2ad72" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  function opt(k, id, title, sub, icon) {
    return '<button type="button" class="wc-opt" data-k="' + k + '"' + (id ? ' data-id="' + F.esc(id) + '"' : "") + ">" +
      (icon ? '<img src="' + F.esc(icon) + '" alt="" width="24" height="24">' : '<i class="wc-dot"></i>') + "<span><b>" + F.esc(title) + "</b>" + (sub ? "<em>" + F.esc(sub) + "</em>" : "") + "</span></button>";
  }
  function paint() {
    if (!root) return;
    var h = "", c = cur, inj = injected();
    if (c) h += '<div class="wc-me"><div><b>' + F.esc(F.short(c.address)) + "</b><em>" + F.esc(c.name) + " · " + (c.family === "solana" ? "Solana" : "EVM chains") + '</em></div><button type="button" class="wc-sec" data-k="out">Disconnect</button></div>' +
      '<div class="wc-row"><a class="wc-sec" href="#/portfolio" data-k="go">Portfolio</a><button type="button" class="wc-sec" data-k="oc">One-click trading</button></div><div class="wc-lab">Switch wallet</div>';
    h += opt("privy", "", "Email or Google", "Your QHooks wallet. One-click trading works with it.", "brand/qh-mark.jpg"); /* icons added by Fable: tester saw empty squares */
    h += '<div class="wc-lab">Browser wallet</div>';
    h += inj.length ? inj.map(function (d) { return opt("inj", d.info.uuid, d.info.name, "Signs each trade in the wallet", d.info.icon); }).join("") : '<div class="wc-none">No browser wallet on this device.</div>';
    h += opt("wc", "", "Any phone wallet", "WalletConnect: pick your wallet app, or scan from desktop", PHONE_ICON);
    h += '<div class="wc-lab">Solana</div>';
    h += sol.length ? sol.map(function (w) { return opt("sol", w.name, w.name, "Solana trades", w.icon); }).join("") : '<a class="wc-opt" href="' + F.esc(phantomLink()) + '" rel="noopener"><img src="' + OPEN_ICON + '" alt="" width="24" height="24"><span><b>Open in Phantom</b><em>Phantom is not in this browser</em></span></a>';
    root.querySelector(".wc-body").innerHTML = h;
  }
  function open(family) {
    if (!root) {
      root = document.createElement("div"); root.className = "wc-scrim";
      root.innerHTML = '<div class="wc-sheet" role="dialog" aria-modal="true" aria-label="Connect"><div class="wc-head"><b>' + (cur ? "Account" : "Connect") + '</b><button type="button" class="wc-x" aria-label="Close">×</button></div>' +
        '<div class="wc-body"></div><div class="wc-msg" role="status" aria-live="polite"></div><div class="wc-foot">Connecting never moves funds. Every trade asks your wallet first unless you turn on one-click.</div></div>';
      root.addEventListener("click", onClick); document.body.appendChild(root);
    }
    root.hidden = false; root.dataset.family = family || ""; paint();
    return new Promise(function (res) { if (pending) pending(null); pending = res; });
  }
  /* The sheet never follows the user to another screen. (Fable) */
  window.addEventListener("hashchange", function () { if (root && !root.hidden) close(); });
  function close(keep) { if (root) root.hidden = true; if (!keep && pending) { var p = pending; pending = null; p(null); } }
  function onClick(e) {
    if (e.target === root || e.target.closest(".wc-x")) { close(); return; }
    var b = e.target.closest("[data-k]"); if (!b) return;
    var k = b.dataset.k, id = b.dataset.id;
    if (k === "go") { close(); return; }
    if (k === "out") { disconnect(); return; }
    if (k === "oc") { close(); if (window.QHOneClick) window.QHOneClick.open(); return; }
    if (k === "privy" || k === "wc") { privyGo(k === "wc" ? "walletconnect" : "privy"); return; }
    say("Approve in your wallet");
    var job = k === "inj" ? useEvm(injected().filter(function (d) { return d.info.uuid === id; })[0], false)
      : useSol(sol.filter(function (w) { return w.name === id; })[0], false);
    job.then(function () { say(""); }).catch(function (err) { say(/reject|denied|cancel/i.test(String(err && err.message)) || (err && err.code === 4001) ? "Cancelled in your wallet." : String((err && err.message) || err).slice(0, 160)); });
  }
  function disconnect() {
    var c = cur;
    if (c && c.via === "phantom" && c.wallet.features["standard:disconnect"]) { try { c.wallet.features["standard:disconnect"].disconnect(); } catch (e) {} }
    if (c && (c.via === "privy" || c.via === "walletconnect") && privy && privy.sdk && c.via === "privy") { try { privy.sdk.logout(); } catch (e) {} }
    set(null);
  }
  /* Resolves with the connected identity for that chain family, opening the sheet if needed (null if they close it). */
  function ensure(family) {
    var ok = function () { return cur && (cur.provider || cur.wallet) && (!family || cur.family === family); };
    if (ok()) return Promise.resolve(cur);
    return open(family).then(function () { return ok() ? cur : null; });
  }

  function top() {
    var b = document.querySelector(".q-connect-btn"); if (!b || !window.QHAccount) return;
    window.QHAccount.fillTop(document.querySelector(".q-earned"), document.querySelector(".q-balance"), b);
    b.classList.toggle("wc-on", !!address()); b.title = address() ? "Account" : "Connect a wallet";
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest(".q-connect-btn")) return;
    e.preventDefault(); e.stopImmediatePropagation(); open();
  }, true);

  if (window.QHLive) {
    window.QHLive.wallet = function () { var a = address(); if (a) return a; try { return localStorage.getItem("qh-watch") || null; } catch (e) { return null; } };
    window.QHLive.connect = function () { return cur ? Promise.resolve(cur.address) : open(); };
  }
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  setTimeout(restore, 400);

  var css = document.createElement("style");
  css.textContent = ".wc-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:90;display:flex;align-items:center;justify-content:center}.wc-scrim[hidden]{display:none}" +
    ".wc-sheet{width:400px;max-width:100%;max-height:88vh;overflow:auto;background:var(--s1);border:1px solid var(--line);border-radius:10px;padding:14px 16px 16px;box-sizing:border-box}" +
    ".wc-head{display:flex;align-items:center;justify-content:space-between;font-size:15px}.wc-x{width:44px;height:44px;border:0;background:none;color:var(--mut);font-size:22px;cursor:pointer}" +
    ".wc-opt{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:8px 10px;margin:6px 0 0;background:var(--s2);border:1px solid var(--line);border-radius:8px;color:var(--tx);text-align:left;cursor:pointer;text-decoration:none;box-sizing:border-box}" +
    ".wc-opt:hover{border-color:var(--acc)}.wc-opt span{display:flex;flex-direction:column;min-width:0}.wc-opt b{font-size:14px}.wc-opt em,.wc-me em{font-style:normal;font-size:12px;color:var(--mut)}" +
    ".wc-dot{width:24px;height:24px;border-radius:6px;background:var(--line);flex:0 0 auto}.wc-lab{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 0}" +
    ".wc-none{font-size:12px;color:var(--mut);padding:8px 0 0}.wc-msg{font-size:12px;color:var(--acc);min-height:16px;margin-top:10px;overflow-wrap:anywhere}.wc-msg a{color:var(--tx)}" +
    ".wc-foot{font-size:11px;color:var(--mut);margin-top:8px}.wc-me{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;background:var(--s2);border-radius:8px;margin-top:6px}" +
    ".wc-me div{display:flex;flex-direction:column}.wc-row{display:flex;gap:8px;margin-top:8px}.wc-sec{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:6px;font-size:13px;cursor:pointer;text-decoration:none;flex:1}" +
    ".q-connect-btn.wc-on{font-variant-numeric:tabular-nums}" +
    "@media (max-width:767px){.wc-scrim{align-items:flex-end}.wc-sheet{border-radius:12px 12px 0 0;max-height:92vh}}";
  document.head.appendChild(css);

  window.QHWallet = { open: open, close: close, ensure: ensure, disconnect: disconnect, address: address,
    current: function () { return cur; }, on: function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; } };
})();
;
/* js/wallet-sign.js */
/* wallet-sign.js: in-page signing and trade feedback (contract 1.2.7, 1.3.3). Written by Claude.
   - evm(): sends unsigned transactions (from prepare-trade / a launch route) to the visitor's own wallet in order
     (approval first, then the swap), waits for each receipt and stops on the first failure. Nothing is signed here.
   - sol(): Phantom/Wallet Standard. signAndSendTransaction first (Phantom adds priority-fee instructions, so a
     sign-then-send check can refuse silently); then reconcile through /api/sol-launch/rpc getSignatureStatuses.
     Wallets without sign-and-send sign, then POST /api/terminal/sol/execute, as the live terminal does.
   - toast(): the feedback stack (submitted, confirmed with tx link, failed with the exact reason and Retry). */
(function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm;
  var HEX = { "4663": "0x1237", "8453": "0x2105", "1": "0x1", "42161": "0xa4b1", "56": "0x38", "99901": "0x1863d", "143": "0x8f" };
  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hexv(v) { return "0x" + BigInt(v || 0).toString(16); }
  function kind(tx) { return String(tx.data || "").slice(0, 10) === "0x095ea7b3" ? "approve" : (tx.kind || "swap"); }
  /* The wallet's own words, cleaned up only where they are a code; cancellations say nothing was sent. */
  function reason(err) {
    var e = err || {}, m = String(e.shortMessage || (e.data && e.data.message) || e.message || e || "");
    if (e.code === 4001 || /user (rejected|denied)|rejected the request|request rejected|cancel/i.test(m)) return "Cancelled in your wallet. Nothing was sent.";
    if (e.code === 4902 || /unrecognized chain|unknown chain/i.test(m)) return "Add this network to your wallet, then retry.";
    if (/insufficient funds/i.test(m)) return "Not enough balance for this trade plus gas.";
    return m.replace(/^Error:\s*/, "").slice(0, 180) || "The wallet did not answer.";
  }
  function chainOk(p, chainId) {
    var want = HEX[String(chainId)]; if (!want) return Promise.resolve();
    return p.request({ method: "eth_chainId" }).then(function (c) {
      if (String(c).toLowerCase() === want) return null;
      return p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
    });
  }
  function receipt(p, hash) {
    var t0 = Date.now();
    function poll() {
      return p.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(function () { return null; }).then(function (r) {
        if (r && r.status) {
          if (String(r.status) === "0x1" || r.status === 1) return r;
          var e = new Error("Reverted on chain. Nothing was spent except gas."); e.hash = hash; throw e;
        }
        if (Date.now() - t0 > 180000) { var x = new Error("Still confirming after 3 minutes. Check the transaction link."); x.hash = hash; x.pending = true; throw x; }
        return wait(Date.now() - t0 < 10000 ? 700 : 2000).then(poll);
      });
    }
    return poll();
  }
  /* o: {provider, from, chainId, txs, on(state, info)}; states: switch, sign, sent, confirmed. Resolves {hashes, receipts}. */
  function evm(o) {
    var p = o.provider, on = o.on || function () {}, hashes = [], receipts = [], i = 0;
    on("switch", {});
    return chainOk(p, o.chainId).then(function next() {
      if (i >= o.txs.length) return { hashes: hashes, receipts: receipts };
      var x = o.txs[i++], k = kind(x), n = o.txs.length;
      on("sign", { i: i, n: n, kind: k });
      var tx = { from: o.from, to: x.to, data: x.data, value: hexv(x.value) };
      if (x.gas) tx.gas = hexv(x.gas);
      return p.request({ method: "eth_sendTransaction", params: [tx] }).then(function (h) {
        hashes.push(h); on("sent", { i: i, n: n, kind: k, hash: h });
        return receipt(p, h);
      }).then(function (r) { receipts.push(r); on("confirmed", { i: i, n: n, kind: k, hash: hashes[hashes.length - 1], receipt: r }); return next(); });
    });
  }

  /* Solana */
  function b58(bytes) {
    var n = 0n, s = "", z = 0; for (var i = 0; i < bytes.length; i++) n = n * 256n + BigInt(bytes[i]);
    while (n > 0n) { s = B58.charAt(Number(n % 58n)) + s; n = n / 58n; }
    while (z < bytes.length && bytes[z] === 0) { s = "1" + s; z++; } return s;
  }
  function fromB64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function toB64(b) { var s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function has(c, f) { return !!(c.wallet.features[f] && (!c.account.features || c.account.features.indexOf(f) >= 0)); }
  function solOrder(o) {
    var q = "input=" + encodeURIComponent(o.input) + "&output=" + encodeURIComponent(o.output) + "&amount=" + o.amount + "&taker=" + encodeURIComponent(o.taker) + "&slippageBps=" + (o.slippageBps || 100);
    return window.QHApi.get("/api/terminal/sol/order?" + q, { timeout: 15000 });
  }
  /* Mint decimals: the balance route first, then the mint account through the read-only RPC route. null when unknown. */
  var decMemo = {};
  function solDecimals(owner, mint) {
    if (decMemo[mint] != null) return Promise.resolve(decMemo[mint]);
    return window.QHApi.get("/api/terminal/sol/balance/" + encodeURIComponent(owner) + "?mint=" + encodeURIComponent(mint)).then(function (r) {
      var d = r.ok && r.body ? r.body.decimals : null; if (Number.isInteger(d)) return d;
      return window.QHApi.post("/api/sol-launch/rpc", { jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "jsonParsed" }] }).then(function (x) {
        var v = x.ok && x.body && x.body.result && x.body.result.value, p = v && v.data && v.data.parsed && v.data.parsed.info;
        return p && Number.isInteger(p.decimals) ? p.decimals : null;
      });
    }).then(function (d) { if (d != null) decMemo[mint] = d; return d; });
  }
  function solStatus(sig) {
    var t0 = Date.now();
    function poll() {
      return window.QHApi.post("/api/sol-launch/rpc", { jsonrpc: "2.0", id: 1, method: "getSignatureStatuses", params: [[sig], { searchTransactionHistory: false }] }).then(function (r) {
        if (!r.ok) return { unknown: true };
        var v = r.body && r.body.result && r.body.result.value && r.body.result.value[0];
        if (v && v.err) { var e = new Error("Failed on Solana: " + JSON.stringify(v.err).slice(0, 120)); e.hash = sig; throw e; }
        if (v && (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized")) return { ok: true };
        if (Date.now() - t0 > 60000) return { unknown: true };
        return wait(800).then(poll);
      });
    }
    return poll();
  }
  /* o: {session: {wallet, account}, order: {transaction, requestId, lastValidBlockHeight}, on}. Resolves {signature, confirmed}. */
  function sol(o) {
    var c = o.session, on = o.on || function () {}, tx = fromB64(o.order.transaction);
    on("sign", { i: 1, n: 1, kind: "swap" });
    if (has(c, "solana:signAndSendTransaction")) {
      return c.wallet.features["solana:signAndSendTransaction"].signAndSendTransaction({ account: c.account, transaction: tx, chain: "solana:mainnet", options: { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 2 } }).then(function (out) {
        var r = out && out[0]; if (!r || !r.signature || r.signature.length !== 64) throw new Error("The wallet did not return a transaction signature.");
        var sig = b58(r.signature); on("sent", { hash: sig });
        return solStatus(sig).then(function (s) { if (s.ok) on("confirmed", { hash: sig }); return { signature: sig, confirmed: !!s.ok }; });
      });
    }
    if (!has(c, "solana:signTransaction")) return Promise.reject(new Error("This wallet cannot sign this transaction. Use Phantom."));
    return c.wallet.features["solana:signTransaction"].signTransaction({ account: c.account, transaction: tx, chain: "solana:mainnet" }).then(function (out) {
      var signed = out && out[0] && out[0].signedTransaction; if (!signed || !signed.length) throw new Error("The wallet did not sign.");
      on("sending", {});
      return window.QHApi.post("/api/terminal/sol/execute", { signedTransaction: toB64(signed), requestId: o.order.requestId, lastValidBlockHeight: o.order.lastValidBlockHeight });
    }).then(function (r) {
      var x = r.body || {};
      if (!r.ok || x.status !== "Success") throw new Error("The swap did not land" + (x.error ? ": " + x.error : r.status === 405 ? ": sending runs on qhooks.com" : "."));
      on("confirmed", { hash: x.signature }); return { signature: x.signature, confirmed: true };
    });
  }

  /* Feedback toasts: top on phone, bottom-right on desktop. t = toast({title}); t.set(state, {hash, chainId, text, retry}). */
  function stack() {
    var s = document.querySelector(".ws-toasts");
    if (!s) { s = document.createElement("div"); s.className = "ws-toasts"; s.setAttribute("aria-live", "polite"); document.body.appendChild(s); }
    return s;
  }
  function toast(o) {
    var el = document.createElement("div"); el.className = "ws-toast"; stack().appendChild(el);
    var api = { el: el, set: function (state, d) {
      d = d || {}; el.dataset.state = state;
      var link = d.hash ? N.txUrl(d.chainId || o.chainId, d.hash) : null;
      var line = state === "failed" ? F.esc(d.text || "Did not go through") : F.esc(d.text || state);
      el.innerHTML = '<div class="ws-t"><b>' + F.esc(o.title) + '</b><button type="button" class="ws-x" aria-label="Dismiss">×</button></div><div class="ws-s">' + line +
        (link ? ' · <a href="' + F.esc(link) + '" target="_blank" rel="noopener">View tx</a>' : "") + "</div>" + (d.retry ? '<button type="button" class="ws-retry">Retry</button>' : "");
      el.querySelector(".ws-x").onclick = function () { el.remove(); };
      if (d.retry) el.querySelector(".ws-retry").onclick = function () { el.remove(); d.retry(); };
      clearTimeout(el._t); if (state === "confirmed") el._t = setTimeout(function () { el.remove(); }, 9000);
    } };
    return api;
  }

  var css = document.createElement("style");
  css.textContent = ".ws-toasts{position:fixed;right:16px;bottom:44px;display:flex;flex-direction:column;gap:8px;z-index:110;width:340px;max-width:calc(100vw - 32px)}" +
    ".ws-toast{background:var(--s1);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--tx);box-shadow:0 6px 24px rgba(0,0,0,.35)}" +
    ".ws-toast[data-state=confirmed]{border-left-color:var(--up)}.ws-toast[data-state=failed]{border-left-color:var(--dn)}" +
    ".ws-t{display:flex;align-items:center;justify-content:space-between;gap:8px}.ws-s{color:var(--mut);overflow-wrap:anywhere}.ws-s a{color:var(--acc)}" +
    ".ws-x{width:44px;height:44px;margin:-10px -10px -10px 0;border:0;background:none;color:var(--mut);font-size:18px;cursor:pointer}" +
    ".ws-retry{margin-top:6px;min-height:44px;padding:0 14px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:6px;cursor:pointer}" +
    "@media (max-width:767px){.ws-toasts{top:8px;bottom:auto;left:16px;right:16px;width:auto;max-width:none}}";
  document.head.appendChild(css);

  window.QHSign = { evm: evm, receipt: receipt, sol: sol, solOrder: solOrder, solDecimals: solDecimals, toast: toast, reason: reason, HEX: HEX, b58: b58 };
})();
;
/* js/oneclick.js */
/* oneclick.js: opt-in one-click trading (contract 1.2.4, 1.3.3; Randall approved the Privy one-click signer 2026-11-19). Written by Claude.
   Same server and Privy pieces as live public/qx-oneclick.mjs:
   - GET/POST /api/oneclick (status, on/off, limits) and POST /api/oneclick/trade, authorised by the QHooks session
     (localStorage "qhooks:board-session:v1", made by one free sign-in signature, shared with qhooks.com).
   - Turning on = Privy's own "add signer" consent (qhooksPrivySignerControls.addSigner, from the Privy bundle), for the
     QHooks email/Google wallet only. Server switch: QHOOKS_TG_SIGNER=on plus the Privy secrets (on in prod 2026-11-20).
   - Limits: per trade and per day in USD, stored server-side; revoke is one tap (server off + Privy removeSigner).
   window.QH_ONECLICK = false hides it all. Nothing here holds a key or signs. */
(function () {
  "use strict";
  var F = window.QHFmt, SKEY = "qhooks:board-session:v1", memo = { w: null, at: 0, v: null }, root = null;
  var CAP_TRADE = 50, CAP_DAY = 250;
  function off() { return window.QH_ONECLICK === false; }
  function me() { return window.QHWallet && window.QHWallet.current(); }
  function session() {
    var c = me(); if (!c) return null;
    try { var s = JSON.parse(localStorage.getItem(SKEY) || "null"); if (s && s.expiresAt > Date.now() && s.wallet === c.address) return s; } catch (e) {}
    return null;
  }
  function call(path, method, body) {
    var s = session(), c = me(), h = { accept: "application/json" };
    if (s) h.authorization = "Bearer " + s.token;
    if (body) h["content-type"] = "application/json";
    var q = method === "GET" && c ? "?wallet=" + c.address : "";
    return fetch(window.QH_API + path + q, { method: method, headers: h, cache: "no-store", body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b || {} }; });
    }).catch(function () { return { ok: false, status: 0, body: { error: "refreshing" } }; });
  }
  function controls() {
    var c = window.qhooksPrivySignerControls, cur = me(); if (!c || !cur) return null;
    var w = typeof c.wallet === "function" ? c.wallet() : c.wallet;
    return w && w.walletClientType === "privy" && String(w.address).toLowerCase() === cur.address && typeof c.addSigner === "function" ? { c: c, w: w } : null;
  }
  /* {available, on, embedded, perTradeUsd, dailyUsd, usedTodayUsd, needsSignIn, why} */
  function status(fresh) {
    var c = me();
    if (off()) return Promise.resolve({ available: false, why: "off" });
    if (!c || c.family !== "evm") return Promise.resolve({ available: true, on: false, why: "connect" });
    if (c.via !== "privy") return Promise.resolve({ available: true, on: false, why: "wallet" });
    if (!fresh && memo.w === c.address && Date.now() - memo.at < 30000) return Promise.resolve(memo.v);
    if (!session()) { memo = { w: c.address, at: Date.now(), v: { available: true, on: false, needsSignIn: true, embedded: !!controls() } }; return Promise.resolve(memo.v); }
    return call("/api/oneclick", "GET").then(function (r) {
      var v = r.ok ? r.body : { available: r.status !== 404 && r.status !== 405, on: false, needsSignIn: r.body.error === "sign_in", why: r.ok ? "" : r.body.error || "refreshing" };
      v.embedded = !!controls(); memo = { w: c.address, at: Date.now(), v: v }; return v;
    });
  }
  function isOn() { var v = memo.v, c = me(); return !!(v && c && memo.w === c.address && v.on && !v.paused && v.embedded); }
  /* One free sign-in signature (EIP-191), the same session flow as live qx-board-session.mjs. */
  function signIn() {
    var c = me();
    return call("/api/community/session/message", "POST", { wallet: c.address }).then(function (r) {
      if (!r.ok || !r.body.message) throw new Error("Sign-in message is unavailable. Try again.");
      var msg = r.body.message, hex = "0x" + Array.prototype.map.call(new TextEncoder().encode(msg), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      return c.provider.request({ method: "personal_sign", params: [hex, c.address] }).then(function (sig) { return call("/api/community/session", "POST", { message: msg, signature: sig }); });
    }).then(function (r) {
      var s = r.body; if (!r.ok || s.wallet !== c.address || !s.token) throw new Error("The sign-in did not match this wallet. Try again.");
      try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {}
    });
  }
  function limits(p, d) { return { perTradeUsd: Math.min(CAP_TRADE, Math.max(1, Math.round(p) || CAP_TRADE)), dailyUsd: Math.min(CAP_DAY, Math.max(1, Math.round(d) || CAP_DAY)) }; }
  function enable(p, d) {
    var k = controls(); if (!k) return Promise.reject(new Error("One-click works with your QHooks email or Google wallet."));
    var lim = limits(p, d); if (lim.dailyUsd < lim.perTradeUsd) lim.dailyUsd = lim.perTradeUsd;
    return (session() ? Promise.resolve() : signIn()).then(function () { return call("/api/oneclick", "GET"); }).then(function (r) {
      if (!r.ok || !r.body.available) throw new Error("One-click is not available right now. Your wallet signs each trade.");
      return Promise.resolve(k.c.addSigner(r.body.policyId, r.body.signerId)).catch(function (e) {
        throw new Error(e && (e.code === 4001 || /reject|cancel/i.test(e.message || "")) ? "Cancelled. Nothing changed." : "Could not turn on one-click. Try again.");
      });
    }).then(function () { return call("/api/oneclick", "POST", { action: "on", walletId: k.w.id, perTradeUsd: lim.perTradeUsd, dailyUsd: lim.dailyUsd }); })
      .then(function (r) { if (!r.ok) throw new Error(r.body.error === "signer_missing" ? "The wallet permission did not save. Try again." : "Could not turn on one-click. Try again."); memo.at = 0; return status(true); });
  }
  function disable() {
    return call("/api/oneclick", "POST", { action: "off" }).then(function (r) {
      var k = controls(); if (k && k.c.removeSigner) { try { k.c.removeSigner(); } catch (e) {} }
      if (!r.ok) throw new Error("Could not turn off. Try again."); memo.at = 0; return status(true);
    });
  }
  function save(p, d) {
    var lim = limits(p, d); if (lim.dailyUsd < lim.perTradeUsd) return Promise.reject(new Error("The day limit must be at least one trade."));
    return call("/api/oneclick", "POST", { action: "limits", perTradeUsd: lim.perTradeUsd, dailyUsd: lim.dailyUsd }).then(function (r) { if (!r.ok) throw new Error("Could not save limits."); memo.at = 0; return status(true); });
  }
  var MSG = { over_trade_limit: "Over your one-click limit per trade. Lower the amount or raise your limit.", over_daily_limit: "Over your one-click limit for today.",
    insufficient_balance: "Not enough balance.", refreshing: "Refreshing prices. Try again in a moment.", no_route: "No route for this trade right now.",
    sell_check_failed: "This token failed the sell check, so one-click will not buy it.", not_permitted: "Turn one-click on again: the wallet permission is missing." };
  /* Resolves {hashes, explorer} or null when the wallet should sign instead. */
  function trade(o) {
    var key = "oc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    return call("/api/oneclick/trade", "POST", { chainId: String(o.chainId), token: o.token, side: o.side, amountWei: String(o.amountWei), slippageBps: o.slippageBps, idempotencyKey: key }).then(function (r) {
      if (r.ok) return r.body;
      var e = r.body.error; if (["use_wallet", "off", "sign_in", "link_wallet", "paused"].indexOf(e) >= 0 || r.status === 405) { memo.at = 0; return null; }
      throw new Error(MSG[e] || "One-click trade failed. Nothing was spent if no transaction is shown.");
    });
  }

  /* The sheet */
  function paint(v, note) {
    if (!root) return;
    var body = root.querySelector(".oc-body"), h = "";
    var lim = '<div class="oc-lim"><label>Per trade $<input type="number" inputmode="decimal" min="1" max="' + CAP_TRADE + '" class="oc-p" value="' + F.esc(v.perTradeUsd || CAP_TRADE) + '"></label>' +
      '<label>Per day $<input type="number" inputmode="decimal" min="1" max="' + CAP_DAY + '" class="oc-d" value="' + F.esc(v.dailyUsd || CAP_DAY) + '"></label></div><div class="oc-cap">Most for now: $' + CAP_TRADE + " a trade, $" + CAP_DAY + " a day.</div>";
    if (!v.available) h = "<p>One-click is not available right now. Your wallet signs each trade.</p>";
    else if (v.why === "connect" || v.why === "wallet") h = "<p>" + (v.why === "connect" ? "Connect first. " : "Your " + F.esc(me().name) + " signs each trade. ") + "One-click works with your QHooks email or Google wallet.</p>" +
      '<button type="button" class="oc-go" data-a="wallet">Use email or Google</button>';
    else if (v.on) h = '<div class="oc-state">On · $' + F.esc(v.perTradeUsd) + " per trade · $" + F.esc(v.dailyUsd) + " per day" + (F.ok(v.usedTodayUsd) ? " · $" + F.num(v.usedTodayUsd) + " used today" : "") + "</div>" +
      lim + '<div class="oc-row"><button type="button" class="oc-sec" data-a="save">Save limits</button><button type="button" class="oc-off" data-a="off">Turn off</button></div>';
    else h = lim + '<button type="button" class="oc-go" data-a="on">Turn on one-click</button>' + (v.embedded ? "" : '<div class="oc-cap">Your QHooks wallet is still opening; this works once it is ready.</div>');
    body.innerHTML = h; root.querySelector(".oc-msg").textContent = note || "";
  }
  function open() {
    if (off()) return;
    if (!root) {
      root = document.createElement("div"); root.className = "wc-scrim oc-scrim";
      root.innerHTML = '<div class="wc-sheet" role="dialog" aria-modal="true" aria-label="One-click trading"><div class="wc-head"><b>One-click trading</b><button type="button" class="wc-x" aria-label="Close">×</button></div>' +
        '<p class="oc-what">Buy and sell with one tap, no wallet popup. QHooks can place swaps from your QHooks wallet, back to that same wallet, only up to your limits. It cannot send your funds anywhere else. Turn it off here any time.</p>' +
        '<div class="oc-body"></div><div class="wc-msg oc-msg" role="status" aria-live="polite"></div></div>';
      root.addEventListener("click", onClick); document.body.appendChild(root);
    }
    root.hidden = false; paint({ available: true, why: "" }, "Reading your setting");
    status(true).then(function (v) { paint(v); });
  }
  function onClick(e) {
    if (e.target === root || e.target.closest(".wc-x")) { root.hidden = true; return; }
    var b = e.target.closest("[data-a]"); if (!b) return;
    var a = b.dataset.a, p = root.querySelector(".oc-p"), d = root.querySelector(".oc-d"), msg = root.querySelector(".oc-msg");
    if (a === "wallet") { root.hidden = true; window.QHWallet.open("evm"); return; }
    b.disabled = true; msg.textContent = a === "on" ? "Confirm in the QHooks wallet window" : a === "off" ? "Turning off" : "Saving";
    var job = a === "on" ? enable(p.value, d.value) : a === "off" ? disable() : save(p.value, d.value);
    job.then(function (v) { paint(v, a === "off" ? "Off. Your wallet signs each trade again." : a === "on" ? "On. Buy is one tap now." : "Saved."); emit(); })
      .catch(function (err) { b.disabled = false; msg.textContent = (err && err.message) || "Did not save. Try again."; });
  }
  function emit() { try { window.dispatchEvent(new CustomEvent("qh-oneclick")); } catch (e) {} }
  if (window.QHWallet) window.QHWallet.on(function () { memo.at = 0; status(true).then(emit); });
  window.addEventListener("qhooks:privy-signer-ready", function () { memo.at = 0; status(true).then(emit); });

  var css = document.createElement("style");
  css.textContent = ".oc-what{font-size:13px;color:var(--mut);margin:4px 0 10px;line-height:1.45}.oc-lim{display:flex;gap:10px;flex-wrap:wrap}.oc-lim label{display:flex;align-items:center;gap:6px;font-size:13px;flex:1;min-width:140px}" +
    ".oc-lim input{flex:1;min-width:0;height:44px;background:var(--s2);border:1px solid var(--line);border-radius:6px;color:var(--tx);padding:0 10px;font-size:14px}" +
    ".oc-cap{font-size:11px;color:var(--mut);margin:6px 0 10px}.oc-go{width:100%;min-height:48px;border:0;border-radius:8px;background:var(--up);color:#04140c;font-weight:600;font-size:15px;cursor:pointer}" +
    ".oc-row{display:flex;gap:8px}.oc-sec,.oc-off{flex:1;min-height:44px;border-radius:6px;border:1px solid var(--line);background:var(--s2);color:var(--tx);cursor:pointer;font-size:13px}.oc-off{color:var(--dn);border-color:rgba(242,105,92,.4)}" +
    ".oc-state{font-size:13px;color:var(--up);margin-bottom:10px}.oc-body p{font-size:13px;margin:0 0 10px}";
  document.head.appendChild(css);

  window.QHOneClick = { open: open, status: status, isOn: isOn, trade: trade, enable: enable, disable: disable, setLimits: save, off: off };
})();
;
/* js/trade-run.js */
/* trade-run.js: one trade path for every buy and sell button (token panel, Pulse and Discover rows, position chip). Written by Claude.
   - quote(): EVM GET /api/v1/agent/quote (the pool's own quoter, hook charges included; about 26 CU), Solana
     GET /api/terminal/sol/order (needs the connected Solana wallet as taker).
   - run(): one-click first when the visitor turned it on (oneclick.js); otherwise POST /api/v1/agent/prepare-trade and
     QHSign.evm sends approval then swap to the visitor's own wallet. Solana signs in Phantom (QHSign.sol).
     Nothing here holds a key or signs: the wallet (or the visitor's opt-in one-click signer) does.
   - After a fill it announces "qh-traded" {chainId, token, side, hash, amount, unit, symbol, confirmed}.
   - QHooks fee 1% on the input of a buy (as prepare-trade charges it); cashback is 30% of that fee. */
(function () {
  "use strict";
  var FEE = 0.01, BACK = 0.30, SLIP_BPS = 100, SOL = "So11111111111111111111111111111111111111112";

  function toWei(v, dec) {
    var s = String(v).trim(); if (!/^\d*\.?\d*$/.test(s) || !s || s === ".") return null;
    var p = s.split("."), frac = (p[1] || "").slice(0, dec); while (frac.length < dec) frac += "0";
    var w = (p[0] || "0") + frac; w = w.replace(/^0+/, ""); return w || null;
  }
  function fromWei(w, dec) { var n = Number(w); return isFinite(n) ? n / Math.pow(10, dec) : NaN; }
  /* A plain decimal string (never "1e-7"), rounded down so a 100% sell never asks for more than is held. */
  function plain(n, dp) {
    if (!(n > 0) || !isFinite(n)) return null;
    dp = dp == null ? 8 : dp; var m = Math.pow(10, dp), s = (Math.floor(n * m) / m).toFixed(dp);
    s = s.replace(/0+$/, "").replace(/\.$/, ""); return parseFloat(s) > 0 ? s : null;
  }
  function isSol(t) { return t && t.chainId === "solana"; }
  function can(t) { return !!t && (isSol(t) || !!window.QHSign.HEX[t.chainId]); }
  function unit(t, side) { return side === "sell" ? t.symbol : (isSol(t) ? "SOL" : t.quoteSymbol || t.native || "ETH"); }
  function solMe() { var c = window.QHWallet.current(); return c && c.family === "solana" ? c : null; }
  function solAmount(t, side, a, me) {
    if (side === "buy") return Promise.resolve({ amt: toWei(a, 9), dec: null });
    return window.QHSign.solDecimals(me.address, t.address).then(function (d) { return { amt: d == null ? null : toWei(a, d), dec: d }; });
  }
  function solOrder(t, side, amt, me) {
    return window.QHSign.solOrder({ input: side === "buy" ? SOL : t.address, output: side === "buy" ? t.address : SOL, amount: amt, taker: me.address, slippageBps: SLIP_BPS });
  }

  /* Resolves {ok, out (tokens or quote units), outUsd, gas, impact, body, status, error}. Never throws. */
  function quote(t, side, a, decimals) {
    if (!can(t) || !(parseFloat(a) > 0)) return Promise.resolve({ ok: false, error: "amount" });
    if (isSol(t)) {
      var me = solMe(); if (!me) return Promise.resolve({ ok: false, error: "connect" });
      var dec = null;
      return solAmount(t, side, a, me).then(function (x) {
        dec = x.dec; if (!x.amt) return { ok: false, error: "Refreshing token details" };
        return solOrder(t, side, x.amt, me).then(function (r) {
          if (!r.ok || !r.body || !r.body.outAmount) return { ok: false, status: r.status, error: (r.body && (r.body.detail || r.body.error)) || "No quote right now. It refreshes on its own." };
          var outDec = side === "buy" ? null : 9;
          return { ok: true, body: r.body, out: outDec == null ? null : fromWei(r.body.outAmount, outDec), min: outDec == null ? null : fromWei(r.body.minOut || 0, outDec),
            outUsd: Number(r.body.outUsdValue) || null, impact: r.body.priceImpact, sellDec: dec };
        });
      }).catch(function (e) { return { ok: false, error: (e && e.message) || "No quote right now." }; });
    }
    var d = decimals || 18, inWei = toWei(side === "buy" ? plain(parseFloat(a) * (1 - FEE), 18) : a, d);
    if (!inWei) return Promise.resolve({ ok: false, error: "Check the amount" });
    return window.QHLive.quote({ chain: t.chainId, token: t.address, side: side, amountIn: inWei }).then(function (r) {
      if (!r.ok || !r.body || !r.body.amountOut) return { ok: false, status: r.status, error: r.status === 404 ? "This token trades in the QHooks terminal for now." : "No quote right now. It refreshes on its own." };
      var out = fromWei(r.body.amountOut, d);
      return { ok: true, body: r.body, out: out, min: out * (1 - SLIP_BPS / 10000), outUsd: side === "buy" && t.price ? out * t.price : null, gas: r.body.gasEstimate };
    });
  }

  /* o: {t, side, amount (decimal string), decimals, on(state, info)}. Resolves {hash, confirmed, oneclick}.
     on() states: switch, sign {i, n, kind}, sending, sent {hash, kind, n, i}, route. */
  function run(o) {
    var t = o.t, side = o.side, a = String(o.amount), on = o.on || function () {};
    if (!can(t)) return Promise.reject(new Error("This token trades in the QHooks terminal for now."));
    var job;
    if (isSol(t)) {
      job = window.QHWallet.ensure("solana").then(function (me) {
        if (!me) throw new Error("Connect Phantom to trade this token.");
        return solAmount(t, side, a, me).then(function (x) {
          if (!x.amt) throw new Error("Refreshing token details. Try again in a moment.");
          on("route", {}); return solOrder(t, side, x.amt, me);
        }).then(function (r) {
          if (!r.ok || !r.body || !r.body.transaction) throw new Error((r.body && (r.body.detail || r.body.error)) || "No route for this trade right now.");
          return window.QHSign.sol({ session: me, order: r.body, on: on });
        });
      }).then(function (x) { return { hash: x.signature, confirmed: x.confirmed }; });
    } else {
      var wei = toWei(a, o.decimals || 18), oc = window.QHOneClick && window.QHOneClick.isOn();
      if (!wei) return Promise.reject(new Error("Check the amount."));
      job = (oc ? window.QHOneClick.trade({ chainId: t.chainId, token: t.address, side: side, amountWei: wei, slippageBps: SLIP_BPS }) : Promise.resolve(null)).then(function (r) {
        if (r && r.hashes && r.hashes.length) {
          var h = r.hashes[r.hashes.length - 1], me = window.QHWallet.current();
          on("sent", { hash: h, kind: "swap", n: 1, i: 1, oneclick: true });
          return (me && me.provider ? window.QHSign.receipt(me.provider, h) : Promise.resolve(null)).then(function (rc) { return { hash: h, confirmed: !!rc, oneclick: true }; });
        }
        return window.QHWallet.ensure("evm").then(function (me) {
          if (!me) throw new Error("Connect a wallet to trade.");
          return window.QHLive.prepareTrade({ chain: t.chainId, token: t.address, side: side, amountIn: wei, slippageBps: SLIP_BPS, trader: me.address }).then(function (p) {
            if (!p.ok || !p.body || !Array.isArray(p.body.transactions)) throw new Error((p.body && (p.body.error || p.body.message)) || "Could not prepare this trade.");
            return window.QHSign.evm({ provider: me.provider, from: me.address, chainId: t.chainId, txs: p.body.transactions, on: on });
          }).then(function (x) { return { hash: x.hashes[x.hashes.length - 1], confirmed: true }; });
        });
      });
    }
    return job.then(function (res) {
      try {
        window.dispatchEvent(new CustomEvent("qh-traded", { detail: { chainId: t.chainId, token: t.address, key: t.key, href: t.href, symbol: t.symbol, side: side,
          amount: a, unit: unit(t, side), hash: res.hash, confirmed: res.confirmed, oneclick: !!res.oneclick, price: t.price } }));
      } catch (x) {}
      return res;
    });
  }

  window.QHTrade = { FEE: FEE, BACK: BACK, SLIP_BPS: SLIP_BPS, SOL: SOL, toWei: toWei, fromWei: fromWei, plain: plain, can: can, isSol: isSol, unit: unit, quote: quote, run: run };
})();
;
/* js/quick-sheet.js */
/* quick-sheet.js: the compact confirm sheet for a row buy when one-click is off (contract 1.2.7, 1.3.3). Written by Claude.
   Opens in place over Pulse or Discover: amount, estimate, QHooks fee and cashback, one Confirm button. It shows the
   quote that was read on hover; if none is ready it asks for one only after it is on screen. Enter confirms, Esc closes.
   Uses the connect sheet's frame (wc-scrim / wc-sheet from wallet-connect.js). No template literals. */
(function () {
  "use strict";
  var F = window.QHFmt, R = window.QHTrade, root = null, cur = null, seq = 0;

  function line(k, v, c) { return '<div class="qbs-line' + (c ? " " + c : "") + '"><span>' + k + "</span><b>" + v + "</b></div>"; }
  function build() {
    root = document.createElement("div"); root.className = "wc-scrim qbs-scrim"; root.hidden = true;
    root.innerHTML = '<div class="wc-sheet qbs-sheet" role="dialog" aria-modal="true" aria-label="Confirm buy"><div class="wc-head"><b class="qbs-title"></b>' +
      '<button type="button" class="wc-x" aria-label="Close">×</button></div><div class="qbs-body"></div><div class="qbs-est" role="status" aria-live="polite"></div>' +
      '<button type="button" class="qbs-go">Confirm</button><div class="qbs-foot"></div></div>';
    root.addEventListener("click", function (e) {
      if (e.target === root || e.target.closest(".wc-x")) { close(); return; }
      if (e.target.closest(".qbs-go")) { var c = cur; close(); if (c) c.confirm(); return; }
      if (e.target.closest(".qbs-oc")) { close(); if (window.QHOneClick) window.QHOneClick.open(); }
    });
    document.addEventListener("keydown", function (e) {
      if (!root || root.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "Enter" && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) { e.preventDefault(); var c = cur; close(); if (c) c.confirm(); }
    });
    window.addEventListener("hashchange", close);
    document.body.appendChild(root);
  }
  function close() { if (root) root.hidden = true; cur = null; seq++; }

  function amountLine(o) {
    var u = R.unit(o.t, "buy"), usd = o.usd != null ? o.usd : o.usdLater ? o.usdLater() : null;
    return F.esc(o.amount) + " " + F.esc(u) + (usd != null ? ' <small class="qbs-usd">' + F.usd(usd) + "</small>" : "");
  }
  function feeLines(o) {
    var u = F.esc(R.unit(o.t, "buy")), a = parseFloat(o.amount), cb = window.QHBlocks && window.QHBlocks.CASHBACK;
    if (R.isSol(o.t)) return cb ? '<div class="qbs-note">' + F.esc(cb) + "</div>" : "";
    return line("QHooks fee (1%)", F.num(a * R.FEE) + " " + u) + line("Cashback (30% of the fee)", "−" + F.num(a * R.FEE * R.BACK) + " " + u, "qbs-good");
  }
  function estimate(o, q) {
    var sym = F.esc(o.t.symbol || "");
    if (!q) return line("You get ≈", '<span class="qbs-mut">Getting a quote</span>');
    if (!q.ok) return line("You get ≈", '<span class="qbs-mut">' + F.esc(q.error === "connect" ? "Shows once Phantom is connected" : q.error || "No quote right now") + "</span>");
    var got = q.out != null ? F.num(q.out) + " " + sym + (q.outUsd ? ' <small class="qbs-usd">' + F.usd(q.outUsd) + "</small>" : "") : F.usd(q.outUsd) + " of " + sym;
    return line("You get ≈", got) + (q.min != null ? line("Min received", F.num(q.min) + " " + sym) : "") + (F.ok(q.impact) ? line("Price impact", F.pct(Math.abs(q.impact))) : "");
  }
  /* o: {t, amount, usd, quote (promise or null), later() -> promise, usdLater(), confirm()} */
  function open(o) {
    if (!root) build();
    cur = o; var my = ++seq, t = o.t;
    root.querySelector(".qbs-title").textContent = "Buy " + (t.symbol || "token") + (t.chain ? " · " + t.chain : "");
    root.querySelector(".qbs-body").innerHTML = line("You pay", amountLine(o)) + feeLines(o) + line("Slippage", "1%");
    var est = root.querySelector(".qbs-est"); est.innerHTML = estimate(o, null);
    var go = root.querySelector(".qbs-go"); go.textContent = "Confirm buy · " + o.amount + " " + R.unit(t, "buy");
    var oc = window.QHOneClick && !window.QHOneClick.off() && !R.isSol(t);
    root.querySelector(".qbs-foot").innerHTML = (oc ? '<button type="button" class="qbs-oc">Turn on one-click</button> to skip this step next time. ' : "") + "Your wallet asks before anything is sent.";
    root.hidden = false;
    try { go.focus({ preventScroll: true }); } catch (e) {}
    function fill(q) { if (my !== seq || !root || root.hidden) return; est.innerHTML = estimate(o, q); root.querySelector(".qbs-body .qbs-line b").innerHTML = amountLine(o); }
    var p = o.quote;
    if (p) p.then(fill);
    else if (o.later) setTimeout(function () { if (my !== seq) return; var x = o.later(); if (x) x.then(fill); else fill({ ok: false, error: "connect" }); }, 0);
  }

  var css = document.createElement("style");
  css.textContent = ".qbs-sheet{width:360px}.qbs-body,.qbs-est{display:flex;flex-direction:column;gap:2px;margin-top:6px}" +
    ".qbs-line{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:13px;min-height:24px}.qbs-line span{color:var(--mut)}" +
    ".qbs-line b{font-weight:600;font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}.qbs-usd,.qbs-mut{color:var(--mut);font-weight:400;font-size:12px}" +
    ".qbs-good b{color:var(--up)}.qbs-note{font-size:12px;color:var(--mut);margin:2px 0}.qbs-est{border-top:1px solid var(--line);padding-top:6px}" +
    ".qbs-go{width:100%;min-height:48px;margin-top:12px;border:0;border-radius:8px;background:var(--up);color:#04140c;font:inherit;font-size:15px;font-weight:700;cursor:pointer}" +
    ".qbs-go:focus-visible{outline:2px solid var(--tx);outline-offset:2px}.qbs-foot{font-size:11px;color:var(--mut);margin-top:8px;line-height:1.5}" +
    ".qbs-oc{background:none;border:0;padding:0;color:var(--acc);font:inherit;text-decoration:underline;cursor:pointer;min-height:24px}" +
    "@media (max-width:767px){.qbs-sheet{width:100%}.qbs-oc{min-height:44px}}";
  document.head.appendChild(css);
  window.QHQuickSheet = { open: open, close: close };
})();
;
/* js/quick-buy.js */
/* quick-buy.js: the row buy button on Pulse and Discover trades in place (contract 1.2.7, 1.3.3). Written by Claude.
   - Amount: each Pulse column's Buy box with presets P1-P3 (three remembered amounts per column, in the chain's own
     unit). Discover uses the amount last set on Pulse. Remembered in localStorage "qh-qb-<column>" and "qh-qb-last".
   - Tap: one-click on (EVM) -> trades at once, toast only. Wallet connected, one-click off -> the confirm sheet
     (quick-sheet.js). No wallet -> the Connect sheet in place, then the same buy carries on. Never leaves the page.
   - Speed: the quote is read on hover or touchstart (kept 15 s) and the native price once a minute, so the sheet opens
     with nothing to wait for. Opening the sheet sends no request of its own.
   - Every trade goes through QHTrade.run (trade-run.js), the same path as the token page panel. */
(function () {
  "use strict";
  var F = window.QHFmt, R = window.QHTrade, DEF = ["0.01", "0.05", "0.1"], COLS = ["new", "final", "migrated"], cache = {}, nat = null;

  function load(col) {
    try { var s = JSON.parse(localStorage.getItem("qh-qb-" + col) || "null"); if (s && s.a && s.a.length === 3 && s.p >= 0 && s.p < 3) return s; } catch (e) {}
    return { p: 0, a: DEF.slice(0) };
  }
  function store(col, s) { try { localStorage.setItem("qh-qb-" + col, JSON.stringify(s)); localStorage.setItem("qh-qb-last", s.a[s.p]); } catch (e) {} }
  function valid(v) { v = String(v || "").trim(); return /^\d*\.?\d+$|^\d+\.$/.test(v) && parseFloat(v) > 0 ? v.replace(/\.$/, "") : null; }
  function last() { var v = null; try { v = valid(localStorage.getItem("qh-qb-last")); } catch (e) {} return v || DEF[0]; }
  function colOf(el) { return el && el.closest ? el.closest(".pulse-col") : null; }
  function amount(btn) {
    var c = colOf(btn), i = c && c.querySelector(".pulse-quick-buy-input");
    return (i && valid(i.value)) || last();
  }
  function relabel(scope, amt) {
    if (!scope) return; amt = amt || (colOf(scope.querySelector(".pulse-buy-btn")) ? amount(scope.querySelector(".pulse-buy-btn")) : last());
    scope.querySelectorAll(".pulse-buy-btn").forEach(function (b) {
      var txt = amt + " " + (b.getAttribute("data-unit") || "ETH");
      if (b.textContent !== txt) { b.textContent = txt; b.setAttribute("aria-label", "Buy " + txt); }
    });
  }
  function mountPulse(root) {
    COLS.forEach(function (n) {
      var c = root.querySelector(".pulse-col-" + n); if (!c) return;
      var s = load(n), inp = c.querySelector(".pulse-quick-buy-input"), ps = c.querySelectorAll(".pulse-preset");
      if (!inp) return;
      inp.value = s.a[s.p]; inp.setAttribute("aria-label", "Buy amount for this column");
      function mark() { ps.forEach(function (b, i) { b.classList.toggle("active", i === s.p); b.title = "Preset " + (i + 1) + ": " + s.a[i]; b.setAttribute("aria-pressed", String(i === s.p)); }); }
      ps.forEach(function (b, i) { b.type = "button"; b.addEventListener("click", function () { s.p = i; inp.value = s.a[i]; store(n, s); mark(); relabel(c, s.a[i]); }); });
      inp.addEventListener("input", function () { var v = valid(inp.value); if (!v) return; s.a[s.p] = v; store(n, s); mark(); relabel(c, v); });
      mark(); relabel(c, s.a[s.p]);
    });
  }

  /* The token behind a button: rows link to #/token/<chain>/<address>. Null for sample rows. */
  function tokenOf(btn) {
    var L = window.QHLive; if (!L || !btn) return null;
    var href = btn.getAttribute("data-href") || "", m = /^#\/token\/([^/]+)\/([^/?]+)/.exec(href), addr = btn.getAttribute("data-addr");
    return m ? L.find(decodeURIComponent(m[1]), decodeURIComponent(m[2])) : addr ? L.find(addr) : null;
  }
  function natives() {
    if (!nat || Date.now() - nat.at > 60000) { var n = nat = { at: Date.now(), v: nat && nat.v }; n.p = window.QHLive.natives().then(function (x) { n.v = x; return x; }); }
    return nat.p;
  }
  function usdOf(t, a) { var u = R.unit(t, "buy"), p = nat && nat.v && nat.v[u]; return p ? parseFloat(a) * p : null; }
  function solReady() { var c = window.QHWallet.current(); return !!(c && c.family === "solana"); }
  /* Cached quote promise for this token and amount, read now if missing. */
  function quoteFor(t, a) {
    if (!R.can(t)) return null;
    var k = t.key + "|" + a, c = cache[k];
    if (c && Date.now() - c.at < 15000) return c.p;
    if (R.isSol(t) && !solReady()) return null;
    var p = R.quote(t, "buy", a); cache[k] = { at: Date.now(), p: p };
    p.then(function (q) { if (!q.ok) delete cache[k]; });
    return p;
  }
  function prefetch(btn) { var t = tokenOf(btn); if (!t || !R.can(t)) return; natives(); quoteFor(t, amount(btn)); }

  function family(t) { return R.isSol(t) ? "solana" : "evm"; }
  function ready(t) { var c = window.QHWallet.current(); return !!(c && c.family === family(t) && (c.provider || c.wallet)); }
  function oneClickOn(t) { return !R.isSol(t) && window.QHOneClick && !window.QHOneClick.off() && window.QHOneClick.isOn(); }

  function tap(btn) {
    var t = tokenOf(btn), a = amount(btn);
    if (!t || !R.can(t)) { var h = btn.getAttribute("data-href"); if (h) location.hash = h; return; }
    if (ready(t)) { go(t, a); return; }
    window.QHWallet.ensure(family(t)).then(function (me) {
      if (!me) return;
      /* Just connected: read the one-click setting once, then carry on with the same buy. */
      (window.QHOneClick && !R.isSol(t) ? window.QHOneClick.status() : Promise.resolve(null)).then(function () { go(t, a); }, function () { go(t, a); });
    });
  }
  function go(t, a) {
    if (oneClickOn(t)) { send(t, a); return; }
    var q = cache[t.key + "|" + a];
    window.QHQuickSheet.open({ t: t, amount: a, usd: usdOf(t, a), quote: q && Date.now() - q.at < 15000 ? q.p : null,
      later: function () { natives(); return quoteFor(t, a); },
      usdLater: function () { return usdOf(t, a); }, confirm: function () { send(t, a); } });
  }
  /* Sends the buy and reports it in a toast: submitted, filled with a tx link, or the exact reason with Retry. */
  function send(t, a) {
    var u = R.unit(t, "buy"), tt = window.QHSign.toast({ title: "Buy " + a + " " + u + " of " + (t.symbol || "token"), chainId: t.chainId }), oc = oneClickOn(t);
    function retry() { go(t, a); }
    if (oc) {
      tt.set("submitted", { text: "Sending with one-click" });
      var usd = usdOf(t, a);
      window.QHOneClick.status().then(function (st) {
        if (st && st.perTradeUsd && usd != null && usd > st.perTradeUsd) {
          tt.set("failed", { text: "Over your one-click limit of $" + st.perTradeUsd + " per trade (this buy is about " + F.usd(usd) + "). Lower the amount or raise your limit.", retry: retry });
          return;
        }
        run();
      });
      return;
    }
    tt.set("submitted", { text: R.isSol(t) ? "Getting the route" : "Preparing" });
    run();
    function run() {
      R.run({ t: t, side: "buy", amount: a, on: function (s, d) {
        if (s === "route") tt.set("submitted", { text: "Getting the route" });
        if (s === "sign") tt.set("submitted", { text: d.n > 1 ? "Sign " + d.i + " of " + d.n + " in your wallet" + (d.kind === "approve" ? " · approval" : "") : "Sign in your wallet" });
        if (s === "sending") tt.set("submitted", { text: "Sending" });
        if (s === "sent") tt.set("submitted", { text: d.oneclick ? "Submitted with one-click" : d.kind === "approve" ? "Approval submitted" : "Submitted", hash: d.hash });
      } }).then(function (x) {
        tt.set(x.confirmed ? "confirmed" : "submitted", { text: x.confirmed ? "Filled" : "Sent, still confirming", hash: x.hash });
      }).catch(function (err) {
        tt.set("failed", { text: window.QHSign.reason(err), hash: err && err.hash, retry: retry });
      });
    }
  }

  function onHover(e) { var b = e.target && e.target.closest && e.target.closest(".pulse-buy-btn"); if (b && !b.__qbp) { b.__qbp = 1; setTimeout(function () { b.__qbp = 0; }, 4000); prefetch(b); } }
  document.addEventListener("pointerover", onHover, true);
  document.addEventListener("touchstart", onHover, { capture: true, passive: true });

  window.QHQuickBuy = { tap: tap, prefetch: prefetch, amount: function (btn) { return btn ? amount(btn) : last(); }, relabel: relabel, mountPulse: mountPulse, tokenOf: tokenOf };
})();
;
/* js/position-chip.js */
/* position-chip.js: after a trade fills, the position shows at once, wherever the trade came from (contract 1.2.7, 1.3.3). Written by Claude.
   - On "qh-traded" (from trade-run.js) the wallet's live holdings are read once (QHLive.holdings, fresh). Not polled:
     the next read is the next trade, or the Refresh button.
   - A small floating chip (any screen) and a box in the token page trade panel: size, value, PnL since entry, and
     Sell 25 / 50 / 100 through QHTrade.run (one-click when on, otherwise the wallet asks).
   - PnL: the server's cost basis when it has one; otherwise the buys made in this tab (amount x native price at the
     time), kept in sessionStorage "qh-entry". Never invented: with neither, PnL shows a dash. */
(function () {
  "use strict";
  var F = window.QHFmt, R = window.QHTrade, pos = null, chip = null, entry = {}, readSeq = 0;
  try { entry = JSON.parse(sessionStorage.getItem("qh-entry") || "{}") || {}; } catch (e) { entry = {}; }

  function same(a, b, chainId) { return chainId === "solana" ? a === b : String(a || "").toLowerCase() === String(b || "").toLowerCase(); }
  function tokenFor(d) {
    var t = window.QHLive.find(d.chainId, d.token);
    return t || { chainId: d.chainId, address: d.token, key: d.key || d.chainId + ":" + d.token, symbol: d.symbol, href: d.href, native: window.QHNorm.chain(d.chainId).native };
  }
  function saveEntry(d) {
    if (d.side !== "buy") return;
    window.QHLive.natives().then(function (p) {
      var px = p && p[d.unit]; if (!px) return;
      var k = d.chainId + ":" + d.token, e = entry[k] || { usd: 0 }; e.usd += parseFloat(d.amount) * px; entry[k] = e;
      try { sessionStorage.setItem("qh-entry", JSON.stringify(entry)); } catch (x) {}
    });
  }
  function pnlOf(row, k) {
    if (row.pnl != null && isFinite(row.pnl)) return row.pnl;
    var e = entry[k]; return e && e.usd > 0 ? row.value - e.usd : null;
  }
  /* One holdings read for this wallet; resolves the row for the token, or null. */
  function read(t) {
    var w = window.QHWallet.address(), my = ++readSeq; if (!w) return Promise.resolve(null);
    pos = { t: t, row: pos && pos.t.key === t.key ? pos.row : null, loading: true }; paint();
    return window.QHLive.holdings(w, true).then(function (r) {
      if (my !== readSeq) return null;
      var row = r.ok ? r.rows.filter(function (x) { return !x.native && x.chainId === t.chainId && (same(x.address, t.address, t.chainId) || (t.href && x.href === t.href)); })[0] || null : null;
      pos = { t: t, row: row, ok: r.ok, loading: false }; paint(); return row;
    });
  }

  function html(p, cls) {
    var t = p.t, sym = F.esc(t.symbol || "token"), row = p.row;
    if (p.loading && !row) return '<div class="' + cls + '-h"><b>' + sym + '</b><span class="qpos-mut">Reading your position</span></div>';
    if (!row) return '<div class="' + cls + '-h"><b>' + sym + '</b><span class="qpos-mut">' + (p.ok === false ? "Position read did not answer." : "No balance shows yet. Wallet balances can lag a few seconds.") +
      '</span><button type="button" class="qpos-ref" data-pc="ref">Refresh</button></div>';
    var pnl = pnlOf(row, t.chainId + ":" + t.address), base = pnl != null ? row.value - pnl : null, pct = pnl != null && base > 0 ? pnl / base * 100 : null;
    var cl = pnl == null ? "" : pnl >= 0 ? " qpos-up" : " qpos-dn";
    return '<div class="' + cls + '-h"><b>' + sym + '</b><span class="qpos-n">' + F.num(row.amount) + '</span><span class="qpos-n">' + F.usd(row.value) + "</span>" +
      '<span class="qpos-n' + cl + '" title="Profit or loss since entry">' + (pnl == null ? "PnL —" : (pnl >= 0 ? "+" : "−") + F.usd(Math.abs(pnl)) + (pct != null ? " (" + (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(1) + "%)" : "")) + "</span></div>" +
      '<div class="qpos-sells"><span class="qpos-mut">Sell</span><button type="button" data-pc="25">25%</button><button type="button" data-pc="50">50%</button><button type="button" data-pc="100">100%</button></div>';
  }
  function onToken(t) { var m = /^#\/token\/(?:([^/?]+)\/)?([^/?]+)/.exec(location.hash); return !!m && same(decodeURIComponent(m[2]), t.address, t.chainId); }
  function paint() {
    if (!pos) return;
    if (!chip) {
      chip = document.createElement("div"); chip.className = "qpos-chip"; chip.setAttribute("role", "status"); chip.setAttribute("aria-label", "Your position");
      chip.addEventListener("click", act); document.body.appendChild(chip);
    }
    chip.innerHTML = '<a class="qpos-go" href="' + F.esc(pos.t.href || "#/portfolio") + '" aria-label="Open token page"></a>' + html(pos, "qpos") + '<button type="button" class="qpos-x" data-pc="x" aria-label="Hide position">×</button>';
    chip.hidden = false; mark();
    panel(0);
  }
  /* The token page box, in the trade panel (live-token.js renders the panel after the route changes). */
  function panel(n) {
    var old = document.querySelector(".qpos-box");
    if (!pos || !onToken(pos.t)) { if (old) old.remove(); return; }
    var p = document.querySelector(".token-trade-panel");
    if (!p) { if (n < 20) setTimeout(function () { panel(n + 1); }, 150); return; }
    var box = old && p.contains(old) ? old : document.createElement("div");
    if (box !== old) { if (old) old.remove(); box.className = "qpos-box"; box.addEventListener("click", act); var st = p.querySelector(".tp-stats"); if (st) p.insertBefore(box, st); else p.appendChild(box); }
    box.innerHTML = '<div class="qpos-lab">Your position</div>' + html(pos, "qpos");
  }
  function act(e) {
    var b = e.target.closest("[data-pc]"); if (!b || !pos) return;
    var k = b.getAttribute("data-pc");
    if (k === "x") { chip.hidden = true; return; }
    if (k === "ref") { read(pos.t); return; }
    sell(pos.t, pos.row, Number(k));
  }
  function sell(t, row, pct) {
    if (!row) return;
    var a = R.plain(pct === 100 ? row.amount : row.amount * pct / 100, 8), tt = window.QHSign.toast({ title: "Sell " + pct + "% of " + (t.symbol || "token"), chainId: t.chainId });
    if (!a) { tt.set("failed", { text: "This position is too small to sell from here." }); return; }
    tt.set("submitted", { text: "Preparing" });
    R.run({ t: t, side: "sell", amount: a, on: function (s, d) {
      if (s === "sign") tt.set("submitted", { text: d.n > 1 ? "Sign " + d.i + " of " + d.n + " in your wallet" + (d.kind === "approve" ? " · approval" : "") : "Sign in your wallet" });
      if (s === "sent") tt.set("submitted", { text: d.oneclick ? "Submitted with one-click" : d.kind === "approve" ? "Approval submitted" : "Submitted", hash: d.hash });
    } }).then(function (x) { tt.set(x.confirmed ? "confirmed" : "submitted", { text: x.confirmed ? "Filled" : "Sent, still confirming", hash: x.hash }); })
      .catch(function (err) { tt.set("failed", { text: window.QHSign.reason(err), hash: err && err.hash, retry: function () { sell(t, row, pct); } }); });
  }

  window.addEventListener("qh-traded", function (e) {
    var d = e.detail || {}; if (!d.chainId || !d.token) return;
    saveEntry(d); read(tokenFor(d));
  });
  /* On the same token's page the panel box shows it, so the chip steps aside on desktop. */
  function mark() { if (!chip || !pos) return; chip.classList.toggle("qpos-tok", location.hash.indexOf("#/token/") === 0); chip.classList.toggle("qpos-same", onToken(pos.t)); }
  window.addEventListener("hashchange", function () { if (!pos) return; mark(); panel(0); });

  var css = document.createElement("style");
  css.textContent = "@media (min-width:768px){.qpos-chip.qpos-same{display:none}}.qpos-chip{position:fixed;left:16px;bottom:44px;z-index:84;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:6px 6px 6px 12px;" +
    "background:var(--s1);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:12px;color:var(--tx)}.qpos-chip[hidden]{display:none}" +
    ".qpos-go{position:absolute;inset:0;z-index:0}.qpos-chip>div,.qpos-chip>button{position:relative;z-index:1}" +
    ".qpos-h{display:flex;align-items:center;gap:10px;min-width:0;white-space:nowrap}.qpos-h b{font-weight:700}.qpos-n{font-variant-numeric:tabular-nums}.qpos-mut{color:var(--mut);white-space:normal}" +
    ".qpos-up{color:var(--up)}.qpos-dn{color:var(--dn)}.qpos-sells{display:flex;align-items:center;gap:4px}" +
    ".qpos-sells button,.qpos-ref{height:28px;padding:0 8px;border:1px solid rgba(242,105,92,.4);background:rgba(242,105,92,.1);color:var(--dn);border-radius:6px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}" +
    ".qpos-ref{border-color:var(--line);background:var(--s2);color:var(--tx)}.qpos-x{width:32px;height:32px;border:0;background:none;color:var(--mut);font-size:18px;cursor:pointer}" +
    ".qpos-box{margin:10px 0 4px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--s2);display:flex;flex-direction:column;gap:6px;font-size:12px}" +
    ".qpos-lab{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.qpos-box .qpos-h{flex-wrap:wrap;white-space:normal}" +
    "@media (max-width:767px){.qpos-chip{left:16px;right:16px;bottom:64px;flex-wrap:wrap;gap:6px;padding:6px 6px 6px 10px}.qpos-chip.qpos-tok{bottom:128px}" +
    ".qpos-chip .qpos-h{flex:1 1 auto;flex-wrap:wrap;gap:8px}.qpos-chip .qpos-sells{flex:1 1 100%}.qpos-sells button,.qpos-ref{height:44px;flex:1}.qpos-x{width:44px;height:44px;position:absolute!important;top:0;right:0}.qpos-chip .qpos-h{padding-right:40px}}";
  document.head.appendChild(css);
  window.QHPosition = { read: function (t) { return read(t); }, current: function () { return pos; } };
})();
;
/* js/token.js */
/**
 * Token page module.
 *
 * Builds the token detail page with header stats strip, candlestick chart,
 * trades table, trade panel with Buy/Sell, and QProof panel.
 *
 * Styles live in app/styles.css under ".token-" prefix.
 * Data comes from app/js/data.js via import.
 *
 * Route: #/token/<address>
 *
 * No external dependencies — pure DOM + app/ code only.
 */

window.Token = (function () {
  "use strict";

  /* ── Colour tokens (QHooks palette) ─────────────────────────────── */
  var C = {
    bg:       "#0b0c0e",
    surface1: "#121419",
    surface2: "#171a20",
    line:     "#23262d",
    text:     "#e8eaed",
    muted:    "#8a8f98",
    up:       "#4cc38a",
    dn:       "#f2695c",
    acc:      "#d2ad72",
  };

  /* ── Timeframes ──────────────────────────────────────────────────── */
  var TIMEFRAMES = ["1s", "1m", "5m", "15m", "1h", "4h", "1D"];

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;");
  }

  function compactUSD(val) {
    if (val == null) return "$0";
    var abs = Math.abs(val);
    if (abs >= 1000000000) {
      return "$" + (val / 1000000000).toFixed(abs >= 10000000000 ? 0 : 1) + "B";
    }
    if (abs >= 1000000) {
      return "$" + (val / 1000000).toFixed(abs >= 10000000 ? 0 : 1) + "M";
    }
    if (abs >= 1000) {
      return "$" + (val / 1000).toFixed(abs >= 10000 ? 1 : 2) + "K";
    }
    return "$" + val.toFixed(2);
  }

  function compactAge(sec) {
    if (sec == null) return "0s";
    var abs = Math.abs(Math.floor(sec));
    if (abs < 60) return abs + "s";
    if (abs < 3600) return Math.floor(abs / 60) + "m";
    if (abs < 86400) return Math.floor(abs / 3600) + "h";
    return Math.floor(abs / 86400) + "d";
  }

  function shortAddr(addr) {
    if (!addr || addr.length <= 10) return addr || "";
    return addr.slice(0, 6) + "\u2026" + addr.slice(-4);
  }

  function formatTime(ts) {
    var d = new Date(ts);
    return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function calcPnL(bought, current) {
    if (!bought || !current || bought <= 0) return 0;
    return ((current - bought) / bought) * 100;
  }

  function renderQProofChip(verdict) {
    var color;
    var bg;
    switch (verdict) {
      case "Clear": color = C.up; bg = "rgba(76,195,138,0.15)"; break;
      case "Watch": color = C.acc; bg = "rgba(210,173,114,0.15)"; break;
      case "Danger": color = C.dn; bg = "rgba(242,105,92,0.15)"; break;
      default: color = C.muted; bg = "rgba(138,143,152,0.15)";
    }
    return "<span class='token-qproof' style='color:" + color + ";background:" + bg + "'>" + verdict + "</span>";
  }

  /* ── Chart rendering (canvas candlestick) ────────────────────────── */
  function renderChart(canvas, candles, width, height, mode) {
    if (!candles || candles.length === 0) return;

    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1; /* Claude: sharp axis text on retina, drawn at real size */
    if (canvas.clientWidth > 0) { width = canvas.clientWidth; height = canvas.clientHeight || height; }
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var padding = 40;
    var chartW = width - padding * 2;
    var chartH = height - padding * 2;

    // Determine min/max
    var min = Infinity, max = -Infinity;
    candles.forEach(function(c) {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    });
    var range = max - min;
    if (range === 0) { range = 1; max = min + 1; }

    var barW = chartW / candles.length;
    var priceScale = chartH / range;

    // Background
    ctx.fillStyle = C.surface1;
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var y = padding + (chartH / 5) * i;
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
    }
    ctx.stroke();

    // Draw candles
    candles.forEach(function(c, i) {
      var x = padding + i * barW;
      var yHigh = padding + chartH - (c.high - min) * priceScale;
      var yLow = padding + chartH - (c.low - min) * priceScale;
      var yOpen = padding + chartH - (c.open - min) * priceScale;
      var yClose = padding + chartH - (c.close - min) * priceScale;

      var color = c.close >= c.open ? C.up : C.dn;
      var barH = Math.abs(yClose - yOpen);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, yHigh);
      ctx.lineTo(x + barW / 2, yLow);
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      if (barH === 0) barH = 1;
      ctx.fillRect(x + 1, Math.min(yOpen, yClose), barW - 2, barH);
    });

    // Y-axis labels
    ctx.fillStyle = C.muted;
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    for (var j = 0; j < 5; j++) {
      var val = max - (range / 5) * j;
      var y = padding + (chartH / 5) * j;
      ctx.fillText(compactUSD(val), padding - 5, y + 4);
    }
  }

  /* ── Render header stats strip ───────────────────────────────────── */
  function renderHeader(token) {
    var ageSec = token.ageSec || 0;
    var price = token.price || 0;
    var mcap = token.mcap || 0;

    return (
      "<div class='token-header'>" +
        "<div class='token-header-top'>" +
          "<div class='token-header-left'>" +
            "<div class='token-avatar' style='background:" + token.tileColor + "'>" +
              token.symbol.charAt(0) + "</div>" +
            "<div class='token-title'>" +
              "<span class='token-symbol'>" + esc(token.symbol) + "</span>" +
              "<span class='token-name'>" + esc(token.name) + "</span>" +
            "</div>" +
            "<div class='token-meta'>" +
              "<span class='token-age'>" + compactAge(ageSec) + "</span>" +
              "<span class='token-socials'>" +
                "<a href='#' class='token-social' title='Website'>\u2022</a>" +
                "<a href='#' class='token-social' title='X'>\u2022</a>" +
                "<a href='#' class='token-social' title='Search'>\u2022</a>" +
              "</span>" +
            "</div>" +
          "</div>" +
          "<div class='token-qproof'>" + renderQProofChip(token.qProof) + (window.HookBadge ? " " + window.HookBadge.html(token) : "") + "</div>" +
        "</div>" +
        "<div class='token-stats-row'>" +
          "<div class='token-stat'><div class='token-stat-label'>Price</div><div class='token-stat-value'>" + compactUSD(price) + "</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>MC</div><div class='token-stat-value' style='color:" + (mcap >= 10000000 ? C.up : mcap >= 1000000 ? C.acc : C.muted) + "'>" + compactUSD(mcap) + "</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Liquidity</div><div class='token-stat-value'>" + compactUSD(token.liquidity || 0) + "</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Supply</div><div class='token-stat-value'>100M</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Fees</div><div class='token-stat-value'>12.5K</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>Bonding</div><div class='token-stat-value'>23%</div></div>" +
          "<div class='token-stat'><div class='token-stat-label'>ATH</div><div class='token-stat-value'>$0.0021</div></div>" +
        "</div>" +
      "</div>"
    );
  }

  /* ── Render chart area ───────────────────────────────────────────── */
  var currentTF = "1m";
  var chartMode = "Price"; // Price or MC

  function renderChartArea(token) {
    currentTF = "1m";
    chartMode = "Price";

    var tfButtons = TIMEFRAMES.map(function(tf) {
      return "<button class='token-tf-btn' data-tf='" + tf + "'>" + tf + "</button>";
    }).join("");

    return (
      "<div class='token-chart-section'>" +
        "<div class='token-chart-header'>" +
          "<div class='token-chart-tfs'>" + tfButtons + "</div>" +
          "<button class='token-chart-mode' data-mode='Price'>Price</button>" +
        "</div>" +
        "<div class='token-chart-container'>" +
          "<canvas class='token-canvas'></canvas>" +
        "</div>" +
      "</div>"
    );
  }

  /* ── Render bottom tabs ──────────────────────────────────────────── */
  function renderBottomTabs() {
    var tabs = [
      { label: "Trades", id: "trades" },
      { label: "Positions", id: "positions" },
      { label: "Orders", id: "orders" },
      { label: "Holders (124)", id: "holders" },
      { label: "Top traders", id: "toptraders" },
      { label: "Early buyers", id: "earlybuyers" },
      { label: "Dev tokens", id: "devtokens" },
    ];

    return (
      "<div class='token-tabs'>" +
        tabs.map(function(t) {
          return "<div class='token-tab " + (t.id === "trades" ? "active" : "") + "' data-tab='" + t.id + "'>" + t.label + "</div>";
        }).join("") +
      "</div>"
    );
  }

  /* ── Render trades table ─────────────────────────────────────────── */
  function renderTradesTable(trades) {
    if (!trades || trades.length === 0) {
      return "<div class='token-no-data'>No trades yet</div>";
    }

    var rows = trades.slice(0, 20).map(function(trade) {
      var typeClass = trade.type === "buy" ? "token-buy" : "token-sell";
      var typeIcon = trade.type === "buy" ? "\u25b2" : "\u25bc";
      var age = compactAge((Date.now() - trade.time) / 1000);

      return (
        "<tr class='token-trade-row " + typeClass + "'>" +
          "<td class='token-age-cell'>" + age + "</td>" +
          "<td class='token-type-cell " + typeClass + "'>" + typeIcon + " " + trade.type + "</td>" +
          "<td class='token-price-cell'>" + compactUSD(trade.price) + "</td>" +
          "<td class='token-amount-cell'>" + trade.amount + "</td>" +
          "<td class='token-usd-cell'>" + compactUSD(trade.usd) + "</td>" +
          "<td class='token-trader-cell'>" + "<a class='q-addr-link' href='#/wallet/" + trade.trader + "'>" + shortAddr(trade.trader) + "</a>" + "</td>" +
        "</tr>"
      );
    }).join("");

    return (
      "<div class='token-trades-table-container'>" +
        "<table class='token-trades-table'>" +
          "<thead>" +
            "<tr>" +
              "<th>Age</th>" +
              "<th>Type</th>" +
              "<th>Price</th>" +
              "<th class='token-amount-cell'>Amount</th>" +
              "<th>USD</th>" +
              "<th>Trader</th>" +
            "</tr>" +
          "</thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>" +
      "</div>"
    );
  }
  /* ── Trade panel (closed out by Claude after the file was truncated) ── */
  function renderTradePanel(token) {
    var amounts = ["0.25", "0.5", "1", "2.5"].map(function (a) {
      return '<button class="tp-amt">' + a + "</button>";
    }).join("");
    return (
      '<aside class="token-trade-panel">' +
        '<div class="tp-side"><button class="tp-buy active">Buy</button><button class="tp-sell">Sell</button></div>' +
        '<div class="tp-tabs"><button class="active">Market</button><button>Limit</button><button>Adv.</button></div>' +
        '<label class="tp-label">Amount</label><input class="tp-input" placeholder="0.0" inputmode="decimal">' +
        '<div class="tp-amts">' + amounts + "</div>" +
        '<div class="tp-meta"><span>Slippage 20%</span><span>Priority 0.001</span></div>' +
        '<button class="tp-go">Buy ' + esc(token.symbol) + '</button>' +
        '<div class="tp-cashback">30% back on this trade</div>' +
        '<div class="tp-stats"><div>Bought<b>0</b></div><div>Sold<b>0</b></div><div>Holding<b>0</b></div><div>PnL<b>+0%</b></div></div>' +
        '<div class="tp-presets"><button class="active">PRESET 1</button><button>PRESET 2</button><button>PRESET 3</button></div>' +
      "</aside>"
    );
  }

  function renderQProofPanel(token) {
    return (
      '<section class="token-qproof"><div class="tq-head">QProof ' + renderQProofChip(token.qProof || token.qproof || "Not checked") + "</div>" +
        '<ul class="tq-checks"><li>Sell test<span>evidence</span></li><li>Taxes<span>evidence</span></li>' +
        "<li>LP lock<span>evidence</span></li><li>Top 10 holders<span>evidence</span></li></ul></section>"
    );
  }

  function render(root, token) {
    root.innerHTML =
      '<div class="token-page">' +
        '<div class="token-main">' + renderHeader(token) + renderChartArea(token) + renderBottomTabs() + renderTradesTable(token.trades || []) + "</div>" +
        '<div class="token-side">' + renderTradePanel(token) + renderQProofPanel(token) + "</div>" +
      "</div>";
    var canvas = root.querySelector("canvas");
    if (canvas && token.candles) renderChart(canvas, token.candles, canvas.clientWidth || 800, canvas.clientHeight || 360, "price");
  }

  return { render: render, renderTradePanel: renderTradePanel, renderQProofPanel: renderQProofPanel };
})();
;
/* js/trade-panel.js */
/* Live trade estimate (contract 1.4.11) + trade feedback states (1.2.7).
   Written by Claude. Fixture math until real quotes are wired:
   native price NATIVE_USD, QHooks router fee 1%, cashback 30% of that fee,
   network fee NET_FEE native, price impact = order USD / liquidity. */
window.TradeEstimate = (function () {
  "use strict";
  var NATIVE_USD = 3000, ROUTER_FEE = 0.01, CASHBACK = 0.30, NET_FEE = 0.0004, SLIP = 0.20;

  function usd(v) {
    if (!isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(2) + "K";
    if (a >= 1) return "$" + v.toFixed(2);
    return "$" + v.toFixed(4);
  }
  function num(v) {
    if (!isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(2) + "K";
    return v.toFixed(a >= 1 ? 2 : 6);
  }
  function line(label, value, cls) {
    return '<div class="te-line' + (cls ? " " + cls : "") + '"><span>' + label + "</span><b>" + value + "</b></div>";
  }

  function compute(tok, amt, side) {
    var price = Number(tok.price) || 0, liq = Number(tok.liquidity) || 0, supply = Number(tok.supply) || 1e8;
    var orderUsd = amt * NATIVE_USD;
    var feeNative = amt * ROUTER_FEE, back = feeNative * CASHBACK;
    var impact = liq > 0 ? (orderUsd / liq) * 100 : NaN;
    var effPrice = price * (1 + (isFinite(impact) ? impact / 100 : 0) * (side === "buy" ? 1 : -1));
    var tokens = effPrice > 0 ? (orderUsd - feeNative * NATIVE_USD) / effPrice : NaN;
    return {
      orderUsd: orderUsd, feeNative: feeNative, back: back, impact: impact, tokens: tokens,
      minTokens: tokens * (1 - SLIP), total: amt + NET_FEE, share: tokens / supply * 100, effPrice: effPrice
    };
  }

  function render(box, tok, amt, side) {
    if (!(amt > 0)) { box.innerHTML = '<div class="te-empty">Enter an amount to see what you get</div>'; return; }
    var r = compute(tok, amt, side), sym = tok.symbol || "";
    var h = side === "buy"
      ? line("You receive ≈", num(r.tokens) + " " + sym + " (" + usd(r.tokens * r.effPrice) + ")") + line("Min received", num(r.minTokens) + " " + sym)
      : line("You receive ≈", num(amt * (1 - ROUTER_FEE)) + " ETH (" + usd(amt * (1 - ROUTER_FEE) * NATIVE_USD) + ")");
    h += line("Price impact", isFinite(r.impact) ? r.impact.toFixed(2) + "%" : "—", r.impact >= 5 ? "te-bad" : "");
    h += line("QHooks fee (1%)", num(r.feeNative) + " ETH · " + usd(r.feeNative * NATIVE_USD));
    h += line("Network fee", num(NET_FEE) + " ETH · " + usd(NET_FEE * NATIVE_USD));
    h += line("Cashback (30%)", "−" + num(r.back) + " ETH · " + usd(r.back * NATIVE_USD), "te-good");
    h += line("Total", num(r.total) + " ETH · " + usd(r.total * NATIVE_USD), "te-total");
    if (side === "buy") h += line("Position", num(r.tokens) + " " + sym + " · " + (isFinite(r.share) ? r.share.toFixed(3) : "—") + "% of supply");
    h += '<div class="te-age">Quote · <span class="te-sec">0</span>s</div>';
    box.innerHTML = h;
  }

  function toast(text) {
    var stack = document.querySelector(".te-toasts");
    if (!stack) { stack = document.createElement("div"); stack.className = "te-toasts"; document.body.appendChild(stack); }
    var t = document.createElement("div"); t.className = "te-toast"; t.textContent = text; stack.appendChild(t);
    setTimeout(function () { t.remove(); }, 5000);
  }

  function attach(root, tok) {
    var side = "buy", input = root.querySelector(".tp-input"), go = root.querySelector(".tp-go");
    var meta = root.querySelector(".tp-meta");
    if (!input || !go || !meta) return;
    var box = document.createElement("div"); box.className = "te-box"; meta.parentNode.insertBefore(box, meta.nextSibling);
    var timer = null, age = 0;
    function update() { render(box, tok, parseFloat(input.value), side); age = 0; }
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(update, 150); });
    root.querySelectorAll(".tp-amt").forEach(function (b) { b.addEventListener("click", function () { input.value = b.textContent; update(); }); });
    var buyB = root.querySelector(".tp-buy"), sellB = root.querySelector(".tp-sell");
    function setSide(s) {
      side = s; if (buyB) buyB.classList.toggle("active", s === "buy"); if (sellB) sellB.classList.toggle("active", s === "sell");
      go.classList.toggle("tp-go-sell", s === "sell"); go.textContent = (s === "buy" ? "Buy " : "Sell ") + (tok.symbol || ""); update();
    }
    if (buyB) buyB.addEventListener("click", function () { setSide("buy"); });
    if (sellB) sellB.addEventListener("click", function () { setSide("sell"); });
    setInterval(function () { age++; var s = box.querySelector(".te-sec"); if (s) s.textContent = age; if (age >= 3 && parseFloat(input.value) > 0) update(); }, 1000);
    go.addEventListener("click", function () {
      var amt = parseFloat(input.value);
      if (!(amt > 0)) { input.focus(); return; }
      var label = go.textContent, steps = ["Quoting…", "Sign in wallet…", "Sending…", "Confirming…"], i = 0;
      go.disabled = true;
      (function next() {
        if (i < steps.length) { go.textContent = steps[i++]; setTimeout(next, 450); return; }
        var r = compute(tok, amt, side);
        go.textContent = "Filled at " + usd(r.effPrice);
        toast((side === "buy" ? "Bought " : "Sold ") + num(side === "buy" ? r.tokens : amt) + " " + (tok.symbol || "") + " at " + usd(r.effPrice));
        setTimeout(function () { go.textContent = label; go.disabled = false; }, 1800);
      })();
    });
    update();
  }
  return { attach: attach, compute: compute };
})();
;
/* js/hook-blocks.js */
/* hook-blocks.js: one shared catalogue of QHooks hook blocks, used by Launch, Hook Studio and the hook page,
   so each block reads the same everywhere (contract 1.5.1-1.5.4, 1.6.4). Written by Claude.
   Money rule: rates are "set at launch" except the two approved lines (cashback, referrals). */
window.QHBlocks = (function () {
  "use strict";
  var CASHBACK = "30% back on trades · 40% on Robinhood Chain if you hold 100K QHOOKS";
  var REFERRAL = "Bring traders, get 20% of their fee";
  var B = [
    { id: "cashback", group: "rewards", name: "Cashback", when: "After swap", risk: "low",
      does: "Sends part of each trade fee back to the trader who paid it.", sees: CASHBACK,
      why: "Only pays out. It cannot block a sell or raise the fee." },
    { id: "referrals", group: "rewards", name: "Referrals", when: "After swap", risk: "low",
      does: "Pays the wallet that brought a trader a share of that trader's fees.", sees: REFERRAL,
      why: "Only pays out from the fee. Trade prices do not change." },
    { id: "antisnipe", group: "protect", name: "Anti-snipe", when: "Before swap", risk: "low",
      does: "Caps how much one wallet can buy in the first minutes, then lifts by itself.", sees: "Early buys have a size cap for a short window.",
      why: "Limits buys for a fixed window only. Sells are never limited." },
    { id: "revshare", group: "rewards", name: "Holder share", when: "After swap", risk: "low",
      does: "Routes a share of the fee to holders who stake the token.", sees: "Stakers earn from trading volume.",
      why: "Only pays out. The share is fixed at launch." },
    { id: "buyback", group: "support", name: "Buyback", when: "After swap", risk: "low",
      does: "Uses part of the fee to buy the token back from its own pool.", sees: "Fees turn into steady buys.",
      why: "Buys only. It never sells or moves holder tokens." },
    { id: "floor", group: "support", name: "Price floor", when: "Pool", risk: "medium",
      does: "Keeps a reserve that bids at a floor price under the market.", sees: "A reserve bids at the floor while it lasts.",
      why: "The floor holds only while the reserve has funds." },
    { id: "dynfee", group: "protect", name: "Busy-hour fee", when: "Before swap", risk: "medium",
      does: "Raises the fee when price swings hard and lowers it when calm, inside fixed bounds.", sees: "The fee moves inside a range shown before each trade.",
      why: "The fee can change, but never outside the bounds set at launch." },
    { id: "lock", group: "protect", name: "Supply lock", when: "Launch", risk: "low",
      does: "Locks the creator's tokens in QLocks with a public unlock date.", sees: "Creator tokens are locked until a date anyone can check.",
      why: "Removes a dump risk. Nothing to change after launch." },
    { id: "sale", group: "trading", name: "Sale tiers", when: "Launch", risk: "medium",
      does: "Sells the first supply in priced tiers before open trading starts.", sees: "Early tiers fill first, then the pool opens.",
      why: "Trading opens only after the sale ends or sells out." },
    { id: "limits", group: "trading", name: "Limit orders", when: "After swap", risk: "low",
      does: "Fills resting orders inside the pool when the price crosses them.", sees: "Set a price; it fills inside the pool.",
      why: "Fills orders only. It cannot touch other wallets." },
    { id: "arb", group: "protect", name: "Arb recapture", when: "Before swap", risk: "low",
      does: "Keeps the profit from price gaps in the pool instead of losing it to bots.", sees: "Price-gap profit stays with the pool.",
      why: "Changes who earns from gaps, not what traders pay." }
  ];
  var PRESETS = {
    standard: { label: "Standard", note: "Cashback, referrals and anti-snipe", ids: ["cashback", "referrals", "antisnipe"] },
    community: { label: "Community", note: "Standard plus a share for stakers", ids: ["cashback", "referrals", "antisnipe", "revshare"] },
    builder: { label: "Builder", note: "Standard plus buyback and a floor", ids: ["cashback", "referrals", "antisnipe", "buyback", "floor"] }
  };
  /* Library groups, in the order Hook Studio lists them. (Fable) */
  var GROUPS = [{ id: "rewards", label: "Rewards" }, { id: "protect", label: "Protection" }, { id: "support", label: "Price support" }, { id: "trading", label: "Trading" }];
  var RISK = { low: "Low risk", medium: "Watch", high: "High risk" };
  var MAX = 8;

  function get(id) { for (var i = 0; i < B.length; i++) if (B[i].id === id) return B[i]; return null; }
  function has(ids, id) { return ids.indexOf(id) >= 0; }
  /* Plain-language checks on a stack of block ids. Each item: { level: "stop"|"note", text }. */
  function check(ids) {
    var out = [];
    if (has(ids, "antisnipe") && has(ids, "sale")) out.push({ level: "stop", text: "Anti-snipe and Sale tiers both set rules for the first minutes. Keep one." });
    if (has(ids, "floor") && !has(ids, "buyback")) out.push({ level: "note", text: "Price floor has no top-up. Add Buyback so fees refill the reserve." });
    if (ids.length > MAX) out.push({ level: "stop", text: "Up to " + MAX + " blocks per hook. Remove " + (ids.length - MAX) + "." });
    if (!has(ids, "cashback")) out.push({ level: "note", text: "Without Cashback, traders here get nothing back. Most launches keep it." });
    return out;
  }
  function ready(ids) { return ids.length > 0 && check(ids).every(function (c) { return c.level !== "stop"; }); }
  /* Which preset an id list equals, or "custom". */
  function presetOf(ids) {
    var keys = Object.keys(PRESETS);
    for (var i = 0; i < keys.length; i++) {
      var p = PRESETS[keys[i]].ids;
      if (p.length === ids.length && p.every(function (x) { return has(ids, x); })) return keys[i];
    }
    return "custom";
  }
  /* A hook id from a badge or hook page: "std" or a preset name, or a single block id. */
  function fromHookId(id) {
    id = String(id || "").toLowerCase();
    if (id === "std" || id === "standard") return { ids: PRESETS.standard.ids.slice(0), name: "Standard" };
    if (PRESETS[id]) return { ids: PRESETS[id].ids.slice(0), name: PRESETS[id].label };
    var b = get(id);
    if (b) { var ids = PRESETS.standard.ids.slice(0); if (!has(ids, id)) ids.push(id); return { ids: ids, name: b.name }; }
    return null;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  /* One block as a row: name, when, plain what-it-does, what traders see, risk chip + why. Same markup everywhere. */
  function row(b, tail) {
    return '<div class="hb-row" data-block="' + b.id + '"><div class="hb-main"><div class="hb-top"><b>' + esc(b.name) + '</b><span class="hb-when">' + esc(b.when) + "</span>" +
      '<span class="hb-risk hb-' + b.risk + '">' + RISK[b.risk] + "</span></div>" +
      '<div class="hb-does">' + esc(b.does) + "</div>" +
      '<div class="hb-sees"><span>Traders see</span> ' + esc(b.sees) + "</div>" +
      '<div class="hb-why">' + esc(b.why) + "</div></div>" + (tail || "") + "</div>";
  }
  return { list: B, groups: GROUPS, presets: PRESETS, get: get, check: check, ready: ready, presetOf: presetOf, fromHookId: fromHookId, row: row, esc: esc, RISK: RISK, MAX: MAX, CASHBACK: CASHBACK, REFERRAL: REFERRAL };
})();
;
/* js/launch-state.js */
/* launch-state.js: the one launch draft shared by Launch (#/launch) and Hook Studio (#/hooks/studio).
   Autosaves to this browser (contract 1.5.1 "drafts autosave"); reads ?like=ADDR, ?hook=ID and ?from=studio. Written by Claude. */
window.QHLaunchState = (function () {
  "use strict";
  var KEY = "qh-launch-draft-v1";
  var STOCKS = ["SPY", "META", "PLTR", "AAPL", "TSLA"];
  /* Chains that the live one-tap launch route accepts, with what each can trade against. */
  var CHAINS = {
    Robinhood: { id: "robinhood", unit: "ETH", pairs: ["ETH", "USDG"].concat(STOCKS), types: ["curve", "pool", "sale"] },
    Base: { id: "base", unit: "ETH", pairs: ["ETH"], types: ["curve", "pool", "sale"] },
    Arbitrum: { id: "arbitrum", unit: "ETH", pairs: ["ETH"], types: ["curve", "pool"] },
    BNB: { id: "bnb", unit: "BNB", pairs: ["BNB"], types: ["curve", "pool"] },
    Elysium: { id: "elysium", unit: "ETH", pairs: ["ETH"], types: ["curve", "pool"] },
    Solana: { id: "solana", unit: "SOL", pairs: ["SOL"], types: ["curve"] }
  };
  var TYPES = {
    curve: { label: "Bonding curve", note: "Price rises as people buy. Moves to a pool when it fills." },
    pool: { label: "Direct pool", note: "Opens straight into a pool. You add the first liquidity." },
    sale: { label: "Sale first", note: "Priced tiers sell first, then the pool opens." }
  };
  function fresh() {
    return { name: "", ticker: "", desc: "", x: "", tg: "", web: "", img: "", chain: "Robinhood", type: "curve", pair: "ETH", dev: "",
      preset: "standard", blocks: window.QHBlocks.presets.standard.ids.slice(0), more: false, vol: 50000, holders: 400,
      like: null, hookNote: "", phase: "form" };
  }
  var st = fresh();
  try { var raw = localStorage.getItem(KEY); if (raw) { var d = JSON.parse(raw); for (var k in d) if (k in st) st[k] = d[k]; } } catch (e) {}
  st.phase = "form";

  function save() {
    try { var c = {}; for (var k in st) if (k !== "img" && k !== "phase") c[k] = st[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
  }
  function reset() { var f = fresh(); Object.keys(f).forEach(function (k) { st[k] = f[k]; }); save(); return st; }
  function isStock(p) { return STOCKS.indexOf(p) >= 0; }
  function setChain(c) {
    if (!CHAINS[c]) return;
    st.chain = c; var cfg = CHAINS[c];
    if (cfg.pairs.indexOf(st.pair) < 0) st.pair = cfg.pairs[0];
    if (cfg.types.indexOf(st.type) < 0) st.type = cfg.types[0];
  }
  function setBlocks(ids) { st.blocks = ids.slice(0); st.preset = window.QHBlocks.presetOf(st.blocks); }
  function chainName(raw) {
    raw = String(raw || "").toLowerCase();
    for (var k in CHAINS) if (k.toLowerCase() === raw || CHAINS[k].id === raw) return k;
    return null;
  }
  function query(hash) {
    var q = {}, i = hash.indexOf("?");
    if (i < 0) return q;
    hash.slice(i + 1).split("&").forEach(function (p) { var kv = p.split("="); if (kv[0]) q[kv[0]] = decodeURIComponent(kv[1] || ""); });
    return q;
  }
  /* Apply the route's query to the draft. Returns a short note for the banner, or "". */
  function fromRoute(hash) {
    var q = query(hash || location.hash), note = "";
    if (q.like) {
      var t = (window.QH_TOKENS || []).filter(function (x) { return String(x.address).toLowerCase() === q.like.toLowerCase(); })[0];
      if (t) {
        var c = chainName(t.chain); if (c) setChain(c);
        var stage = t.stage === "migrated" ? "pool" : "curve";
        if (CHAINS[st.chain].types.indexOf(stage) >= 0) st.type = stage;
        if (t.quote && CHAINS[st.chain].pairs.indexOf(t.quote) >= 0) st.pair = t.quote;
        var hk = window.QHBlocks.fromHookId(t.hook && t.hook.id ? t.hook.id : "std");
        if (hk) setBlocks(hk.ids);
        st.like = { symbol: t.symbol, address: t.address };
        note = "Copied the setup of " + t.symbol + ": " + st.chain + ", " + TYPES[st.type].label.toLowerCase() + ", " + st.pair + " pair and its hooks. Name and image are yours to pick.";
      } else {
        st.like = { symbol: "", address: q.like };
        note = "We could not load that token, so this starts from the usual setup.";
      }
    }
    if (q.hook) {
      var h = window.QHBlocks.fromHookId(q.hook);
      if (h) { setBlocks(h.ids); note = (note ? note + " " : "") + h.name + " hook preselected."; }
      else note = (note ? note + " " : "") + "That hook is not in the library yet, so Standard is selected.";
    }
    if (q.from === "studio") note = "Hooks from Hook Studio are in. " + st.blocks.length + " blocks.";
    st.hookNote = note; save();
    return note;
  }
  return {
    get: function () { return st; }, save: save, reset: reset, setChain: setChain, setBlocks: setBlocks, fromRoute: fromRoute,
    isStock: isStock, CHAINS: CHAINS, TYPES: TYPES, STOCKS: STOCKS
  };
})();
;
/* js/launch-view.js */
/* launch-view.js: markup for the one-screen launch (contract 1.3.3, 1.3.4, 1.5.1, 1.5.4). Written by Claude.
   Three zones (Identity, Market, Hooks) + cost box + live preview. Every fee is "set at launch"
   except the approved cashback and referral lines. No template literals. */
window.LaunchView = (function () {
  "use strict";
  var S = window.QHLaunchState, K = window.QHBlocks, esc = K.esc;
  function count(v, max) { return '<span class="lx-count' + (v.length > max ? " lx-over" : "") + '">' + v.length + "/" + max + "</span>"; }
  function pill(k, v, label, on, extra) { return '<button type="button" class="lx-pill' + (on ? " on" : "") + '" data-set="' + k + '" data-v="' + esc(v) + '">' + label + (extra || "") + "</button>"; }
  function field(k, label, max, val, ph, extra) {
    return '<label class="lx-field"><span class="lx-lab">' + label + (max ? " " + count(val, max) : "") + "</span>" +
      '<input class="lx-in" data-k="' + k + '" value="' + esc(val) + '" placeholder="' + ph + '" autocomplete="off"' + (extra || "") + "></label>";
  }
  /* Inline checks for name and ticker; the ticker check looks for the same symbol on the same chain. */
  function nameMsg(s) {
    if (!s.name) return "";
    if (s.name.length > 32 || /[<>]/.test(s.name)) return '<div class="lx-msg lx-bad">Use 1 to 32 characters, no angle brackets.</div>';
    return "";
  }
  function tickerMsg(s) {
    if (!s.ticker) return "";
    if (!/^[A-Z0-9]{2,10}$/.test(s.ticker)) return '<div class="lx-msg lx-bad">2 to 10 letters or numbers.</div>';
    var taken = (window.QH_TOKENS || []).some(function (t) { return t.symbol === s.ticker && String(t.chain).toLowerCase() === s.chain.toLowerCase(); });
    return taken ? '<div class="lx-msg lx-warn">' + s.ticker + " already trades on " + s.chain + ". You can still use it, but buyers may mix them up.</div>"
      : '<div class="lx-msg lx-ok">' + s.ticker + " is free on " + s.chain + ".</div>";
  }
  function identity(s) {
    var tile = s.img ? '<img src="' + s.img + '" alt="">' : '<span>' + esc((s.ticker || s.name || "?").charAt(0)) + "</span>";
    return '<section class="lx-zone"><div class="lx-zh"><b>1</b> Identity</div>' +
      '<div class="lx-idrow"><label class="lx-drop" title="Add image">' + tile + '<input type="file" accept="image/*" data-img hidden></label>' +
      '<div class="lx-idtext"><div class="lx-hint">Square image, 5 MB max. Drop it here or paste it; we crop it square.</div>' +
      '<label class="lx-filebtn">Choose image<input type="file" accept="image/*" data-img hidden></label></div></div>' +
      '<div class="lx-two">' + field("name", "Name", 32, s.name, "Night Market") + field("ticker", "Ticker", 10, s.ticker, "NIGHT", ' autocapitalize="characters"') + "</div>" +
      nameMsg(s) + tickerMsg(s) +
      '<button type="button" class="lx-more" data-more>' + (s.more ? "Hide description and links" : "Add description and links (optional)") + "</button>" +
      (s.more ? '<label class="lx-field"><span class="lx-lab">Description ' + count(s.desc, 256) + '</span><textarea class="lx-in" data-k="desc" rows="3" placeholder="A line or two. Links go below.">' + esc(s.desc) + "</textarea></label>" +
        '<div class="lx-three">' + field("x", "X", 0, s.x, "@handle") + field("tg", "Telegram", 0, s.tg, "t.me/group") + field("web", "Website", 0, s.web, "https://") + "</div>" : "") +
      "</section>";
  }
  function market(s) {
    var cfg = S.CHAINS[s.chain], unit = cfg.unit;
    var types = cfg.types.map(function (t) {
      return '<button type="button" class="lx-type' + (s.type === t ? " on" : "") + '" data-set="type" data-v="' + t + '"><b>' + S.TYPES[t].label + "</b><span>" + S.TYPES[t].note + "</span></button>";
    }).join("");
    var pairs = cfg.pairs.map(function (p) { return pill("pair", p, p, s.pair === p, S.isStock(p) ? ' <span class="lx-tag">Stock</span>' : ""); }).join("");
    var dev = parseFloat(s.dev);
    return '<section class="lx-zone"><div class="lx-zh"><b>2</b> Market</div>' +
      '<div class="lx-lab">Chain</div><div class="lx-pills">' + Object.keys(S.CHAINS).map(function (c) { return pill("chain", c, c, s.chain === c); }).join("") + "</div>" +
      '<div class="lx-lab">Launch type</div><div class="lx-types">' + types + "</div>" +
      '<div class="lx-lab">Trades against</div><div class="lx-pills">' + pairs + "</div>" +
      (S.isStock(s.pair) ? '<div class="lx-msg lx-warn">Stock pairs are not offered to US persons. We check this before you sign.</div>' : "") +
      '<div class="lx-two">' + '<label class="lx-field"><span class="lx-lab">Your first buy (optional, ' + unit + ')</span><input class="lx-in" data-k="dev" inputmode="decimal" value="' + esc(s.dev) + '" placeholder="0"></label>' +
      '<div class="lx-field"><span class="lx-lab">Start and liquidity</span><div class="lx-fixed">Supply 1B · start MC set at launch</div></div></div>' +
      (dev > 0 ? '<div class="lx-msg">Bought in the same signature as the launch. Share of supply: see the estimate below.</div>' : "") +
      "</section>";
  }
  function hooks(s) {
    var ps = K.presets, keys = Object.keys(ps);
    var pills = keys.map(function (k) { return pill("preset", k, ps[k].label, s.preset === k); }).join("") + pill("preset", "custom", "Custom", s.preset === "custom");
    var rows = s.blocks.map(function (id) {
      var b = K.get(id); if (!b) return "";
      return K.row(b, '<button type="button" class="lx-x" data-drop="' + id + '" aria-label="Remove ' + esc(b.name) + '">Remove</button>');
    }).join("");
    var checks = K.check(s.blocks).map(function (c) { return '<div class="lx-msg ' + (c.level === "stop" ? "lx-bad" : "lx-warn") + '">' + esc(c.text) + "</div>"; }).join("");
    return '<section class="lx-zone"><div class="lx-zh"><b>3</b> Hooks <span class="lx-zn">' + s.blocks.length + " blocks</span></div>" +
      '<div class="lx-pills">' + pills + "</div>" +
      '<div class="lx-hint">' + (ps[s.preset] ? ps[s.preset].note : "Your own mix from Hook Studio") + ". Every block below says what it does and its risk.</div>" +
      '<div class="lx-blocks">' + (rows || '<div class="lx-msg">No hooks. The pool trades plain.</div>') + "</div>" + checks +
      '<a class="lx-studio" href="#/hooks/studio?from=launch">Customize hooks in Hook Studio</a></section>';
  }
  function precheck(s) {
    var bad = K.check(s.blocks).filter(function (c) { return c.level === "stop"; });
    if (bad.length) return '<div class="lx-pre lx-bad">QProof pre-check: needs a fix. ' + esc(bad[0].text) + "</div>";
    var watch = s.blocks.filter(function (id) { var b = K.get(id); return b && b.risk !== "low"; }).length;
    return '<div class="lx-pre ' + (watch ? "lx-warn" : "lx-ok") + '">QProof pre-check: ' + (watch ? "Watch" : "Clear") +
      ". Sells stay open, fees stay inside fixed bounds, no owner switch over trading" + (watch ? "; " + watch + " block" + (watch > 1 ? "s" : "") + " with timed or moving rules." : ".") + "</div>";
  }
  function cost(s) {
    var unit = S.CHAINS[s.chain].unit, dev = parseFloat(s.dev) > 0 ? s.dev + " " + unit : "None";
    var acts = ["Creates " + (s.ticker || "your token") + " with 1B supply", "Opens the " + S.TYPES[s.type].label.toLowerCase() + " against " + s.pair, "Attaches " + s.blocks.length + " hook blocks"];
    if (parseFloat(s.dev) > 0) acts.push("Buys " + dev + " for you");
    return '<section class="lx-cost"><div class="lx-lab">What you pay</div>' +
      '<div class="lx-cr"><span>Launch fee</span><b class="lx-ph">Set at launch</b></div>' +
      '<div class="lx-cr"><span>Network fee</span><b class="lx-ph">Your wallet shows it</b></div>' +
      '<div class="lx-cr"><span>First buy</span><b>' + esc(dev) + "</b></div>" +
      '<div class="lx-cr"><span>Trading fee on this pool</span><b class="lx-ph">Set at launch</b></div>' +
      '<div class="lx-cr lx-tot"><span>Total</span><b>' + (parseFloat(s.dev) > 0 ? esc(dev) + " + fees set at launch" : "Fees set at launch") + "</b></div>" +
      '<div class="lx-acts"><div class="lx-lab">One signature does all of this</div>' + acts.map(function (a) { return "<div>" + esc(a) + "</div>"; }).join("") + "</div>" +
      (s.blocks.indexOf("cashback") >= 0 ? '<div class="lx-perk">' + esc(K.CASHBACK) + "</div>" : "") +
      (s.blocks.indexOf("referrals") >= 0 ? '<div class="lx-perk">' + esc(K.REFERRAL) + "</div>" : "") +
      precheck(s) + "</section>";
  }
  function draftToken(s) {
    var risk = s.blocks.some(function (id) { var b = K.get(id); return b && b.risk !== "low"; }) ? "medium" : "low";
    var hk = K.presets[s.preset] ? K.presets[s.preset].label : "Custom";
    return { address: "draft", href: "#/launch", symbol: s.ticker || "TICKER", name: s.name || "Your token", ageSec: 0, holders: 0, volume: 0, mcap: 0,
      top10: 0, dev: 0, sniper: 0, bundler: 0, qProof: "Not checked", chain: s.chain, native: S.CHAINS[s.chain].unit, logo: s.img || "", candles: [],
      hook: { id: s.preset === "custom" ? "custom" : s.preset, name: hk, risk: risk } };
  }
  function preview(s) {
    var t = draftToken(s), row = window.PulseRow && window.PulseRow.renderRow ? window.PulseRow.renderRow(t) : "";
    var tile = s.img ? '<img src="' + s.img + '" alt="">' : esc(t.symbol.charAt(0));
    return '<aside class="lx-prev"><div class="lx-lab">How it shows in Pulse</div><div class="lx-prow">' + row + "</div>" +
      '<div class="lx-lab">Token page header</div><div class="lx-head"><div class="lx-htile">' + tile + '</div><div><b>' + esc(t.symbol) + "</b> <span>" + esc(t.name) + "</span>" +
      '<div class="lx-hsub">' + esc(s.chain) + " · " + S.TYPES[s.type].label + " · " + esc(s.pair) + " pair · " + (window.HookBadge ? window.HookBadge.html(t).replace("<a ", "<span ").replace(/ href="[^"]*"/, "").replace("</a>", "</span>") : "") + "</div></div></div>" +
      '<div class="lx-lab">Share card</div><div class="lx-card"><div class="lx-ctile">' + tile + '</div><div><b>$' + esc(t.symbol) + "</b><div>" + esc(t.name) + "</div>" +
      '<div class="lx-hsub">New on QHooks · ' + esc(s.chain) + "</div></div></div></aside>";
  }
  return { identity: identity, market: market, hooks: hooks, cost: cost, preview: preview, draftToken: draftToken };
})();
;
/* js/launch-sim.js */
/* launch-sim.js: economics simulator before signing (contract 1.6.2), also used on hook pages. Written by Claude.
   Fixture math only, every output labelled "estimate". The fee rate and splits are example inputs; real values are set at launch.
   Cashback 30% and referral 20% come from the approved lines. No template literals. */
window.LaunchSim = (function () {
  "use strict";
  var EX = { fee: 1, creator: 25, holders: 10, buyback: 15, floor: 10, referred: 25, bag: 150, startMc: 5000 };
  var PX = { ETH: 3000, SOL: 150, BNB: 600, USDG: 1 };
  function usd(v) { return window.QHFmt ? window.QHFmt.usd(v) : "$" + Math.round(v); }
  function logv(pos, lo, hi) { return Math.round(lo * Math.pow(hi / lo, pos / 100)); }
  function logp(v, lo, hi) { return Math.round(100 * Math.log(v / lo) / Math.log(hi / lo)); }
  function has(s, id) { return (s.blocks || []).indexOf(id) >= 0; }
  function calc(s) {
    var vol = s.vol || 50000, holders = s.holders || 400, fee = s.fee || EX.fee;
    var pool = vol * fee / 100, out = { pool: pool, rows: [] };
    function add(label, share, note) { out.rows.push({ label: label, v: pool * share / 100, share: share, note: note }); }
    if (has(s, "cashback")) add("Cashback to traders", 30, "30% of the fee");
    if (has(s, "referrals")) add("Referrers", 20 * EX.referred / 100, "20% of the fee on referred trades; assumes a quarter of volume is referred");
    if (has(s, "revshare")) add("Stakers", EX.holders, "example share");
    if (has(s, "buyback")) add("Buyback", EX.buyback, "example share");
    if (has(s, "floor")) add("Floor reserve", EX.floor, "example share");
    add("You, the creator", EX.creator, "example share");
    var used = out.rows.reduce(function (a, r) { return a + r.share; }, 0);
    out.rows.push({ label: "Pool and platform", v: pool * Math.max(0, 100 - used) / 100, share: Math.max(0, 100 - used), note: "split set at launch" });
    out.mc = Math.max(EX.startMc, holders * EX.bag);
    out.creator = pool * EX.creator / 100;
    out.cashPerHolder = has(s, "cashback") ? pool * 0.3 / holders : 0;
    out.buyPct = has(s, "buyback") ? 100 * pool * EX.buyback / 100 / out.mc : 0;
    var unit = s.unit || "ETH", dev = parseFloat(s.dev) || 0, px = PX[unit] || 0;
    out.devPct = dev > 0 && px ? 100 * dev * px / (EX.startMc + dev * px) : 0;
    return out;
  }
  /* Curve chart: market cap against share of curve supply sold; the step to a pool and the first buy are marked with lines. */
  function curve(s, r) {
    var w = 320, h = 120, pts = [], i;
    for (i = 0; i <= 40; i++) { var f = i / 40 * 0.8, y = 1 / Math.pow(1 - f, 2); pts.push([(i / 40) * w, h - 8 - (y - 1) / 24 * (h - 16)]); }
    var line = pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
    var dx = Math.min(w, (r.devPct / 80) * w);
    return '<svg class="ls-svg" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" role="img" aria-label="Curve estimate">' +
      '<polyline points="' + line + '" fill="none" stroke="var(--acc)" stroke-width="2"/>' +
      '<line x1="' + (w - 1) + '" y1="0" x2="' + (w - 1) + '" y2="' + h + '" stroke="var(--up)" stroke-dasharray="3 3"/>' +
      (r.devPct > 0 ? '<line x1="' + dx.toFixed(1) + '" y1="0" x2="' + dx.toFixed(1) + '" y2="' + h + '" stroke="var(--mut)"/>' : "") + "</svg>" +
      '<div class="ls-axis"><span>0% sold</span>' + (r.devPct > 0 ? "<span>Your first buy</span>" : "") + '<span class="ls-up">Moves to a pool (MC set at launch)</span></div>';
  }
  function body(s) {
    var r = calc(s), max = r.rows.reduce(function (a, x) { return Math.max(a, x.v); }, 0) || 1;
    var bars = r.rows.map(function (x) {
      return '<div class="ls-row"><span>' + x.label + '</span><span class="ls-bar"><span style="width:' + Math.round(100 * x.v / max) + '%"></span></span><b>' + usd(x.v) + "</b></div>";
    }).join("");
    return '<div class="ls-kpis"><div><span>You earn / day</span><b>' + usd(r.creator) + "</b></div>" +
      "<div><span>Cashback / holder / day</span><b>" + (r.cashPerHolder ? usd(r.cashPerHolder) : "Off") + "</b></div>" +
      "<div><span>Buyback / day vs MC</span><b>" + (r.buyPct ? r.buyPct.toFixed(r.buyPct < 1 ? 2 : 1) + "%" : "Off") + "</b></div>" +
      "<div><span>Your first buy</span><b>" + (r.devPct ? r.devPct.toFixed(1) + "% of supply" : "None") + "</b></div></div>" +
      '<div class="ls-lab">Where a day of fees goes (' + usd(r.pool) + " in fees at the example rate)</div>" + bars +
      (has(s, "floor") ? '<div class="ls-note">Floor reserve grows about ' + usd(r.pool * EX.floor / 100) + " a day at this volume, more if Buyback also tops it up.</div>" : "") +
      (s.type === "curve" || !s.type ? '<div class="ls-lab">Bonding curve</div>' + curve(s, r) : "") +
      '<div class="ls-note">Assumes an MC near ' + usd(r.mc) + " (holders x " + usd(EX.bag) + " average bag). Real fees and splits are set at launch.</div>";
  }
  /* Randall 2026-11-20: "Hide simulator but those are fine figures". Flip SHOW to bring it back. */
  var SHOW = false;
  function html(s) {
    if (!SHOW) return "";
    var vp = logp(s.vol || 50000, 1000, 1000000), hp = logp(s.holders || 400, 10, 10000);
    return '<section class="ls"><div class="ls-head"><b>Economics</b><span class="ls-est">Estimate</span></div>' +
      '<label class="ls-sl"><span>Daily buy volume <b data-o="vol">' + usd(s.vol || 50000) + '</b></span><input type="range" min="0" max="100" value="' + vp + '" data-sim="vol"></label>' +
      '<label class="ls-sl"><span>Holders <b data-o="holders">' + (s.holders || 400).toLocaleString("en-US") + '</b></span><input type="range" min="0" max="100" value="' + hp + '" data-sim="holders"></label>' +
      '<label class="ls-sl"><span>Example fee rate <b data-o="fee">' + (s.fee || EX.fee).toFixed(1) + '%</b> <span class="ls-ph">placeholder, real fee set at launch</span></span><input type="range" min="2" max="30" value="' + Math.round((s.fee || EX.fee) * 10) + '" data-sim="fee"></label>' +
      '<div class="ls-body">' + body(s) + "</div></section>";
  }
  /* Wire sliders inside root; s is mutated; onChange(s) lets the caller autosave. Only the outputs redraw. */
  function bind(root, s, onChange) {
    if (!SHOW) return;
    root.addEventListener("input", function (e) {
      var k = e.target.getAttribute && e.target.getAttribute("data-sim"); if (!k) return;
      var v = +e.target.value;
      if (k === "vol") s.vol = logv(v, 1000, 1000000);
      if (k === "holders") s.holders = logv(v, 10, 10000);
      if (k === "fee") s.fee = v / 10;
      var o = root.querySelector('[data-o="' + k + '"]');
      if (o) o.textContent = k === "vol" ? usd(s.vol) : k === "holders" ? s.holders.toLocaleString("en-US") : s.fee.toFixed(1) + "%";
      var b = root.querySelector(".ls-body"); if (b) b.innerHTML = body(s);
      if (onChange) onChange(s);
    });
  }
  return { html: html, bind: bind, calc: calc };
})();
;
/* js/launch-css.js */
/* launch-css.js: styles for Launch (lx-), hook block rows (hb-), simulator (ls-) and Hook Studio (sx-).
   Injected so styles.css (shared with other agents) stays untouched. Contract tokens only. Written by Claude. */
(function () {
  "use strict";
  var L = "11px", U = "text-transform:uppercase;letter-spacing:.06em;";
  var css = [
    ".lx,.sx{max-width:1280px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:12px;font-size:13px}",
    ".lx h1,.sx h1{font-size:22px;font-weight:600;margin:0 0 4px}",
    ".lx-top,.sx-top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}.lx-topa{display:flex;gap:8px}",
    ".lx-hint{color:var(--mut);font-size:12px;line-height:1.45}",
    ".lx-note{border:1px solid var(--acc);border-radius:6px;padding:10px 12px;font-size:12px;color:var(--tx);background:var(--s1)}",
    ".lx-grid{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:12px;align-items:start}",
    ".lx-form{display:flex;flex-direction:column;gap:12px;min-width:0}",
    ".lx-zone,.lx-cost,.lx-sim .ls,.lx-prev,.sx-card,.lx-done{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0}",
    ".lx-zh{" + U + "font-size:" + L + ";color:var(--mut);display:flex;align-items:center;gap:8px}.lx-zh b{color:#140d00;background:var(--acc);border-radius:4px;padding:1px 6px}.lx-zn{margin-left:auto}",
    ".lx-lab,.sx-lab,.ls-lab{" + U + "font-size:" + L + ";color:var(--mut);display:flex;justify-content:space-between;gap:8px;margin-top:2px}",
    ".lx-field{display:flex;flex-direction:column;gap:4px;min-width:0}.lx-count{font-variant-numeric:tabular-nums}.lx-over{color:var(--dn)}",
    ".lx-in{background:var(--s2);border:1px solid var(--line);border-radius:4px;color:var(--tx);padding:0 10px;height:40px;font-size:14px;font-family:inherit;width:100%;box-sizing:border-box;min-width:0}",
    "textarea.lx-in{height:auto;padding:10px;resize:vertical}.lx-in:focus{outline:none;border-color:var(--acc)}",
    ".lx-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lx-three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}",
    ".lx-idrow{display:flex;gap:12px;align-items:center}.lx-idtext{display:flex;flex-direction:column;gap:8px;align-items:flex-start}",
    ".lx-drop{width:72px;height:72px;flex:none;border:1px dashed var(--mut);border-radius:6px;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:600;color:var(--mut);cursor:pointer;overflow:hidden}",
    ".lx-drop img,.lx-htile img,.lx-ctile img{width:100%;height:100%;object-fit:cover}",
    ".lx-filebtn,.lx-btn{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border:1px solid var(--line);border-radius:4px;background:var(--s2);color:var(--tx);font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap}",
    ".lx-btn:hover,.lx-filebtn:hover{border-color:var(--mut)}",
    ".lx-more,.lx-link{background:none;border:0;color:var(--acc);font-size:12px;padding:0;cursor:pointer;text-align:left;min-height:28px;font-family:inherit}",
    ".lx-msg{font-size:12px;color:var(--mut)}.lx-ok{color:var(--up)}.lx-bad{color:var(--dn)}.lx-warn{color:var(--acc)}",
    ".lx-pills{display:flex;gap:4px;flex-wrap:wrap}",
    ".lx-pill{height:32px;padding:0 12px;background:var(--s2);border:1px solid var(--line);border-radius:4px;color:var(--mut);font-size:12px;cursor:pointer;font-family:inherit}",
    ".lx-pill.on{color:var(--tx);border-color:var(--acc)}.lx-tag{font-style:normal;font-size:10px;color:var(--acc);margin-left:4px}",
    ".lx-types{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
    ".lx-type{display:flex;flex-direction:column;gap:4px;text-align:left;padding:10px;background:var(--s2);border:1px solid var(--line);border-radius:6px;color:var(--tx);cursor:pointer;font-family:inherit;font-size:13px}",
    ".lx-type span{font-size:11px;color:var(--mut);line-height:1.4}.lx-type.on{border-color:var(--acc)}",
    ".lx-fixed{height:40px;display:flex;align-items:center;padding:0 10px;border:1px dashed var(--line);border-radius:4px;color:var(--mut);font-size:12px}",
    ".lx-blocks,.sx-lib{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:6px}",
    ".hb-row{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-top:1px solid var(--line)}.hb-row:first-child{border-top:0}",
    ".hb-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}.hb-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.hb-top b{font-size:14px}",
    ".hb-when{font-size:10px;color:var(--mut);" + U + "}.hb-does{font-size:12px}.hb-sees{font-size:12px;color:var(--mut)}.hb-sees span{color:var(--acc)}.hb-why{font-size:11px;color:var(--mut)}",
    ".hb-risk{font-size:10px;border:1px solid;border-radius:4px;padding:1px 6px;white-space:nowrap}.hb-low{color:var(--up)}.hb-medium{color:var(--acc)}.hb-high{color:var(--dn)}",
    ".lx-x,.sx-add,.sx-rm{height:32px;padding:0 10px;background:transparent;border:1px solid var(--line);border-radius:4px;color:var(--mut);font-size:12px;cursor:pointer;flex:none;font-family:inherit}",
    ".sx-add{color:var(--tx)}.sx-add.on{border-color:var(--acc);color:var(--acc)}",
    ".lx-studio{display:flex;align-items:center;justify-content:center;height:40px;border:1px solid var(--acc);border-radius:4px;color:var(--acc);text-decoration:none;font-weight:600;font-size:13px}",
    ".lx-cr{display:flex;justify-content:space-between;gap:8px;font-size:12px}.lx-cr span{color:var(--mut)}.lx-cr b{font-weight:600;font-variant-numeric:tabular-nums;text-align:right}",
    ".lx-ph{color:var(--acc)}.lx-tot{border-top:1px solid var(--line);padding-top:6px}",
    ".lx-acts{border-top:1px solid var(--line);padding-top:6px;display:flex;flex-direction:column;gap:2px;font-size:12px}",
    ".lx-perk{font-size:12px;color:var(--acc)}.lx-pre{font-size:12px;border:1px solid currentColor;border-radius:4px;padding:8px}",
    ".lx-bar{display:flex;flex-direction:column;gap:6px}",
    ".lx-go{display:flex;align-items:center;justify-content:center;width:100%;height:48px;border:0;border-radius:6px;background:var(--up);color:#06110c;font-weight:600;font-size:15px;cursor:pointer;text-decoration:none;font-family:inherit}",
    ".lx-go:disabled{opacity:.4;cursor:default}.lx-gosub{font-size:11px;color:var(--mut);text-align:center}",
    ".lx-side{position:sticky;top:68px;display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 80px);overflow:auto;min-width:0}.lx-prev{gap:6px}.lx-prow{border:1px solid var(--line);border-radius:6px;overflow:hidden;pointer-events:none}.lx-prow>*{margin:0!important}",
    ".lx-head,.lx-card{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:6px;padding:10px;background:var(--s2)}",
    ".lx-head span{color:var(--mut)}.lx-hsub{font-size:11px;color:var(--mut);margin-top:2px}",
    ".lx-htile,.lx-ctile{width:40px;height:40px;flex:none;border-radius:6px;background:var(--bg);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--mut);overflow:hidden}",
    ".lx-card{background:var(--bg);border-left:3px solid var(--acc)}.lx-ctile{width:56px;height:56px;font-size:22px}",
    ".ls-head{display:flex;justify-content:space-between;align-items:center}.ls-est,.sx-est{font-size:10px;" + U + "color:#140d00;background:var(--acc);border-radius:4px;padding:2px 6px}",
    ".ls-sl{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--mut)}.ls-sl b{color:var(--tx);font-variant-numeric:tabular-nums}.ls-sl input{width:100%;accent-color:var(--acc);height:28px}",
    ".ls-ph{font-size:10px;color:var(--acc)}",
    ".ls-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.ls-kpis div{background:var(--s2);border:1px solid var(--line);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:2px;min-width:0}",
    ".ls-kpis span{font-size:10px;color:var(--mut);" + U + "}.ls-kpis b{font-size:16px;font-variant-numeric:tabular-nums}",
    ".ls-row{display:grid;grid-template-columns:150px minmax(0,1fr) 72px;gap:8px;align-items:center;font-size:12px}.ls-row b{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}",
    ".ls-bar{height:8px;background:var(--s2);border-radius:2px;overflow:hidden}.ls-bar span{display:block;height:100%;background:var(--acc)}",
    ".ls-svg{width:100%;height:110px;background:var(--s2);border:1px solid var(--line);border-radius:6px}.ls-axis{display:flex;justify-content:space-between;font-size:11px;color:var(--mut)}.ls-up{color:var(--up)}",
    ".ls-note{font-size:11px;color:var(--mut)}",
    ".lx-k,.sx-k{font-size:" + L + ";" + U + "color:var(--acc)}",
    ".lx-donegrid{display:grid;grid-template-columns:240px minmax(0,1fr);gap:8px;align-items:center}.lx-share{display:flex;gap:8px;min-width:0}",
    ".lx-next{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}",
    ".lx-step{display:flex;flex-direction:column;gap:4px;text-align:left;padding:12px;background:var(--s2);border:1px solid var(--line);border-radius:6px;color:var(--tx);text-decoration:none;cursor:pointer;font-family:inherit;font-size:13px}",
    ".lx-step span{font-size:12px;color:var(--mut)}.lx-acc{border-color:var(--acc)}.lx-acc b{color:var(--acc)}",
    ".sx-tabs,.sx-seg{display:flex;gap:4px}.sx-tab,.sx-seg button{height:36px;padding:0 14px;background:var(--s1);border:1px solid var(--line);border-radius:4px;color:var(--mut);cursor:pointer;font-family:inherit;font-size:12px}",
    ".sx-tab.on,.sx-seg .on{color:var(--tx);border-color:var(--acc)}",
    ".sx-grid{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:12px;align-items:start}.sx-card{position:sticky;top:72px}",
    ".sx-presets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}",
    ".sx-preset{display:flex;flex-direction:column;gap:4px;text-align:left;padding:10px;background:var(--s1);border:1px solid var(--line);border-radius:6px;color:var(--tx);cursor:pointer;font-family:inherit}",
    ".sx-preset span{font-size:11px;color:var(--mut)}.sx-preset.on{border-color:var(--acc)}",
    ".sx-ch{display:flex;align-items:center;gap:8px}.sx-cnt{margin-left:auto;font-size:11px;color:var(--mut)}",
    ".sx-chip{font-size:10px;border-radius:4px;padding:2px 6px;font-weight:600}.sx-ok{background:var(--up);color:#06110c}.sx-bad{background:var(--s2);color:var(--acc);border:1px solid var(--acc)}",
    ".sx-stack,.sx-path{display:flex;flex-direction:column;gap:4px}.sx-it{display:flex;gap:8px;align-items:center;background:var(--s2);border:1px solid var(--line);border-radius:6px;padding:8px 10px;font-size:12px}",
    ".sx-it>div{flex:1;min-width:0}.sx-it>div div{color:var(--mut);margin-top:2px}.sx-it b{margin-right:6px}",
    ".sx-step{border-left:2px solid var(--acc);padding:6px 10px;font-size:12px;background:var(--s2)}.sx-step div{color:var(--mut)}.sx-n{color:var(--acc);margin-right:6px}.sx-w{color:var(--mut);font-size:10px;margin-left:6px;" + U + "}",
    ".sx-end{border-left-color:var(--mut);color:var(--mut)}.sx-empty{color:var(--mut);font-size:12px;padding:12px;border:1px dashed var(--line);border-radius:6px}",
    ".sx-test{border:1px solid var(--line);border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:4px;font-size:12px}.sx-run{width:100%}",
    "@media (max-width:767px){",
    ".lx,.sx{padding:12px 12px 140px}.lx-grid,.sx-grid{grid-template-columns:1fr}.lx-side{position:static;max-height:none;overflow:visible}.sx-card{position:static;order:-1}",
    ".lx-types,.sx-presets,.lx-next{grid-template-columns:1fr}.lx-three{grid-template-columns:1fr}.ls-kpis{grid-template-columns:1fr 1fr}",
    ".ls-row{grid-template-columns:110px minmax(0,1fr) 64px}.lx-donegrid{grid-template-columns:1fr}",
    ".lx-pill,.lx-btn,.lx-filebtn,.lx-x,.sx-add,.sx-rm,.sx-tab,.sx-seg button,.lx-in,.lx-more,.lx-link,.lx-studio{min-height:44px}.lx-in{height:44px}.ls-sl input{height:44px}",
    ".lx-bar,.sx-bar{position:fixed;left:0;right:0;bottom:56px;z-index:30;background:var(--s1);border-top:1px solid var(--line);padding:8px 12px;margin:0}",
    ".lx-top h1,.sx-top h1{font-size:20px}}"
  ].join("");
  var el = document.createElement("style"); el.id = "launch-css"; el.textContent = css; document.head.appendChild(el);
})();
;
/* js/launch.js */
/* launch.js: one-screen fast launch at #/launch (contract 1.3.3, 1.3.4, 1.5.1, 1.5.4, 1.6.1, 1.6.2). Written by Claude.
   State: QHLaunchState (shared with Hook Studio). Markup: LaunchView, LaunchSim. No real signing here:
   Launch asks the live prepare route, then the user's own wallet signs one transaction on the page it returns. */
window.Launch = (function () {
  "use strict";
  var S = window.QHLaunchState, V = window.LaunchView, K = window.QHBlocks, esc = K.esc;
  var run = { phase: "form", link: "", err: "", token: null, touched: false };

  function suggest(name) {
    var words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(" ").filter(Boolean);
    if (!words.length) return "";
    return (words[0].length >= 3 ? words[0] : words.join("")).slice(0, 8);
  }
  function valid(s) { return s.name && s.name.length <= 32 && !/[<>]/.test(s.name) && /^[A-Z0-9]{2,10}$/.test(s.ticker) && K.ready(s.blocks); }
  function missing(s) {
    if (!s.name) return "Add a name";
    if (!/^[A-Z0-9]{2,10}$/.test(s.ticker)) return "Add a 2 to 10 character ticker";
    if (!K.ready(s.blocks)) return "Fix the hook check above";
    return "";
  }
  function action(s) {
    var t = s.ticker || "token", miss = missing(s);
    if (run.phase === "signing") return '<button class="lx-go" disabled>' + esc(run.step || "Sign in your wallet") + '</button><div class="lx-gosub">One transaction from your own wallet. The token page opens when it confirms.</div>';
    if (run.phase === "preparing") return '<button class="lx-go" disabled>Preparing your launch</button><div class="lx-gosub">Asking the live launch route</div>';
    if (run.phase === "sign") return '<a class="lx-go" href="' + esc(run.link) + '" target="_blank" rel="noopener">Sign in your wallet</a>' +
      '<div class="lx-gosub">One transaction, signed by your wallet on qhooks.com. Name, ticker and chain carry over; check pair and hooks there before you sign.</div>' +
      '<button type="button" class="lx-btn" data-signed>I signed it, show my launch</button>';
    return '<button class="lx-go" data-launch' + (valid(s) ? "" : " disabled") + ">Launch " + esc(t) + "</button>" +
      '<div class="lx-gosub">' + (miss ? esc(miss) + " to continue" : "One signature from your wallet. Nothing else to approve.") + "</div>" +
      (run.err ? '<div class="lx-msg lx-bad">Launch did not start: ' + esc(run.err) + ' Everything is still filled in. <button type="button" class="lx-link" data-launch>Retry</button></div>' : "");
  }
  function success(s) {
    var t = run.token, url = location.href.split("#")[0] + "#/token/" + t.address;
    var tweet = "https://x.com/intent/post?text=" + encodeURIComponent("$" + t.symbol + " is live on QHooks " + url);
    return '<div class="lx-done"><div class="lx-k">LAUNCH SIGNED</div><h1>$' + esc(t.symbol) + " is launching on " + esc(s.chain) + "</h1>" +
      '<div class="lx-hint">This page shows your draft until the chain confirms the token. Then the numbers go live.</div>' +
      '<div class="lx-donegrid"><a class="lx-go" href="#/token/' + esc(t.address) + '">Open token page</a>' +
      '<div class="lx-share"><input class="lx-in" readonly value="' + esc(url) + '" aria-label="Share link"><button type="button" class="lx-btn" data-copy>Copy link</button>' +
      '<a class="lx-btn" href="' + esc(tweet) + '" target="_blank" rel="noopener">Post on X</a></div></div>' +
      '<div class="lx-lab">Next steps</div><div class="lx-next">' +
      '<a class="lx-step lx-acc" href="#/portfolio"><b>Set up QLocks</b><span>Lock your first buy and any team tokens. Buyers see the unlock date on the token page.</span></a>' +
      '<a class="lx-step" href="#/token/' + esc(t.address) + '"><b>Make a call</b><span>Post your entry so followers see it first.</span></a>' +
      '<a class="lx-step" href="#/agents?token=' + esc(t.address) + '"><b>Run an agent</b><span>Have an agent watch the token for you.</span></a>' +
      '<button type="button" class="lx-step" data-again><b>Launch another</b><span>Start a fresh form.</span></button></div></div>';
  }
  function draw(root) {
    var s = S.get();
    if (run.phase === "done") { root.innerHTML = '<div class="lx">' + success(s) + "</div>"; return; }
    root.innerHTML = '<div class="lx"><div class="lx-top"><div><h1>Launch a token</h1><div class="lx-hint">Name, ticker and image are all it needs. Everything else starts on a setting that works; change what you like.</div></div>' +
      '<div class="lx-topa"><button type="button" class="lx-btn" data-reset>Start over</button><a class="lx-btn" href="#/agents">Create an agent instead</a></div></div>' +
      (s.hookNote ? '<div class="lx-note">' + esc(s.hookNote) + "</div>" : "") +
      '<div class="lx-grid"><div class="lx-form">' + V.identity(s) + V.market(s) + V.hooks(s) +
      '<div class="lx-sim">' + window.LaunchSim.html(simState(s)) + "</div></div>" +
      '<div class="lx-side">' + V.preview(s) + V.cost(s) + '<div class="lx-bar">' + action(s) + "</div></div></div></div>";
  }
  function simState(s) { s.unit = S.CHAINS[s.chain].unit; return s; }
  /* Square-crop an image file to 256 px and keep it as a data URL. */
  function takeImage(file, root) {
    if (!file || !/^image\//.test(file.type)) return;
    if (file.size > 5 * 1024 * 1024) { alertMsg(root, "That image is over 5 MB. Pick a smaller one."); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement("canvas"), n = Math.min(im.width, im.height); c.width = c.height = 256;
        c.getContext("2d").drawImage(im, (im.width - n) / 2, (im.height - n) / 2, n, n, 0, 0, 256, 256);
        S.get().img = c.toDataURL("image/png"); draw(root);
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function alertMsg(root, text) { var z = root.querySelector(".lx-idtext"); if (z) z.insertAdjacentHTML("beforeend", '<div class="lx-msg lx-bad">' + esc(text) + "</div>"); }
  function launch(root) {
    var s = S.get(); if (!valid(s)) return;
    run.phase = "preparing"; run.err = ""; draw(root);
    var live = window.QHLive && window.QHLive.prepareLaunch;
    var req = { name: s.name, ticker: s.ticker, chain: S.CHAINS[s.chain].id };
    /* In-page launch (2026-11-20): needs prepare-launch to take the creator and return the unsigned deploy transaction.
       It does not yet (it answers "Unknown argument: creator." and returns only a qhooks.com link), so this stays off. */
    if (window.QH_LAUNCH_SIGN === true && window.QHWallet && window.QHWallet.address()) req.creator = window.QHWallet.address();
    var p = live ? window.QHLive.prepareLaunch(req) : Promise.resolve({ ok: false, body: { error: "The live launch route is not reachable from here." } });
    p.then(function (r) {
      var b = r && r.body;
      if (r && r.ok && b && Array.isArray(b.transactions) && b.transactions.length && window.QHSign) { signLaunch(root, b); return; }
      if (r && r.ok && b && b.link) { run.phase = "sign"; run.link = b.link; }
      else { run.phase = "form"; run.err = (b && b.error) || "The launch route did not answer."; }
      draw(root);
    });
  }
  /* Signs the launch in the visitor's wallet and opens the new token page on confirm (contract 1.3.3 Launch row). */
  function signLaunch(root, b) {
    var s = S.get(), chain = String(b.chain || S.CHAINS[s.chain].id), tt = window.QHSign.toast({ title: "Launch $" + s.ticker, chainId: chain });
    run.phase = "signing"; run.step = "Connect your wallet"; draw(root);
    window.QHWallet.ensure("evm").then(function (me) {
      if (!me) throw new Error("Connect a wallet to launch.");
      return window.QHSign.evm({ provider: me.provider, from: me.address, chainId: chain, txs: b.transactions, on: function (st, d) {
        if (st === "sign") run.step = "Sign in your wallet";
        if (st === "sent") { run.step = "Confirming on chain"; tt.set("submitted", { text: "Submitted", hash: d.hash }); }
        draw(root);
      } });
    }).then(function (x) {
      var token = b.token || b.predictedToken, h = x.hashes[x.hashes.length - 1];
      tt.set("confirmed", { text: "Launched", hash: h }); S.reset(); run.phase = "form";
      location.hash = token ? "#/token/" + chain + "/" + String(token).toLowerCase() : "#/portfolio";
    }).catch(function (e) {
      var why = window.QHSign.reason(e); run.phase = "form"; run.err = why; draw(root);
      tt.set("failed", { text: why, hash: e && e.hash, retry: function () { launch(root); } });
    });
  }
  function finish(root) {
    var s = S.get(), hex = "0x";
    for (var i = 0; i < 40; i++) hex += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
    var t = V.draftToken(s); t.address = hex; t.href = null; t.trades = []; t.stage = "new"; t.price = 0; t.liquidity = 0; t.insider = 0;
    window.QH_DRAFTS = (window.QH_DRAFTS || []).concat([t]);
    run.token = t; run.phase = "done"; draw(root); window.scrollTo(0, 0);
  }
  function setKey(s, k, v) {
    if (k === "ticker") { run.touched = v !== ""; s.ticker = v.toUpperCase().replace(/[^A-Z0-9]/g, ""); return; }
    s[k] = v;
    if (k === "name" && !run.touched) s.ticker = suggest(v);
  }
  function render(root) {
    run.phase = "form"; run.err = ""; run.touched = !!S.get().ticker;
    S.fromRoute(location.hash); draw(root);
    window.LaunchSim.bind(root, S.get(), function () { S.save(); });
    root.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var s = S.get();
      if (b.hasAttribute("data-launch")) { launch(root); return; }
      if (b.hasAttribute("data-signed")) { finish(root); return; }
      if (b.hasAttribute("data-more")) { s.more = !s.more; S.save(); draw(root); return; }
      if (b.hasAttribute("data-reset") || b.hasAttribute("data-again")) { S.reset(); run.phase = "form"; run.touched = false; history.replaceState(null, "", "#/launch"); draw(root); return; }
      if (b.hasAttribute("data-copy")) { var inp = root.querySelector(".lx-share input"); try { navigator.clipboard.writeText(inp.value); } catch (x) {} b.textContent = "Copied"; return; }
      if (b.dataset.drop) { S.setBlocks(s.blocks.filter(function (x) { return x !== b.dataset.drop; })); S.save(); draw(root); return; }
      if (b.dataset.set) {
        var k = b.dataset.set, v = b.dataset.v;
        if (k === "chain") S.setChain(v);
        else if (k === "preset") { if (K.presets[v]) S.setBlocks(K.presets[v].ids); else location.hash = "#/hooks/studio?from=launch"; }
        else s[k] = v;
        s.hookNote = ""; S.save(); draw(root);
      }
    });
    root.addEventListener("input", function (e) {
      var k = e.target.dataset && e.target.dataset.k; if (!k) return;
      var pos = e.target.selectionStart; setKey(S.get(), k, e.target.value); S.save(); draw(root);
      var el = root.querySelector('[data-k="' + k + '"]');
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) {} }
    });
    root.addEventListener("change", function (e) { if (e.target.hasAttribute && e.target.hasAttribute("data-img")) takeImage(e.target.files[0], root); });
    root.addEventListener("dragover", function (e) { if (e.target.closest(".lx-drop")) e.preventDefault(); });
    root.addEventListener("drop", function (e) { if (!e.target.closest(".lx-drop")) return; e.preventDefault(); takeImage(e.dataTransfer.files[0], root); });
    root.addEventListener("paste", function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) if (/^image\//.test(items[i].type)) { takeImage(items[i].getAsFile(), root); e.preventDefault(); return; }
    });
  }
  return { render: render };
})();
;
/* js/search.js */
// search.js – Token search dropdown for QHooks
// WARNING: No template literals used - they break the editor.

var window = window || {};

(function() {
  function highlightMatch(text, q) {
    var t = String(text == null ? '' : text); if (!q) return t;
    var i = t.toLowerCase().indexOf(String(q).toLowerCase());
    if (i < 0) return t;
    return t.slice(0, i) + '<b>' + t.slice(i, i + q.length) + '</b>' + t.slice(i + q.length);
  }

  'use strict';

  // CSS to inject once
  var CSS_INJECTED = false;

  function injectCSS() {
    if (CSS_INJECTED) return;
    CSS_INJECTED = true;

    var style = document.createElement('style');
    style.textContent =
      '.qs-dropdown {' +
      '  position: absolute;' +
      '  top: 100%;' +
      '  left: 0;' +
      '  right: 0;' +
      '  background: var(--s1);' +
      '  border: 1px solid var(--line);' +
      '  border-radius: 8px;' +
      '  box-shadow: 0 4px 20px rgba(0,0,0,0.5);' +
      '  max-height: 350px;' +
      '  overflow-y: auto;' +
      '  z-index: 200;' +
      '  margin-top: 4px;' +
      '}' +
      '.qs-group {' +
      '  padding: 8px 12px;' +
      '  border-bottom: 1px solid var(--line);' +
      '}' +
      '.qs-group-title {' +
      '  font-size: 11px;' +
      '  color: var(--mut);' +
      '  text-transform: uppercase;' +
      '  margin-bottom: 6px;' +
      '}' +
      '.qs-result {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 10px;' +
      '  padding: 8px 10px;' +
      '  cursor: pointer;' +
      '  border-radius: 6px;' +
      '  transition: background 0.2s;' +
      '}' +
      '.qs-result:hover {' +
      '  background: var(--s2);' +
      '}' +
      '.qs-symbol {' +
      '  font-weight: 700;' +
      '  font-size: 14px;' +
      '  min-width: 50px;' +
      '}' +
      '.qs-name {' +
      '  color: var(--tx);' +
      '  font-size: 13px;' +
      '  flex: 1;' +
      '}' +
      '.qs-chain {' +
      '  font-size: 10px;' +
      '  color: var(--mut);' +
      '  background: var(--bg);' +
      '  padding: 2px 6px;' +
      '  border-radius: 4px;' +
      '}' +
      '.qs-mc {' +
      '  font-size: 12px;' +
      '  font-weight: 600;' +
      '  color: var(--mut);' +
      '}' +
      '.qs-result.qs-highlight {' +
      '  background: var(--s2);' +
      '}' +
      '.qs-empty {' +
      '  padding: 12px;' +
      '  color: var(--mut);' +
      '  text-align: center;' +
      '  font-size: 13px;' +
      '}';
  }

  // Group tokens by symbol prefix for display
  function groupBySymbol(tokens) {
    var groups = {};
    tokens.forEach(function(token) {
      var sym = token.symbol;
      if (!groups[sym]) {
        groups[sym] = [];
      }
      groups[sym].push(token);
    });
    return groups;
  }

  // Format market cap
  function formatMC(mcap) {
    if (mcap == null || !isFinite(mcap)) return '';
    if (mcap >= 1000000000) {
      return '$' + (mcap / 1000000000).toFixed(2) + 'B';
    }
    if (mcap >= 1000000) {
      return '$' + (mcap / 1000000).toFixed(2) + 'M';
    }
    if (mcap >= 1000) {
      return '$' + (mcap / 1000).toFixed(2) + 'K';
    }
    return '$' + mcap.toFixed(2);
  }

  // Get chain badge text
  function getChainBadge(chain) {
    if (!chain) return '';
    return chain.slice(0, 3).toUpperCase();
  }

  // Search tokens by query
  function searchTokens(query) {
    if (!query || query.length < 1) return [];
    if (!window.QH_TOKENS || !Array.isArray(window.QH_TOKENS)) return [];

    var q = query.toLowerCase();
    var results = [];

    window.QH_TOKENS.forEach(function(token) {
      var match = false;
      if (token.symbol && token.symbol.toLowerCase().indexOf(q) !== -1) match = true;
      if (token.name && token.name.toLowerCase().indexOf(q) !== -1) match = true;
      if (token.address && token.address.toLowerCase().indexOf(q) !== -1) match = true;
      if (token.chain && token.chain.toLowerCase().indexOf(q) !== -1) match = true;

      if (match) {
        results.push(token);
      }
    });

    // Sort by relevance: exact symbol match first, then partial symbol, then name, then address
    results.sort(function(a, b) {
      var aSym = a.symbol ? a.symbol.toLowerCase() : '';
      var bSym = b.symbol ? b.symbol.toLowerCase() : '';
      var qSym = q;
      if (aSym === qSym) return -1;
      if (bSym === qSym) return 1;
      if (aSym.indexOf(qSym) === 0) return -1;
      if (bSym.indexOf(qSym) === 0) return 1;
      return 0;
    });

    return results.slice(0, 8);
  }

  // Create dropdown result row
  function createResultRow(token, query) {
    var row = document.createElement('div');
    row.className = 'qs-result';
    row.dataset.address = token.address;

    var symDiv = document.createElement('div');
    symDiv.className = 'qs-symbol';
    symDiv.innerHTML = highlightMatch(token.symbol, query);

    var nameDiv = document.createElement('div');
    nameDiv.className = 'qs-name';
    nameDiv.innerHTML = highlightMatch(token.name, query);

    var chainDiv = document.createElement('div');
    chainDiv.className = 'qs-chain';
    chainDiv.textContent = getChainBadge(token.chain);

    var mcDiv = document.createElement('div');
    mcDiv.className = 'qs-mc';
    mcDiv.textContent = formatMC(token.mcap);

    row.appendChild(symDiv);
    row.appendChild(nameDiv);
    row.appendChild(chainDiv);
    row.appendChild(mcDiv);

    return row;
  }

  // Create dropdown UI
  function createDropdown() {
    var dropdown = document.createElement('div');
    dropdown.className = 'qs-dropdown';
    return dropdown;
  }

  // Search module
  var Search = {
    dropdown: null,
    input: null,
    debounceTimer: null,

    attach: function(inputElement) {
      this.input = inputElement;

      if (!this.dropdown) {
        this.dropdown = createDropdown();
        (inputElement.parentNode || document.body).appendChild(this.dropdown);
      }

      inputElement.oninput = function(e) {
        var value = e.target.value;
        clearTimeout(Search.debounceTimer);
        Search.debounceTimer = setTimeout(function() {
          Search.showResults(value);
        }, 150);
      };

      inputElement.onkeydown = function(e) {
        switch (e.key) {
          case 'Escape':
            Search.close();
            break;
          case 'Enter':
            Search.selectCurrent();
            break;
        }
      };

      document.addEventListener('click', function(e) {
        if (!inputElement.contains(e.target) && !Search.dropdown.contains(e.target)) {
          Search.close();
        }
      });

      injectCSS();
    },

    showResults: function(query) {
      if (!this.dropdown) return;

      var results = searchTokens(query);
      var groups = groupBySymbol(results);

      this.dropdown.innerHTML = '';

      if (results.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'qs-empty';
        empty.textContent = 'No tokens found';
        this.dropdown.appendChild(empty);
        this.dropdown.style.display = 'block';
        return;
      }

      var count = 0;
      for (var sym in groups) {
        if (count >= 8) break;

        var groupDiv = document.createElement('div');
        groupDiv.className = 'qs-group';

        var title = document.createElement('div');
        title.className = 'qs-group-title';
        title.textContent = sym;

        groupDiv.appendChild(title);

        var tokens = groups[sym];
        for (var i = 0; i < tokens.length && count < 8; i++) {
          var row = createResultRow(tokens[i], query);
          row.onmouseenter = function() {
            Search.dropdown.querySelectorAll('.qs-result').forEach(function(r) {
              r.classList.remove('qs-highlight');
            });
            this.classList.add('qs-highlight');
          };
          row.onclick = function() {
            Search.selectToken(this.dataset.address);
          };
          groupDiv.appendChild(row);
          count++;
        }

        this.dropdown.appendChild(groupDiv);
      }

      this.dropdown.style.display = 'block';
    },

    close: function() {
      if (this.dropdown) {
        this.dropdown.style.display = 'none';
      }
    },

    selectCurrent: function() {
      var highlighted = this.dropdown.querySelector('.qs-highlight, .qs-result');
      if (highlighted && highlighted.dataset.address) {
        this.selectToken(highlighted.dataset.address);
      }
    },

    selectToken: function(address) {
      if (address) {
        this.close();
        if (this.input) {
          this.input.value = '';
        }
        window.location.hash = '#/token/' + address;
      }
    },
  };

  window.Search = Search;

})();
;
/* js/qh-view.js */
/* qh-view.js: small shared kit for Discover and Portfolio. Written by Claude.
   - tokens(): the one adapter. Reads window.QHLive.all() when live rows exist, else window.QH_TOKENS fixtures,
     and returns flat view rows so screens never touch raw shapes.
   - fmt: window.QHFmt when loaded, else a local copy with the same rules (invalid -> em dash).
   - spark(): inline SVG polyline sparkline (no circles). rng(): seeded random for stable fixture numbers. */
window.QHView = (function () {
  "use strict";
  var DASH = "—";
  var STOCKS = ["TSLA", "NVDA", "AAPL", "AMZN", "PLTR"];

  function ok(v) { return typeof v === "number" && isFinite(v); }
  function usd(v) {
    if (window.QHFmt) return window.QHFmt.usd(v);
    if (!ok(v)) return DASH;
    var a = Math.abs(v), s = v < 0 ? "-$" : "$";
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e4 ? 1 : 2) + "K";
    return s + a.toFixed(2);
  }
  function pct(v, sign) { if (!ok(v)) return DASH; return (sign && v > 0 ? "+" : "") + v.toFixed(Math.abs(v) >= 100 ? 0 : 1) + "%"; }
  function num(v) {
    if (!ok(v)) return DASH;
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return (v / 1e3).toFixed(1) + "K";
    return Math.round(v).toLocaleString("en-US");
  }
  function age(s) {
    if (!ok(s) || s < 0) return DASH;
    return s < 60 ? Math.floor(s) + "s" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : Math.floor(s / 86400) + "d";
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function short(a) { a = String(a || ""); return a.length > 12 ? a.slice(0, 4) + "…" + a.slice(-4) : a || DASH; }
  var TAGS = { Robinhood: "RH", Base: "BASE", Solana: "SOL", BNB: "BNB", Ethereum: "ETH", Arbitrum: "ARB", Elysium: "ELY", Monad: "MON" };
  function tag(c) { return '<span class="qv-cb">' + esc(TAGS[c] || String(c || "").slice(0, 4).toUpperCase()) + "</span>"; }
  function cls(v) { return ok(v) ? (v >= 0 ? "qv-up" : "qv-dn") : ""; }

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function hash(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function spark(vals, w, h, up) {
    w = w || 64; h = h || 20;
    var v = (vals || []).filter(ok);
    if (v.length < 2) return '<span class="qv-nospark">' + DASH + "</span>";
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), span = hi - lo || 1;
    var pts = v.map(function (x, i) { return (i * (w / (v.length - 1))).toFixed(1) + "," + (h - 1 - ((x - lo) / span) * (h - 2)).toFixed(1); }).join(" ");
    var col = up == null ? (v[v.length - 1] >= v[0] ? "var(--up)" : "var(--dn)") : (up ? "var(--up)" : "var(--dn)");
    return '<svg class="qv-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true"><polyline fill="none" stroke="' + col + '" stroke-width="1.3" stroke-linejoin="round" points="' + pts + '"/></svg>';
  }

  function closes(c) { return (c || []).map(function (x) { return Number(x.close != null ? x.close : x.c); }); }
  function vols(c) { return (c || []).map(function (x) { return Number(x.volume != null ? x.volume : x.v) || 0; }); }
  function sumArr(a) { var s = 0; a.forEach(function (x) { s += x; }); return s; }

  /* One view row per token. Fixture-only fields (fees, progress, stock pair) are derived only when the
     source is fixtures; live rows show an em dash until the feed carries them. */
  function row(t, fixture) {
    var c = t.candles || [], cl = closes(c), vl = vols(c), tr = t.trades || [];
    var first = cl.length ? cl[0] : NaN, last = cl.length ? cl[cl.length - 1] : NaN;
    var change = ok(t.change24) ? t.change24 : (first ? ((last - first) / first) * 100 : NaN);
    var buys = ok(t.buys) ? t.buys : tr.filter(function (x) { return x.type === "buy" || x.side === "buy"; }).length;
    var sells = ok(t.sells) ? t.sells : tr.length - buys;
    var recent = sumArr(vl.slice(-12)), prior = sumArr(vl.slice(-24, -12));
    var growth = prior > 0 ? ((recent - prior) / prior) * 100 : (ok(t.volGrowth) ? t.volGrowth : NaN);
    var r = rng(hash(t.address || t.symbol));
    var progress = ok(t.progress) ? t.progress : null, stage = t.stage || null;
    if (fixture && progress == null && (stage === "new" || stage === "final")) progress = stage === "final" ? 70 + r() * 29.5 : 4 + r() * 62;
    var pair = t.pair || t.quote || null;
    if (fixture && !pair && t.chain === "Robinhood" && r() < 0.7) pair = STOCKS[Math.floor(r() * STOCKS.length)];
    var fees = ok(t.fees) ? t.fees : (fixture && ok(t.volume) ? t.volume * 0.008 : NaN);
    return {
      t: t, sym: t.symbol || DASH, name: t.name || "", chain: t.chain || "", href: t.href || "#/token/" + encodeURIComponent(t.address || ""),
      ageSec: ok(t.ageSec) ? t.ageSec : NaN, mcap: ok(t.mcap) ? t.mcap : NaN, liq: ok(t.liquidity) ? t.liquidity : NaN,
      vol: ok(t.volume) ? t.volume : NaN, change: change, buys: buys, sells: sells, txs: buys + sells,
      holders: ok(t.holders) ? t.holders : NaN, fees: fees, growth: growth, progress: progress, stage: stage,
      bonding: progress != null && stage !== "migrated", pair: pair, stock: !!(pair && STOCKS.indexOf(String(pair).toUpperCase()) >= 0) || !!t.isStock,
      spark: cl.slice(-48), qProof: t.qProof || "Not checked", native: t.native || (t.chain === "Solana" ? "SOL" : t.chain === "BNB" ? "BNB" : "ETH"),
      price: ok(t.price) ? t.price : NaN, trades: tr
    };
  }
  function tokens() {
    var L = window.QHLive, live = L && L.all ? L.all() : [];
    if (live && live.length >= 8) return live.map(function (t) { return row(t, false); });
    return (window.QH_TOKENS || []).map(function (t) { return row(t, true); });
  }
  function source() { var L = window.QHLive; return L && L.all && L.all().length >= 8 ? "live" : "fixtures"; }
  function chains(rows) { var seen = {}, out = []; rows.forEach(function (r) { if (r.chain && !seen[r.chain]) { seen[r.chain] = 1; out.push(r.chain); } }); return out; }

  function toast(text, action, onAction) {
    var s = document.querySelector(".qv-toasts");
    if (!s) { s = document.createElement("div"); s.className = "qv-toasts"; document.body.appendChild(s); }
    var t = document.createElement("div"); t.className = "qv-toast"; t.textContent = text;
    if (action) { var b = document.createElement("button"); b.textContent = action; b.onclick = function () { onAction(); t.remove(); }; t.appendChild(b); }
    s.appendChild(t); setTimeout(function () { t.remove(); }, 5000);
  }
  function gone(el) { return !el || !document.body.contains(el); }

  var css = document.createElement("style");
  css.textContent =
    ".qv-up{color:var(--up)}.qv-dn{color:var(--dn)}.qv-mut{color:var(--mut)}.qv-spark{display:block}.qv-nospark{color:var(--mut)}" +
    ".qv-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.qv-chips::-webkit-scrollbar{display:none}" +
    ".qv-chip{flex:0 0 auto;height:28px;padding:0 10px;border:1px solid var(--line);background:var(--s2);color:var(--mut);border-radius:4px;font-size:12px;cursor:pointer;white-space:nowrap}" +
    ".qv-chip.on{color:var(--tx);border-color:rgba(210,173,114,.55);background:rgba(210,173,114,.08)}" +
    ".qv-cb{display:inline-block;font-size:10px;line-height:14px;color:var(--mut);border:1px solid var(--line);border-radius:4px;padding:0 4px;vertical-align:1px}" +
    ".qv-toasts{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;z-index:70}" +
    ".qv-toast{display:flex;gap:10px;align-items:center;background:var(--s2);border:1px solid var(--line);color:var(--tx);padding:8px 12px;border-radius:6px;font-size:12px}" +
    ".qv-toast button{background:none;border:1px solid var(--line);color:var(--acc);border-radius:4px;height:28px;padding:0 8px;cursor:pointer}" +
    "@media (max-width:767px){.qv-chip{height:44px;padding:0 12px}.qv-toast button{height:44px}}";
  document.head.appendChild(css);

  return { DASH: DASH, ok: ok, usd: usd, pct: pct, num: num, age: age, esc: esc, short: short, cls: cls, rng: rng, hash: hash,
    spark: spark, tag: tag, tokens: tokens, source: source, chains: chains, toast: toast, gone: gone, row: row };
})();
;
/* js/discover-table.js */
/* Discover table (contract section 6 + parity row "Discovery"). Written by Claude.
   Dense trending table: sparkline from candles, MC with change, Liq, 24h volume, buys/sells, holders, fees,
   QProof + hook badge, quick buy. Each tab passes its default sort (rule 11) and an optional extra column
   (bonding progress or volume growth). A non-default sort shows "Sorted by X · Reset". Rows are real links. */
window.DiscoverTable = (function () {
  "use strict";
  var V = window.QHView;
  var BASE = [
    { k: "sym", l: "Token", left: true },
    { k: "ageSec", l: "Age" },
    { k: "spark", l: "Chart", nosort: true },
    { k: "mcap", l: "MC" },
    { k: "liq", l: "Liq" },
    { k: "vol", l: "24h Vol" },
    { k: "txs", l: "24h TXs" },
    { k: "holders", l: "Holders" },
    { k: "fees", l: "Fees" }
  ];
  var EXTRA = { progress: { k: "progress", l: "Bonding" }, growth: { k: "growth", l: "Vol 1h" } };
  var sorts = {};

  function cell(r, k) {
    if (k === "sym") {
      return '<span class="dt-l1"><b class="dt-sym">' + V.esc(r.sym) + "</b>" + (r.pair ? '<span class="dt-pair">/' + V.esc(r.pair) + "</span>" : "") +
        ' <span class="dt-name">' + V.esc(r.name) + "</span> " + V.tag(r.chain) + "</span>" +
        '<span class="dt-mchips">' + chips(r) + "</span>";
    }
    if (k === "ageSec") return V.age(r.ageSec);
    if (k === "spark") return V.spark(r.spark, 72, 22);
    if (k === "mcap") return '<span class="dt-2"><span>' + V.usd(r.mcap) + '</span><small class="' + V.cls(r.change) + '">' + V.pct(r.change, true) + "</small></span>";
    if (k === "liq") return V.usd(r.liq);
    if (k === "vol") return V.usd(r.vol);
    if (k === "txs") return '<span class="dt-2"><span>' + V.num(r.txs) + '</span><small><span class="qv-up">' + V.num(r.buys) + '</span> / <span class="qv-dn">' + V.num(r.sells) + "</span></small></span>";
    if (k === "holders") return V.num(r.holders);
    if (k === "fees") return V.usd(r.fees);
    if (k === "progress") {
      var p = V.ok(r.progress) ? Math.max(0, Math.min(100, r.progress)) : NaN;
      return '<span class="dt-prog"><span class="dt-bar"><i style="width:' + (V.ok(p) ? p.toFixed(1) : 0) + '%"></i></span><span>' + V.pct(p) + "</span></span>";
    }
    if (k === "growth") return '<span class="' + V.cls(r.growth) + '">' + V.pct(r.growth, true) + "</span>";
    if (k === "qp") return chips(r);
    return "";
  }
  function chips(r) {
    var q = r.qProof || "Not checked";
    return '<span class="pulse-qproof pulse-qproof-' + q.toLowerCase().replace(" ", "-") + '">' + V.esc(q) + "</span>" + (window.HookBadge ? " " + window.HookBadge.inRow(r.t) : "");
  }
  function val(r, k) { return k === "sym" ? String(r.sym) : r[k]; }

  function render(container, rows, opts) {
    opts = opts || {};
    var tab = opts.tab || "trending", def = opts.sort || { k: "vol", dir: -1 };
    if (!sorts[tab]) sorts[tab] = { k: def.k, dir: def.dir };
    var st = sorts[tab], cols = BASE.slice(0);
    if (opts.extra && EXTRA[opts.extra]) cols.splice(3, 0, EXTRA[opts.extra]);
    cols.push({ k: "qp", l: "QProof", left: true, nosort: true });
    var labelOf = {}; cols.forEach(function (c) { labelOf[c.k] = c.l; });

    function draw() {
      rows.sort(function (a, b) {
        var va = val(a, st.k), vb = val(b, st.k);
        if (typeof va === "string") return st.dir * va.localeCompare(vb);
        return st.dir * ((V.ok(va) ? va : 1e18 * st.dir) - (V.ok(vb) ? vb : 1e18 * st.dir));
      });
      var head = '<div class="dt-row dt-head">' + cols.map(function (c) {
        if (c.nosort) return '<span class="dt-h dt-k-' + c.k + (c.left ? " dt-left" : "") + '">' + c.l + "</span>";
        var on = c.k === st.k;
        return '<button class="dt-h dt-k-' + c.k + (c.left ? " dt-left" : "") + (on ? " dt-sorted" : "") + '" data-k="' + c.k + '">' + c.l + (on ? (st.dir < 0 ? " ▾" : " ▴") : "") + "</button>";
      }).join("") + '<span class="dt-h dt-k-buy"></span></div>';
      var amt = V.esc(window.QHQuickBuy ? window.QHQuickBuy.amount() : "0.01");
      var body = rows.length ? rows.map(function (r) {
        return '<a class="dt-row" href="' + V.esc(r.href) + '">' + cols.map(function (c) {
          return '<span class="dt-c dt-k-' + c.k + (c.left ? " dt-left" : "") + '">' + cell(r, c.k) + "</span>";
        }).join("") + '<span class="dt-c dt-k-buy"><button type="button" class="pulse-buy-btn dt-buy" data-sym="' + V.esc(r.sym) + '" data-href="' + V.esc(r.href) + '" data-addr="' + V.esc(r.t && r.t.address || "") + '" data-unit="' + V.esc(r.native) + '" aria-label="Buy ' + amt + " " + V.esc(r.native) + " of " + V.esc(r.sym) + '">' + amt + " " + V.esc(r.native) + "</button></span></a>";
      }).join("") : '<div class="dt-empty">No tokens on these chains in this tab yet.</div>';
      var custom = st.k !== def.k || st.dir !== def.dir;
      var chip = '<div class="dt-sortchip">Sorted by ' + V.esc(labelOf[st.k] || st.k) + (st.dir < 0 ? ", high first" : ", low first") +
        (custom ? ' <button class="dt-reset">Reset</button>' : "") + "</div>";
      /* No chart data on any row: drop the Chart column instead of a column of dashes. (Fable) */
      var hasSpark = rows.some(function (r) { return r.spark && r.spark.length > 1; });
      container.innerHTML = chip + '<div class="dt-table' + (opts.extra ? " dt-hasx" : "") + (hasSpark ? "" : " dt-nospark") + '">' + head + body + "</div>";
      var rs = container.querySelector(".dt-reset");
      if (rs) rs.onclick = function () { st.k = def.k; st.dir = def.dir; draw(); };
      container.querySelectorAll("button.dt-h").forEach(function (b) {
        b.onclick = function () { var k = b.getAttribute("data-k"); if (k === st.k) st.dir = -st.dir; else { st.k = k; st.dir = k === "ageSec" ? 1 : -1; } draw(); };
      });
      container.querySelectorAll(".dt-buy").forEach(function (b) {
        b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); if (window.QHQuickBuy) window.QHQuickBuy.tap(b); else location.hash = b.getAttribute("data-href"); };
      });
    }
    draw();
  }

  var GRID = "minmax(200px,2.1fr) 44px 80px 0.9fr 0.8fr 0.8fr 0.9fr 0.7fr 0.8fr minmax(118px,1.1fr) 120px";
  var GRIDX = "minmax(200px,2.1fr) 44px 80px 96px 0.9fr 0.8fr 0.8fr 0.9fr 0.7fr 0.8fr minmax(118px,1.1fr) 120px";
  var css = document.createElement("style");
  css.textContent =
    ".dt-table{background:var(--s1);border:1px solid var(--line);border-radius:8px;overflow:hidden}" +
    ".dt-row{display:grid;grid-template-columns:" + GRID + ";align-items:center;gap:8px;height:44px;padding:0 12px;border-bottom:1px solid var(--line);color:var(--tx);text-decoration:none;font-size:12px;font-variant-numeric:tabular-nums}" +
    ".dt-hasx .dt-row{grid-template-columns:" + GRIDX + "}" +
    "a.dt-row:hover{background:var(--s2)}.dt-head{height:32px;position:sticky;top:0;background:var(--s1);z-index:1}" +
    ".dt-h{background:none;border:0;color:var(--mut);font-size:11px;text-align:right;cursor:pointer;padding:0;white-space:nowrap}span.dt-h{cursor:default}.dt-h.dt-sorted{color:var(--tx)}" +
    ".dt-c{text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.dt-left{text-align:left}" +
    ".dt-k-spark{display:flex;justify-content:flex-end}.dt-k-buy{text-align:right}" +
    ".dt-l1{display:block;overflow:hidden;text-overflow:ellipsis}.dt-sym{font-size:13px;font-weight:600}.dt-pair{color:var(--acc);font-size:11px}.dt-name{color:var(--mut)}" +
    ".dt-2{display:flex;flex-direction:column;align-items:flex-end;line-height:15px}.dt-2 small{font-size:10px;color:var(--mut)}" +
    ".dt-prog{display:flex;flex-direction:column;align-items:flex-end;gap:3px;line-height:12px;font-size:11px}" +
    ".dt-bar{display:block;width:72px;height:4px;background:var(--s2);border-radius:2px;overflow:hidden}.dt-bar i{display:block;height:100%;background:var(--acc)}" +
    ".dt-sortchip{font-size:11px;color:var(--mut);margin:0 0 6px;display:flex;align-items:center;gap:6px}" +
    ".dt-reset{border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;height:24px;padding:0 8px;cursor:pointer;font-size:11px}" +
    ".dt-mchips{display:none}.dt-k-qp .pulse-qproof{font-size:10px}.dt-empty{padding:16px 12px;color:var(--mut);font-size:12px}" +
    "@media (max-width:1180px){.dt-row,.dt-hasx .dt-row{grid-template-columns:minmax(170px,2fr) 72px 0.9fr 0.8fr 0.9fr 0.8fr 96px}.dt-hasx .dt-row{grid-template-columns:minmax(170px,2fr) 72px 90px 0.9fr 0.8fr 0.9fr 0.8fr 96px}" +
    ".dt-k-ageSec,.dt-k-liq,.dt-k-holders,.dt-k-qp{display:none}.dt-mchips{display:flex;gap:4px;align-items:center;margin-top:2px}.dt-mchips .pulse-qproof,.dt-mchips .hk-badge{font-size:9px;padding:0 5px}.dt-c.dt-k-sym{display:flex;flex-direction:column}}" +
    "@media (max-width:767px){.dt-row,.dt-hasx .dt-row{grid-template-columns:minmax(0,1fr) 56px 76px 80px;height:56px;gap:6px;padding:0 10px}" +
    ".dt-k-fees,.dt-k-vol,.dt-k-txs{display:none}.dt-hasx .dt-k-spark{display:none}.dt-hasx .dt-row{grid-template-columns:minmax(0,1fr) 76px 76px 80px}" +
    ".dt-name{display:none}.dt-bar{width:60px}.dt-buy{min-height:44px;width:80px;padding:0 4px;font-size:11px}.dt-bw{display:none}.dt-reset{height:44px;padding:0 12px}.dt-head{height:36px}}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/dc-live.js */
/* Discover "Live" tab: newest trades across every token, streaming in at the top. Written by Claude.
   Live mode re-reads trades already held by window.QHLive (no new polling routes). Fixture mode adds a
   synthetic trade every 1.6 s so the screen behaves the same. Rows never move while the pointer or a finger
   is on the list (contract v1.1 #3): new trades wait in a buffer and enter with a 150 ms slide when it leaves. */
window.DiscoverLive = (function () {
  "use strict";
  var V = window.QHView, MAX = 80;

  function key(x) { return x.r.sym + ":" + x.time + ":" + (x.trader || "") + ":" + x.usd; }
  function collect(rows) {
    var out = [];
    rows.forEach(function (r) {
      (r.trades || []).slice(0, 12).forEach(function (tr) {
        var usd = Number(tr.usd != null ? tr.usd : tr.valueUsd), time = Number(tr.time != null ? tr.time : tr.ts);
        if (!V.ok(usd) || !V.ok(time)) return;
        out.push({ r: r, side: tr.type || tr.side || "buy", usd: usd, qty: Number(tr.amount), time: time, trader: tr.trader || tr.wallet || "" });
      });
    });
    return out.sort(function (a, b) { return b.time - a.time; });
  }
  function fake(rows, rand) {
    var r = rows[Math.floor(rand() * rows.length)], usd = Math.pow(10, 0.5 + rand() * 3.2);
    var hex = ""; for (var i = 0; i < 40; i++) hex += "0123456789abcdef".charAt(Math.floor(rand() * 16));
    return { r: r, side: rand() < 0.56 ? "buy" : "sell", usd: usd, qty: V.ok(r.price) && r.price > 0 ? usd / r.price : NaN, time: Date.now(), trader: "0x" + hex };
  }
  function line(x) {
    var buy = x.side === "buy";
    return '<a class="lv-row" href="' + V.esc(x.r.href) + '" data-t="' + x.time + '">' +
      '<span class="lv-age" data-t="' + x.time + '">' + V.age((Date.now() - x.time) / 1000) + "</span>" +
      '<span class="lv-side ' + (buy ? "qv-up" : "qv-dn") + '">' + (buy ? "Buy" : "Sell") + "</span>" +
      '<span class="lv-tok"><b>' + V.esc(x.r.sym) + "</b> " + V.tag(x.r.chain) + "</span>" +
      '<span class="lv-usd ' + (buy ? "qv-up" : "qv-dn") + '">' + V.usd(x.usd) + "</span>" +
      '<span class="lv-qty">' + V.num(x.qty) + "</span>" +
      '<span class="lv-mc">' + V.usd(x.r.mcap) + "</span>" +
      '<span class="lv-who">' + V.esc(V.short(x.trader)) + "</span></a>";
  }

  function render(container, rows) {
    var rand = V.rng(Date.now() & 0xffff), seen = {}, held = false, buffer = [], fixtures = V.source() === "fixtures";
    var list = collect(rows).slice(0, 40);
    list.forEach(function (x) { seen[key(x)] = 1; });
    container.innerHTML = '<div class="lv-wrap"><div class="lv-top"><span class="lv-dot-label">Live</span> <span class="lv-fresh qv-mut">· 0s</span>' +
      '<span class="qv-mut lv-hint">Newest trades on every chain you picked</span></div>' +
      '<div class="lv-row lv-head"><span>Age</span><span>Side</span><span>Token</span><span class="lv-usd">Value</span><span class="lv-qty">Amount</span><span class="lv-mc">MC</span><span class="lv-who">Wallet</span></div>' +
      '<div class="lv-body">' + list.map(line).join("") + "</div></div>";
    var body = container.querySelector(".lv-body"), fresh = container.querySelector(".lv-fresh"), last = Date.now();
    function hold(v) { held = v; if (!v) flush(); }
    body.addEventListener("mouseenter", function () { hold(true); });
    body.addEventListener("mouseleave", function () { hold(false); });
    body.addEventListener("touchstart", function () { hold(true); }, { passive: true });
    body.addEventListener("touchend", function () { setTimeout(function () { hold(false); }, 1200); }, { passive: true });
    function flush() {
      if (held || !buffer.length) return;
      buffer.splice(0).reverse().forEach(function (x) {
        var tmp = document.createElement("div"); tmp.innerHTML = line(x);
        var el = tmp.firstChild; el.classList.add("lv-in"); body.insertBefore(el, body.firstChild);
      });
      while (body.children.length > MAX) body.removeChild(body.lastChild);
      last = Date.now();
    }
    var timer = setInterval(function () {
      if (V.gone(container) || !document.body.contains(body)) { clearInterval(timer); return; }
      if (document.hidden) return;
      if (fixtures) buffer.push(fake(rows, rand));
      else collect(V.tokens()).forEach(function (x) { var k = key(x); if (!seen[k]) { seen[k] = 1; buffer.push(x); } });
      flush();
      fresh.textContent = "· " + Math.max(0, Math.round((Date.now() - last) / 1000)) + "s";
      body.querySelectorAll(".lv-age").forEach(function (s) { s.textContent = V.age((Date.now() - Number(s.getAttribute("data-t"))) / 1000); });
    }, 1600);
  }

  var css = document.createElement("style");
  css.textContent =
    ".lv-wrap{background:var(--s1);border:1px solid var(--line);border-radius:8px;overflow:hidden}" +
    ".lv-top{display:flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-bottom:1px solid var(--line);font-size:12px}.lv-dot-label{color:var(--up);font-weight:600}.lv-hint{margin-left:auto;font-size:11px}" +
    ".lv-row{display:grid;grid-template-columns:48px 44px minmax(120px,1.4fr) 1fr 1fr 1fr 1fr;gap:8px;align-items:center;height:32px;padding:0 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--tx);text-decoration:none;font-variant-numeric:tabular-nums}" +
    "a.lv-row:hover{background:var(--s2)}.lv-head{height:28px;color:var(--mut);font-size:11px}" +
    ".lv-usd,.lv-qty,.lv-mc,.lv-who{text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-who{color:var(--mut)}.lv-age{color:var(--mut)}.lv-side{font-weight:600}" +
    ".lv-tok{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "@keyframes lvIn{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}.lv-in{animation:lvIn .15s ease-out;background:rgba(210,173,114,.05)}" +
    "@media (max-width:767px){.lv-row{grid-template-columns:40px 38px minmax(0,1fr) 72px 64px;height:44px;padding:0 10px;gap:6px}.lv-head{height:28px}.lv-qty,.lv-who{display:none}.lv-hint{display:none}}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/discover.js */
/* Discover page (contract section 6, parity row "Discovery"). Written by Claude.
   Tabs: Trending, New, Near graduation, Hot, Stocks, Live. Each list's default sort matches its name (v1.1 #11).
   Chain chips are multi-select ("All" clears them). Data comes from window.QHView.tokens() (live first,
   fixtures otherwise). The table lives in discover-table.js, the trade stream in dc-live.js. */
window.Discover = (function () {
  "use strict";
  var V = window.QHView;
  var TABS = [
    { id: "trending", l: "Trending", sort: { k: "vol", dir: -1 } },
    { id: "new", l: "New", sort: { k: "ageSec", dir: 1 } },
    { id: "near", l: "Near graduation", sort: { k: "progress", dir: -1 }, extra: "progress", only: function (r) { return r.bonding && V.ok(r.progress); } },
    { id: "hot", l: "Hot", sort: { k: "growth", dir: -1 }, extra: "growth", only: function (r) { return V.ok(r.growth); } },
    { id: "stocks", l: "Stocks", sort: { k: "vol", dir: -1 }, only: function (r) { return r.stock; } },
    { id: "live", l: "Live" }
  ];
  var state = { tab: "trending", chains: {} };

  function picked(rows) {
    var any = Object.keys(state.chains).length > 0;
    return any ? rows.filter(function (r) { return state.chains[r.chain]; }) : rows;
  }
  function tabOf(id) { return TABS.filter(function (t) { return t.id === id; })[0] || TABS[0]; }

  function render(root) {
    var m = /[?&]tab=([a-z]+)/.exec(location.hash); if (m && tabOf(m[1]).id === m[1]) state.tab = m[1];
    root.innerHTML = '<div class="dc-page"><div class="dc-top"><div class="dc-tabs" role="tablist"></div><span class="dc-src qv-mut"></span></div>' +
      '<div class="dc-chainrow"><div class="qv-chips dc-chains"></div></div><div class="dc-body"></div></div>';
    var tabsEl = root.querySelector(".dc-tabs"), chainsEl = root.querySelector(".dc-chains"), body = root.querySelector(".dc-body");
    var all = V.tokens();
    root.querySelector(".dc-src").textContent = V.source() === "live" ? "Live" : "Sample data";

    function drawTabs() {
      var rows = picked(all);
      tabsEl.innerHTML = TABS.map(function (t) {
        var n = t.id === "live" ? "" : (t.only ? rows.filter(t.only) : rows).length;
        if (n === 0 && t.id !== state.tab) return ""; /* an empty list is not offered as a tab (Fable) */
        return '<button class="dc-tab' + (t.id === state.tab ? " on" : "") + '" role="tab" data-t="' + t.id + '">' + t.l + (n !== "" ? ' <small>' + n + "</small>" : "") + "</button>";
      }).join("");
      tabsEl.querySelectorAll(".dc-tab").forEach(function (b) {
        b.onclick = function () { state.tab = b.getAttribute("data-t"); drawTabs(); drawBody(); };
      });
    }
    function drawChains() {
      var names = V.chains(all), none = !Object.keys(state.chains).length;
      chainsEl.innerHTML = '<button class="qv-chip' + (none ? " on" : "") + '" data-c="">All chains</button>' + names.map(function (c) {
        return '<button class="qv-chip' + (state.chains[c] ? " on" : "") + '" data-c="' + V.esc(c) + '" aria-pressed="' + !!state.chains[c] + '">' + V.esc(c) + "</button>";
      }).join("");
      chainsEl.querySelectorAll(".qv-chip").forEach(function (b) {
        b.onclick = function () {
          var c = b.getAttribute("data-c");
          if (!c) state.chains = {}; else if (state.chains[c]) delete state.chains[c]; else state.chains[c] = 1;
          if (Object.keys(state.chains).length === names.length) state.chains = {};
          drawChains(); drawTabs(); drawBody();
        };
      });
    }
    function drawBody() {
      var t = tabOf(state.tab), rows = picked(all);
      if (t.id === "live") { window.DiscoverLive.render(body, rows); return; }
      if (t.only) rows = rows.filter(t.only);
      window.DiscoverTable.render(body, rows.slice(0), { tab: t.id, sort: t.sort, extra: t.extra });
    }
    drawChains(); drawTabs(); drawBody();
  }

  var css = document.createElement("style");
  css.textContent =
    ".dc-page{display:flex;flex-direction:column;gap:8px;min-width:0}" +
    ".dc-top{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line);min-width:0}" +
    ".dc-tabs{display:flex;gap:18px;overflow-x:auto;scrollbar-width:none;min-width:0;flex:1}.dc-tabs::-webkit-scrollbar{display:none}" +
    ".dc-tab{flex:0 0 auto;background:none;border:0;border-bottom:2px solid transparent;color:var(--mut);font-size:16px;font-weight:600;padding:8px 0;cursor:pointer;white-space:nowrap}" +
    ".dc-tab small{font-size:11px;font-weight:400;color:var(--mut);margin-left:2px}.dc-tab.on{color:var(--tx);border-bottom-color:var(--acc)}" +
    ".dc-src{font-size:11px;white-space:nowrap}.dc-chainrow{display:flex;align-items:center;gap:8px;min-width:0}.dc-chains{flex:1;min-width:0}" +
    ".dc-body{min-width:0}" +
    "@media (max-width:767px){.q-discover{padding:8px 10px}.dc-tabs{gap:14px}.dc-tab{font-size:14px;min-height:44px}.dc-src{display:none}}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/pf-data.js */
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
;
/* js/pf-summary.js */
/* Portfolio summary row (contract section 5 + parity row "Portfolio"). Written by Claude.
   Three cards: Balance (total, unrealized, tradeable, 7-day line, cashback and rewards earned -> #/rewards),
   Realized PnL bars (1d/7d/30d/Max), Performance (total PnL, TXNs, win rate, five win-rate buckets). */
window.PfSummary = (function () {
  "use strict";
  var V = window.QHView, D = window.PfData;
  var RANGES = [["1d", 1], ["7d", 7], ["30d", 30], ["Max", 90]];
  var range = 7;

  function bars(list, w, h) {
    var max = 0; list.forEach(function (x) { max = Math.max(max, Math.abs(x.v)); });
    max = max || 1;
    var bw = w / list.length, mid = h / 2, out = '<line x1="0" x2="' + w + '" y1="' + mid + '" y2="' + mid + '" stroke="var(--line)"/>';
    list.forEach(function (x, i) {
      var bh = Math.max(x.v ? 1 : 0, (Math.abs(x.v) / max) * (mid - 2)), y = x.v >= 0 ? mid - bh : mid;
      out += '<rect x="' + (i * bw + bw * 0.15).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, bw * 0.7).toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + (x.v >= 0 ? "var(--up)" : "var(--dn)") + '"><title>' + x.d.toDateString() + ": " + V.usd(x.v) + "</title></rect>";
    });
    return '<svg class="ps-bars" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-label="Realized PnL by day">' + out + "</svg>";
  }
  function kv(k, v, c) { return '<div class="ps-kv"><span>' + k + '</span><b class="' + (c || "") + '">' + v + "</b></div>"; }

  function render(root, data) {
    var s = data, total = s.held + s.tradeable;
    var bal = D.series(7).reduce(function (acc, x) { acc.push((acc.length ? acc[acc.length - 1] : total - 900) + x.v); return acc; }, []);
    var realized = 0; D.series(90).forEach(function (x) { realized += x.v; });
    var all = s.history.concat(s.positions), wins = all.filter(function (x) { return x.pnl > 0; }).length;
    var bk = D.buckets(all), n = all.length || 1;

    root.innerHTML = '<div class="ps-row">' +
      '<section class="ps-card ps-bal"><div class="ps-h">Balance</div><div class="ps-split"><div>' +
        '<div class="ps-k">Total value</div><div class="ps-big">' + V.usd(total) + "</div>" +
        kv("Unrealized PnL", V.usd(s.unreal), V.cls(s.unreal)) + kv("Tradeable", V.usd(s.tradeable)) + kv("In tokens", V.usd(s.held)) +
      '</div><div class="ps-line"><div class="ps-k">Last 7 days</div>' + V.spark(bal, 150, 46) + "</div></div>" +
      '<a class="ps-rw" href="#/rewards"><span class="ps-rwk">Earned with QHooks</span><span class="ps-rwv"></span><span class="ps-rwgo">Open rewards</span></a></section>' +
      '<section class="ps-card"><div class="ps-h">Realized PnL <span class="ps-rng"></span></div><div class="ps-rtot"></div><div class="ps-chart"></div></section>' +
      '<section class="ps-card"><div class="ps-h">Performance</div><div class="ps-perf">' +
        kv("Total PnL", V.usd(realized + s.unreal), V.cls(realized + s.unreal)) + kv("Realized, 90 days", V.usd(realized), V.cls(realized)) +
        kv("Trades", '<span class="qv-up">' + s.buys + '</span> / <span class="qv-dn">' + s.sells + "</span>") +
        kv("Win rate", V.pct((wins / n) * 100) + ' <span class="qv-mut">(' + wins + " of " + all.length + ")</span>") +
      '</div><div class="ps-bk">' + bk.map(function (b) {
        return '<div class="ps-bkr"><i style="background:' + b.c + '"></i><span>' + b.l + "</span><b>" + b.n + "</b></div>";
      }).join("") + '</div><div class="ps-seg">' + bk.map(function (b) {
        return b.n ? '<i style="flex:' + b.n + ";background:" + b.c + '" title="' + b.l + ": " + b.n + '"></i>' : "";
      }).join("") + "</div></section></div>";

    function drawRewards(rw) {
      root.querySelector(".ps-rwv").innerHTML = "Cashback <b>" + V.usd(rw.cash) + "</b> · Referrals <b>" + V.usd(rw.ref) + "</b> · Ready to claim <b class=\"ps-acc\">" + V.usd(rw.claim) + "</b>";
    }
    drawRewards(s.rewards);
    D.liveRewards(function (rw) { s.rewards = rw; if (document.body.contains(root)) drawRewards(rw); });

    function drawChart() {
      var list = range === 1 ? D.series(24).map(function (x, i) { var r = V.rng(V.hash("h" + i)); return { d: x.d, v: (r() - 0.45) * 120 }; }) : D.series(range);
      var sum = 0; list.forEach(function (x) { sum += x.v; });
      root.querySelector(".ps-rtot").innerHTML = '<span class="ps-big ' + V.cls(sum) + '">' + V.usd(sum) + '</span> <span class="qv-mut">' + (range === 1 ? "today" : "last " + range + " days") + "</span>";
      root.querySelector(".ps-chart").innerHTML = bars(list, 300, 110);
      root.querySelector(".ps-rng").innerHTML = RANGES.map(function (r) { return '<button class="ps-rb' + (r[1] === range ? " on" : "") + '" data-d="' + r[1] + '">' + r[0] + "</button>"; }).join("");
      root.querySelectorAll(".ps-rb").forEach(function (b) { b.onclick = function () { range = Number(b.getAttribute("data-d")); drawChart(); }; });
    }
    drawChart();
  }

  var css = document.createElement("style");
  css.textContent =
    ".ps-row{display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:8px}" +
    ".ps-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px;min-width:0}" +
    ".ps-h{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:600}.ps-k{font-size:11px;color:var(--mut)}" +
    ".ps-big{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}.ps-split{display:grid;grid-template-columns:1fr 150px;gap:12px;align-items:end}" +
    ".ps-kv{display:flex;justify-content:space-between;gap:8px;font-size:12px;line-height:20px;color:var(--mut)}.ps-kv b{font-weight:600;color:var(--tx);font-variant-numeric:tabular-nums}.ps-kv b.qv-up{color:var(--up)}.ps-kv b.qv-dn{color:var(--dn)}" +
    ".ps-line{display:flex;flex-direction:column;gap:4px}" +
    ".ps-rw{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:auto;padding:8px 10px;border:1px solid rgba(210,173,114,.35);border-radius:6px;background:rgba(210,173,114,.05);color:var(--mut);font-size:12px;text-decoration:none}" +
    ".ps-rw b{color:var(--tx);font-weight:600;font-variant-numeric:tabular-nums}.ps-rw .ps-acc{color:var(--acc)}.ps-rwk{color:var(--acc);font-weight:600}.ps-rwgo{margin-left:auto;color:var(--acc)}" +
    ".ps-rng{display:flex;gap:2px}.ps-rb{background:none;border:1px solid transparent;color:var(--mut);font-size:11px;height:24px;padding:0 8px;border-radius:4px;cursor:pointer}.ps-rb.on{color:var(--tx);border-color:var(--line);background:var(--s2)}" +
    ".ps-rtot{display:flex;align-items:baseline;gap:8px;font-size:12px}.ps-chart{flex:1;min-height:90px}.ps-bars{width:100%;height:100%;min-height:90px;display:block}" +
    ".ps-bk{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-top:2px}.ps-bkr{display:flex;align-items:center;gap:6px;font-size:11px;line-height:18px;color:var(--mut)}.ps-bkr i{width:8px;height:8px;border-radius:2px}.ps-bkr b{margin-left:auto;color:var(--tx);font-weight:600}" +
    ".ps-seg{display:flex;height:4px;border-radius:2px;overflow:hidden;gap:1px;background:var(--s2)}.ps-seg i{display:block}" +
    "@media (max-width:1100px){.ps-row{grid-template-columns:1fr 1fr}.ps-bal{grid-column:1 / -1}}" +
    "@media (max-width:767px){.ps-row{grid-template-columns:1fr}.ps-split{grid-template-columns:1fr 110px}.ps-split .qv-spark{width:110px}.ps-rb{min-height:44px;min-width:44px}.ps-rw{min-height:44px}}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/pf-calendar.js */
/* PnL calendar (parity row "Portfolio": GMGN-style month grid). Written by Claude.
   Each day is tinted green or red by the size of that day's realized PnL relative to the month's biggest day.
   The header shows the month's net, winning days, losing days and win rate; arrows step through months. */
window.PfCalendar = (function () {
  "use strict";
  var V = window.QHView, D = window.PfData;
  var WD = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var offset = 0;

  function short(v) {
    if (!V.ok(v) || v === 0) return "";
    var a = Math.abs(v), s = v < 0 ? "-" : "+";
    return s + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + "K" : Math.round(a));
  }

  function render(root) {
    var now = new Date(), first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    var days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
    var vals = [], max = 0, net = 0, win = 0, loss = 0;
    for (var d = 1; d <= days; d++) {
      var v = D.daily(new Date(first.getFullYear(), first.getMonth(), d));
      vals.push(v);
      if (v != null) { max = Math.max(max, Math.abs(v)); net += v; if (v > 0) win++; else if (v < 0) loss++; }
    }
    var cells = "";
    for (var i = 0; i < lead; i++) cells += '<span class="pc-d pc-pad"></span>';
    var today = now.getDate(), isThis = offset === 0;
    vals.forEach(function (v, i2) {
      var day = i2 + 1, style = "", cls = "pc-d";
      if (v == null) cls += " pc-fut";
      else if (v !== 0) {
        var a = 0.12 + 0.6 * Math.sqrt(Math.abs(v) / (max || 1));
        style = ' style="background:' + (v > 0 ? "rgba(76,195,138," : "rgba(242,105,92,") + a.toFixed(2) + ')"';
      }
      if (isThis && day === today) cls += " pc-today";
      cells += '<span class="' + cls + '"' + style + ' title="' + (v == null ? "" : V.usd(v)) + '"><i>' + day + "</i><b>" + short(v) + "</b></span>";
    });
    var rate = win + loss ? (win / (win + loss)) * 100 : NaN;
    root.innerHTML = '<section class="pc-card"><div class="pc-top"><b>PnL calendar</b><span class="pc-nav">' +
      '<button class="pc-prev" aria-label="Previous month">‹</button><span class="pc-m">' + MONTHS[first.getMonth()] + " " + first.getFullYear() + "</span>" +
      '<button class="pc-next" aria-label="Next month"' + (offset >= 0 ? " disabled" : "") + ">›</button></span></div>" +
      '<div class="pc-stats"><span>Net <b class="' + V.cls(net) + '">' + V.usd(net) + "</b></span><span>Winning days <b class=\"qv-up\">" + win +
      "</b></span><span>Losing days <b class=\"qv-dn\">" + loss + "</b></span><span>Win rate <b>" + V.pct(rate) + "</b></span></div>" +
      '<div class="pc-grid">' + WD.map(function (w) { return '<span class="pc-wd">' + w + "</span>"; }).join("") + cells + "</div></section>";
    root.querySelector(".pc-prev").onclick = function () { offset--; render(root); };
    root.querySelector(".pc-next").onclick = function () { if (offset < 0) { offset++; render(root); } };
  }

  var css = document.createElement("style");
  css.textContent =
    ".pc-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px}" +
    ".pc-top{display:flex;align-items:center;justify-content:space-between;font-size:13px}.pc-nav{display:flex;align-items:center;gap:6px;font-size:12px}" +
    ".pc-nav button{width:26px;height:26px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;cursor:pointer;font-size:14px;line-height:1}.pc-nav button:disabled{opacity:.35;cursor:default}" +
    ".pc-m{min-width:110px;text-align:center}" +
    ".pc-stats{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11px;color:var(--mut)}.pc-stats b{font-weight:600;color:var(--tx);font-variant-numeric:tabular-nums}.pc-stats b.qv-up{color:var(--up)}.pc-stats b.qv-dn{color:var(--dn)}" +
    ".pc-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.pc-wd{font-size:10px;color:var(--mut);text-align:center;line-height:16px}" +
    ".pc-d{height:38px;border-radius:4px;background:var(--s2);display:flex;flex-direction:column;justify-content:space-between;padding:3px 4px;font-variant-numeric:tabular-nums;min-width:0;overflow:hidden}" +
    ".pc-d i{font-style:normal;font-size:10px;color:var(--mut)}.pc-d b{font-size:10px;font-weight:600;text-align:right;color:var(--tx)}" +
    ".pc-pad{background:none}.pc-fut{opacity:.4}.pc-today{box-shadow:inset 0 0 0 1px var(--acc)}" +
    "@media (max-width:767px){.pc-nav button{width:44px;height:44px}.pc-d{height:40px}}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/pf-positions.js */
/* Portfolio bottom row: positions (Active / History) on the left, Activity on the right. Written by Claude.
   Active rows keep one-tap Sell 25/50/100 with Undo; the ".q-table-actions" cell is where flows.js adds
   Lock / Stake / Share. Rows are real links to the token page. A pending price shows a one-line note per row
   (v1.1 #9), never a coverage headline. */
window.PfPositions = (function () {
  "use strict";
  var V = window.QHView, view = "active";

  function cb(r) { return V.tag(r.chain); }
  function held(s) { return V.age(s); }
  function activeRow(p, i) {
    var gone = p.remaining <= 0.005;
    return '<a class="pp-row" href="' + V.esc(p.href) + '" data-i="' + i + '">' +
      '<span class="pp-tok"><b>' + V.esc(p.sym) + "</b> " + cb(p) + (p.pricing ? '<small class="qv-mut">1 token pricing</small>' : "") + "</span>" +
      '<span class="pp-n">' + V.usd(p.bought) + "</span>" +
      '<span class="pp-n">' + V.usd(p.sold) + "</span>" +
      '<span class="pp-n pp-2"><span>' + (gone ? '<span class="qv-mut">Sold out</span>' : V.usd(p.remaining)) + "</span><small>" + (gone ? "" : V.num(p.qty) + " " + V.esc(p.sym)) + "</small></span>" +
      '<span class="pp-n pp-2 ' + V.cls(p.pnl) + '"><span>' + V.usd(p.pnl) + "</span><small>" + V.pct(p.pnlPct, true) + "</small></span>" +
      '<span class="pp-n pp-held">' + held(p.heldSec) + "</span>" +
      '<span class="q-table-actions pp-act">' + [25, 50, 100].map(function (n) {
        return '<button class="pp-sell" data-p="' + n + '"' + (gone ? " disabled" : "") + ' aria-label="Sell ' + n + ' percent"><span class="pp-sw">Sell </span>' + n + "%</button>";
      }).join("") + "</span></a>";
  }
  function histRow(h) {
    return '<a class="pp-row pp-hist" href="' + V.esc(h.href) + '"><span class="pp-tok"><b>' + V.esc(h.sym) + "</b> " + cb(h) + "</span>" +
      '<span class="pp-n">' + V.usd(h.cost) + '</span><span class="pp-n">' + V.usd(h.cost + h.pnl) + "</span>" +
      '<span class="pp-n pp-2 ' + V.cls(h.pnl) + '"><span>' + V.usd(h.pnl) + "</span><small>" + V.pct(h.pnlPct, true) + "</small></span>" +
      '<span class="pp-n pp-held">' + V.age((Date.now() - h.closed) / 1000) + " ago</span></a>";
  }

  function render(root, data, chains) {
    var on = function (x) { return !chains || !Object.keys(chains).length || chains[x.chain]; };
    root.innerHTML = '<div class="pp-grid"><section class="pp-card"><div class="pp-tabs"><button data-v="active">Active positions</button><button data-v="history">History</button></div><div class="pp-body"></div></section>' +
      '<div class="pp-right"><div class="pp-cal"></div><section class="pp-card pp-actcard"><div class="pp-tabs"><button class="on">Activity</button></div><div class="pp-feed"></div></section></div></div>';
    var body = root.querySelector(".pp-body");

    function draw() {
      root.querySelectorAll(".pp-tabs button[data-v]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === view); });
      if (view === "history") {
        var hs = data.history.filter(on);
        body.innerHTML = '<div class="pp-row pp-head pp-hist"><span>Token</span><span class="pp-n">Cost</span><span class="pp-n">Returned</span><span class="pp-n">PnL</span><span class="pp-n">Closed</span></div>' +
          (hs.length ? hs.map(histRow).join("") : '<div class="pp-none">No closed trades on these chains.</div>');
        return;
      }
      var ps = data.positions.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return on(x.p); });
      body.innerHTML = '<div class="pp-row pp-head"><span>Token</span><span class="pp-n">Bought</span><span class="pp-n">Sold</span><span class="pp-n">Remaining</span><span class="pp-n">PnL</span><span class="pp-n pp-held">Held</span><span class="pp-n">Sell in one tap</span></div>' +
        (ps.length ? ps.map(function (x) { return activeRow(x.p, x.i); }).join("") : '<div class="pp-none">No open positions on these chains.</div>');
    }
    body.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".pp-sell");
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var row = b.closest(".pp-row"), p = data.positions[Number(row.getAttribute("data-i"))], pct = Number(b.getAttribute("data-p"));
      var before = { remaining: p.remaining, sold: p.sold, qty: p.qty }, got = p.remaining * pct / 100;
      p.remaining -= got; p.qty -= p.qty * pct / 100; p.sold += got;
      draw();
      V.toast("Sold " + pct + "% of " + p.sym + " for " + V.usd(got), "Undo", function () { p.remaining = before.remaining; p.sold = before.sold; p.qty = before.qty; draw(); });
    });
    root.querySelectorAll(".pp-tabs button[data-v]").forEach(function (b) { b.onclick = function () { view = b.getAttribute("data-v"); draw(); }; });
    draw();

    var feed = data.activity.filter(function (a) { return on(a.r); });
    root.querySelector(".pp-feed").innerHTML = feed.length ? feed.map(function (a) {
      var buy = a.side === "buy";
      return '<a class="pp-arow" href="' + V.esc(a.r.href) + '"><span class="' + (buy ? "qv-up" : "qv-dn") + '">' + (buy ? "Buy" : "Sell") + "</span>" +
        "<span><b>" + V.esc(a.r.sym) + "</b> " + cb(a.r) + '</span><span class="pp-n">' + V.usd(a.usd) + '</span><span class="pp-n qv-mut">' + V.usd(a.mcap) + '</span><span class="pp-n qv-mut">' + V.age((Date.now() - a.time) / 1000) + "</span></a>";
    }).join("") : '<div class="pp-none">No activity on these chains.</div>';
  }

  var css = document.createElement("style");
  css.textContent =
    ".pp-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:8px;min-width:0;align-items:start}.pp-right{display:flex;flex-direction:column;gap:8px;min-width:0}" +
    ".pp-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;overflow:hidden;min-width:0}" +
    ".pp-tabs{display:flex;gap:16px;padding:0 12px;border-bottom:1px solid var(--line);height:38px;align-items:stretch}" +
    ".pp-tabs button{background:none;border:0;border-bottom:2px solid transparent;color:var(--mut);font-size:13px;font-weight:600;cursor:pointer;padding:0}.pp-tabs button.on{color:var(--tx);border-bottom-color:var(--acc)}" +
    ".pp-row{display:grid;grid-template-columns:minmax(120px,1.3fr) .8fr .8fr 1fr 1fr 52px 344px;gap:8px;align-items:center;min-height:44px;padding:4px 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--tx);text-decoration:none;font-variant-numeric:tabular-nums}" +
    ".pp-hist{grid-template-columns:minmax(120px,1.3fr) 1fr 1fr 1fr 1fr}.pp-head{min-height:30px;color:var(--mut);font-size:11px}a.pp-row:hover{background:var(--s2)}" +
    ".pp-n{text-align:right;white-space:nowrap}.pp-2{display:flex;flex-direction:column;align-items:flex-end;line-height:15px}.pp-2 small{font-size:10px;color:var(--mut)}.pp-2.qv-up small{color:var(--up)}.pp-2.qv-dn small{color:var(--dn)}" +
    ".pp-tok{display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;overflow:hidden}.pp-tok b{font-size:13px}.pp-tok small{font-size:10px}" +
    ".pp-act{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:4px}.pp-act .fl-sm{padding:0 8px}.pp-act .fl-sm{margin-left:0}" +
    ".pp-sell{height:24px;padding:0 7px;border:1px solid rgba(242,105,92,.4);background:rgba(242,105,92,.08);color:var(--dn);border-radius:4px;font-size:11px;cursor:pointer}.pp-sell:disabled{opacity:.35;cursor:default}" +
    ".pp-none{padding:14px 12px;color:var(--mut);font-size:12px}" +
    ".pp-feed{max-height:360px;overflow-y:auto}.pp-arow{display:grid;grid-template-columns:34px minmax(0,1fr) 64px 64px 34px;gap:6px;align-items:center;height:32px;padding:0 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--tx);text-decoration:none;font-variant-numeric:tabular-nums}a.pp-arow:hover{background:var(--s2)}" +
    "@media (max-width:1100px){.pp-grid{grid-template-columns:1fr}.pp-held{display:none}.pp-row{grid-template-columns:minmax(110px,1.3fr) .8fr .8fr 1fr 1fr 344px}.pp-hist{grid-template-columns:minmax(110px,1.3fr) 1fr 1fr 1fr}}" +
    "@media (max-width:767px){.pp-head{display:none}.pp-row{grid-template-columns:minmax(0,1fr) auto auto;grid-template-areas:'t r p' 'a a a';padding:8px 10px;row-gap:6px}" +
    ".pp-row>.pp-n:nth-child(2),.pp-row>.pp-n:nth-child(3){display:none}.pp-tok{grid-area:t}.pp-row>.pp-2:nth-child(4){grid-area:r}.pp-row>.pp-2:nth-child(5){grid-area:p}.pp-act{grid-area:a;justify-content:flex-start}" +
    ".pp-hist{grid-template-columns:minmax(0,1fr) auto auto;grid-template-areas:none}.pp-hist>.pp-n:nth-child(2),.pp-hist>.pp-n:nth-child(3){display:none}.pp-hist>.pp-2{grid-area:auto}" +
    ".pp-sell{height:44px;min-width:46px;padding:0 6px;font-size:12px}.pp-sw{display:none}.pp-act .fl-sm{min-width:44px;padding:0 7px}.pp-act::before{content:'Sell';align-self:center;font-size:11px;color:var(--mut);margin-right:2px}.pp-tabs{height:auto}.pp-tabs button{min-height:44px}.pp-arow{height:44px;grid-template-columns:34px minmax(0,1fr) 64px 34px}.pp-arow>:nth-child(4){display:none}}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/pf-wallets.js */
/* Portfolio Wallets tab (contract section 5 + parity row "Portfolio": GMGN-style multi-wallet groups).
   Written by Claude. Left: wallet groups (Solana, EVM) with select boxes, volume, tokens, stablecoins, native.
   Right: totals for the selected wallets and the move-money actions. Actions toast until the flows are wired. */
window.PfWallets = (function () {
  "use strict";
  var V = window.QHView, sel = null, open = { SOL: true, EVM: true };
  var ACTIONS = [["Deposit", "Add funds from an exchange or card"], ["Buy", "Buy a token with the selected wallets"], ["Withdraw", "Send funds out"],
    ["Consolidate", "Gather balances into one wallet"], ["Distribute", "Split a balance across wallets"], ["Transfer", "Move between your wallets"], ["Bridge", "Move funds between Solana and EVM"]];

  function render(root, data) {
    var ws = data.wallets;
    if (!sel) { sel = {}; ws.forEach(function (w, i) { sel[i] = true; }); }
    var nSol = ws.filter(function (w) { return w.family === "SOL"; }).length, nEvm = ws.length - nSol;
    root.innerHTML = '<div class="pw-grid"><section class="pw-card"><div class="pw-top"><b>Wallets</b> <span class="qv-mut">Solana ' + nSol + " · EVM " + nEvm + "</span>" +
      '<span class="pw-add"><button data-a="Add a Solana wallet">+ Solana wallet</button><button data-a="Add an EVM wallet">+ EVM wallet</button><button data-a="Import a wallet">Import</button></span></div>' +
      '<div class="pw-row pw-head"><label class="pw-cbx"><input type="checkbox" class="pw-all"> All</label><span class="pw-n">7d volume</span><span class="pw-n">Tokens</span><span class="pw-n">Stablecoins</span><span class="pw-n">Native</span></div>' +
      '<div class="pw-groups"></div></section><section class="pw-card pw-side"></section></div>';
    var groups = root.querySelector(".pw-groups"), side = root.querySelector(".pw-side"), allBox = root.querySelector(".pw-all");

    function drawGroups() {
      groups.innerHTML = ["SOL", "EVM"].map(function (fam) {
        var list = ws.map(function (w, i) { return { w: w, i: i }; }).filter(function (x) { return x.w.family === fam; });
        var tot = 0; list.forEach(function (x) { tot += x.w.usd; });
        return '<div class="pw-g"><button class="pw-gh" data-f="' + fam + '"><span class="pw-car">' + (open[fam] ? "▾" : "▸") + "</span>" + (fam === "SOL" ? "Solana wallets" : "EVM wallets") +
          '<span class="qv-mut">' + list.length + '</span><span class="pw-gt">' + V.usd(tot) + "</span></button>" +
          (open[fam] ? list.map(function (x) {
            var w = x.w;
            return '<div class="pw-row"><label class="pw-cbx"><input type="checkbox" data-i="' + x.i + '"' + (sel[x.i] ? " checked" : "") + '><span class="pw-nm"><b>' + V.esc(w.name) + "</b>" +
              '<span class="qv-mut pw-ad">' + V.esc(V.short(w.addr)) + "</span></span></label>" +
              '<span class="pw-n">' + V.usd(w.vol) + '</span><span class="pw-n">' + w.tokens + '</span><span class="pw-n">' + V.usd(w.stable) + "</span>" +
              '<span class="pw-n pw-2"><span>' + w.native.toFixed(3) + " " + w.nativeSym + "</span><small>" + V.usd(w.native * w.px) + "</small></span></div>";
          }).join("") : "") + "</div>";
      }).join("");
      groups.querySelectorAll(".pw-gh").forEach(function (b) { b.onclick = function () { var f = b.getAttribute("data-f"); open[f] = !open[f]; drawGroups(); }; });
      groups.querySelectorAll("input[data-i]").forEach(function (c) { c.onchange = function () { sel[c.getAttribute("data-i")] = c.checked; drawSide(); }; });
      drawSide();
    }
    function drawSide() {
      var picked = ws.filter(function (w, i) { return sel[i]; }), bal = 0, vol = 0;
      picked.forEach(function (w) { bal += w.usd; vol += w.vol; });
      allBox.checked = picked.length === ws.length; allBox.indeterminate = picked.length > 0 && picked.length < ws.length;
      var pnl = 0; data.positions.forEach(function (p) { pnl += p.pnl; });
      side.innerHTML = '<div class="pw-top"><b>' + (picked.length === ws.length ? "All wallets" : picked.length + " of " + ws.length + " wallets") + "</b></div>" +
        '<div class="pw-sum"><div class="ps-k">Balance</div><div class="ps-big">' + V.usd(bal) + "</div>" +
        '<div class="pw-kv"><span>7d volume <b>' + V.usd(vol) + '</b></span><span>Open PnL <b class="' + V.cls(pnl) + '">' + V.usd(pnl) + "</b></span>" +
        "<span>Tokens held <b>" + picked.reduce(function (a, w) { return a + w.tokens; }, 0) + '</b></span><span>Unrealized <b class="' + V.cls(data.unreal) + '">' + V.usd(data.unreal) + "</b></span></div></div>" +
        '<div class="pw-acts">' + ACTIONS.map(function (a) { return '<button class="pw-act" data-a="' + a[0] + '" title="' + a[1] + '"><b>' + a[0] + "</b><small>" + a[1] + "</small></button>"; }).join("") + "</div>";
      side.querySelectorAll(".pw-act").forEach(function (b) {
        b.onclick = function () { V.toast(b.getAttribute("data-a") + ": " + (picked.length ? picked.length + " wallet" + (picked.length > 1 ? "s" : "") + " selected" : "pick a wallet first")); };
      });
    }
    allBox.onchange = function () { ws.forEach(function (w, i) { sel[i] = allBox.checked; }); drawGroups(); };
    root.querySelectorAll(".pw-add button").forEach(function (b) { b.onclick = function () { V.toast(b.getAttribute("data-a") + ": opens in your wallet"); }; });
    drawGroups();
  }

  var css = document.createElement("style");
  css.textContent =
    ".pw-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:8px}" +
    ".pw-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;overflow:hidden;min-width:0}" +
    ".pw-top{display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 12px;border-bottom:1px solid var(--line);font-size:13px;flex-wrap:wrap}" +
    ".pw-add{margin-left:auto;display:flex;gap:6px}.pw-add button{height:26px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;font-size:11px;padding:0 8px;cursor:pointer}" +
    ".pw-row{display:grid;grid-template-columns:minmax(150px,1.6fr) 1fr .6fr 1fr 1fr;gap:8px;align-items:center;min-height:40px;padding:0 12px;border-bottom:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums}" +
    ".pw-head{min-height:30px;color:var(--mut);font-size:11px}.pw-n{text-align:right;white-space:nowrap}.pw-2{display:flex;flex-direction:column;align-items:flex-end;line-height:15px}.pw-2 small{color:var(--mut);font-size:10px}" +
    ".pw-cbx{display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer}.pw-cbx input{accent-color:var(--acc);width:14px;height:14px;margin:0}" +
    ".pw-nm{display:flex;gap:8px;align-items:baseline;min-width:0;white-space:nowrap;overflow:hidden}.pw-ad{font-size:11px}" +
    ".pw-gh{display:flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 12px;background:var(--s2);border:0;border-bottom:1px solid var(--line);color:var(--tx);font-size:12px;font-weight:600;cursor:pointer;text-align:left}" +
    ".pw-car{width:10px;color:var(--mut)}.pw-gt{margin-left:auto;font-variant-numeric:tabular-nums}" +
    ".pw-sum{padding:12px;display:flex;flex-direction:column;gap:4px;border-bottom:1px solid var(--line)}.pw-kv{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px;color:var(--mut)}.pw-kv b{color:var(--tx);font-weight:600;font-variant-numeric:tabular-nums}.pw-kv b.qv-up{color:var(--up)}.pw-kv b.qv-dn{color:var(--dn)}" +
    ".pw-acts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;padding:12px}" +
    ".pw-act{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;cursor:pointer;text-align:left}" +
    ".pw-act b{font-size:13px;font-weight:600}.pw-act small{font-size:11px;color:var(--mut)}.pw-act:hover{border-color:rgba(210,173,114,.5)}" +
    "@media (max-width:900px){.pw-grid{grid-template-columns:1fr}}" +
    "@media (max-width:767px){.pw-row{grid-template-columns:minmax(0,1fr) 90px 92px;min-height:52px}.pw-row>.pw-n:nth-child(3),.pw-row>.pw-n:nth-child(4){display:none}" +
    ".pw-cbx input{width:20px;height:20px}.pw-cbx{min-height:44px}.pw-gh{height:44px}.pw-add button{height:44px}.pw-acts{grid-template-columns:1fr 1fr}.pw-act{min-height:52px}.pw-nm{flex-direction:column;gap:0}.pw-ad{line-height:18px}}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/pf-live.js */
/* pf-live.js: the live Portfolio tabs Compare and Perpetuals. Written by Claude.
   Compare: two wallets side by side (value, 24h, PnL 7d / 30d / all, realized, unrealized, win rate) from
   /api/portfolio and /api/wallets/card, read once per wallet per visit (portfolio reads cost paid provider units).
   Perpetuals: Hyperliquid clearinghouseState for the connected or watched EVM address, read on open and on Refresh. */
window.PfLive = (function () {
  "use strict";
  var F = window.QHFmt, hold = {}, pair = { a: "", b: "" };
  function L() { return window.QHLive; }
  function valid(v) { return /^0x[0-9a-fA-F]{40}$/.test(v) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v); }
  function norm(v) { v = String(v || "").trim(); return /^0x/i.test(v) ? v.toLowerCase() : v; }
  /* Sub-cent PnL is dust: shown as $0 so a rounding residue never reads as a loss. */
  function cut(v) { return F.ok(v) && Math.abs(Number(v)) < 0.005 ? 0 : v; }
  function cls(v) { v = cut(v); return F.ok(v) && Number(v) !== 0 ? (Number(v) > 0 ? "pl-up" : "pl-dn") : ""; }
  function signed(v) { v = cut(v); return F.ok(v) ? (Number(v) > 0 ? "+" : "") + F.usd(v) : F.DASH; }
  function holdings(w) { if (!hold[w]) hold[w] = L().holdings(w).then(function (r) { if (!r.ok) delete hold[w]; return r; }); return hold[w]; }

  function readWallet(w) {
    var evm = L().family(w) === "evm", none = Promise.resolve({ ok: false });
    /* Cards first (fast index reads), then the slower balance read, so the browser's connection pool never starves them. */
    var cards = [evm ? L().card(w, "7d") : none, evm ? L().card(w, "30d") : none, evm ? L().card(w, "all") : none];
    return Promise.all(cards.concat([Promise.all(cards).then(function () { return holdings(w); })])).then(function (r) {
      r = [r[3], r[0], r[1], r[2]];
      var t = r[0].ok ? r[0].totals || {} : null;
      return { w: w, evm: evm, value: t ? t.valueUsd : null, ch24: t ? t.change24Usd : null, chains: t && t.byChain ? Object.keys(t.byChain).filter(function (k) { return F.n(t.byChain[k]) >= 0.01; }).length : null,
        d7: r[1].ok ? r[1].pnl : null, d30: r[2].ok ? r[2].pnl : null, all: r[3].ok ? r[3] : null };
    });
  }
  var ROWS = [
    ["Total value", function (x) { return F.usd(x.value); }, function (x) { return x.value; }],
    ["24h", function (x) { return signed(x.ch24); }, function (x) { return x.ch24; }, true],
    ["Chains", function (x) { return x.chains == null ? F.DASH : String(x.chains); }],
    ["PnL 7d", function (x) { return signed(x.d7); }, function (x) { return x.d7; }, true],
    ["PnL 30d", function (x) { return signed(x.d30); }, function (x) { return x.d30; }, true],
    ["PnL all time", function (x) { return signed(x.all && x.all.pnl); }, function (x) { return x.all && x.all.pnl; }, true],
    ["Realized", function (x) { return signed(x.all && x.all.realized); }, function (x) { return x.all && x.all.realized; }, true],
    ["Unrealized", function (x) { return signed(x.all && x.all.unrealized); }, function (x) { return x.all && x.all.unrealized; }, true],
    ["Win rate", function (x) { return x.all && x.all.counted ? F.pct(x.all.winRate * 100) : F.DASH; }, function (x) { return x.all && x.all.counted ? x.all.winRate : null; }],
    ["Tokens traded", function (x) { return x.all ? String(x.all.counted) : F.DASH; }, function (x) { return x.all ? x.all.counted : null; }]
  ];

  function compare(root) {
    if (!pair.a) pair.a = L().wallet() || "";
    root.innerHTML = '<div class="pl-card"><div class="pl-h">Compare two wallets</div><form class="pl-form"><input class="pl-in" name="a" placeholder="First wallet, 0x... or Solana" value="' + F.esc(pair.a) + '" spellcheck="false" autocomplete="off">' +
      '<input class="pl-in" name="b" placeholder="Second wallet" value="' + F.esc(pair.b) + '" spellcheck="false" autocomplete="off"><button class="pl-go">Compare</button></form><div class="pl-msg"></div><div class="pl-out"></div></div>';
    var out = root.querySelector(".pl-out"), msg = root.querySelector(".pl-msg");
    function run() {
      if (!pair.a || !pair.b) { out.innerHTML = '<div class="pl-note">Paste two addresses to see value, PnL and win rate side by side. Live numbers, read once.</div>'; return; }
      out.innerHTML = '<div class="pl-note">Reading both wallets</div>';
      Promise.all([readWallet(pair.a), readWallet(pair.b)]).then(function (xs) {
        if (!out.isConnected) return;
        out.innerHTML = '<div class="pl-cmp"><div class="pl-row pl-th"><span></span>' + xs.map(function (x) { return '<a href="#/wallet/' + encodeURIComponent(x.w) + '">' + F.esc(F.short(x.w)) + "</a>"; }).join("") + "</div>" +
          ROWS.map(function (r) {
            var v = r[2] ? xs.map(function (x) { return F.n(r[2](x)); }) : [NaN, NaN], lead = isFinite(v[0]) && isFinite(v[1]) && v[0] !== v[1] ? (v[0] > v[1] ? 0 : 1) : -1;
            return '<div class="pl-row"><span class="pl-k">' + r[0] + "</span>" + xs.map(function (x, i) {
              return '<b class="' + (r[3] ? cls(r[2](x)) : "") + (i === lead ? " pl-lead" : "") + '">' + r[1](x) + "</b>";
            }).join("") + "</div>";
          }).join("") + '</div><div class="pl-note">PnL and win rate cover QHooks markets on EVM chains. The higher value in each row is marked.</div>';
      });
    }
    root.querySelector(".pl-form").onsubmit = function (e) {
      e.preventDefault();
      var a = norm(this.a.value), b = norm(this.b.value);
      if (!valid(a) || !valid(b)) { msg.textContent = "Both need to be wallet addresses."; return; }
      msg.textContent = ""; pair.a = a; pair.b = b; run();
    };
    run();
  }

  function perps(root) {
    var w = L().wallet(), evm = w && L().family(w) === "evm";
    root.innerHTML = '<div class="pl-card"><div class="pl-h">Perpetuals on Hyperliquid <span class="pl-fresh"></span>' + (evm ? '<button class="pl-btn pl-ref">Refresh</button>' : "") + '</div><div class="pl-out"></div></div>';
    var out = root.querySelector(".pl-out");
    if (!evm) {
      out.innerHTML = '<div class="pl-note">' + (w ? "Hyperliquid accounts are EVM addresses. " : "") + 'Connect or watch an EVM wallet to see its open positions.</div><form class="pl-form"><input class="pl-in" name="a" placeholder="0x... address to watch" spellcheck="false"><button class="pl-go">Watch</button></form>';
      out.querySelector(".pl-form").onsubmit = function (e) { e.preventDefault(); var v = norm(this.a.value); if (/^0x[0-9a-f]{40}$/.test(v)) { L().watch(v); perps(root); } };
      return;
    }
    function draw(fresh) {
      out.innerHTML = '<div class="pl-note">Reading positions</div>';
      L().perps(w, fresh).then(function (r) {
        if (!out.isConnected) return;
        if (!r.ok) { out.innerHTML = '<div class="pl-note">Hyperliquid did not answer. Refresh to try again.</div>'; return; }
        root.querySelector(".pl-fresh").textContent = F.fresh(r.at);
        var up = 0; r.rows.forEach(function (p) { up += p.upnl || 0; });
        out.innerHTML = '<div class="pl-stats">' + [["Account value", F.usd(r.value)], ["Open notional", F.usd(r.notional)], ["Margin used", F.usd(r.margin)], ["Withdrawable", F.usd(r.withdrawable)], ["Unrealized PnL", signed(up), cls(up)]].map(function (s) {
          return '<div class="pl-stat"><div class="pl-k">' + s[0] + '</div><div class="pl-v ' + (s[2] || "") + '">' + s[1] + "</div></div>";
        }).join("") + "</div>" +
          (r.rows.length ? '<div class="pl-pos pl-th"><span>Market</span><span>Size</span><span>Entry</span><span>Value</span><span>PnL (ROE)</span><span>Liq.</span></div>' + r.rows.map(function (p) {
            return '<div class="pl-pos"><span><b>' + F.esc(p.coin) + '</b> <i class="' + (p.side === "Long" ? "pl-up" : "pl-dn") + '">' + p.side + (p.lev ? " " + p.lev + "x" : "") + "</i></span><span>" + F.num(p.size) + "</span><span>" + F.price(p.entry) + "</span><span>" + F.usd(p.value) +
              '</span><span class="' + cls(p.upnl) + '">' + signed(p.upnl) + " (" + F.pct((p.roe || 0) * 100, true) + ")</span><span>" + F.price(p.liq) + "</span></div>";
          }).join("") : '<div class="pl-note">No open perpetual positions for ' + F.esc(F.short(w)) + '. <a href="#/perps">Open Perps</a></div>');
      });
    }
    root.querySelector(".pl-ref").onclick = function () { draw(true); };
    draw();
  }

  var css = document.createElement("style");
  css.textContent = ".pl-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0}" +
    ".pl-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}.pl-fresh{font-size:11px;color:var(--mut);font-weight:400;margin-left:auto}" +
    ".pl-form{display:flex;gap:8px;flex-wrap:wrap}.pl-in{flex:1 1 240px;min-width:0;height:36px;background:var(--s2);border:1px solid var(--line);border-radius:4px;color:var(--tx);padding:0 10px;font-size:13px}" +
    ".pl-go,.pl-btn{height:36px;padding:0 14px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;font-size:12px;cursor:pointer}.pl-go{background:var(--up);color:#04140c;border-color:var(--up);font-weight:600}" +
    ".pl-msg{font-size:12px;color:var(--acc);min-height:0}.pl-note{font-size:12px;color:var(--mut)}.pl-note a{color:var(--acc)}" +
    ".pl-cmp{border:1px solid var(--line);border-radius:6px;overflow:hidden}.pl-row{display:grid;grid-template-columns:minmax(0,1.2fr) 1fr 1fr;gap:8px;align-items:center;min-height:36px;padding:0 10px;border-top:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums}" +
    ".pl-row>b,.pl-row>a{text-align:right;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pl-th{border-top:0;color:var(--mut)}.pl-th a{color:var(--tx);text-decoration:none;font-family:ui-monospace,monospace}" +
    ".pl-k{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.pl-lead{box-shadow:inset -2px 0 0 var(--acc);padding-right:6px}.pl-up{color:var(--up)}.pl-dn{color:var(--dn)}" +
    ".pl-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.pl-stat{background:var(--s2);border-radius:6px;padding:10px;min-width:0}.pl-v{font-size:16px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".pl-pos{display:grid;grid-template-columns:minmax(0,1.3fr) .8fr 1fr 1fr 1.3fr 1fr;gap:8px;align-items:center;min-height:36px;padding:0 4px;border-top:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums}" +
    ".pl-pos>span{text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pl-pos>span:first-child{text-align:left}.pl-pos i{font-style:normal;font-size:11px}" +
    "@media (max-width:767px){.pl-note a{display:inline-flex;align-items:center;min-height:44px}.pl-stats{grid-template-columns:1fr 1fr}.pl-in,.pl-go,.pl-btn{height:44px}.pl-row{min-height:44px}.pl-pos{grid-template-columns:minmax(0,1.2fr) 1fr 1.3fr;min-height:44px}.pl-pos>*:nth-child(2),.pl-pos>*:nth-child(3),.pl-pos>*:nth-child(6){display:none}}";
  document.head.appendChild(css);
  return { compare: compare, perps: perps };
})();
;
/* js/portfolio.js */
/* Portfolio page (contract section 5, parity row "Portfolio"). Written by Claude.
   Tabs Spot / Wallets / Perpetuals / Compare and a multi-select chain chip row with All.
   Spot = summary cards (pf-summary.js) + positions and activity (pf-positions.js) + PnL calendar (pf-calendar.js).
   Wallets = GMGN-style wallet groups (pf-wallets.js). Compare and Perpetuals are live (pf-live.js).
   Spot is live (live-wallet.js through QHAccount) when a wallet is connected or watched; otherwise the connect
   panel sits over the seeded sample. Every tab that shows pf-data.js numbers carries the "Sample data" tag. */
window.Portfolio = (function () {
  "use strict";
  var V = window.QHView, tab = "spot", chains = {}, example = false;
  var TABS = [["spot", "Spot"], ["wallets", "Wallets"], ["perps", "Perpetuals"], ["compare", "Compare"]];

  function render(root) {
    var data = window.PfData.get();
    root.innerHTML = '<div class="po-page"><div class="po-top"><div class="po-tabs">' + TABS.map(function (t) {
      return '<button class="po-tab" data-t="' + t[0] + '">' + t[1] + "</button>";
    }).join("") + '</div><span class="po-sample">Sample data</span></div><div class="qv-chips po-chains"></div><div class="po-body"></div></div>';
    var body = root.querySelector(".po-body"), chipsEl = root.querySelector(".po-chains"), tagEl = root.querySelector(".po-sample");
    function live() { return !!(window.QHLive && window.QHLive.wallet() && window.QHAccount); }
    var names = V.chains(data.positions.concat(data.history));

    function drawChips() {
      var none = !Object.keys(chains).length;
      chipsEl.innerHTML = '<button class="qv-chip' + (none ? " on" : "") + '" data-c="">All</button>' + names.map(function (c) {
        return '<button class="qv-chip' + (chains[c] ? " on" : "") + '" data-c="' + V.esc(c) + '">' + V.esc(c) + "</button>";
      }).join("");
      chipsEl.querySelectorAll(".qv-chip").forEach(function (b) {
        b.onclick = function () {
          var c = b.getAttribute("data-c");
          if (!c) chains = {}; else if (chains[c]) delete chains[c]; else chains[c] = 1;
          if (Object.keys(chains).length === names.length) chains = {};
          drawChips(); drawBody();
        };
      });
      chipsEl.style.display = tab === "spot" && !live() && example ? "" : "none";
    }
    function drawBody() {
      root.querySelectorAll(".po-tab").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-t") === tab); });
      body.innerHTML = "";
      var sample = tab === "wallets" || (tab === "spot" && !live() && example);
      tagEl.style.display = sample ? "" : "none";
      tagEl.textContent = tab === "wallets" ? "Sample data · multi-wallet groups open with wallet sign-in" : "Sample data · connect or watch a wallet to see yours";
      if (tab === "spot" && window.QHAccount) {
        var acct = document.createElement("div"); body.appendChild(acct);
        window.QHAccount.portfolio(acct);
        if (live()) return;
      }
      /* Not connected: a real empty state that says what the page gives you. The sample account only shows
         after an explicit "See an example", and carries the Sample data tag while it does. (Fable) */
      if (tab === "spot" && !example) {
        var em = document.createElement("div"); em.className = "po-start";
        em.innerHTML = '<div class="po-start-h">Your QHooks portfolio</div>' +
          '<ul class="po-start-l"><li><b>One balance</b><span>Every chain you trade on, added up in one number.</span></li>' +
          '<li><b>PnL you can read</b><span>Realized PnL, win rate and a day-by-day calendar.</span></li>' +
          '<li><b>What QHooks paid you</b><span>Cashback and referral earnings, with what is ready to claim.</span></li></ul>' +
          '<button type="button" class="po-start-x">See an example</button>';
        body.appendChild(em);
        em.querySelector(".po-start-x").onclick = function () { example = true; drawChips(); drawBody(); };
        return;
      }
      if (tab === "spot") {
        var hide = document.createElement("button"); hide.type = "button"; hide.className = "po-start-x po-start-hide"; hide.textContent = "Hide the example";
        hide.onclick = function () { example = false; drawChips(); drawBody(); }; body.appendChild(hide);
        var sum = document.createElement("div"), pos = document.createElement("div");
        body.appendChild(sum); body.appendChild(pos);
        window.PfSummary.render(sum, data);
        window.PfPositions.render(pos, data, chains);
        window.PfCalendar.render(pos.querySelector(".pp-cal"));
      } else if (tab === "wallets") {
        window.PfWallets.render(body, data);
      } else if (tab === "perps") {
        window.PfLive.perps(body);
      } else {
        window.PfLive.compare(body);
      }
    }
    root.querySelectorAll(".po-tab").forEach(function (b) {
      b.onclick = function () { tab = b.getAttribute("data-t"); drawChips(); drawBody(); };
    });
    drawChips(); drawBody();
  }

  var css = document.createElement("style");
  css.textContent =
    ".po-page{display:flex;flex-direction:column;gap:8px;min-width:0}.po-body{display:flex;flex-direction:column;gap:8px;min-width:0}.po-body>div{min-width:0}" +
    ".po-top{display:flex;align-items:center;border-bottom:1px solid var(--line)}.po-tabs{display:flex;gap:18px;overflow-x:auto;scrollbar-width:none}" +
    ".po-sample{margin-left:auto;font-size:11px;font-weight:600;color:var(--acc);border:1px solid rgba(210,173,114,.45);border-radius:4px;padding:2px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}" +
    ".po-tab{flex:0 0 auto;background:none;border:0;border-bottom:2px solid transparent;color:var(--mut);font-size:16px;font-weight:600;padding:8px 0;cursor:pointer}.po-tab.on{color:var(--tx);border-bottom-color:var(--acc)}" +
    ".po-empty{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:16px;font-size:13px;color:var(--mut)}.po-empty a{color:var(--acc);margin-left:6px}" +
    ".po-cmp{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.po-in{flex:1;min-width:220px;height:36px;background:var(--s2);border:1px solid var(--line);border-radius:4px;color:var(--tx);padding:0 10px;font-size:13px}" +
    ".q-portfolio{padding:12px}" +
    ".q-portfolio .la-panel{max-width:none;margin:0 0 8px;padding:10px 12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}.q-portfolio .la-panel h2{font-size:13px;margin:0}.q-portfolio .la-panel p{margin:0;font-size:12px;flex:1 1 260px}" +
    ".q-portfolio .la-go{height:32px}.q-portfolio .la-or{margin:0}.q-portfolio .la-watch{flex:1 1 300px}.q-portfolio .la-input{height:32px}.q-portfolio .la-msg{min-height:0;margin:0}" +
    "@media (max-width:767px){.q-portfolio{padding:8px 10px}.po-tab{min-height:44px;font-size:14px}.po-in{height:44px;min-width:0;width:100%}.po-empty a{display:inline-flex;align-items:center;min-height:44px}.q-portfolio .la-go,.q-portfolio .la-input{height:44px}.q-portfolio .la-panel p{display:none}}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/agents.js */
/* Agents tab (contract 1.2.6 + 1.3.5). Written by Claude in QHooks' own words.
   Activity rows are sample data until the live agent feed is wired. */
window.Agents = (function () {
  "use strict";
  var MCP = "https://qhooks.com/mcp";
  var ACTIVITY = [
    ["2m", "Agent paid for a fresh QProof scan", "$0.25 USDG"],
    ["9m", "Agent prepared a buy on Robinhood Chain", "0.05 ETH"],
    ["21m", "Escrow tranche released by attestation", "1 USDG"],
    ["34m", "Agent read a stored QProof report", "$0.02 USDG"],
    ["1h", "Agent launched a token with the Standard hooks", "Base"]
  ];
  function render(root) {
    root.innerHTML =
      '<div class="ag-wrap">' +
      '<section class="ag-hero"><div class="ag-kicker">AGENTS</div><h1>Give your agent the whole of QHooks</h1>' +
      '<p>Trading on six EVM chains, launches, escrow, OTC and token safety checks through one MCP link. No API key. Your agent’s own wallet signs every transaction.</p>' +
      '<div class="ag-install"><code>' + MCP + '</code><button class="ag-copy">Copy link</button></div>' +
      '<div class="ag-paths"><a class="ag-path" href="https://qhooks.com/skill.md">Read the agent guide</a><span class="ag-path">npm i @qhooks/mcp</span><span class="ag-path">Works with Claude, Cursor and any MCP client</span></div>' +
      '<div class="ag-price">QProof: stored report $0.02 · fresh scan $0.25 · pay per call over x402 in USDC on Base or USDG on Robinhood Chain</div></section>' +
      '<section class="ag-grid"><div class="ag-card"><h2>Agent activity <span class="po-sample">Sample data</span></h2>' +
      ACTIVITY.map(function (a) { return '<div class="ag-row"><span class="ag-age">' + a[0] + "</span><span>" + a[1] + '</span><b>' + a[2] + "</b></div>"; }).join("") +
      '</div><div class="ag-card"><h2>Live with</h2><div class="ag-partners"><span>Autonomo</span><span>Nomad</span><span>Zolva</span></div>' +
      '<h2 style="margin-top:16px">Earn for the traders you bring</h2><p class="ag-small">Pass your wallet as referrer, or open sessions with your ref link, and earn a share of the router fee on every trade your agent routes.</p></div></section></div>';
    root.querySelector(".ag-copy").onclick = function (e) {
      try { navigator.clipboard.writeText(MCP); e.target.textContent = "Copied"; } catch (x) { e.target.textContent = MCP; }
    };
  }
  var css = document.createElement("style");
  css.textContent =
    ".ag-wrap{padding:16px;max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:12px}" +
    ".ag-hero{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:20px}" +
    ".ag-kicker{font-size:11px;letter-spacing:.06em;color:var(--acc)}.ag-hero h1{font-size:24px;margin:6px 0}.ag-hero p{color:var(--mut);max-width:720px}" +
    ".ag-install{display:flex;gap:8px;align-items:center;margin:12px 0}.ag-install code{background:var(--s2);border:1px solid var(--line);border-radius:4px;padding:8px 10px;font-size:13px}" +
    ".ag-copy{height:34px;border:0;border-radius:4px;background:var(--acc);color:#140d00;font-weight:600;padding:0 12px;cursor:pointer}" +
    ".ag-paths{display:flex;gap:8px;flex-wrap:wrap}.ag-path{font-size:12px;color:var(--tx);border:1px solid var(--line);border-radius:4px;padding:6px 10px;text-decoration:none}" +
    ".ag-price{margin-top:12px;font-size:12px;color:var(--mut)}" +
    ".ag-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:12px}.ag-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:14px}" +
    ".ag-card h2{font-size:14px;margin:0 0 8px}.ag-row{display:grid;grid-template-columns:44px 1fr auto;gap:8px;font-size:12px;padding:8px 0;border-top:1px solid var(--line)}" +
    ".ag-age{color:var(--mut)}.ag-row b{font-variant-numeric:tabular-nums}.ag-partners{display:flex;gap:6px;flex-wrap:wrap}" +
    ".ag-partners span{border:1px solid rgba(210,173,114,.4);color:var(--acc);border-radius:4px;padding:4px 10px;font-size:12px}.ag-small{font-size:12px;color:var(--mut)}" +
    "@media (max-width:767px){.ag-grid{grid-template-columns:1fr}.ag-install{flex-direction:column;align-items:stretch}}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/perps.js */
/* Perps trading screen (#/perps): market rail, live Hyperliquid candles, order book, trade tape, liquidity map, order panel.
   This file loads the perps modules, lays out the screen and switches markets. One shared WS (perps-feed.js). Written by Claude. */
window.Perps = (function () {
  "use strict";
  var MODS = ["perps-feed.js", "perps-css.js", "perps-markets.js", "perps-chart.js", "perps-book.js", "perps-tape.js", "perps-map.js", "perps-order.js"];
  var loaded = false, loading = null, coin = "", H = {}, ctxCoin = "";

  function loadAll() {
    if (loaded) return Promise.resolve();
    if (loading) return loading;
    loading = MODS.reduce(function (p, f) {
      return p.then(function () {
        return new Promise(function (ok, bad) {
          var s = document.createElement("script"); s.src = "js/" + f; s.onload = ok;
          s.onerror = function () { bad(new Error("Could not load " + f)); }; document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { loaded = true; });
    return loading;
  }
  function stat(label, cls) {
    var w = document.createElement("div"); w.className = "pph-st";
    var l = document.createElement("span"); l.textContent = label; var v = document.createElement("b"); v.className = cls || ""; v.textContent = "—";
    w.appendChild(l); w.appendChild(v); H.stats.appendChild(w); return v;
  }
  function paintCtx(ctx) {
    var F = window.PerpsFeed; if (!ctx) return;
    var mark = F.num(ctx.markPx), prev = F.num(ctx.prevDayPx), ch = (mark - prev) / prev * 100;
    window.PerpsState.mark = mark;
    H.px.textContent = F.px(mark);
    H.ch.textContent = F.pct(ch); H.ch.className = isFinite(ch) ? (ch >= 0 ? "up" : "dn") : "";
    H.oracle.textContent = F.px(ctx.oraclePx);
    H.vol.textContent = F.usd(ctx.dayNtlVlm);
    H.oi.textContent = F.usd(F.num(ctx.openInterest) * mark);
    var fr = F.num(ctx.funding) * 100; H.fund.textContent = isFinite(fr) ? (fr >= 0 ? "" : "−") + Math.abs(fr).toFixed(4) + "%" : F.DASH;
    H.fund.className = fr >= 0 ? "up" : "dn";
  }
  function tickHeader() {
    var F = window.PerpsFeed;
    H.live.textContent = F.liveText();
    var now = new Date(), left = 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds());
    H.next.textContent = ("0" + Math.floor(left / 60)).slice(-2) + ":" + ("0" + (left % 60)).slice(-2);
  }
  function pick(c, inf) {
    var F = window.PerpsFeed;
    if (c === coin) return;
    if (coin) { F.unsub({ type: "l2Book", coin: coin }); F.unsub({ type: "trades", coin: coin }); F.unsub({ type: "activeAssetCtx", coin: coin }); }
    coin = c; ctxCoin = c; window.PerpsState.coin = c; window.PerpsState.last = NaN; window.PerpsState.mid = NaN;
    try { localStorage.setItem("qh-perps-coin", c); } catch (x) {}
    H.sym.textContent = c + "-PERP"; H.lev.textContent = (inf.maxLev || 20) + "x max";
    H.px.textContent = F.DASH;
    if (inf.ctx) paintCtx(inf.ctx);
    F.sub({ type: "l2Book", coin: c }); F.sub({ type: "trades", coin: c }); F.sub({ type: "activeAssetCtx", coin: c });
    window.PerpsChart.setCoin(c, inf); window.PerpsBook.setCoin(c, inf); window.PerpsTape.setCoin(c, inf);
    window.PerpsMap.setCoin(c, inf); window.PerpsOrder.setCoin(c, inf);
  }
  function part(cls) { var d = document.createElement("section"); d.className = "pz-panel " + cls; return d; }
  function build(root) {
    var F = window.PerpsFeed;
    F.stop(); F.start(); coin = "";
    window.PerpsState = { walls: [] };
    root.textContent = "";
    var term = F.el("div", "pz-term");
    var rail = part("pz-rail"), head = F.el("header", "pz-headr"), chart = part("pz-chart"), map = part("pz-map");
    var book = part("pz-book"), tape = part("pz-tape"), order = part("pz-order");
    var tabs = F.el("div", "pz-tabs");
    [["book", "Book"], ["tape", "Trades"], ["map", "Liquidity"]].forEach(function (t, i) {
      var b = F.el("button", "pz-tab" + (i ? "" : " on"), t[1]); b.type = "button";
      b.addEventListener("click", function () {
        term.setAttribute("data-tab", t[0]); tabs.querySelectorAll(".pz-tab").forEach(function (x) { x.classList.toggle("on", x === b); });
        if (window.PerpsState.redrawChart) window.PerpsState.redrawChart();
      });
      tabs.appendChild(b);
    });
    term.setAttribute("data-tab", "book");
    [rail, head, chart, tabs, map, book, tape, order].forEach(function (x) { term.appendChild(x); });
    root.appendChild(term);
    H = {};
    var id = F.el("div", "pph-id"); H.sym = F.el("span", "pph-sym", "—"); H.lev = F.el("span", "pph-lev", ""); id.appendChild(H.sym); id.appendChild(H.lev);
    H.px = F.el("span", "pph-px", "—");
    H.stats = F.el("div", "pph-stats");
    head.appendChild(id); head.appendChild(H.px); head.appendChild(H.stats);
    H.ch = stat("24h change"); H.oracle = stat("Oracle"); H.vol = stat("24h volume"); H.oi = stat("Open interest");
    H.fund = stat("Funding 1h"); H.next = stat("Next funding");
    H.live = F.el("span", "pph-live", "Connecting"); head.appendChild(H.live);
    window.PerpsChart.mount(chart); window.PerpsBook.mount(book); window.PerpsTape.mount(tape);
    window.PerpsMap.mount(map); window.PerpsOrder.mount(order);
    F.on("activeAssetCtx", function (d) { if (d && d.coin === ctxCoin) paintCtx(d.ctx); });
    var saved = "BTC"; try { saved = localStorage.getItem("qh-perps-coin") || "BTC"; } catch (x) {}
    window.PerpsMarkets.mount(rail, { coin: saved, onPick: pick });
    tickHeader(); F.every(tickHeader, 1000);
  }
  function render(root) {
    var holder = document.createElement("div"); holder.className = "pz-msg"; holder.textContent = "Loading perps";
    root.appendChild(holder);
    loadAll().then(function () { if (root.isConnected || root.parentNode) build(root); }).catch(function (e) {
      holder.textContent = "Perps did not load: " + e.message + " ";
      var b = document.createElement("button"); b.className = "pz-retry"; b.textContent = "Retry"; b.type = "button";
      b.addEventListener("click", function () { location.reload(); }); holder.appendChild(b);
    });
  }
  return { render: render };
})();
;
/* js/rewards.js */
/* Rewards hub (contract 1.2.5). Written by Claude. Uses Randall's approved wording for cashback and referrals.
   Amounts come from /api/qhooks/rewards?wallet= (on-chain events plus what is claimable now), priced with
   /api/funding/native-prices; nothing is estimated. Claims happen in the live claim flow on qhooks.com. */
window.Rewards = (function () {
  "use strict";
  var STABLE = { USDC: 1, USDG: 1, USDT: 1 };
  var WRAP = { WETH: "ETH", WBNB: "BNB", WHYPE: "HYPE", WSOL: "SOL" };

  function usdOf(sym, wei, dec, prices) {
    var units = Number(wei || 0) / Math.pow(10, dec || 18), s = WRAP[sym] || sym;
    var p = STABLE[s] != null ? STABLE[s] : prices[s];
    return isFinite(units) && isFinite(Number(p)) ? units * Number(p) : (units === 0 ? 0 : NaN);
  }
  function sum(body, prices) {
    var out = { claim: 0, cash: 0, ref: 0, rows: [] };
    (body.chains || []).forEach(function (c) {
      var cl = 0, ca = 0, rf = 0;
      (c.currencies || []).forEach(function (x) {
        cl += usdOf(x.symbol, x.claimableWei, x.decimals, prices); ca += usdOf(x.symbol, x.cashbackEarnedWei, x.decimals, prices);
        rf += usdOf(x.symbol, x.referralEarnedWei, x.decimals, prices);
      });
      out.claim += cl; out.cash += ca; out.ref += rf;
      out.rows.push([c.name || c.chainId, ca, cl]);
    });
    return out;
  }
  function money(v) { return window.QHFmt ? window.QHFmt.usd(v) : "—"; }

  function shell(root, s, w, link) {
    var F = window.QHFmt;
    root.innerHTML =
      '<div class="rw-wrap"><section class="rw-top"><div><div class="rw-k">EARNED, READY TO CLAIM</div><div class="rw-big">' + (s ? money(s.claim) : "—") + '</div>' +
      '<div class="rw-sub">' + (w ? F.esc(F.short(w)) + ' <span class="rw-fresh"></span>' : "Connect a wallet to see what you have earned") + '</div></div>' +
      (w ? '<a class="rw-claim" href="https://qhooks.com/me" target="_blank" rel="noopener">Claim all</a>' : '<button class="rw-claim rw-connect">Connect</button>') + "</section>" +
      '<section class="rw-grid">' +
      '<div class="rw-card"><h2>Cashback</h2><p class="rw-line">30% back on trades · 40% on Robinhood Chain if you hold 100K QHOOKS</p>' +
      (s ? s.rows.map(function (c) { return '<div class="rw-row"><span>' + F.esc(c[0]) + "</span><b>" + money(c[1]) + '<em> earned · ' + money(c[2]) + " to claim</em></b></div>"; }).join("") : '<div class="rw-row"><span>Per chain</span><b>—</b></div>') + "</div>" +
      '<div class="rw-card"><h2>Referrals</h2><p class="rw-line">Bring traders, get 20% of their fee</p><div class="rw-ref"><code>' + F.esc(link || "Connect to get your link") + '</code><button class="rw-copy"' + (link ? "" : " disabled") + ">Copy</button></div>" +
      '<div class="rw-row"><span>Referral earnings</span><b>' + (s ? money(s.ref) : "—") + "</b></div></div>" +
      '<div class="rw-card"><h2>QHOOKS holder tier</h2><div class="rw-row"><span>Your QHOOKS (wallet + staked + locked)</span><b class="rw-tier">—</b></div><div class="rw-row"><span>Next tier</span><b>100K for 40% on Robinhood Chain</b></div><a class="rw-link" href="https://qhooks.com/stake">Stake or lock QHOOKS</a></div>' +
      '<div class="rw-card"><h2>Competitions</h2><div class="rw-row"><span>This week</span><b>PnL, Return, Perps boards</b></div><div class="rw-row"><span>Your rank</span><b>—</b></div><a class="rw-link" href="https://qhooks.com/compete">See standings</a></div>' +
      "</section></div>";
    var cp = root.querySelector(".rw-copy");
    if (cp && link) cp.onclick = function () { try { navigator.clipboard.writeText(link); cp.textContent = "Copied"; } catch (e) {} };
    var cn = root.querySelector(".rw-connect");
    if (cn) cn.onclick = function () { window.QHLive.connect().then(function (a) { if (a) render(root); else cn.textContent = "No wallet found"; }); };
  }

  function render(root) {
    var L = window.QHLive, w = L && L.wallet();
    shell(root, null, w, null);
    if (!w) return;
    /* Holder tier (server: /api/qhooks/holder-tier, cached 60 s); filled in place so it survives the rewards re-render. */
    var tierText = null;
    function paintTier() { var el = root.querySelector(".rw-tier"); if (el && tierText) el.textContent = tierText; }
    if (L.holderTier) L.holderTier(w).then(function (t) {
      if (!root.isConnected || !t.ok) return;
      tierText = t.total != null ? window.QHFmt.num(t.total) + " QHOOKS" : "Refreshing";
      paintTier();
    });
    Promise.all([L.rewards(w), L.natives()]).then(function (r) {
      if (!root.isConnected) return;
      var res = r[0];
      if (!res.ok || !res.body) { root.querySelector(".rw-sub").textContent = "Rewards are unavailable right now. Open this page again in a moment."; return; }
      shell(root, sum(res.body, r[1] || {}), w, res.body.referralLink || null);
      paintTier();
      var f = root.querySelector(".rw-fresh"); if (f) f.textContent = "· " + window.QHFmt.fresh(res.body.observedAt);
    });
  }
  function earned(w) {
    var L = window.QHLive;
    return Promise.all([L.rewards(w), L.natives()]).then(function (r) { return r[0].ok && r[0].body ? sum(r[0].body, r[1] || {}) : null; });
  }

  var css = document.createElement("style");
  css.textContent =
    ".rw-wrap{padding:16px;max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:12px}" +
    ".rw-top{display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--s1);border:1px solid rgba(210,173,114,.4);border-radius:8px;padding:16px}" +
    ".rw-k{font-size:11px;letter-spacing:.06em;color:var(--mut)}.rw-big{font-size:30px;font-weight:600;color:var(--acc);font-variant-numeric:tabular-nums}.rw-sub{font-size:12px;color:var(--mut);margin-top:2px}" +
    ".rw-claim{height:40px;border:0;border-radius:6px;background:var(--acc);color:#140d00;font-weight:600;padding:0 18px;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none;white-space:nowrap}" +
    ".rw-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rw-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:14px}" +
    ".rw-card h2{font-size:14px;margin:0 0 6px}.rw-line{font-size:12px;color:var(--acc);margin:0 0 8px}" +
    ".rw-row{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:7px 0;border-top:1px solid var(--line)}.rw-row b{font-variant-numeric:tabular-nums;text-align:right}.rw-row em{font-style:normal;color:var(--mut);font-weight:400}" +
    ".rw-ref{display:flex;gap:6px;margin-bottom:6px}.rw-ref code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--s2);border:1px solid var(--line);border-radius:4px;padding:6px 8px;font-size:12px}" +
    ".rw-copy{border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;padding:0 10px;cursor:pointer}" +
    ".rw-link{display:inline-block;margin-top:8px;font-size:12px;color:var(--acc);text-decoration:none}" +
    "@media (max-width:767px){.rw-grid{grid-template-columns:1fr}.rw-big{font-size:24px}.rw-top{flex-wrap:wrap}.rw-row em{display:block}.rw-card{min-width:0}}";
  document.head.appendChild(css);
  return { render: render, earned: earned };
})();
;
/* js/flows.js */
/* Connective flows (contract 1.2.3, 1.3.3, v1.1 #7 and #10). Written by Claude.
   Adds the one-ecosystem actions to screens after they render: token action bar,
   gas check + MEV line on the trade panel, Lock/Stake/Share on
   positions, Follow/Copy on wallet pages. Idempotent. Every action does the real thing or is not shown. */
(function () {
  "use strict";
  function toast(text) {
    var s = document.querySelector(".fl-toasts");
    if (!s) { s = document.createElement("div"); s.className = "fl-toasts"; document.body.appendChild(s); }
    var t = document.createElement("div"); t.className = "fl-toast"; t.textContent = text; s.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function btn(label, cls, onClick, href) {
    var b = document.createElement(href ? "a" : "button");
    b.className = "fl-btn" + (cls ? " " + cls : ""); b.textContent = label;
    if (href) b.href = href;
    if (onClick) b.addEventListener("click", function (e) { if (!href) e.preventDefault(); onClick(e); });
    return b;
  }
  function ext(a) { a.target = "_blank"; a.rel = "noopener"; return a; }
  /* Share says "Link copied" only once the browser confirms the copy; otherwise it says how to copy it by hand. */
  function share() {
    var url = location.href, ok = function () { toast("Link copied"); }, no = function () { toast("Copy the link from the address bar"); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, no); else no(); } catch (x) { no(); }
  }
  function tokenAddr() { var m = location.hash.match(/^#\/token\/(?:[^/?]+\/)?([^/?]+)/); return m ? decodeURIComponent(m[1]) : ""; }
  function sym() {
    var a = tokenAddr(), lt = window.QHLive && window.QHLive.find(a);
    if (lt && lt.symbol) return lt.symbol;
    var t = (window.QH_TOKENS || []).find(function (x) { return x.address === a; }); return t ? t.symbol : "token";
  }

  function tokenPage() {
    var head = document.querySelector(".token-header");
    if (head && !head.querySelector(".fl-bar")) {
      var a = tokenAddr(), bar = document.createElement("div"); bar.className = "fl-bar";
      /* No button claims something that did not happen (Fable, 2026-11-20). "Set alert" is gone until a real
         alert exists; "Make a call" opens the real call sheet for this token and is hidden when that is not loaded. */
      if (window.Community && window.Community.openSheet) bar.appendChild(btn("Make a call", "", function () { window.Community.openSheet(a); }));
      bar.appendChild(btn("Launch one like this", "fl-acc", null, "#/launch?like=" + a));
      bar.appendChild(btn("Run an agent on this token", "fl-acc", null, "#/agents?token=" + a));
      bar.appendChild(btn("Share", "", share));
      head.appendChild(bar);
    }
    if (innerWidth < 768 && !document.querySelector(".fl-sticky")) {
      var st = document.createElement("div"); st.className = "fl-sticky";
      ["Buy", "Sell"].forEach(function (side) {
        st.appendChild(btn(side + " " + sym(), "fl-" + side.toLowerCase(), function () {
          var pn = document.querySelector(".token-trade-panel"); if (!pn) return;
          var t = pn.querySelector(side === "Buy" ? ".tp-buy" : ".tp-sell"); if (t) t.click();
          pn.scrollIntoView({ behavior: "smooth", block: "start" });
          var inp = pn.querySelector(".tp-input"); if (inp) setTimeout(function () { inp.focus(); }, 300);
        }));
      });
      document.body.appendChild(st);
    }
    var panel = document.querySelector(".token-trade-panel");
    if (panel && !panel.querySelector(".fl-gas")) {
      var meta = panel.querySelector(".tp-meta"), g = document.createElement("div"); g.className = "fl-gas";
      g.innerHTML = '<label class="fl-mev"><input type="checkbox" checked> MEV protection</label>' +
        '<div class="fl-gasline">' + (window.QHLive ? "Gas shows with your quote" : 'Gas check: 0.0004 ETH needed · <b class="dt-up">you have enough</b>') + '</div>' +
        '<div class="fl-oneclick"></div>';
      if (meta) meta.after(g); else panel.appendChild(g);
      ocLine();
    }
  }
  /* One-click line on the trade panel: opens the opt-in sheet (oneclick.js); says On with the limit once it is on. */
  function ocLine() {
    var el = document.querySelector(".fl-oneclick"), O = window.QHOneClick; if (!el) return;
    if (!O || O.off()) { el.remove(); return; }
    O.status().then(function (v) {
      if (!el.isConnected) return;
      el.innerHTML = v && v.on ? "One-click on · $" + v.perTradeUsd + " per trade · <button type='button' class='fl-oc'>Change</button>"
        : "One-click trading is off · <button type='button' class='fl-oc'>Turn on</button> to buy with one tap";
      el.querySelector(".fl-oc").onclick = function () { O.open(); };
    });
  }
  window.addEventListener("qh-oneclick", ocLine);
  function portfolio() {
    document.querySelectorAll(".q-table-actions").forEach(function (cell) {
      if (cell.querySelector(".fl-btn")) return;
      var row = cell.parentElement, isQ = row && /QHOOKS/.test(row.textContent);
      /* Lock and Stake open the live pages; the "PnL card" share is gone because no card exists yet. */
      cell.appendChild(ext(btn("Lock", "fl-sm", null, "https://qhooks.com/qlocks")));
      if (isQ) cell.appendChild(ext(btn("Stake", "fl-sm fl-acc", null, "https://qhooks.com/stake")));
    });
  }
  function wallet() {
    var h = document.querySelector(".q-wallet-header");
    if (!h || h.querySelector(".fl-bar")) return;
    var bar = document.createElement("div"); bar.className = "fl-bar";
    var who = decodeURIComponent((location.hash.slice(9).split("?")[0]) || ""), D = window.CommunityData;
    var fol = D && D.isTracked && D.isTracked(who);
    bar.appendChild(btn(fol ? "Following" : "Follow", "fl-acc", function (e) {
      if (!D) return; var on = D.isTracked(who);
      if (on) D.untrack(who); else D.track(who);
      e.target.textContent = on ? "Follow" : "Following"; toast(on ? "Stopped following" : "Following: this wallet's trades show in Community, Tracked");
    }));
    bar.appendChild(ext(btn("Copy trades", "", null, "https://qhooks.com/copy?w=" + encodeURIComponent(who))));
    bar.appendChild(btn("Share", "", share));
    h.appendChild(bar);
  }
  var pending = false;
  function run() {
    pending = false;
    var h = location.hash;
    if (h.indexOf("#/token/") !== 0) { var old = document.querySelector(".fl-sticky"); if (old) old.remove(); }
    if (h.indexOf("#/token/") === 0) tokenPage();
    else if (h.indexOf("#/portfolio") === 0) portfolio();
    else if (h.indexOf("#/wallet/") === 0) wallet();
  }
  new MutationObserver(function () { if (!pending) { pending = true; requestAnimationFrame(run); } })
    .observe(document.documentElement, { childList: true, subtree: true });

  var css = document.createElement("style");
  css.textContent =
    ".fl-bar{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}" +
    ".fl-btn{display:inline-flex;align-items:center;height:30px;padding:0 10px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;font-size:12px;text-decoration:none;cursor:pointer}" +
    ".fl-acc{border-color:rgba(210,173,114,.45);color:var(--acc)}.fl-sm{height:24px;padding:0 8px;font-size:11px;margin-left:4px}" +
    ".fl-live{font-size:11px;color:var(--up);margin-left:8px;align-self:center}" +
    ".fl-gas{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mut);margin:6px 0}.fl-mev{display:flex;gap:6px;align-items:center}" +
    ".fl-oneclick a,.fl-oc{color:var(--acc)}.fl-oc{background:none;border:0;padding:0 4px;min-height:44px;font:inherit;cursor:pointer;text-decoration:underline}" +
    ".fl-toasts{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;z-index:60}" +
    ".fl-toast{background:var(--s2);border:1px solid var(--line);color:var(--tx);padding:8px 12px;border-radius:6px;font-size:12px}" +
    ".fl-sticky{position:fixed;left:0;right:0;bottom:56px;display:flex;gap:8px;padding:8px 12px;background:var(--bg);border-top:1px solid var(--line);z-index:40}" +
    ".fl-sticky .fl-btn{flex:1;justify-content:center;height:48px;font-size:15px;font-weight:600}.fl-buy{background:var(--up);color:#04140c;border-color:var(--up)}.fl-sell{background:rgba(242,105,92,.14);color:var(--dn);border-color:rgba(242,105,92,.4)}" +
    "@media (max-width:767px){.token-page{padding-bottom:72px}.token-type-cell,.token-trader-cell,.token-age-cell{white-space:nowrap}.token-amount-cell{display:none}" +
    ".fl-btn{height:44px}.fl-sm{height:44px;min-width:56px}.fl-bar{overflow-x:auto;flex-wrap:nowrap}.fl-bar .fl-btn{flex:0 0 auto}}";
  document.head.appendChild(css);
})();
;
/* js/brand.js */
/* brand.js: the QHooks layer that sits on every screen. Written by Fable.
   - Ecosystem strip under the top bar: Rewards, Hooks, Launch, Agents, Calls, each one tap away from anywhere.
   - Page titles carry the name ("Pulse · QHooks").
   - The brand line "For the next generation of token builders / callers / holders / traders" on desktop.
   Money wording uses the approved line from QHBlocks only. No template literals. */
(function () {
  "use strict";
  /* The studded QHooks hook render (supplied by a tester through Randall, 2026-11-20, cut out with tools/key-hook.mjs). */
  var HOOK = '<img class="qh-hook" src="brand/hook-studded-192.png" alt="" aria-hidden="true">';
  var WORDS = ["builders", "callers", "holders", "traders"], wi = 0;
  var TITLES = { pulse: "Pulse", discover: "Discover", launch: "Launch", perps: "Perps", community: "Community", agents: "Agents", portfolio: "Portfolio", rewards: "Rewards", token: "Token", wallet: "Wallet", hooks: "Hook Studio", hook: "Hook", more: "More" };

  function back() {
    var line = window.QHBlocks && window.QHBlocks.CASHBACK ? window.QHBlocks.CASHBACK.split(" on ")[0] : "";
    return line || "Cashback";
  }
  function strip() {
    var here = location.hash || "#/pulse";
    function a(href, label, text, gold) {
      return '<a href="' + href + '"' + (gold ? ' class="eco-gold"' : "") + (here.indexOf(href) === 0 ? ' aria-current="page"' : "") + ">" + (gold ? HOOK : "") + label + " <b>" + text + "</b></a>";
    }
    /* Phone has no room for the chain selector in the top bar, so it leads the strip there. */
    var chains = ["Robinhood", "Base", "Solana", "BNB", "Ethereum", "Arbitrum", "Elysium"], cur = window.QH_CHAIN || "";
    var sel = '<select class="eco-chain" aria-label="Chain"><option value="">All chains</option>' + chains.map(function (c) { return '<option' + (c === cur ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select>";
    return '<nav class="eco" aria-label="QHooks">' + sel +
      a("#/rewards", "Rewards", back(), true) +
      a("#/hooks/studio", "Hooks", "Build yours") +
      a("#/launch", "Launch", "Start a token") +
      a("#/agents", "Agents", "Put one to work") +
      a("#/community", "Calls", "See who called it") +
      '<div class="eco-line">For the next generation of token <span>' + WORDS[wi] + "</span></div></nav>";
  }
  function title() {
    var seg = (location.hash || "#/pulse").replace(/^#\//, "").split(/[/?]/)[0];
    var t = (TITLES[seg] || "QHooks") + " · QHooks";
    if (document.title !== t) document.title = t;
  }
  function mount() {
    var main = document.querySelector("main.q-main"); if (!main) return;
    var cur = main.querySelector(":scope > .eco");
    if (cur && cur.getAttribute("data-at") === location.hash) return;
    if (cur) cur.remove();
    var box = document.createElement("div"); box.innerHTML = strip();
    var el = box.firstChild; el.setAttribute("data-at", location.hash);
    main.insertBefore(el, main.firstChild);
    var cs = el.querySelector(".eco-chain");
    if (cs) cs.onchange = function () { window.QH_CHAIN = cs.value; try { localStorage.setItem("qh-chain", cs.value); } catch (x) {} window.dispatchEvent(new CustomEvent("qh-chain", { detail: cs.value })); };
    /* Phone has no room for the line in the strip, so Pulse opens with it: one line, then straight into the tokens. */
    var seg = (location.hash || "#/pulse").replace(/^#\//, "").split(/[/?]/)[0];
    if (seg === "pulse" || seg === "") {
      var l = document.createElement("div"); l.className = "eco-open";
      /* The hook sits beside the line, never under the words. */
      l.innerHTML = '<div class="eco-open-t">For the next generation of token <span>' + WORDS[wi] + '</span></div><img class="eco-open-h" src="brand/hook-studded-192.png" alt="" aria-hidden="true">';
      main.insertBefore(l, el.nextSibling);
    }
    title();
  }
  var pending = false;
  new MutationObserver(function () { if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; mount(); }); } })
    .observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", function () { setTimeout(mount, 0); });
  setInterval(function () {
    var all = document.querySelectorAll(".eco-line span, .eco-open span"); if (!all.length || document.hidden) return;
    all.forEach(function (s) { s.style.opacity = "0"; });
    setTimeout(function () { wi = (wi + 1) % WORDS.length; all.forEach(function (s) { s.textContent = WORDS[wi]; s.style.opacity = "1"; }); }, 180);
  }, 3200);
  window.QHBrand = { hook: HOOK };
})();
;
/* js/hook-badge.js */
/* hook-badge.js  —  minimal badge renderer (no backticks) */

(function () {
  'use strict';

  var STYLE_INJECTED = false;

  var RISK_COLORS = {
    low: 'hk-low',
    medium: 'hk-medium',
    high: 'hk-high'
  };

  function getRiskClass(risk) {
    return RISK_COLORS[risk] || 'hk-low';
  }

  function injectStyle() {
    if (STYLE_INJECTED) return;
    STYLE_INJECTED = true;
    var css = '.hk-badge{' +
        'display:inline-block;' +
        'padding:2px 8px;' +
        'font-size:10px;' +
        'border:1px solid;' +
        'border-radius:4px;' +
        'text-decoration:none;' +
        'color:#e8eaed;' +
        'white-space:nowrap;' +
        '}' +
        '.hk-low{border-color:#4cc38a;background:#4cc38a18;}' +
        '.hk-medium{border-color:#d2ad72;background:#d2ad7218;}' +
        '.hk-high{border-color:#f2695c;background:#f2695c18;}';
    var el = document.createElement('style');
    el.innerHTML = css;
    document.head.appendChild(el);
  }

  /* What the badge says (Fable):
     - a token with its own hook: what that hook does for the trader (the standard hook reads with the approved
       cashback line), linking to the hook page;
     - any other token: the same cashback applies to every trade made here (Randall, 2026-11-20: "30% back is
       for all trades"), so the badge says so and opens Rewards. */
  function html(token) {
    var h = token && token.hook ? token.hook : null;
    var line = window.QHBlocks && window.QHBlocks.CASHBACK ? window.QHBlocks.CASHBACK : '';
    var short = line ? line.split(' on ')[0] : '';
    var glyph = window.QHBrand ? window.QHBrand.hook : '';
    injectStyle();
    /* Randall, 2026-11-20: "30% back" on every row turned into wallpaper, since it applies to every trade. Rows
       now carry a badge only when there is a hook to speak of: a token's own hook, or a QHooks launch (which
       runs the standard hook). Everything else gets no badge; the cashback line lives in the strip and at the trade. */
    if (!h) {
      if (!token || token.kind !== 'qhooks') return '';
      return '<a class="hk-badge hk-low" href="#/hook/std" title="Launched on QHooks with the standard hook' + (line ? ': ' + line : '') + '">' + glyph + 'QHooks hook</a>';
    }
    var risk = getRiskClass(h.risk), id = h.id || 'std', name = h.name || 'Standard';
    var std = id === 'std' || id === 'standard' || name === 'Standard';
    return '<a class="hk-badge ' + risk + '" href="#/hook/' + id + '" title="' + (std && line ? 'Standard hook: ' + line : name + ' hook') + '">' + glyph + (std && short ? short : name) + '</a>';
  }

  /* Claude: inside row links use a span (no nested <a>); a click still opens the hook page. */
  function inRow(token) { return html(token).replace('<a ', '<span role="link" ').replace('href="', 'data-href="').replace('</a>', '</span>'); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('span.hk-badge[data-href]');
    if (!b) return; e.preventDefault(); e.stopPropagation(); location.hash = b.getAttribute('data-href');
  }, true);
  window.HookBadge = { html: html, inRow: inRow };
})();
;
/* js/hook-page.js */
/* Hook page (contract 1.5.3 + 1.6.2 + 1.6.4: every hook badge opens a plain explainer).
   Written by Claude. Block rows come from QHBlocks so they match Launch and Hook Studio exactly.
   Hook facts are fixtures until the hook registry is wired. */
window.HookPage = (function () {
  "use strict";
  var OWNER = { std: "No owner controls. The contract is fixed once deployed." };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function render(root, id) {
    var K = window.QHBlocks, h = K ? K.fromHookId(id) : null;
    var blocks = h ? h.ids.map(K.get).filter(Boolean) : [];
    var risk = blocks.some(function (b) { return b.risk !== "low"; }) ? "medium" : (h ? "low" : "medium");
    var users = (window.QH_TOKENS || []).filter(function (t) { return !t.hook || t.hook.id === id; }).slice(0, 8);
    var sim = { blocks: h ? h.ids : [], vol: 50000, holders: 400, type: "pool" };
    root.innerHTML =
      '<div class="hp-wrap"><div class="hp-k">HOOK</div><h1>' + esc(h ? h.name : id) + ' <span class="hk-badge hk-' + risk + '">' + risk + " risk</span></h1>" +
      '<section class="hp-card"><h2>What it does</h2>' +
      (blocks.length ? blocks.map(function (b) { return K.row(b); }).join("") : '<div class="hp-row">We have not explained this hook yet. Check its QProof report before trading.</div>') +
      '<div class="hp-row hp-mut">' + esc(OWNER[id] || (h ? "Fees and splits are set at launch and fixed after that." : "Unknown")) + "</div></section>" +
      (window.LaunchSim && h ? '<section class="hp-card hp-sim">' + window.LaunchSim.html(sim) + "</section>" : "") +
      '<section class="hp-card"><h2>Tokens using it</h2>' + users.map(function (t) {
        return '<a class="hp-row hp-tok" href="#/token/' + esc(t.address) + '"><b>' + esc(t.symbol) + '</b><span>' + esc(t.name) + "</span></a>";
      }).join("") + "</section>" +
      '<a class="hp-cta" href="#/launch?hook=' + esc(id) + '">Launch with this hook</a></div>';
    if (window.LaunchSim && h) window.LaunchSim.bind(root, sim);
  }
  var css = document.createElement("style");
  css.textContent =
    ".hp-wrap{padding:16px;max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:12px}.hp-k{font-size:11px;letter-spacing:.06em;color:var(--acc)}" +
    ".hp-wrap h1{font-size:24px;margin:0;display:flex;align-items:center;gap:10px}.hp-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:14px}" +
    ".hp-card h2{font-size:14px;margin:0 0 6px}.hp-row{font-size:13px;padding:9px 0;border-top:1px solid var(--line)}.hp-mut{color:var(--mut)}" +
    ".hp-tok{display:flex;gap:8px;color:var(--tx);text-decoration:none;min-height:24px}.hp-tok span{color:var(--mut)}" +
    ".hp-cta{display:flex;align-items:center;justify-content:center;height:48px;border-radius:6px;background:var(--acc);color:#140d00;font-weight:600;text-decoration:none}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/studio.js */
/* studio.js: Hook Studio at #/hooks/studio (contract 1.5.2, 1.5.4). Rewritten by Claude.
   Opens with the launch draft's blocks (QHLaunchState); "Use these hooks" writes them back and returns to #/launch.
   Block rows come from QHBlocks so they read exactly as on Launch and the hook page. No template literals. */
window.Studio = (function () {
  "use strict";
  var K = window.QHBlocks, S = window.QHLaunchState, esc = K.esc;
  var ui = { tab: "compose", view: "blocks", blocks: [], test: "", open: null };

  function chip(ids) {
    var ok = K.ready(ids);
    return '<span class="sx-chip ' + (ok ? "sx-ok" : "sx-bad") + '">' + (ok ? "Ready" : ids.length ? "Needs a fix" : "Empty") + "</span>";
  }
  function presets() {
    return '<div class="sx-presets">' + Object.keys(K.presets).map(function (k) {
      var p = K.presets[k], on = K.presetOf(ui.blocks) === k;
      return '<button type="button" class="sx-preset' + (on ? " on" : "") + '" data-preset="' + k + '"><b>' + p.label + "</b><span>" + p.ids.length + " blocks · " + esc(p.note) + "</span></button>";
    }).join("") + "</div>";
  }
  /* Library in groups (Rewards / Protection / Price support / Trading). Each group folds; on phone only the
     first starts open, so the page is a short list of headers instead of every block at once. (Fable) */
  function library() {
    if (!ui.open) { ui.open = {}; K.groups.forEach(function (g, i) { ui.open[g.id] = window.innerWidth >= 768 || i === 0; }); }
    return '<div class="sx-lib">' + K.groups.map(function (g) {
      var items = K.list.filter(function (b) { return b.group === g.id; }), open = ui.open[g.id];
      var added = items.filter(function (b) { return ui.blocks.indexOf(b.id) >= 0; }).length;
      return '<section class="sx-grp' + (open ? " open" : "") + '"><button type="button" class="sx-gh" data-group="' + g.id + '" aria-expanded="' + (open ? "true" : "false") + '">' +
        '<b>' + esc(g.label) + '</b><span class="sx-gn">' + (open ? items.length + " blocks" : esc(items.map(function (b) { return b.name; }).join(" · "))) + "</span>" +
        '<span class="sx-ga' + (added ? " on" : "") + '">' + added + " added</span><span class=\"sx-gx\">" + (open ? "Hide" : "Show") + "</span></button>" +
        (open ? items.map(function (b) {
          var on = ui.blocks.indexOf(b.id) >= 0;
          return K.row(b, '<button type="button" class="sx-add' + (on ? " on" : "") + '" data-toggle="' + b.id + '">' + (on ? "Added" : "Add") + "</button>");
        }).join("") : "") + "</section>";
    }).join("") + "</div>";
  }
  /* The order a buy meets the blocks: before swap, pool, after swap; launch-only blocks listed apart. */
  function ordered() {
    var rank = { "Launch": 0, "Before swap": 1, "Pool": 2, "After swap": 3 };
    return ui.blocks.map(K.get).filter(Boolean).sort(function (a, b) { return rank[a.when] - rank[b.when]; });
  }
  function stack() {
    if (!ui.blocks.length) return '<div class="sx-empty">Add a block from the list. A hook with no blocks trades as a plain pool.</div>';
    if (ui.view === "path") {
      return '<div class="sx-path"><div class="sx-step sx-end">A buy comes in</div>' + ordered().map(function (b, i) {
        return '<div class="sx-step"><span class="sx-n">' + (i + 1) + "</span><b>" + esc(b.name) + '</b><span class="sx-w">' + esc(b.when) + "</span><div>" + esc(b.sees) + "</div></div>";
      }).join("") + '<div class="sx-step sx-end">Tokens reach the buyer</div></div>';
    }
    return '<div class="sx-stack">' + ordered().map(function (b) {
      return '<div class="sx-it"><div><b>' + esc(b.name) + '</b><span class="hb-risk hb-' + b.risk + '">' + K.RISK[b.risk] + "</span><div>" + esc(b.does) + "</div></div>" +
        '<button type="button" class="sx-rm" data-toggle="' + b.id + '" aria-label="Remove ' + esc(b.name) + '">Remove</button></div>';
    }).join("") + "</div>";
  }
  function testBuy() {
    var has = function (id) { return ui.blocks.indexOf(id) >= 0; }, lines = [];
    lines.push("The buyer pays 1 ETH plus the trading fee, which is set at launch.");
    if (has("antisnipe")) lines.push("Anti-snipe: in the first minutes, a buy over the cap is trimmed to the cap.");
    if (has("dynfee")) lines.push("Busy-hour fee: the fee sits inside its fixed range, shown before the buy.");
    if (has("arb")) lines.push("Arb recapture: any price gap profit stays with the pool.");
    if (has("cashback")) lines.push("Cashback: 30% of the fee goes back to the buyer (40% on Robinhood Chain with 100K QHOOKS).");
    if (has("referrals")) lines.push("Referrals: if someone brought this buyer, they get 20% of the fee.");
    if (has("buyback")) lines.push("Buyback: part of the fee buys the token back from the pool.");
    if (has("revshare")) lines.push("Holder share: part of the fee goes to stakers.");
    if (has("floor")) lines.push("Price floor: part of the fee tops up the floor reserve.");
    lines.push("A sell of the same tokens goes through. No block here can stop it.");
    return '<div class="sx-test"><div class="sx-lab">Test buy, 1 ETH <span class="sx-est">Simulated</span></div>' + lines.map(function (l) { return "<div>" + esc(l) + "</div>"; }).join("") + "</div>";
  }
  function draw(root) {
    var s = S.get(), checks = K.check(ui.blocks);
    root.innerHTML = '<div class="sx"><div class="sx-top"><div><div class="sx-k">HOOK STUDIO' + (s.ticker ? " · FOR $" + esc(s.ticker) : "") + "</div><h1>Build the hook for your pool</h1>" +
      '<div class="lx-hint">Pick blocks. Each one says what it does, what traders see and how risky it is. Problems show as you go.</div></div>' +
      '<a class="lx-btn" href="#/launch">Back to launch</a></div>' +
      '<div class="sx-tabs"><button type="button" class="sx-tab' + (ui.tab === "compose" ? " on" : "") + '" data-tab="compose">Pick blocks</button>' +
      '<button type="button" class="sx-tab' + (ui.tab === "preset" ? " on" : "") + '" data-tab="preset">Start from a preset</button></div>' +
      '<div class="sx-grid"><div>' + (ui.tab === "preset" ? presets() : "") + library() + "</div>" +
      '<aside class="sx-card"><div class="sx-ch"><b>Your hook</b><span class="sx-cnt">' + ui.blocks.length + "/" + K.MAX + " blocks</span>" + chip(ui.blocks) + "</div>" +
      '<div class="sx-seg"><button type="button" class="' + (ui.view === "blocks" ? "on" : "") + '" data-view="blocks">Blocks</button><button type="button" class="' + (ui.view === "path" ? "on" : "") + '" data-view="path">Buy path</button></div>' +
      stack() + checks.map(function (c) { return '<div class="lx-msg ' + (c.level === "stop" ? "lx-bad" : "lx-warn") + '">' + esc(c.text) + "</div>"; }).join("") +
      (ui.test ? testBuy() : "") +
      '<button type="button" class="lx-btn sx-run" data-test>' + (ui.test ? "Run the test buy again" : "Run a test buy") + "</button>" +
      '<div class="sx-bar"><button type="button" class="lx-go" data-use' + (K.ready(ui.blocks) || !ui.blocks.length ? "" : " disabled") + ">Use these hooks</button>" +
      '<div class="lx-gosub">Goes back to your launch with these ' + ui.blocks.length + " blocks.</div></div></aside></div></div>";
  }
  function render(root) {
    ui.blocks = S.get().blocks.slice(0); ui.test = ""; ui.view = "blocks";
    draw(root);
    root.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.tab) { ui.tab = b.dataset.tab; }
      else if (b.dataset.view) { ui.view = b.dataset.view; }
      else if (b.dataset.group) { ui.open[b.dataset.group] = !ui.open[b.dataset.group]; }
      else if (b.dataset.preset) { ui.blocks = K.presets[b.dataset.preset].ids.slice(0); ui.test = ""; }
      else if (b.dataset.toggle) {
        var id = b.dataset.toggle, i = ui.blocks.indexOf(id);
        if (i >= 0) ui.blocks.splice(i, 1); else ui.blocks.push(id);
        ui.test = "";
      }
      else if (b.hasAttribute("data-test")) { ui.test = "1"; }
      else if (b.hasAttribute("data-use")) { S.setBlocks(ui.blocks); S.save(); location.hash = "#/launch?from=studio"; return; }
      else return;
      var y = window.scrollY; draw(root); window.scrollTo(0, y);
    });
  }
  return { render: render };
})();
;
/* js/community-fill.js */
/* community-fill.js: names and "now" numbers for the Community board. Written by Claude.
   Names: each wallet's public community profile (/api/community/profile/<w>, the record /profile.html shows):
   its display name, else its profile handle, else its linked X handle. No profile means the short address,
   linked to the wallet page. One read per wallet per visit (memo + sessionStorage), 4 at a time.
   Now: tokens the market lists don't carry are read once per visit from the token reader the token page uses
   (/api/terminal/x/token, or the QHooks pool index for a launch board), with our own stored pool candles as the
   fallback while that reader refreshes. values(c) turns entry and now into
   market caps: entry MC = entry price x (MC / price now) when only the entry price was stamped. */
window.CommunityFill = (function () {
  "use strict";
  var who = {}, asking = {}, tok = {}, tries = {}, KEY = "qh-names-v1";
  try { who = JSON.parse(sessionStorage.getItem(KEY) || "{}") || {}; } catch (e) { who = {}; }
  function A() { return window.QHApi; }
  function lc(w) { return String(w || "").toLowerCase(); }
  function keep() { try { sessionStorage.setItem(KEY, JSON.stringify(who)); } catch (e) { /* private window */ } }
  function local(u) { u = String(u || ""); return u.indexOf("https://qhooks.com/api/") === 0 ? u.slice(19) : (u.charAt(0) === "/" ? u : ""); }

  function read(w) {
    return A().get("/api/community/profile/" + encodeURIComponent(w), { timeout: 10000 }).then(function (r) {
      var b = r.body || {};
      if (!r.ok || lc(b.wallet) !== w) return null;
      var p = b.profile || {}, x = (b.accounts || []).filter(function (a) { return a && a.kind === "x" && a.handle; })[0];
      var name = String(p.name || "").trim() || (b.handle ? "@" + b.handle : "") || (x ? "@" + x.handle : "");
      return { name: name.slice(0, 32), image: local(p.image) ? window.QH_API + local(p.image) : "" };
    });
  }
  /* Looks up every wallet not known yet; done() runs once when any new answer lands. */
  function names(wallets, done) {
    if (!A()) return;
    var todo = [], seen = {};
    (wallets || []).forEach(function (w) { w = lc(w); if (/^0x[0-9a-f]{40}$/.test(w) && !(w in who) && !asking[w] && !seen[w]) { seen[w] = 1; todo.push(w); } });
    if (!todo.length) return;
    todo.forEach(function (w) { asking[w] = 1; });
    var next = 0, got = 0;
    function lane() {
      if (next >= todo.length) return Promise.resolve();
      var w = todo[next++];
      return read(w).then(function (v) { if (v) { who[w] = v; got++; } delete asking[w]; return lane(); });
    }
    var lanes = []; for (var i = 0; i < Math.min(4, todo.length); i++) lanes.push(lane());
    Promise.all(lanes).then(function () { keep(); if (got && done) done(); });
  }
  function label(w) { var v = who[lc(w)]; return v && (v.name || v.image) ? v : null; }

  function num(v) { v = Number(v); return isFinite(v) && v > 0 ? v : null; }
  /* Fills price and MC for call tokens no market list carries. done() runs when new numbers land. */
  function prices(calls, done) {
    if (!A()) return;
    var todo = {};
    (calls || []).forEach(function (c) {
      var t = c.token; if (!t || (t.mcap && t.price)) return;
      var k = t.chainId + ":" + lc(t.address); if (tok[k]) return; tok[k] = { t: [] }; todo[k] = c;
    });
    var keys = Object.keys(todo).slice(0, 16); if (!keys.length) return;
    var next = 0, got = 0, retry = false;
    function one(k) {
      var c = todo[k], t = c.token, launch = c.boardKind === "launch";
      var path = launch ? "/api/terminal/market/" + t.chainId + "/" + lc(t.address) + "?tf=3600" : "/api/terminal/x/token/" + t.chainId + "/" + lc(t.address);
      return A().get(path, { timeout: 15000 }).then(function (r) {
        var b = r.body || {}, s = launch ? b.summary || {} : b, m = launch ? b.meta || {} : b;
        if (!r.ok) return launch ? null : ownPool(t);
        var px = num(s.priceUsd);
        return { price: px, mcap: num(s.mcapUsd) || num(s.fdvUsd) || (px && num(s.supply) ? px * num(s.supply) : null), symbol: m.symbol || "", name: m.name || "", logo: window.QHNorm ? window.QHNorm.img(m.logo || m.logoURI) : null };
      }).then(function (v) {
        /* Neither reader answered (both refresh now and then): two more tries, 6 s apart. */
        if (!v) { delete tok[k]; tries[k] = (tries[k] || 0) + 1; if (tries[k] < 3) retry = true; return; }
        tok[k] = v; if (v.price || v.mcap) got++;
      });
    }
    function lane() { if (next >= keys.length) return Promise.resolve(); var k = keys[next++]; return one(k).then(lane); }
    var lanes = []; for (var i = 0; i < Math.min(3, keys.length); i++) lanes.push(lane());
    Promise.all(lanes).then(function () { if (got && done) done(); if (retry) setTimeout(function () { prices(calls, done); }, 6000); });
  }
  /* Our own pool index while the outside-token reader is refreshing: the token's pool and supply from its stored
     QProof report, then the last stored candle of that pool (/api/candles, the token page's chart feed). */
  function ownPool(t) {
    if (String(t.chainId) !== "4663") return Promise.resolve(null);
    return A().get("/api/qproof/latest?chain=robinhood&address=" + lc(t.address), { timeout: 15000 }).then(function (r) {
      var rep = r.ok && r.body && r.body.report, ob = rep && rep.observations || {}, mk = ob.market || {}, sub = rep && rep.subject || {};
      var pool = mk.pair || (sub.pool && sub.pool.address) || "", eth = (ob.liquidity && ob.liquidity.quoteSymbol) === "ETH";
      var quote = mk.quoteAddress || (eth ? "0x0000000000000000000000000000000000000000" : "");
      if (!/^0x[0-9a-f]{64}$/i.test(pool) || !/^0x[0-9a-f]{40}$/i.test(quote)) return null;
      var supply = Number(sub.supply) / Math.pow(10, Number(sub.decimals) || 18);
      return A().get("/api/candles?chain=4663&tf=300&pool=" + lc(pool) + "&token=" + lc(t.address) + "&quote=" + lc(quote), { timeout: 15000 }).then(function (c) {
        var bars = c.ok && c.body && c.body.unit === "USD" && c.body.bars || [], last = bars[bars.length - 1], px = last ? num(last.close) : null;
        return px ? { price: px, mcap: supply > 0 ? px * supply : null, symbol: String(sub.label || "").replace(/^\$/, ""), name: sub.name || "", logo: null } : null;
      });
    });
  }
  /* Copies what prices() learned onto a token object. */
  function apply(t) {
    var v = t && tok[t.chainId + ":" + lc(t.address)]; if (!v || !v.symbol && !v.price) return t;
    if (!t.price && v.price) t.price = v.price; if (!t.mcap && v.mcap) t.mcap = v.mcap;
    if (/^0x/.test(t.symbol || "") && v.symbol) { t.symbol = v.symbol; t.name = t.name || v.name; }
    if (!t.logo && v.logo) t.logo = v.logo;
    return t;
  }

  /* Entry and now as market caps (and prices) for one call; null where it can't be known. */
  function values(c) {
    var t = c.token || {}, nowPx = num(t.price) || num(c.nowPrice), nowMc = num(t.mcap);
    var ratio = nowPx && nowMc ? nowMc / nowPx : null;
    var entryMc = num(c.entryMc) || (num(c.entryPrice) && ratio ? c.entryPrice * ratio : null);
    var entryPx = num(c.entryPrice) || (entryMc && ratio ? entryMc / ratio : null);
    var m = entryMc && nowMc ? nowMc / entryMc : (entryPx && nowPx ? nowPx / entryPx : 0);
    return { entryMc: entryMc, entryPx: entryPx, nowMc: nowMc, nowPx: nowPx, multiple: m };
  }
  return { names: names, label: label, prices: prices, apply: apply, values: values };
})();
;
/* js/community-data.js */
/* community-data.js: calls, callers, comments and tracked wallets for the Community board.
   Written by Claude. One adapter, load(kind, arg). Live first (live-social.js, read once per visit):
   calls = /api/community/activity, tokens = boards, leaders = traders by real PnL (7d), wallets = the
   visitor's tracked wallets (or the week's top traders) with their QHooks trades, comments = the token's board.
   Until a live read answers, or when it fails, the seeded fixtures below fill in and isSample(kind) is true,
   so every screen shows the "Sample data" tag. Fires window event "qh-community" when live rows land. */
window.CommunityData = (function () {
  "use strict";
  var CALLERS = ["deltaslate", "nightdesk", "lowfloat", "ironledger", "quietbid", "graphite", "tapewatch", "slowfuse", "coldstart", "midcurve", "blockhand", "lastprint"];
  var NOTES = [
    "Dev kept a small bag and the LP is locked. Watching the next level.",
    "Holder count climbing steady, no bundles in the first block.",
    "QProof came back clear and the hook pays holders on every trade.",
    "Volume held through the dip. Small size here, adding on strength.",
    "Close to graduation. Taking a starter before the pool opens.",
    "Chart reset after the first run. Entry is cheaper than the open.",
    "Buyback hook is live, so every sell feeds the floor.",
    "Team posted the roadmap on chain. Long hold for me."
  ];
  var COMMENTS = [
    "Bought a little after the call, holding through the week.",
    "Liquidity looks thin for the size people are trading.",
    "Hook payouts showed up in my wallet this morning.",
    "Top 10 dropped under 20 percent, good sign.",
    "Took profit at 3x, left a runner.",
    "Anyone checked the dev wallet history?",
    "Floor held twice today."
  ];
  var memo = null, posted = [], posting = [];

  function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hexAddr(r) { var h = "0x"; for (var i = 0; i < 40; i++) h += "0123456789abcdef".charAt(Math.floor(r() * 16)); return h; }
  function tokens() { return (window.QH_TOKENS || []).filter(function (t) { return t && t.address; }); }

  function build() {
    var toks = tokens(); if (!toks.length) return { calls: [], callers: [], wallets: [] };
    var r = seeded(toks.length * 7919 + toks[0].address.charCodeAt(5));
    var callers = CALLERS.map(function (n) { return { name: n, address: hexAddr(r) }; });
    var calls = [];
    for (var i = 0; i < 140; i++) {
      var t = toks[Math.floor(r() * Math.min(toks.length, 18))];
      var c = callers[Math.floor(r() * callers.length)];
      var mult = r() < 0.55 ? 1 + r() * r() * 14 : 0.25 + r() * 0.75;
      calls.push({ id: "c" + i, caller: c.name, wallet: c.address, token: t, entryMc: Math.max(400, Math.round((t.mcap || 1000) / mult)), at: Date.now() - Math.floor(i * i * 900 + r() * 600) * 1000, note: NOTES[Math.floor(r() * NOTES.length)] });
    }
    var wallets = callers.slice(0, 7).map(function (c, k) {
      var trades = [];
      for (var j = 0; j < 3; j++) { var tk = toks[Math.floor(r() * toks.length)]; trades.push({ side: r() < 0.6 ? "buy" : "sell", token: tk, usd: Math.round(40 + r() * r() * 9000), at: Date.now() - Math.floor((k * 3 + j) * 400 + r() * 300) * 1000 }); }
      return { label: c.name, address: c.address, trades: trades };
    });
    return { calls: calls, callers: callers, wallets: wallets };
  }
  function base() { if (!memo || !memo.calls.length) memo = build(); return memo; }
  function multiple(c) {
    if (c.live) return window.CommunityFill ? window.CommunityFill.values(c).multiple : 0;
    return c.entryMc ? (c.token.mcap || 0) / c.entryMc : 0;
  }
  function allCalls() { return posted.concat(base().calls); }

  function leaders() {
    var by = {};
    allCalls().forEach(function (c) {
      var m = multiple(c), row = by[c.caller] || (by[c.caller] = { caller: c.caller, wallet: c.wallet, calls: 0, hits: 0, best: 0 });
      row.calls++; if (m >= 2) row.hits++; if (m > row.best) row.best = m;
    });
    return Object.keys(by).map(function (k) { var x = by[k]; x.hitRate = x.calls ? x.hits / x.calls : 0; return x; });
  }
  function calledTokens() {
    var by = {};
    allCalls().forEach(function (c) {
      var a = c.token.address, row = by[a] || (by[a] = { token: c.token, calls: 0, firstMc: c.entryMc, last: 0 });
      row.calls++; if (c.at > row.last) { row.last = c.at; } if (c.entryMc < row.firstMc) row.firstMc = c.entryMc;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.calls - a.calls; });
  }
  function comments(addr) {
    var r = seeded(parseInt(String(addr).slice(2, 10), 16) || 7), cs = base().callers;
    var list = [];
    for (var i = 0; i < 5; i++) { var c = cs[Math.floor(r() * cs.length)]; list.push({ who: c.name, wallet: c.address, text: COMMENTS[Math.floor(r() * COMMENTS.length)], at: Date.now() - Math.floor((i + 1) * (i + 2) * 420 + r() * 200) * 1000 }); }
    return posting.filter(function (p) { return p.addr === addr; }).concat(list);
  }

  /* Live rows (null until a read answers). */
  var live = { calls: null, tokens: null, leaders: null, wallets: null, boards: {} }, started = false;
  function L() { return window.QHLive && window.QHLive.calls ? window.QHLive : null; }
  function emit() { try { window.dispatchEvent(new Event("qh-community")); } catch (e) {} }
  function sh(a) { a = String(a || ""); return a.length > 10 ? a.slice(0, 6) + "…" + a.slice(-4) : a; }
  function tokenFor(chainId, addr, hint) {
    var lt = L() && L().find(chainId, addr), b = (live.tokens || []).filter(function (x) { return x.token.address.toLowerCase() === String(addr).toLowerCase(); })[0];
    var t = lt || (b && b.token) || {};
    return { address: addr, chainId: chainId, chain: t.chain || (window.QHNorm ? window.QHNorm.chain(chainId).name : ""), symbol: t.symbol || (hint && hint.symbol) || sh(addr),
      name: t.name || (hint && hint.name) || "", mcap: t.mcap, price: t.price, logo: t.logo || (hint && hint.logo), qProof: t.qProof, href: window.QHNorm ? window.QHNorm.href(chainId, addr) : "#/token/" + addr };
  }
  function start() {
    var A = L(); if (!A || started) return; started = true;
    A.boards().then(function (r) {
      if (r.ok) live.tokens = r.rows.map(function (b) { return { live: true, token: tokenFor(b.chainId, b.address, b), calls: b.posts, replies: b.replies, last: b.last, kind: b.kind }; });
      return A.calls();
    }).then(function (r) {
      if (r && r.ok) live.calls = r.rows.map(function (c) {
        var t = tokenFor(c.chainId, c.address);
        return { id: c.id, live: true, caller: sh(c.wallet), wallet: c.wallet, token: t, at: c.at, note: c.note, kind: c.kind, boardKind: c.boardKind, entryPrice: c.entryPrice, entryMc: c.entryMc || null, nowPrice: c.nowPrice || t.price || null };
      });
      emit(); if (r && r.ok) { names(); fill(); }
    });
    A.leaders("7d").then(function (r) {
      if (r.ok) live.leaders = r.rows.map(function (x) { return { live: true, caller: sh(x.wallet), wallet: x.wallet, pnl: x.pnl, winRate: x.winRate, trades: x.trades, volume: x.volume, calls: x.trades }; });
      emit(); loadWallets(); fill();
    });
  }
  /* Display names for callers, traders and tracked wallets, and "now" numbers for call tokens (community-fill.js). */
  function fill() {
    var F = window.CommunityFill; if (!F) return;
    var ws = (live.calls || []).map(function (c) { return c.wallet; }).concat((live.leaders || []).slice(0, 20).map(function (x) { return x.wallet; }), trackedList());
    F.names(ws, emit);
    if (live.calls) F.prices(live.calls, emit);
  }
  /* Calls on tokens outside the market lists: take the symbol and logo from the token's own board (one read each). */
  function names() {
    var A = L(), todo = {};
    (live.calls || []).forEach(function (c) {
      var lt = A.find(c.token.chainId, c.token.address);
      if (lt && lt.symbol) { c.token.symbol = lt.symbol; c.token.logo = c.token.logo || lt.logo; c.nowPrice = c.nowPrice || lt.price || null; }
      else if (/^0x/.test(c.token.symbol)) todo[c.token.chainId + ":" + c.token.address] = c.token;
    });
    var keys = Object.keys(todo).slice(0, 12); if (!keys.length) return;
    Promise.all(keys.map(function (k) { var t = todo[k]; return A.board(t.chainId, t.address, "token").then(function (r) { return { k: k, r: r }; }); })).then(function (rs) {
      var meta = {}; rs.forEach(function (x) { if (x.r.ok && x.r.meta.symbol) { meta[x.k] = x.r.meta; live.boards[x.k] = x.r.posts; } });
      live.calls.forEach(function (c) { var m = meta[c.token.chainId + ":" + c.token.address]; if (m) { c.token.symbol = m.symbol; c.token.name = m.name; c.token.logo = m.logo; } });
      emit();
    });
  }
  function loadWallets() {
    var A = L(), mine = trackedList(), top = !mine.length;
    var list = (mine.length ? mine : (live.leaders || []).slice(0, 3).map(function (x) { return x.wallet; })).slice(0, 6);
    if (!A || !list.length) { live.wallets = live.leaders ? [] : null; emit(); return; }
    Promise.all(list.map(function (w) {
      if (A.family(w) !== "evm") return Promise.resolve({ label: sh(w), address: w, trades: [], note: "Trades on QHooks cover EVM wallets" });
      return A.trades(w).then(function (r) {
        var rows = (r.ok ? r.rows : []).slice(0, 3);
        return Promise.all(rows.map(function (t) { return A.usdOf(t.paid, t.quoteSymbol); })).then(function (u) {
          return { label: (top ? "Top trader " : "") + sh(w), address: w, trades: rows.map(function (t, i) {
            return { side: t.side, token: { address: t.href, symbol: t.symbol, href: t.href }, usd: u[i], at: t.time };
          }) };
        });
      });
    })).then(function (ws) { live.wallets = ws; live.walletsTop = top; emit(); fill(); });
  }
  /* The boards list says whether a token has a launch board or a token board; wait for it (one shared read). */
  function boardFor(chainId, addr, kind, cb) {
    var A = L(), k = chainId + ":" + addr; if (!A) return cb(null);
    if (live.boards[k]) return cb(live.boards[k]);
    A.boards().then(function (bl) {
      var known = (bl.rows || []).filter(function (x) { return x.address.toLowerCase() === String(addr).toLowerCase(); })[0];
      if (known) kind = known.kind === "launch" ? "launch" : "token";
      return A.board(chainId, addr, kind);
    }).then(function (r) { if (r.ok || r.final) live.boards[k] = r.posts; cb(r.ok || r.final ? r.posts : null); });
  }

  /* The adapter: the only place a live source plugs in. */
  function load(kind, arg) {
    start();
    if (kind === "calls" && live.calls) return live.calls.filter(function (c) { return !arg || c.token.address.toLowerCase() === String(arg).toLowerCase(); });
    if (kind === "leaders" && live.leaders) return live.leaders.slice();
    if (kind === "tokens" && live.tokens) return live.tokens;
    if (kind === "wallets" && live.wallets) return live.wallets;
    if (kind === "calls") return allCalls().filter(function (c) { return !arg || c.token.address === arg; }).sort(function (a, b) { return b.at - a.at; });
    if (kind === "leaders") return leaders();
    if (kind === "tokens") return calledTokens();
    if (kind === "comments") return comments(arg);
    if (kind === "wallets") return trackedExtra().concat(base().wallets);
    return [];
  }
  function isSample(kind) { return !live[kind]; }
  function trackedList() { try { return JSON.parse(localStorage.getItem("qh-tracked") || "[]"); } catch (e) { return []; } }
  function trackedExtra() {
    return trackedList().map(function (a) { return { label: a.slice(0, 6) + "…" + a.slice(-4), address: a, trades: [] }; });
  }

  function postCall(token, note) {
    var me = { name: "you", address: (window.QHLive && window.QHLive.wallet && window.QHLive.wallet()) || "0x0000000000000000000000000000000000000000" };
    posted.unshift({ id: "p" + Date.now(), caller: me.name, wallet: String(me.address), token: token, entryMc: token.mcap || 0, at: Date.now(), note: note || "" });
  }
  function postComment(addr, text) { posting.unshift({ addr: addr, who: "you", wallet: "", text: text, at: Date.now() }); }
  function save(list) { try { localStorage.setItem("qh-tracked", JSON.stringify(list.slice(0, 20))); } catch (e) { /* private window */ } }
  function track(addr) { var list = trackedList(); if (list.indexOf(addr) < 0) list.unshift(addr); save(list); if (started) loadWallets(); }
  function untrack(addr) { save(trackedList().filter(function (a) { return a !== addr; })); if (started) loadWallets(); }
  function isTracked(addr) { return trackedList().indexOf(addr) >= 0; }
  return { load: load, isSample: isSample, boardFor: boardFor, multiple: multiple, postCall: postCall, postComment: postComment, track: track, untrack: untrack, isTracked: isTracked };
})();
;
/* js/community-cards.js */
/* community-cards.js: shared pieces for the Community board and the token Community tab.
   Written by Claude. Call cards, leaderboard rows, called-token rows, tracked wallets,
   one-touch Buy with an undo toast. All copy is QHooks' own. */
window.CommunityCards = (function () {
  "use strict";
  var TILE = ["#3a4a5c", "#4a3f5c", "#5c4a3a", "#3a5c4f", "#5c3a46", "#45503a"];
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function usd(v) {
    v = v || 0; var a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "K";
    return "$" + Math.round(v);
  }
  function ago(t) {
    var s = Math.max(1, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return s + "s"; if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h"; return Math.floor(s / 86400) + "d";
  }
  function short(a) { return a && a.length > 10 ? a.slice(0, 6) + "…" + a.slice(-4) : (a || ""); }
  function mult(m) { return (m >= 10 ? m.toFixed(0) : m.toFixed(m >= 1 ? 1 : 2)) + "x"; }
  function native(t) { return t.chain === "Solana" ? "SOL" : t.chain === "BNB" ? "BNB" : "ETH"; }
  function size(t) { return t.chain === "Solana" ? "0.1" : t.chain === "BNB" ? "0.05" : "0.01"; }
  function tile(t, px) {
    var code = (t.symbol || "?").charCodeAt(0) || 0;
    return '<a class="cm-tile" style="width:' + px + "px;height:" + px + "px;background:" + TILE[code % TILE.length] + '" href="' + esc(th(t)) + '">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy">' : esc((t.symbol || "?").charAt(0))) + "</a>";
  }
  function th(t) { return t.href || "#/token/" + t.address; }
  function px(v) { return window.QHFmt ? window.QHFmt.price(v) : "$" + v; }
  function sample() { return '<span class="cm-sample">Sample data</span>'; }
  function qp(t) { var q = t.qProof || "Not checked"; return '<span class="pulse-qproof pulse-qproof-' + q.toLowerCase().replace(" ", "-") + '">' + esc(q) + "</span>"; }
  function hook(t) { return window.HookBadge ? window.HookBadge.inRow(t) : ""; }
  function buyBtn(t) { if (t.href) return '<a class="cm-buy" href="' + esc(t.href) + '">Trade</a>'; return '<button class="cm-buy" data-buy="' + esc(t.address) + '" aria-label="Buy">' + size(t) + " " + native(t) + "</button>"; }
  /* A wallet's public name (community profile) with the short address beside it; the short address alone otherwise. */
  function person(addr, fallback, prefix) {
    var v = window.CommunityFill && addr ? window.CommunityFill.label(addr) : null;
    if (!v) return walletLink(fallback || short(addr), addr);
    return '<a class="cm-who" href="#/wallet/' + esc(addr) + '">' + (v.image ? '<img class="cm-av" src="' + esc(v.image) + '" alt="" loading="lazy">' : "") + esc((prefix || "") + (v.name || short(addr))) + "</a>" + (v.name ? '<span class="cm-mut cm-addr">' + short(addr) + "</span>" : "");
  }
  function walletLink(name, addr) { return addr ? '<a class="cm-who" href="#/wallet/' + esc(addr) + '">' + esc(name) + "</a>" : '<span class="cm-who">' + esc(name) + "</span>"; }

  function liveNums(c) {
    var v = window.CommunityFill.values(c), cls = v.multiple >= 1 ? "cm-up" : "cm-dn";
    var nowPx = v.nowPx ? '<small class="cm-px">' + px(v.nowPx) + "</small>" : "";
    if (!v.nowMc && !v.nowPx) return "";
    if (!v.entryMc && !v.entryPx) return '<span class="cm-solo">Now ' + (v.nowMc ? usd(v.nowMc) + " MC" : px(v.nowPx)) + "</span>" + (v.nowMc ? nowPx : "");
    var useMc = v.entryMc && v.nowMc;
    return "<span><i>Entry</i>" + (useMc ? usd(v.entryMc) + " MC" : px(v.entryPx)) + "</span><span><i>Now</i>" + (useMc ? usd(v.nowMc) + " MC" : px(v.nowPx)) + "</span>" +
      (useMc ? nowPx.replace("cm-px", "cm-px cm-px-d") : "") + (v.multiple ? '<b class="' + cls + '">' + mult(v.multiple) + "</b>" : "");
  }
  function callCard(c) {
    var t = c.live && window.CommunityFill ? window.CommunityFill.apply(c.token) : c.token, m = window.CommunityData.multiple(c), cls = m >= 1 ? "cm-up" : "cm-dn";
    var nums = c.live ? liveNums(c) : "<span><i>Entry</i>" + usd(c.entryMc) + " MC</span><span><i>Now</i>" + usd(t.mcap) + ' MC</span><b class="' + cls + '">' + mult(m) + "</b>";
    var verb = c.kind === "buy" ? "bought" : "called";
    return '<article class="cm-call">' + tile(t, 40) +
      '<div class="cm-call-body"><div class="cm-call-top">' + (c.live ? person(c.wallet) : walletLink(c.caller, c.wallet)) + '<span class="cm-mut">' + verb + '</span><a class="cm-sym" href="' + esc(th(t)) + '">' + esc(t.symbol) + "</a>" + '<span class="cm-mut">' + ago(c.at) + "</span>" + '<span class="cm-chips">' + qp(t) + hook(t) + "</span></div>" +
      (c.note ? '<p class="cm-note">' + esc(c.note) + "</p>" : "") +
      '<div class="cm-call-nums">' + nums + '<span class="cm-chain">' + esc(t.chain || "") + "</span>" + buyBtn(t) + "</div></div></article>";
  }
  function leaderHead(sort) {
    function h(k, l) { return '<button class="cm-sort' + (sort === k ? " on" : "") + '" data-sort="' + k + '">' + l + "</button>"; }
    return '<div class="cm-lb cm-lb-head"><span>#</span><span>Caller</span>' + h("calls", "Calls") + h("hitRate", "Hit rate") + h("best", "Best") + "</div>";
  }
  function leaderHeadLive(sort) {
    function h(k, l) { return '<button class="cm-sort' + (sort === k ? " on" : "") + '" data-sort="' + k + '">' + l + "</button>"; }
    return '<div class="cm-lb cm-lb-head"><span>#</span><span>Trader</span>' + h("pnl", "PnL 7d") + h("winRate", "Win rate") + h("trades", "Trades") + "</div>";
  }
  function leaderRowLive(x, i) {
    return '<div class="cm-lb"><span class="cm-mut">' + (i + 1) + '</span><span class="cm-lb-who">' + person(x.wallet, x.caller) + "</span>" +
      '<b class="' + (x.pnl >= 0 ? "cm-up" : "cm-dn") + '">' + (x.pnl >= 0 ? "+" : "-") + usd(Math.abs(x.pnl || 0)) + "</b><b>" + (x.winRate == null ? "—" : Math.round(x.winRate * 100) + "%") + "</b><b>" + x.trades + "</b></div>";
  }
  function leaderRow(x, i) {
    return '<div class="cm-lb"><span class="cm-mut">' + (i + 1) + "</span>" + '<span class="cm-lb-who">' + walletLink(x.caller, x.wallet) + '<span class="cm-mut cm-addr">' + short(x.wallet) + "</span></span>" +
      "<b>" + x.calls + "</b><b>" + Math.round(x.hitRate * 100) + '%</b><b class="cm-up">' + mult(x.best) + "</b></div>";
  }
  function tokenRowLive(x) {
    var t = x.token;
    return '<div class="cm-trow">' + tile(t, 36) + '<div class="cm-trow-id"><a class="cm-sym" href="' + esc(th(t)) + '">' + esc(t.symbol) + '</a><span class="cm-mut">' + esc(t.name || "") + '</span><span class="cm-chips"><span class="cm-chain">' + esc(t.chain || "") + "</span>" + (x.kind === "token" ? "" : '<span class="cm-qh">QHooks launch</span>') + "</span></div>" +
      '<div class="cm-trow-n"><b>' + x.calls + '</b><i>posts</i></div><div class="cm-trow-n"><b>' + (x.last ? ago(x.last) : "—") + "</b><i>last post</i></div>" + buyBtn(t) + "</div>";
  }
  function tokenRow(x) {
    var t = x.token, m = x.firstMc ? (t.mcap || 0) / x.firstMc : 0;
    return '<div class="cm-trow">' + tile(t, 36) + '<div class="cm-trow-id"><a class="cm-sym" href="#/token/' + esc(t.address) + '">' + esc(t.symbol) + '</a><span class="cm-mut">' + esc(t.name || "") + '</span><span class="cm-chips">' + qp(t) + hook(t) + "</span></div>" +
      '<div class="cm-trow-n"><b>' + x.calls + '</b><i>calls</i></div><div class="cm-trow-n"><b>' + usd(t.mcap) + '</b><i class="' + (m >= 1 ? "cm-up" : "cm-dn") + '">' + mult(m) + " since first call</i></div>" + buyBtn(t) + "</div>";
  }
  function walletBlock(w) {
    var trades = w.trades.length ? w.trades.map(function (tr) {
      return '<div class="cm-wt"><span class="' + (tr.side === "buy" ? "cm-up" : "cm-dn") + '">' + (tr.side === "buy" ? "Bought" : "Sold") + '</span><a class="cm-sym" href="' + esc(th(tr.token)) + '">' + esc(tr.token.symbol) + "</a><b>" + (tr.usd == null ? "—" : usd(tr.usd)) + '</b><span class="cm-mut">' + ago(tr.at) + "</span></div>";
    }).join("") : '<div class="cm-wt cm-mut">' + esc(w.note || "No trades on QHooks markets yet") + "</div>";
    var named = window.CommunityFill && window.CommunityFill.label(w.address), top = /^Top trader /.test(w.label || "") ? "Top trader " : "";
    return '<div class="cm-wallet"><div class="cm-wallet-h">' + (named ? person(w.address, w.label, top) : walletLink(w.label, w.address) + '<span class="cm-mut cm-addr">' + short(w.address) + "</span>") + "</div>" + trades + "</div>";
  }
  function trackedPanel(list, isSample) {
    return '<section class="cm-tracked"><div class="cm-h">TRACKED WALLETS<span class="cm-mut">' + list.length + "</span>" + (isSample ? sample() : "") + "</div>" +
      '<form class="cm-track"><input class="cm-input" placeholder="Paste a wallet to track" aria-label="Wallet address"><button class="cm-btn" type="submit">Track</button></form>' +
      list.map(walletBlock).join("") + "</section>";
  }

  function toast(text, undo) {
    var s = document.querySelector(".fl-toasts");
    if (!s) { s = document.createElement("div"); s.className = "fl-toasts"; document.body.appendChild(s); }
    var t = document.createElement("div"); t.className = "fl-toast cm-toast"; t.textContent = text;
    if (undo) { var u = document.createElement("button"); u.className = "cm-undo"; u.textContent = "Undo"; u.onclick = function () { t.textContent = "Order cancelled"; setTimeout(function () { t.remove(); }, 1200); }; t.appendChild(u); }
    s.appendChild(t); setTimeout(function () { if (t.parentNode) t.remove(); }, 4000);
  }
  /* One touch (contract 1.3.3): delegated, so every card on every screen gets it. */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-buy]"); if (!b) return;
    e.preventDefault();
    var t = (window.QH_TOKENS || []).find(function (x) { return x.address === b.getAttribute("data-buy"); }); if (!t) return;
    toast("Buying " + size(t) + " " + native(t) + " of " + t.symbol + " at " + usd(t.mcap) + " MC", true);
  });
  document.addEventListener("submit", function (e) {
    var f = e.target; if (!f.classList || !f.classList.contains("cm-track")) return;
    e.preventDefault(); var v = (f.querySelector("input").value || "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(v) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) { toast("That doesn't look like a wallet address"); return; }
    window.CommunityData.track(v); toast("Tracking " + short(v)); window.dispatchEvent(new Event("hashchange"));
  });

  return { esc: esc, usd: usd, ago: ago, sample: sample, callCard: callCard, leaderHead: leaderHead, leaderRow: leaderRow, leaderHeadLive: leaderHeadLive, leaderRowLive: leaderRowLive, tokenRow: tokenRow, tokenRowLive: tokenRowLive, trackedPanel: trackedPanel, toast: toast };
})();
;
/* js/community-style.js */
/* community-style.js: styles for the Community board and the token Community tab. Written by Claude.
   Noir/brutalist (contract 1.2.1): hard 1 px rules, uppercase 11 px labels, numbers carry weight. */
(function () {
  "use strict";
  var css =
    ".cm-sample{display:inline-flex;align-items:center;height:18px;padding:0 6px;margin-left:8px;border:1px solid rgba(210,173,114,.45);color:var(--acc);border-radius:4px;font-size:11px;font-weight:600;letter-spacing:0;text-transform:none;white-space:nowrap}" +
    ".cm-tile img{width:100%;height:100%;object-fit:cover;border-radius:3px}a.cm-buy{display:inline-flex;align-items:center;text-decoration:none}" +
    ".cm-qh{font-size:11px;color:var(--acc);border:1px solid rgba(210,173,114,.45);border-radius:4px;padding:1px 5px}.cm-live-note{font-size:12px;color:var(--mut);padding:8px 16px}.cm-live-note a{color:var(--acc)}@media (max-width:767px){.cm-live-note a{display:inline-flex;align-items:center;min-height:44px}}" +
    ".cm-page{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:0;min-height:calc(100vh - 56px)}" +
    ".cm-main{min-width:0;border-right:1px solid var(--line)}" +
    ".cm-bar{position:sticky;top:56px;z-index:5;display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--line)}" +
    ".cm-title{font-size:11px;letter-spacing:.06em;color:var(--mut);margin:0;font-weight:600}" +
    ".cm-tabs{display:flex;gap:4px;flex:1;min-width:0}" +
    ".cm-tab{height:32px;padding:0 12px;border:1px solid var(--line);background:var(--s1);color:var(--mut);border-radius:4px;font-size:13px;cursor:pointer;white-space:nowrap}" +
    ".cm-tab.on{color:var(--tx);border-color:var(--tx);background:var(--s2)}.cm-tab-phone{display:none}" +
    ".cm-make{height:34px;padding:0 14px;border:1px solid var(--acc);background:var(--acc);color:#140d00;border-radius:4px;font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap}" +
    ".cm-btn{height:34px;padding:0 12px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;font-size:13px;cursor:pointer;white-space:nowrap}" +
    ".cm-list{padding:0}.cm-chips-row{display:flex;gap:6px;padding:10px 16px;border-bottom:1px solid var(--line)}" +
    ".cm-chip{height:28px;padding:0 10px;border:1px solid var(--line);background:transparent;color:var(--mut);border-radius:4px;font-size:12px;cursor:pointer}.cm-chip.on{color:var(--tx);border-color:var(--mut)}" +
    ".cm-mut{color:var(--mut);font-weight:400}.cm-up{color:var(--up)}.cm-dn{color:var(--dn)}" +
    ".cm-tile{flex:none;display:flex;align-items:center;justify-content:center;border-radius:4px;color:var(--tx);font-weight:700;font-size:16px;text-decoration:none;border:1px solid var(--line)}" +
    ".cm-call{display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}.cm-call:hover{background:var(--s1)}" +
    ".cm-call-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}" +
    ".cm-call-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px}" +
    ".cm-who{color:var(--tx);font-weight:600;text-decoration:none}.cm-who:hover,.cm-sym:hover{text-decoration:underline}" +
    ".cm-sym{color:var(--tx);font-weight:700;text-decoration:none}.cm-chips{display:inline-flex;gap:4px;align-items:center;margin-left:auto}" +
    ".cm-note{margin:0;font-size:13px;line-height:1.4;color:var(--tx);overflow-wrap:anywhere}" +
    ".cm-call-nums{display:flex;align-items:center;gap:14px;font-size:13px;font-variant-numeric:tabular-nums}" +
    ".cm-call-nums i{font-style:normal;color:var(--mut);font-size:11px;margin-right:5px;letter-spacing:.04em;text-transform:uppercase}" +
    ".cm-call-nums>b{font-size:15px}.cm-chain{color:var(--mut);font-size:11px}.cm-px{color:var(--mut);font-size:12px}" +
    ".cm-who{display:inline-flex;align-items:center;gap:6px}.cm-av{width:18px;height:18px;border-radius:3px;object-fit:cover;flex:none}.cm-call-top .cm-addr{color:var(--mut)}" +
    ".cm-buy{margin-left:auto;height:32px;padding:0 12px;border:1px solid var(--up);background:rgba(76,195,138,.1);color:var(--up);border-radius:4px;font-weight:600;font-size:12px;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums}" +
    ".cm-buy:hover{background:var(--up);color:#04140c}" +
    ".cm-sub{margin:0;padding:10px 16px;font-size:12px;color:var(--mut)}" +
    ".cm-lb{display:grid;grid-template-columns:40px minmax(0,1fr) 90px 90px 90px;align-items:center;height:48px;padding:0 16px;border-bottom:1px solid var(--line);font-size:13px;font-variant-numeric:tabular-nums}" +
    ".cm-lb b{text-align:right}.cm-lb-head{height:36px;font-size:11px;color:var(--mut);letter-spacing:.06em;text-transform:uppercase}" +
    ".cm-sort{background:none;border:0;color:var(--mut);font:inherit;letter-spacing:inherit;text-transform:inherit;text-align:right;cursor:pointer;height:100%;padding:0}.cm-sort.on{color:var(--tx)}" +
    ".cm-lb-who{display:flex;gap:8px;align-items:baseline;min-width:0}.cm-addr{font-size:11px;font-family:ui-monospace,Menlo,monospace}" +
    ".cm-trow{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:13px}" +
    ".cm-trow-id{flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.cm-trow-id .cm-chips{margin-left:0}" +
    ".cm-trow-n{display:flex;flex-direction:column;align-items:flex-end;min-width:90px;font-variant-numeric:tabular-nums}.cm-trow-n i{font-style:normal;font-size:11px;color:var(--mut)}.cm-trow-n i.cm-up{color:var(--up)}.cm-trow-n i.cm-dn{color:var(--dn)}" +
    ".cm-side{position:sticky;top:56px;align-self:start;max-height:calc(100vh - 56px);overflow-y:auto}" +
    ".cm-h{display:flex;gap:8px;align-items:center;font-size:11px;letter-spacing:.06em;color:var(--mut);font-weight:600;padding:12px 16px}" +
    ".cm-track,.cm-cform{display:flex;gap:6px;padding:0 16px 12px;border-bottom:1px solid var(--line)}" +
    ".cm-input{flex:1;min-width:0;height:34px;background:var(--s1);border:1px solid var(--line);color:var(--tx);border-radius:4px;padding:0 10px;font-size:13px}" +
    ".cm-wallet{padding:10px 16px;border-bottom:1px solid var(--line)}.cm-wallet-h{display:flex;gap:8px;align-items:baseline;margin-bottom:6px;font-size:13px}" +
    ".cm-wt{display:grid;grid-template-columns:56px minmax(0,1fr) auto 36px;gap:8px;font-size:12px;padding:3px 0;font-variant-numeric:tabular-nums}.cm-wt span:last-child{text-align:right}" +
    ".cm-empty{padding:24px 16px;color:var(--mut);font-size:13px}" +
    ".token-main>.token-tabs,.token-main>.cm-tc{flex-shrink:0}" +
    ".cm-tc{border-top:1px solid var(--line)}.cm-tc-head{display:flex;align-items:center;justify-content:space-between;padding-right:16px}.cm-h-gap{margin-top:8px}" +
    ".cm-comment{padding:10px 16px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:4px}" +
    ".cm-sheet-wrap{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center}" +
    ".cm-sheet{width:420px;max-width:100%;background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:4px 0 16px;display:flex;flex-direction:column;gap:10px;animation:cmIn .16s ease-out}" +
    ".cm-lbl{display:flex;flex-direction:column;gap:6px;padding:0 16px;font-size:12px;color:var(--mut)}.cm-sel{-webkit-appearance:none;appearance:none;cursor:pointer}.cm-ta{height:72px;padding:8px 10px;resize:none;font-family:inherit}" +
    ".cm-sheet .cm-sub{padding:0 16px}.cm-sheet-act{display:flex;gap:8px;justify-content:flex-end;padding:0 16px}" +
    ".cm-undo{margin-left:10px;background:none;border:1px solid var(--line);color:var(--acc);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:12px}" +
    ".q-more-h{font-size:11px;letter-spacing:.06em;color:var(--mut);margin:0;padding:16px;font-weight:600}" +
    ".q-more-link{display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:60px;padding:0 16px;border-top:1px solid var(--line);color:var(--tx);text-decoration:none;font-size:15px}" +
    ".q-more-link span{font-size:12px;color:var(--mut)}.q-more-link:last-child{border-bottom:1px solid var(--line)}" +
    "@keyframes cmIn{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}" +
    "@media (max-width:1099px){.cm-page{grid-template-columns:1fr}.cm-side{display:none}.cm-main{border-right:0}.cm-tab-phone{display:inline-block}}" +
    "@media (max-width:767px){.cm-page{padding-bottom:80px}.cm-bar{flex-wrap:wrap;gap:8px;padding:8px 12px}.cm-title{display:none}" +
    ".cm-tabs{order:2;flex-basis:100%;overflow-x:auto}.cm-tab{flex:1;height:44px;padding:0 8px}.cm-make{margin-left:auto;height:44px}.cm-btn,.cm-input{height:44px}" +
    ".cm-bar::before{content:'COMMUNITY';font-size:11px;letter-spacing:.06em;color:var(--mut);font-weight:600}" +
    ".cm-call{padding:12px}.cm-chips{margin-left:0}.cm-buy{height:44px;padding:0 14px}" +
    ".cm-chips-row{padding:8px 12px}.cm-chip{height:44px;flex:1}.cm-sort{min-height:44px}" +
    ".cm-lb{grid-template-columns:28px minmax(0,1fr) 52px 64px 56px;padding:0 12px;height:52px}.cm-lb .cm-addr{display:none}" +
    ".cm-trow{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:6px 10px;padding:10px 12px}.cm-trow>.cm-tile{grid-row:1/3}" +
    ".cm-trow-id{grid-column:2;grid-row:1}.cm-trow-n:nth-child(3){grid-column:2;grid-row:2;flex-direction:row;gap:4px;align-items:center;min-width:0}" +
    ".cm-trow-n:nth-child(4){grid-column:3;grid-row:1;min-width:0}.cm-trow .cm-buy{grid-column:3;grid-row:2;margin:0}" +
    ".cm-call-nums{gap:8px;flex-wrap:nowrap}.cm-call-nums i,.cm-chain{display:none}.cm-call-nums span+span::before{content:'\\2192  ';color:var(--mut)}.cm-px-d{display:none}" +
    ".cm-wallet,.cm-h{padding-left:12px;padding-right:12px}.cm-track,.cm-cform{padding:0 12px 12px}.cm-who,.cm-sym{display:inline-flex;align-items:center;min-height:44px;margin:-12px 0}" +
    ".cm-tile{min-width:44px;min-height:44px}.token-tabs{height:auto}.token-tab{min-height:44px;display:flex;align-items:center}.cm-wt{align-items:center;min-height:44px}" +
    ".cm-sheet-wrap{align-items:flex-end}.cm-sheet{border-radius:8px 8px 0 0;padding-bottom:24px}.cm-sheet-act button{height:48px;flex:1}}";
  var el = document.createElement("style"); el.textContent = css; document.head.appendChild(el);
})();
;
/* js/community.js */
/* community.js: the Community board at #/community (contract parity row "Community", v1.7 rule 1).
   Written by Claude. Tabs Calls / Tokens / Leaderboard, a Tracked wallets panel (right column on
   desktop, its own tab on phone) and a "Make a call" sheet. Data comes from CommunityData.load. */
window.Community = (function () {
  "use strict";
  var state = { tab: "calls", sort: "hitRate", filter: "all" };
  var TABS = [["calls", "Calls"], ["tokens", "Tokens"], ["leaders", "Leaderboard"], ["wallets", "Tracked"]];
  var D = function () { return window.CommunityData; }, K = function () { return window.CommunityCards; };

  function callsView() {
    var list = D().load("calls");
    if (state.filter === "hits") list = list.filter(function (c) { return D().multiple(c) >= 2; });
    if (state.filter === "mine") list = list.filter(function (c) { return c.caller === "you"; });
    var chips = [["all", "Newest"], ["hits", "2x and up"], ["mine", "My calls"]].map(function (f) {
      return '<button class="cm-chip' + (state.filter === f[0] ? " on" : "") + '" data-filter="' + f[0] + '">' + f[1] + "</button>";
    }).join("");
    var body = list.slice(0, 40).map(K().callCard).join("") || '<div class="cm-empty">No calls here yet. Make the first one.</div>';
    return '<div class="cm-chips-row">' + chips + tag("calls") + "</div>" + body;
  }
  function tag(kind) { return D().isSample(kind) ? K().sample() : ""; }
  function tokensView() {
    var live = !D().isSample("tokens"), rows = D().load("tokens").slice(0, 30);
    return (live ? '<p class="cm-sub">Boards with the newest posts, QHooks launches and any token.</p>' : '<p class="cm-sub">' + tag("tokens") + "</p>") +
      (rows.map(live ? K().tokenRowLive : K().tokenRow).join("") || '<div class="cm-empty">No boards yet.</div>');
  }
  function leadersView() {
    if (!D().isSample("leaders")) {
      var lk = ["pnl", "winRate", "trades"].indexOf(state.sort) >= 0 ? state.sort : "pnl";
      var lr = D().load("leaders").sort(function (a, b) { return (b[lk] || 0) - (a[lk] || 0); });
      return '<p class="cm-sub">Traders on QHooks markets this week, ranked by real PnL (5 trades or more).</p>' + K().leaderHeadLive(lk) + lr.slice(0, 50).map(K().leaderRowLive).join("");
    }
    var key = ["calls", "hitRate", "best"].indexOf(state.sort) >= 0 ? state.sort : "hitRate", rows = D().load("leaders").sort(function (a, b) { return b[key] - a[key] || b.calls - a.calls; });
    return '<p class="cm-sub">A hit is a call that reached 2x from its entry market cap.' + tag("leaders") + "</p>" + K().leaderHead(key) + rows.map(K().leaderRow).join("");
  }
  function walletsView() { return K().trackedPanel(D().load("wallets"), D().isSample("wallets")); }

  function body() {
    if (state.tab === "tokens") return tokensView();
    if (state.tab === "leaders") return leadersView();
    if (state.tab === "wallets") return walletsView();
    return callsView();
  }

  var hooked = false;
  function render(root) {
    if (!hooked) {
      hooked = true;
      window.addEventListener("qh-community", function () {
        var r = document.querySelector(".cm-page"); if (r && r.parentNode && !document.querySelector(".cm-sheet-wrap")) render(r.parentNode);
      });
    }
    if (window.innerWidth >= 1100 && state.tab === "wallets") state.tab = "calls";
    var tabs = TABS.map(function (t) {
      return '<button class="cm-tab' + (state.tab === t[0] ? " on" : "") + (t[0] === "wallets" ? " cm-tab-phone" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
    }).join("");
    root.innerHTML =
      '<div class="cm-page"><div class="cm-main">' +
        '<div class="cm-bar"><h1 class="cm-title">COMMUNITY</h1><div class="cm-tabs" role="tablist">' + tabs + "</div>" +
        '<button class="cm-make" data-make="">Make a call</button></div>' +
        '<div class="cm-list">' + body() + "</div></div>" +
        '<aside class="cm-side">' + walletsView() + "</aside></div>";
    root.onclick = function (e) {
      var t = e.target.closest("[data-tab]"), s = e.target.closest("[data-sort]"), f = e.target.closest("[data-filter]");
      if (t) { state.tab = t.getAttribute("data-tab"); render(root); }
      else if (s) { state.sort = s.getAttribute("data-sort"); render(root); }
      else if (f) { state.filter = f.getAttribute("data-filter"); render(root); }
      else if (e.target.closest("[data-make]")) openSheet(e.target.closest("[data-make]").getAttribute("data-make"), function () { state.tab = "calls"; state.filter = "all"; render(root); });
    };
  }

  /* Make a call: one sheet, token + one line, posted at the current market cap. */
  function openSheet(addr, done) {
    var toks = (window.QH_TOKENS || []).slice(0), C = K(), want = String(addr || "").toLowerCase();
    /* Opened from a token page: that token leads the list and is selected, even when it is not in the feed list. (Fable) */
    var cur = want && window.QHLive && window.QHLive.find ? window.QHLive.find(addr) : null;
    if (cur && cur.symbol) { toks = [cur].concat(toks.filter(function (t) { return String(t.address).toLowerCase() !== want; })); }
    var old = document.querySelector(".cm-sheet-wrap"); if (old) old.remove();
    var w = document.createElement("div"); w.className = "cm-sheet-wrap";
    var opts = toks.slice(0, 40).map(function (t) { return '<option value="' + C.esc(t.address) + '"' + (String(t.address).toLowerCase() === want ? " selected" : "") + ">" + C.esc(t.symbol) + " · " + C.usd(t.mcap) + " MC · " + C.esc(t.chain || "") + "</option>"; }).join("");
    w.innerHTML = '<form class="cm-sheet" role="dialog" aria-label="Make a call"><div class="cm-h">MAKE A CALL</div>' +
      '<label class="cm-lbl">Token<select class="cm-input cm-sel">' + opts + "</select></label>" +
      '<label class="cm-lbl">Why (optional)<textarea class="cm-input cm-ta" maxlength="160" placeholder="One line on why you like it"></textarea></label>' +
      '<p class="cm-sub">Your call is stamped with the market cap right now. Everyone sees the multiple from there.</p>' +
      '<div class="cm-sheet-act"><button type="button" class="cm-btn cm-cancel">Cancel</button><button type="submit" class="cm-make">Post call</button></div></form>';
    document.body.appendChild(w);
    /* The sheet must not follow the user to another screen (back button, link). (Fable) */
    window.addEventListener("hashchange", function gone() { window.removeEventListener("hashchange", gone); if (w.parentNode) w.remove(); });
    w.onclick = function (e) { if (e.target === w || e.target.closest(".cm-cancel")) w.remove(); };
    w.querySelector("form").onsubmit = function (e) {
      e.preventDefault();
      var a = w.querySelector(".cm-sel").value, t = toks.find(function (x) { return x.address === a; });
      if (!t) return;
      if (!D().isSample("calls") && t.chainId) {
        /* Live calls are signed on the token's board (wallet sign-in), so hand off there with the note copied. */
        var note = w.querySelector(".cm-ta").value.trim(); try { if (note) navigator.clipboard.writeText(note); } catch (x) {}
        window.open("https://qhooks.com/board.html#" + (t.kind === "qhooks" ? "m=" : "t=") + t.chainId + ":" + (t.controller || t.address), "_blank", "noopener");
        w.remove(); C.toast("Sign in on the board to post your call" + (note ? ". Your note is copied." : "")); return;
      }
      D().postCall(t, w.querySelector(".cm-ta").value.trim());
      w.remove(); C.toast("Call posted on " + t.symbol + " at " + C.usd(t.mcap) + " MC");
      if (done) done();
    };
  }

  return { render: render, openSheet: openSheet };
})();
;
/* js/token-community.js */
/* token-community.js: the Community tab on the token page (contract 1.3 token tabs + parity row).
   Written by Claude. Adds a "Community" tab to .token-tabs after the page renders; when it is on,
   the trades table is hidden and this token's calls and comments show in its place. */
(function () {
  "use strict";
  /* Live token routes are #/token/<chain>/<address>; take the last segment. (Fable) */
  function addr() { var m = location.hash.match(/^#\/token\/([^?]+)/); return m ? m[1].split("/").pop() : ""; }
  function token() {
    var a = addr().toLowerCase(), t = (window.QH_TOKENS || []).find(function (x) { return (x.address || "").toLowerCase() === a; });
    if (t || !a) return t;
    var sy = document.querySelector(".token-header .token-symbol");
    return { address: addr(), symbol: sy && sy.textContent.trim() ? sy.textContent.trim() : "this token" };
  }

  function chainId() { var m = location.hash.match(/^#\/token\/([^/?]+)\/[^/?]+/); return m ? decodeURIComponent(m[1]) : ""; }
  function boardUrl(t, c) { var lt = window.QHLive && window.QHLive.find(c, t.address); return "https://qhooks.com/board.html#" + (lt && lt.kind === "qhooks" ? "m=" : "t=") + c + ":" + ((lt && lt.controller) || t.address); }
  function commentRow(c, K) {
    var who = c.wallet ? '<a class="cm-who" href="#/wallet/' + K.esc(c.wallet) + '">' + K.esc(c.who || (c.wallet.slice(0, 6) + "…" + c.wallet.slice(-4))) + "</a>" : '<span class="cm-who">' + K.esc(c.who) + "</span>";
    return '<div class="cm-comment"><div class="cm-call-top">' + who + '<span class="cm-mut">' + K.ago(c.at) + "</span>" + (c.kind === "call" ? '<span class="cm-qh">Call</span>' : "") + '</div><p class="cm-note">' + K.esc(c.text) + "</p></div>";
  }
  /* Calls and comments: live from the token's board when the page has a chain; the seeded sample only when no
     live answer exists, and then always under a "Sample data" tag. */
  function panel(t, box) {
    var D = window.CommunityData, K = window.CommunityCards, c = chainId(), liveCalls = !D.isSample("calls");
    var calls = D.load("calls", t.address).slice(0, 6);
    box.innerHTML = '<div class="cm-tc-head"><div class="cm-h">CALLS ON ' + K.esc(t.symbol) + '<span class="cm-mut">' + calls.length + "</span>" + (liveCalls ? "" : K.sample()) + '</div><button class="cm-make" data-tc-make="">Make a call</button></div>' +
      (calls.map(K.callCard).join("") || '<div class="cm-empty">Nobody has called ' + K.esc(t.symbol) + " yet.</div>") +
      '<div class="cm-h cm-h-gap">COMMENTS<span class="cm-mut cm-ccount"></span><span class="cm-ctag"></span></div><div class="cm-clist"><div class="cm-empty">Reading the board</div></div>';
    function sample() {
      var list = D.load("comments", t.address);
      box.querySelector(".cm-ccount").textContent = list.length; box.querySelector(".cm-ctag").innerHTML = K.sample();
      box.querySelector(".cm-clist").innerHTML = '<form class="cm-cform"><input class="cm-input" maxlength="200" placeholder="Say something about ' + K.esc(t.symbol) + '" aria-label="Comment"><button class="cm-btn" type="submit">Post</button></form>' + list.map(function (x) { return commentRow(x, K); }).join("");
    }
    if (!c || !D.boardFor) { sample(); return; }
    var lt = window.QHLive && window.QHLive.find(c, t.address);
    D.boardFor(c, (lt && lt.kind === "qhooks" && lt.controller) || t.address, lt && lt.kind === "qhooks" ? "launch" : "token", function (posts) {
      if (!box.isConnected) return;
      if (!posts) { sample(); return; }
      box.querySelector(".cm-ccount").textContent = posts.length;
      box.querySelector(".cm-clist").innerHTML = '<div class="cm-live-note">Posting needs a wallet sign-in. <a href="' + K.esc(boardUrl(t, c)) + '" target="_blank" rel="noopener">Open the board to post</a></div>' +
        (posts.map(function (x) { return commentRow(x, K); }).join("") || '<div class="cm-empty">No posts on this board yet. Be the first.</div>');
    });
  }

  function show(on, tabs, id) {
    var main = tabs.parentNode, t = token();
    tabs.querySelectorAll(".token-tab").forEach(function (x) { x.classList.toggle("active", on ? x.getAttribute("data-tab") === "community" : x.getAttribute("data-tab") === (id || "trades")); });
    Array.prototype.forEach.call(main.children, function (el) {
      if (el.classList.contains("token-trades-table-container") || el.classList.contains("token-no-data") || el.classList.contains("lt-tabbody")) el.style.display = on ? "none" : "";
    });
    var box = main.querySelector(".cm-tc");
    if (!on) { if (box) box.style.display = "none"; return; }
    if (!box) { box = document.createElement("section"); box.className = "cm-tc"; main.appendChild(box); }
    box.style.display = ""; if (t) panel(t, box);
    box.onclick = function (e) { if (e.target.closest("[data-tc-make]") && window.Community) window.Community.openSheet(t.address, function () { show(true, tabs); }); };
    box.onsubmit = function (e) {
      e.preventDefault(); var inp = box.querySelector(".cm-cform input"), v = (inp.value || "").trim();
      if (!v || !t) return; window.CommunityData.postComment(t.address, v); show(true, tabs);
    };
  }

  function attach() {
    if (location.hash.indexOf("#/token/") !== 0 || !window.CommunityData) return;
    var tabs = document.querySelector(".token-tabs");
    if (!tabs || tabs.querySelector("[data-tab='community']")) return;
    var tab = document.createElement("div"); tab.className = "token-tab"; tab.setAttribute("data-tab", "community");
    tab.setAttribute("role", "button"); tab.tabIndex = 0; tab.textContent = "Community";
    tabs.appendChild(tab);
    tabs.addEventListener("click", function (e) {
      var x = e.target.closest(".token-tab"); if (!x) return;
      var id = x.getAttribute("data-tab");
      show(id === "community", tabs, id);
    });
  }
  window.addEventListener("qh-community", function () {
    var box = document.querySelector(".cm-tc"), t = token();
    if (box && box.style.display !== "none" && t && !box.querySelector(".cm-sheet")) panel(t, box);
  });
  var pending = false;
  new MutationObserver(function () { if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; attach(); }); } })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
;
/* js/live-chart.js */
/* live-chart.js: candlestick canvas for live bars (USD). Written by Claude.
   Draws at device pixel ratio, keeps the last 120 bars, right-hand price scale, last-price line.
   The last bar follows the header price so chart and header always tick from the same read. */
(function () {
  "use strict";
  var C = { bg: "#0b0d0c", line: "#1d2220", mut: "#8a938e", up: "#4cc38a", dn: "#f2695c", acc: "#d2ad72" };

  function label(v) {
    if (!(v > 0)) return "";
    if (v >= 1000) return "$" + Math.round(v).toLocaleString("en-US");
    if (v >= 1) return "$" + v.toFixed(3);
    var z = Math.floor(-Math.log10(v));
    return "$" + v.toFixed(Math.min(z + 3, 14));
  }

  function draw(canvas, bars, opts) {
    opts = opts || {};
    var box = canvas.parentNode, w = Math.max(200, box.clientWidth || 600), h = Math.max(160, box.clientHeight || 320);
    var dpr = window.devicePixelRatio || 1, ctx = canvas.getContext("2d");
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    var list = (bars || []).slice(-120);
    if (!list.length) {
      ctx.fillStyle = C.mut; ctx.font = "12px system-ui"; ctx.textAlign = "center";
      ctx.fillText(opts.empty || "No trades in this window yet", w / 2, h / 2);
      return;
    }
    var mult = opts.mult > 0 ? opts.mult : 1;
    var right = 72, top = 12, bottom = 22, cw = w - right, ch = h - top - bottom;
    var min = Infinity, max = -Infinity;
    list.forEach(function (b) { min = Math.min(min, b.low * mult); max = Math.max(max, b.high * mult); });
    if (!(max > min)) { max = max * 1.01 || 1; min = min * 0.99; }
    var pad = (max - min) * 0.08; max += pad; min -= pad;
    function y(v) { return top + ch - (v * mult - min) / (max - min) * ch; }
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.mut; ctx.font = "10px system-ui"; ctx.textAlign = "left";
    for (var i = 0; i <= 4; i++) {
      var gy = top + ch / 4 * i, val = max - (max - min) / 4 * i;
      ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(cw, gy + 0.5); ctx.stroke();
      if (Math.abs(gy - y(list[list.length - 1].close)) > 13) ctx.fillText(label(val), cw + 6, gy + 3);
    }
    var step = cw / Math.max(list.length, 30), bw = Math.max(1, Math.min(9, step * 0.7));
    var start = cw - step * list.length;
    /* Thin tokens: mostly flat bars (O=H=L=C) read as broken dashes, so draw a line with a flat area fill instead. (Fable) */
    var moving = 0; list.forEach(function (b) { if (b.high > b.low) moving++; });
    var asLine = opts.line || moving < Math.max(8, list.length * 0.6);
    if (asLine) {
      var lc = list[list.length - 1].close >= list[0].open ? C.up : C.dn, base = top + ch;
      ctx.beginPath();
      list.forEach(function (b, k) { var px = start + step * k + step / 2, py = y(b.close); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.strokeStyle = lc; ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.stroke(); ctx.lineWidth = 1;
      ctx.lineTo(start + step * (list.length - 1) + step / 2, base); ctx.lineTo(start + step / 2, base); ctx.closePath();
      ctx.globalAlpha = 0.1; ctx.fillStyle = lc; ctx.fill(); ctx.globalAlpha = 1;
    }
    if (!asLine) list.forEach(function (b, k) {
      var x = start + step * k + step / 2, upBar = b.close >= b.open, col = upBar ? C.up : C.dn;
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, y(b.high)); ctx.lineTo(Math.round(x) + 0.5, y(b.low)); ctx.stroke();
      var y1 = y(Math.max(b.open, b.close)), y2 = y(Math.min(b.open, b.close));
      ctx.fillRect(Math.round(x - bw / 2), y1, bw, Math.max(1, y2 - y1));
    });
    var last = list[list.length - 1].close, ly = y(last);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = C.acc; ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(cw, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.acc; ctx.fillRect(cw, ly - 8, right, 16); ctx.fillStyle = "#17130b"; ctx.fillText(label(last * mult), cw + 4, ly + 3);
    ctx.fillStyle = C.mut; ctx.textAlign = "left";
    var t0 = new Date(list[0].time), t1 = new Date(list[list.length - 1].time);
    if (list.length > 6) ctx.fillText(t0.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), Math.max(4, start), h - 6);
    ctx.textAlign = "right"; ctx.fillText(t1.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" }), cw - 4, h - 6);
  }

  /* Bring the newest bar in line with the header price (same source as the header). */
  function tick(bars, price, sec) {
    if (!bars.length || !(price > 0)) return bars;
    var b = bars[bars.length - 1], nowBucket = Math.floor(Date.now() / 1000 / sec) * sec * 1000;
    if (b.time >= nowBucket) { b.close = price; b.high = Math.max(b.high, price); b.low = Math.min(b.low, price); }
    return bars;
  }

  /* How many of the last 120 bars actually moved; the token page uses it to pick a default timeframe. */
  function moving(bars) { var n = 0; (bars || []).slice(-120).forEach(function (b) { if (b.high > b.low) n++; }); return n; }

  window.QHChart = { draw: draw, tick: tick, moving: moving };
})();
;
/* js/live-token-tabs.js */
/* live-token-tabs.js: token page lower tabs (Trades, Holders, Top traders) and the QProof panel, live.
   Trades are keyed by id: the table is rewritten only when the newest trade changes, new rows flash once.
   QProof shows the newest stored report only (/api/qproof/latest never starts a check). Written by Claude. */
(function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm;
  var EXPLORER = { "4663": "https://robinhoodchain.blockscout.com", "8453": "https://basescan.org", "1": "https://etherscan.io", "42161": "https://arbiscan.io", "56": "https://bscscan.com", "solana": "https://solscan.io" };

  function walletLink(w) { return w ? '<a class="q-addr-link" href="#/wallet/' + encodeURIComponent(w) + '">' + F.esc(F.short(w)) + "</a>" : F.DASH; }
  function table(head, rows) {
    return '<div class="token-trades-table-container"><table class="token-trades-table"><thead><tr>' + head.map(function (h, i) { return "<th" + (i === 0 ? "" : "") + ">" + h + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }
  function note(t) { return '<div class="token-no-data lt-note">' + t + "</div>"; }

  function tradeRows(t, seen) {
    var ex = EXPLORER[t.chainId];
    return t.trades.slice(0, 60).map(function (x) {
      var isNew = seen && !seen[x.id], c = x.type === "buy" ? "token-buy" : "token-sell";
      return "<tr class='token-trade-row " + c + (isNew ? " lt-new" : "") + "'><td>" + F.age((Date.now() - x.time) / 1000) + "</td><td class='token-type-cell " + c + "'>" + (x.type === "buy" ? "Buy" : "Sell") +
        "</td><td>" + F.price(x.price) + "</td><td class='token-amount-cell'>" + F.num(x.amount) + "</td><td>" + F.usd(x.usd) + "</td><td>" + walletLink(x.trader) + "</td><td>" +
        (ex && x.tx ? "<a class='lt-tx' href='" + ex + "/tx/" + F.esc(x.tx) + "' target='_blank' rel='noopener'>Tx</a>" : "") + "</td></tr>";
    }).join("");
  }
  function trades(box, t, state) {
    if (!t.trades.length) { box.innerHTML = note(t.tradesOk === false ? "Trades for this pool are unavailable right now." : "No trades yet."); state.top = null; return; }
    var top = t.trades[0].id;
    if (state.top === top && box.querySelector("table")) {
      box.querySelectorAll("tbody tr").forEach(function (tr, i) { var td = tr.firstChild, x = t.trades[i]; if (td && x) td.textContent = F.age((Date.now() - x.time) / 1000); });
      return;
    }
    box.innerHTML = table(["Age", "Side", "Price", "<span class='token-amount-cell'>Amount</span>", "USD", "Trader", ""], tradeRows(t, state.seen));
    state.seen = {}; t.trades.forEach(function (x) { state.seen[x.id] = 1; }); state.top = top;
  }
  function holders(box, t) {
    box.innerHTML = note("Reading holders");
    window.QHLive.holders(t).then(function (r) {
      if (!box.isConnected) return;
      if (!r.ok || !r.rows.length) { box.innerHTML = note(t.chainId === "solana" || t.kind === "qhooks" ? "Holders are unavailable right now." : "Holder lists cover QHooks launches and Solana tokens for now."); return; }
      box.innerHTML = table(["#", "Wallet", "Amount", "Share", "Note"], r.rows.slice(0, 50).map(function (h, i) {
        return "<tr><td>" + (i + 1) + "</td><td>" + walletLink(h.wallet) + "</td><td>" + F.num(h.amount) + "</td><td>" + F.pct(h.share) + "</td><td class='lt-label'>" + F.esc(h.label || "") + "</td></tr>";
      }).join(""));
    });
  }
  function traders(box, t) {
    if (!t.traderRows || !t.traderRows.length) { box.innerHTML = note(t.kind === "qhooks" ? "No trader stats yet." : "Top traders cover QHooks launches for now."); return; }
    var q = F.esc(t.quoteSymbol || t.native);
    box.innerHTML = table(["Wallet", "Bought", "Sold", "Spent (" + q + ")", "Got (" + q + ")", "Trades"], t.traderRows.map(function (r) {
      return "<tr><td>" + walletLink(r.wallet) + "</td><td>" + F.num(r.bought) + "</td><td>" + F.num(r.sold) + "</td><td>" + F.num(r.spent) + "</td><td>" + F.num(r.received) + "</td><td>" + F.int(r.trades) + "</td></tr>";
    }).join(""));
  }

  var LEVEL = { danger: "Danger", caution: "Watch", watch: "Watch", clear: "Clear", unknown: "Not checked", incomplete: "Not checked", info: "" };
  function chip(v) { return "<span class='pulse-qproof pulse-qproof-" + String(v || "Not checked").toLowerCase().replace(" ", "-") + "'>" + F.esc(v || "Not checked") + "</span>"; }
  /* QProof in numbers, under the token header (Fable): the facts about the token itself that decide whether it is
     safe to hold. Read from the stored report's key numbers; a fact with no reading is left out, never guessed. */
  function facts(n) {
    var old = document.querySelector(".lt-facts"); if (old) old.remove();
    var head = document.querySelector(".lt-page .token-header"); if (!n || !head) return;
    var out = [];
    function add(label, value, tone) { out.push("<div class='lt-fact" + (tone ? " lt-fact-" + tone : "") + "'><span>" + label + "</span><b>" + value + "</b></div>"); }
    /* Randall, 2026-11-20: a "round trip keeps 93.6%" figure reads as if QHooks takes the rest. The strip states
       facts about the token itself only: can you sell, does the token tax you, is the liquidity locked. */
    if (n.sellable === true || n.sellable === false) add("Sells", n.sellable ? "Open" : "Blocked", n.sellable ? "up" : "dn");
    if (F.ok(n.buyTaxPct) && F.ok(n.sellTaxPct)) {
      var none = Number(n.buyTaxPct) === 0 && Number(n.sellTaxPct) === 0;
      add("Token tax", none ? "None" : F.pct(n.buyTaxPct) + " buy / " + F.pct(n.sellTaxPct) + " sell", none ? "up" : (Math.max(n.buyTaxPct, n.sellTaxPct) >= 10 ? "dn" : "warn"));
    }
    if (F.ok(n.lpLockedPct)) add("LP locked", F.pct(n.lpLockedPct), n.lpLockedPct >= 95 ? "up" : n.lpLockedPct > 0 ? "warn" : "dn");
    if (n.mintable === true || n.mintable === false) add("Mint", n.mintable ? "Open" : "Off", n.mintable ? "warn" : "up");
    if (n.ownerRenounced === true || n.ownerRenounced === false) add("Owner", n.ownerRenounced ? "Renounced" : "Active", n.ownerRenounced ? "up" : "warn");
    if (!out.length) return;
    var el = document.createElement("div"); el.className = "lt-facts";
    el.innerHTML = "<div class='lt-facts-k'>QProof</div>" + out.join("");
    head.parentNode.insertBefore(el, head.nextSibling);
  }
  function qproof(panel, t) {
    panel.innerHTML = "<div class='tq-head'>QProof " + chip("Not checked") + "</div><div class='lt-q-note'>Reading the stored report</div>";
    window.QHLive.qproof(t).then(function (r) {
      if (!panel.isConnected) return;
      if (!r.ok || !r.verdict) {
        panel.innerHTML = "<div class='tq-head'>QProof " + chip("Not checked") + "</div><div class='lt-q-note'>" + (r.ok ? "No stored check for this token yet." : "QProof is unavailable right now.") +
          "</div><a class='lt-q-link' href='https://qhooks.com/qproof' target='_blank' rel='noopener'>Run a check</a>";
        return;
      }
      var order = { danger: 0, caution: 1, watch: 1, unknown: 2, clear: 3 };
      var checks = r.checks.filter(function (c) { return c.status !== "info"; }).sort(function (a, b) { return (order[a.status] == null ? 4 : order[a.status]) - (order[b.status] == null ? 4 : order[b.status]); }).slice(0, 6);
      panel.innerHTML = "<div class='tq-head'>QProof " + chip(r.verdict) + "</div><div class='lt-q-note'>" + F.esc(r.headline) + "</div><ul class='tq-checks'>" + checks.map(function (c) {
        var ev = (c.evidenceLinks || [])[0] || (c.evidenceRefs || [])[0], s = LEVEL[c.status] || "";
        return "<li><b class='lt-q-" + F.esc(c.status) + "'>" + F.esc(s === "Not checked" ? "Partial" : s) + "</b><em>" + F.esc(c.title) + "</em>" + (ev && ev.url ? "<a href='" + F.esc(ev.url) + "' target='_blank' rel='noopener'>evidence</a>" : "<span></span>") + "</li>";
      }).join("") + "</ul><div class='lt-q-foot'>" + (r.checkedAt ? "Checked " + F.age((Date.now() - r.checkedAt) / 1000) + " ago" : "") +
        (r.url ? " · <a href='" + F.esc(r.url) + "' target='_blank' rel='noopener'>Full report</a>" : "") + "</div>";
      var head = document.querySelector(".lt-head-q"); if (head) head.innerHTML = chip(r.verdict);
      facts(r.numbers);
    });
  }

  var css = document.createElement("style");
  css.textContent = ".lt-note{padding:14px 12px;color:var(--mut);font-size:12px}.lt-tx{color:var(--mut)}.lt-label{color:var(--acc);font-size:11px}" +
    "@keyframes ltnew{from{background:rgba(76,195,138,.14)}to{background:transparent}}.lt-new{animation:ltnew .6s ease-out}" +
    ".lt-q-note{font-size:12px;color:var(--mut);margin:0 0 6px}.lt-q-link,.lt-q-foot a{color:var(--acc);font-size:12px;text-decoration:none}.lt-q-foot{font-size:11px;color:var(--mut);margin-top:6px}" +
    ".token-side .tq-checks li{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:6px;height:auto;min-height:28px;padding:4px 0}.tq-checks li em{font-style:normal;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".tq-checks li a{color:var(--acc);font-size:11px;text-decoration:none}.tq-checks li b{font-size:11px}.lt-q-danger{color:var(--dn)}.lt-q-caution,.lt-q-watch{color:var(--acc)}.lt-q-clear{color:var(--up)}.lt-q-unknown{color:var(--mut)}";
  document.head.appendChild(css);
  window.LiveTokenTabs = { trades: trades, holders: holders, traders: traders, qproof: qproof, chip: chip };
})();
;
/* js/live-trade.js */
/* live-trade.js: the token page trade panel on the live routes. Written by Claude.
   - Estimate: GET /api/v1/agent/quote (the pool's own quoter, so hook charges are included), on input and then
     every 10 s while an amount is entered and the tab is visible. Cost: one eth_call (about 26 CU) per quote,
     so at most about 360 quotes / 9.4K CU per hour for one visitor with the panel open and an amount typed.
     Solana: GET /api/terminal/sol/order (needs the connected Solana wallet as taker), same 10 s cadence.
   - Buy/Sell, in-page (2026-11-20): QHTrade.run (trade-run.js), the one trade path shared with the Pulse and Discover
     row buttons: one-click first, else prepare-trade signed in the visitor's own wallet; Solana in Phantom.
     States on the button and in a toast (contract 1.2.7).
   - QHooks fee 1% on the input of a buy (as prepare-trade charges it); cashback is 30% of that fee. */
(function () {
  "use strict";
  var F = window.QHFmt, R = window.QHTrade, FEE = R.FEE, BACK = R.BACK, SLIP_BPS = R.SLIP_BPS;
  var HEX = window.QHSign.HEX, fromWei = R.fromWei;
  function line(k, v, c) { return "<div class='te-line" + (c ? " " + c : "") + "'><span>" + k + "</span><b>" + v + "</b></div>"; }

  function attach(root, tok) {
    var panel = root.querySelector(".token-trade-panel"); if (!panel) return null;
    var t = tok, side = "buy", input = panel.querySelector(".tp-input"), go = panel.querySelector(".tp-go"), meta = panel.querySelector(".tp-meta");
    var box = document.createElement("div"); box.className = "te-box"; meta.parentNode.insertBefore(box, meta.nextSibling);
    var stat = document.createElement("div"); stat.className = "lt-status"; stat.setAttribute("role", "status"); stat.setAttribute("aria-live", "polite"); go.parentNode.insertBefore(stat, go.nextSibling);
    meta.innerHTML = "<span>Slippage 1%</span><span class='lt-unit'></span>";
    var tabs = panel.querySelector(".tp-tabs"); if (tabs) tabs.innerHTML = "<button class='active'>Market</button><a class='lt-more' href='https://qhooks.com/terminal' target='_blank' rel='noopener'>Limit and advanced on qhooks.com</a>";
    var pre = panel.querySelector(".tp-presets"); if (pre) pre.remove();
    var st = panel.querySelector(".tp-stats"); if (st) st.innerHTML = "<div>Bought<b>—</b></div><div>Sold<b>—</b></div><div>Holding<b>—</b></div><div>Trades<b>—</b></div>";
    var isSol = t.chainId === "solana", can = isSol || !!HEX[t.chainId], seq = 0, last = null, age = 0, decimals = 18, busy = false;
    var cb = panel.querySelector(".tp-cashback"); if (cb && !can) cb.style.display = "none";
    function unit() { return side === "buy" ? (isSol ? "SOL" : t.quoteSymbol || t.native) : t.symbol; }
    function label() { return (side === "buy" ? "Buy " : "Sell ") + (t.symbol || ""); }
    function setSide(s) {
      side = s; panel.querySelector(".tp-buy").classList.toggle("active", s === "buy"); panel.querySelector(".tp-sell").classList.toggle("active", s === "sell");
      go.classList.toggle("tp-go-sell", s === "sell"); if (!busy) go.textContent = label();
      panel.querySelectorAll(".tp-amt").forEach(function (b, i) { b.textContent = s === "buy" ? ["0.001", "0.005", "0.01", "0.05"][i] : ["1K", "10K", "100K", "1M"][i]; });
      panel.querySelector(".lt-unit").textContent = "Amount in " + unit(); quote();
    }
    function amount() { var v = String(input.value).replace(/k$/i, "000").replace(/m$/i, "000000"); return parseFloat(v) > 0 ? v : null; }
    function quote() {
      var a = amount(), my = ++seq;
      if (!can) { box.innerHTML = "<div class='te-empty'>Trading this token opens in the QHooks terminal.</div>"; return; }
      if (!a) { box.innerHTML = "<div class='te-empty'>Enter an amount to see what you get</div>"; return; }
      if (isSol && !(window.QHWallet.current() && window.QHWallet.current().family === "solana")) { box.innerHTML = "<div class='te-empty'>Connect Phantom to see your quote</div>"; return; }
      if (!box.querySelector(".te-line")) box.innerHTML = "<div class='te-empty'>Getting a quote</div>";
      R.quote(t, side, a, decimals).then(function (q) {
        if (my !== seq || !box.isConnected) return;
        if (!q.ok) { box.innerHTML = "<div class='te-empty'>" + F.esc(q.error === "connect" ? "Connect Phantom to see your quote" : q.error) + "</div>"; return; }
        last = q.body; age = 0; if (isSol) solPaint(q); else paint(a);
      });
    }
    function solPaint(q) {
      var sym = side === "buy" ? t.symbol : "SOL";
      box.innerHTML = (q.out == null ? line("You receive ≈", F.usd(q.outUsd) + " of " + F.esc(sym)) : line("You receive ≈", F.num(q.out) + " " + F.esc(sym)) + line("Min received", F.num(q.min) + " " + F.esc(sym))) +
        (F.ok(q.impact) ? line("Price impact", F.pct(Math.abs(q.impact))) : "") + "<div class='te-age'>Quote · <span class='te-sec'>0</span>s</div>";
    }
    function paint(a) {
      var out = fromWei(last.amountOut, decimals), amt = parseFloat(a), q = t.quoteSymbol || t.native, px = t.price;
      var fee = side === "buy" ? amt * FEE : NaN, gotUsd = side === "buy" ? out * px : NaN;
      var h = side === "buy" ? line("You receive ≈", F.num(out) + " " + F.esc(t.symbol) + " (" + F.usd(gotUsd) + ")") + line("Min received", F.num(out * (1 - SLIP_BPS / 10000)) + " " + F.esc(t.symbol))
        : line("You receive ≈", F.num(out) + " " + F.esc(q)) + line("Min received", F.num(out * (1 - SLIP_BPS / 10000)) + " " + F.esc(q));
      if (side === "buy") { h += line("QHooks fee (1%)", F.num(fee) + " " + F.esc(q)); h += line("Cashback (30%)", "−" + F.num(fee * BACK) + " " + F.esc(q), "te-good"); }
      h += line("Network gas", F.int(last.gasEstimate) + " units");
      h += "<div class='te-age'>Quote · <span class='te-sec'>0</span>s</div>";
      box.innerHTML = h;
      var gl = document.querySelector(".fl-gasline"); if (gl) gl.textContent = "Gas for this swap: about " + F.int(last.gasEstimate) + " units, paid in " + t.native;
    }
    var timer = null;
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(quote, 350); });
    panel.querySelectorAll(".tp-amt").forEach(function (b) { b.addEventListener("click", function () { input.value = b.textContent; quote(); }); });
    panel.querySelector(".tp-buy").addEventListener("click", function () { setSide("buy"); });
    panel.querySelector(".tp-sell").addEventListener("click", function () { setSide("sell"); });
    var iv = setInterval(function () {
      if (!panel.isConnected) { clearInterval(iv); return; }
      age++; var s = box.querySelector(".te-sec"); if (s) s.textContent = age;
      if (age >= 10 && amount() && !document.hidden && !busy) { age = 0; quote(); }
    }, 1000);
    go.addEventListener("click", function (e) { e.preventDefault(); if (!busy) trade(); });
    var offW = window.QHWallet.on(function () { if (panel.isConnected) quote(); else offW(); });

    /* Button + toast states: Preparing → Sign → Sending → Confirming → Filled, or the exact error with Retry. */
    function say(text, cls) { go.textContent = text; stat.className = "lt-status" + (cls ? " " + cls : ""); }
    function settle(ok, text) {
      busy = false; go.disabled = false; stat.textContent = text || ""; stat.className = "lt-status " + (ok ? "lt-ok" : "lt-bad");
      go.textContent = ok ? label() : "Retry";
    }
    function trade() {
      var a = amount();
      if (!can) { window.open("https://qhooks.com/terminal#t=" + t.chainId + ":" + t.address, "_blank", "noopener"); return; }
      if (!a) { input.focus(); return; }
      var title = (side === "buy" ? "Buy " : "Sell ") + F.esc(a) + " " + unit() + (side === "buy" ? " of " + t.symbol : ""), tt = window.QHSign.toast({ title: title, chainId: t.chainId });
      busy = true; go.disabled = true; say("Preparing"); stat.textContent = "";
      function on(s, d) {
        if (s === "switch") say("Checking network");
        if (s === "sign") say(d.n > 1 ? "Sign " + d.i + " of " + d.n + (d.kind === "approve" ? " · approval" : " · swap") : "Sign in your wallet");
        if (s === "sending") say("Sending");
        if (s === "sent") { say(d.n > 1 && d.i < d.n ? "Confirming approval" : "Confirming"); tt.set("submitted", { text: d.kind === "approve" ? "Approval submitted" : "Submitted", hash: d.hash }); }
      }
      function fail(err) {
        var why = window.QHSign.reason(err); settle(false, why);
        tt.set("failed", { text: why, hash: err && err.hash, retry: function () { if (!busy) trade(); } });
      }
      function filled(hash, confirmed) {
        settle(true, confirmed ? "Filled · " + F.short(hash) : "Sent · confirming on the explorer");
        tt.set(confirmed ? "confirmed" : "submitted", { text: confirmed ? "Filled" : "Sent, still confirming", hash: hash });
        input.value = ""; quote(); positions();
      }
      function on2(s, d) { if (s === "route") say("Getting the route"); if (s === "sent" && d.oneclick) { say("Confirming"); tt.set("submitted", { text: "Sent with one-click", hash: d.hash }); return; } on(s, d); }
      R.run({ t: t, side: side, amount: a, decimals: decimals, on: on2 }).then(function (x) { filled(x.hash, x.confirmed); }).catch(fail);
    }
    setSide("buy");
    var lastSig = t.symbol + "|" + t.quoteSymbol, lastKind = t.kind;
    function positions() {
      var w = window.QHLive.wallet(); if (!w || t.kind !== "qhooks" || !/^0x/.test(w)) return;
      window.QHLive.positions(w).then(function (r) {
        var p = r.ok && r.body && (r.body.positions || []).filter(function (x) { return String(x.chainId) === t.chainId && String(x.controller).toLowerCase() === (t.controller || t.address); })[0];
        if (!p || !st || !st.isConnected) return;
        st.innerHTML = "<div>Bought<b>" + F.num(p.bought) + "</b></div><div>Sold<b>" + F.num(p.sold) + "</b></div><div>Holding<b>" + F.num(p.balance) + "</b></div><div>Trades<b>" + F.int(p.trades) + "</b></div>";
      });
    }
    positions();
    var amt0 = null; try { amt0 = sessionStorage.getItem("qh-quick-amt"); sessionStorage.removeItem("qh-quick-amt"); } catch (x) {}
    if (amt0 && parseFloat(amt0) > 0) { input.value = amt0; quote(); }
    return { update: function (nt) {
      var sig = nt.symbol + "|" + nt.quoteSymbol, re = sig !== lastSig, k = nt.kind !== lastKind; t = nt; lastSig = sig; lastKind = nt.kind;
      if (re) setSide(side); if (k) positions();
    } };
  }

  var css = document.createElement("style");
  css.textContent = ".lt-more{font-size:11px;color:var(--mut);align-self:center;margin-left:auto;text-decoration:none}.tp-go:disabled{opacity:.8;cursor:default}" +
    ".lt-status{font-size:12px;min-height:0;margin-top:6px;overflow-wrap:anywhere}.lt-status:empty{display:none}.lt-ok{color:var(--up)}.lt-bad{color:var(--dn)}";
  document.head.appendChild(css);
  window.LiveTrade = { attach: attach };
})();
;
/* js/live-token.js */
/* live-token.js: the token page on live data. Route #/token/<chain>/<address> (or #/token/<address> for a token
   already seen in a feed). Paints at once from what the feeds already read, then refreshes in place:
   token read every 10 s while visible (30 s when nothing changed), candles every 30 s (the route is cached 30 s).
   Fixture tokens (offline) keep the original page. Written by Claude. */
(function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm;
  var TFS = [["1m", 60], ["5m", 300], ["15m", 900], ["1h", 3600], ["4h", 14400], ["1D", 86400]];

  function parse(rest) {
    rest = String(rest || "").split("?")[0];
    var p = rest.split("/").map(function (x) { return decodeURIComponent(x); });
    if (p.length >= 2) return { chain: p[0], addr: p[1] };
    var t = window.QHLive.find(p[0]);
    if (t) return { chain: t.chainId, addr: t.address };
    return { chain: /^0x[0-9a-fA-F]{40}$/.test(p[0]) ? "4663" : "solana", addr: p[0], guess: /^0x[0-9a-fA-F]{40}$/.test(p[0]), tries: 0 };
  }
  function stat(k, v, cls) { return "<div class='token-stat'><div class='token-stat-label'>" + k + "</div><div class='token-stat-value " + (cls || "") + "'>" + v + "</div></div>"; }
  function stats(t) {
    var ch = t.change24, chc = F.ok(ch) && ch !== 0 ? (ch > 0 ? "dt-up" : "dt-dn") : "";
    return stat("Price", F.price(t.price)) + stat("MC", F.usd(t.mcap)) + stat("24h", F.pct(ch, true), chc) + stat("Liquidity", F.usd(t.liquidity)) +
      stat("24h Vol", F.usd(t.volume)) + stat("Buys / Sells", F.ok(t.buys) ? F.int(t.buys) + " / " + F.int(t.sells) : F.DASH) +
      stat("Holders", F.int(t.holders)) + stat("Top 10", F.pct(t.top10)) + (t.progress != null && t.stage !== "migrated" ? stat("Curve", F.pct(t.progress)) : "");
  }
  function header(t) {
    var av = t.logo ? "<img class='token-avatar lt-avatar' src='" + F.esc(t.logo) + "' alt=''>" : "<div class='token-avatar'>" + F.esc((t.symbol || "?").charAt(0)) + "</div>";
    var links = t.links || {}, soc = ["website", "x", "telegram"].filter(function (k) { return links[k]; }).map(function (k) {
      return "<a class='token-social' href='" + F.esc(links[k]) + "' target='_blank' rel='noopener'>" + (k === "x" ? "X" : k === "website" ? "Site" : "TG") + "</a>";
    }).join("");
    return "<div class='token-header'><div class='token-header-top'><div class='token-header-left'>" + av + "<div class='token-title'><span class='token-symbol'>" + F.esc(t.symbol || F.DASH) +
      "</span><span class='token-name'>" + F.esc(t.name || "") + "</span></div><div class='token-meta'><span class='token-age'>" + F.age(t.ageSec) + "</span> <span class='lt-chain'>" + F.esc(t.chain) +
      "</span> <span class='token-socials'>" + soc + "</span></div></div><div class='lt-head-q'>" + window.LiveTokenTabs.chip(t.qProof) + "</div><span class='lt-fresh'></span></div>" +
      "<div class='token-stats-row'>" + stats(t) + "</div></div>";
  }
  function shell(t) {
    return "<div class='token-page lt-page'><div class='token-main'>" + header(t) +
      "<div class='token-chart-section'><div class='token-chart-header'><div class='token-chart-tfs'>" + TFS.map(function (x, i) { return "<button class='token-tf-btn" + (i === 0 ? " active" : "") + "' data-tf='" + x[1] + "'>" + x[0] + "</button>"; }).join("") +
      "</div><button class='token-chart-mode' data-mode='price'>Price</button><span class='lt-chart-note'></span></div><div class='token-chart-container'><canvas class='token-canvas'></canvas></div></div>" +
      "<div class='token-tabs'><div class='token-tab active' data-tab='trades'>Trades</div><div class='token-tab' data-tab='holders'>Holders</div><div class='token-tab' data-tab='traders'>Top traders</div></div>" +
      "<div class='lt-tabbody'></div></div><div class='token-side'>" + window.Token.renderTradePanel(t) + "<section class='token-qproof lt-qproof'></section></div></div>";
  }

  function render(wrap, rest, fixtures) {
    var L = window.QHLive, where = parse(rest);
    var fx = (fixtures || []).find(function (x) { return (x.address || "").toLowerCase() === String(where.addr).toLowerCase(); });
    if (fx && !L.find(where.addr)) { window.Token.render(wrap, fx); if (window.TradeEstimate) window.TradeEstimate.attach(wrap, fx); return; }
    var t = L.find(where.chain, where.addr) || Object.assign(N.feedRow({ chainId: where.chain, token: { address: where.addr, symbol: "", name: "" } }), { kind: "pending" });
    wrap.innerHTML = shell(t);
    var main = wrap.querySelector(".token-main"), body = wrap.querySelector(".lt-tabbody"), canvas = wrap.querySelector("canvas");
    var tab = "trades", tstate = {}, tf = 60, bars = [], mc = false, loaded = false, side = null, autoTf = true, best = null;
    function paintHeader() {
      var row = main.querySelector(".token-stats-row"), html = stats(t);
      if (row && row.innerHTML !== html) row.innerHTML = html;
      var sy = main.querySelector(".token-symbol"); if (sy && t.symbol && sy.textContent !== t.symbol) { main.querySelector(".token-header").outerHTML = header(t); }
      var fr = main.querySelector(".lt-fresh"); if (fr) fr.textContent = loaded ? F.fresh(t.observedAt) : "";
    }
    function paintChart() {
      QHChart.draw(canvas, QHChart.tick(bars, t.price, tf), { mult: mc ? t.supply || (t.mcap && t.price ? t.mcap / t.price : 0) : 1, empty: loaded ? "No trades in this window yet" : "Reading chart" });
    }
    function paintTab() {
      if (tab === "trades") window.LiveTokenTabs.trades(body, t, tstate);
      else if (tab === "holders") window.LiveTokenTabs.holders(body, t);
      else window.LiveTokenTabs.traders(body, t);
    }
    function readBars() {
      return L.candles(t, tf).then(function (r) {
        bars = r.bars || [];
        /* Default timeframe: the shortest with about 40 moving bars, else 1h. Stops once the user picks one. (Fable) */
        if (autoTf) {
          var ix = 0; TFS.forEach(function (x, i) { if (x[1] === tf) ix = i; });
          var mv = QHChart.moving(bars);
          if (!best || mv > best.mv) best = { tf: tf, mv: mv };
          if (mv < 40 && ix < 3) { tf = TFS[ix + 1][1]; markTf(); return readBars(); }
          /* Nothing reached 40: settle on whichever timeframe moved most, not on an empty 1h. */
          if (best && best.tf !== tf && best.mv > mv) { tf = best.tf; autoTf = false; markTf(); return readBars(); }
          if (bars.length) autoTf = false;
        }
        var nt = wrap.querySelector(".lt-chart-note"); if (nt) nt.textContent = r.fromTrades ? "Built from recent trades" : "";
        paintChart(); return { ok: true, body: bars.length, same: false };
      });
    }
    function markTf() { wrap.querySelectorAll(".token-tf-btn").forEach(function (x) { x.classList.toggle("active", +x.dataset.tf === tf); }); }
    wrap.querySelectorAll(".token-tf-btn").forEach(function (b) {
      b.onclick = function () { autoTf = false; wrap.querySelectorAll(".token-tf-btn").forEach(function (x) { x.classList.remove("active"); }); b.classList.add("active"); tf = +b.dataset.tf; readBars(); };
    });
    var modeB = wrap.querySelector(".token-chart-mode");
    modeB.onclick = function () { mc = !mc; modeB.textContent = mc ? "MC" : "Price"; modeB.classList.toggle("active", mc); paintChart(); };
    wrap.querySelectorAll(".token-tab").forEach(function (b) {
      b.onclick = function () { wrap.querySelectorAll(".token-tab").forEach(function (x) { x.classList.remove("active"); }); b.classList.add("active"); tab = b.dataset.tab; tstate = {}; paintTab(); };
    });
    window.LiveTokenTabs.qproof(wrap.querySelector(".lt-qproof"), t);
    if (window.LiveTrade) side = window.LiveTrade.attach(wrap, t);
    paintHeader(); paintChart(); body.innerHTML = "<div class='token-no-data lt-note'>Reading trades</div>";
    var first = true;
    QHApi.poll(wrap, function () { return L.token(where.chain, where.addr); }, function (r) {
      if (!r.ok || !r.token) {
        /* Claude: a bare EVM address may live on another chain; try the next one before giving up */
        if (where.guess && where.tries < 5) { where.tries++; where.chain = ["4663", "8453", "42161", "56", "1", "99901"][where.tries]; return; }
        if (first) { body.innerHTML = "<div class='token-no-data lt-note'>This token is unavailable right now. QHooks will keep trying.</div>"; QHChart.draw(canvas, [], { empty: "Chart unavailable right now" }); }
        var fr = main.querySelector(".lt-fresh"); if (fr) fr.textContent = "Refreshing";
        return;
      }
      t = r.token; loaded = true;
      if (first) {
        first = false; wrap.querySelector(".token-header").outerHTML = header(t);
        if (t.kind === "qhooks") L.header(t).then(paintHeader);
        QHApi.poll(wrap, readBars, function () {}, { fast: 30000, slow: 60000 });
      }
      if (side) side.update(t);
      document.querySelectorAll(".fl-sticky .fl-btn").forEach(function (x, i) { var lb = (i ? "Sell " : "Buy ") + (t.symbol || "token"); if (x.textContent !== lb) x.textContent = lb; });
      paintHeader(); if (bars.length) paintChart();
      if (tab === "trades") paintTab(); else if (tab === "traders") paintTab();
    });
    var iv = setInterval(function () { if (!main.isConnected) { clearInterval(iv); return; } var fr = main.querySelector(".lt-fresh"); if (fr && loaded) fr.textContent = F.fresh(t.observedAt); }, 1000);
    var ro = new ResizeObserver(function () { if (canvas.isConnected) paintChart(); }); ro.observe(canvas.parentNode);
  }

  var css = document.createElement("style");
  css.textContent = ".lt-avatar{object-fit:cover;padding:0}.lt-chain{font-size:10px;border:1px solid var(--line);border-radius:4px;padding:1px 5px;color:var(--mut)}" +
    ".lt-fresh,.lt-chart-note{font-size:11px;color:var(--mut);margin-left:auto;white-space:nowrap}.lt-head-q{display:flex}.token-social{text-decoration:none}" +
    ".lt-page .token-stat-value.dt-up{color:var(--up)}.lt-page .token-stat-value.dt-dn{color:var(--dn)}" +
    ".pulse-qproof-partial{color:var(--acc);border-color:rgba(210,173,114,.3)}.lt-page .q-addr-link{white-space:nowrap}" +
    "@media (max-width:767px){.lt-page,.lt-page .token-main,.lt-page .token-header{max-width:100vw;min-width:0}.lt-page .token-stats-row{min-width:0;max-width:100%;overflow-x:auto;flex-wrap:nowrap}.lt-page{overflow-x:hidden}}";
  document.head.appendChild(css);
  window.LiveToken = { render: render, parse: parse };
})();
;
/* js/live-pulse.js */
/* live-pulse.js: Pulse columns on live data. Written by Claude.
   Rows come from live-boot.js (one shared reader, window event "qhlive"):
   New pairs  = market feed tab "new";
   Final stretch = QHooks launches still on their curve + feed tab "bonding" (highest progress first);
   Migrated   = QHooks launches that graduated + feed tab "migrated".
   Rows are keyed (chain:address). Changed values are patched in place with a short flash, unchanged rows are not
   touched, order freezes while the pointer is over a column, and rows that arrive meanwhile wait in an "N new" pill.
   If the live feed cannot be read the fixture rows stay. */
(function () {
  "use strict";
  var COLS = ["new", "final", "migrated"];
  var PARTS = [".pulse-row-right .pulse-price", ".pulse-row-right .pulse-volume", ".pulse-row-right .pulse-mcap", ".pulse-row-right .pulse-fees", ".pulse-row-right .pulse-press", ".pulse-row-stats", ".pulse-age", ".pulse-qproof", ".pulse-prog"];

  function el(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
  function byProgress(a, b) { return (b.progress || 0) - (a.progress || 0); }
  function merge(lists) {
    var seen = {}, out = [];
    lists.forEach(function (l) { l.forEach(function (t) { if (!seen[t.key]) { seen[t.key] = 1; out.push(t); } }); });
    return out;
  }

  function Column(root, name) {
    var col = root.querySelector(".pulse-col-" + name), list = col && col.querySelector(".pulse-row-list");
    var head = col && col.querySelector(".pulse-col-header"), rows = {}, pending = [], frozen = false, started = false, fresh = 0;
    var tag = document.createElement("span"); tag.className = "lp-fresh"; tag.title = "Refreshing";
    var pill = document.createElement("button"); pill.className = "lp-pill"; pill.style.display = "none";
    if (head) head.appendChild(tag);
    if (list) list.parentNode.insertBefore(pill, list);
    col.addEventListener("mouseenter", function () { frozen = true; });
    col.addEventListener("mouseleave", function () { frozen = false; flush(); });
    pill.onclick = function () { frozen = false; flush(); list.scrollTop = 0; };
    var last = [];

    function patch(row, html) {
      var next = el(html);
      PARTS.forEach(function (sel) {
        var a = row.querySelector(sel), b = next.querySelector(sel);
        if (a && b && a.innerHTML !== b.innerHTML) {
          a.innerHTML = b.innerHTML;
          if (sel.indexOf("price") > 0 || sel.indexOf("mcap") > 0) { a.classList.remove("lp-flash"); void a.offsetWidth; a.classList.add("lp-flash"); }
        }
      });
    }
    function flush() {
      if (frozen) return;
      var keys = {};
      last.forEach(function (t) { keys[t.key] = 1; });
      Object.keys(rows).forEach(function (k) { if (!keys[k]) { rows[k].el.remove(); delete rows[k]; } });
      last.forEach(function (t) {
        var html = window.PulseRow.renderRow(t);
        if (!rows[t.key]) rows[t.key] = { el: el(html), html: html };
      });
      var want = last.map(function (t) { return rows[t.key].el; }), cur = Array.prototype.slice.call(list.children);
      var same = want.length === cur.length && want.every(function (e, i) { return cur[i] === e; });
      if (!same) { list.innerHTML = ""; want.forEach(function (e) { list.appendChild(e); }); if (window.QHQuickBuy) window.QHQuickBuy.relabel(col); }
      pending = []; pill.style.display = "none";
      if (!want.length) list.innerHTML = "<div class='pulse-empty'>Nothing in this column right now</div>";
    }
    function show(tokens, observedAt) {
      fresh = observedAt || fresh;
      if (!started) { started = true; list.innerHTML = ""; }
      last = tokens;
      tokens.forEach(function (t) {
        var r = rows[t.key], html;
        if (!r) { if (frozen && pending.indexOf(t.key) < 0) pending.push(t.key); return; }
        html = window.PulseRow.renderRow(t);
        if (html !== r.html) { patch(r.el, html); r.html = html; }
      });
      if (frozen) { pill.textContent = pending.length + " new"; pill.style.display = pending.length ? "" : "none"; return; }
      flush();
    }
    function unavailable() { if (started) return; tag.textContent = "Sample rows"; }
    /* Header status is a dot plus the age ("13s"); the full words are in the tooltip. The long label was squeezing
       the column search box down to two letters on desktop. (Fable) */
    function clock() {
      var full = started ? window.QHFmt.fresh(fresh) : "Refreshing", live = /^Live/.test(full);
      tag.title = full; tag.setAttribute("aria-label", full); tag.className = "lp-fresh" + (live ? " lp-on" : "");
      var short = live ? full.replace(/^Live · /, "").replace(" ago", "") : "";
      if (tag.textContent !== short) tag.textContent = short;
    }
    return { show: show, unavailable: unavailable, clock: clock, ok: !!list };
  }

  function attach(root) {
    if (!window.QHLive || !window.PulseRow) return;
    var L = window.QHLive, cols = {}, mounted = false, waits = 0;
    COLS.forEach(function (c) { cols[c] = Column(root, c); });
    if (!cols.new.ok) return;
    if (window.QHQuickBuy) window.QHQuickBuy.mountPulse(root);
    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".pulse-buy-btn");
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (window.QHQuickBuy) { window.QHQuickBuy.tap(b); return; } /* trades in place (quick-buy.js) */
      var input = b.closest(".pulse-col") && b.closest(".pulse-col").querySelector(".pulse-quick-buy-input");
      try { sessionStorage.setItem("qh-quick-amt", input ? input.value : "0.01"); } catch (x) {}
      var h = b.getAttribute("data-href"); if (h) location.hash = h;
    }, true);

    function show(d) {
      // attach() runs before the page appends root; only stop listening once root has been mounted and then removed.
      if (root.isConnected) mounted = true;
      if (!root.isConnected) { if (mounted) window.removeEventListener("qhlive", onLive); else if (waits++ < 100) setTimeout(function () { show(d); }, 50); return; }
      if (!d || !d.ok) { COLS.forEach(function (c) { cols[c].unavailable(); }); return; }
      var l = d.lists, own = l.launches || [];
      var curve = own.filter(function (t) { return t.stage !== "migrated"; });
      var moved = own.filter(function (t) { return t.stage === "migrated"; });
      /* Chain filter from the top bar (window.QH_CHAIN = a chain name, or empty for all chains). (Fable) */
      var want = window.QH_CHAIN || "", pick = function (list) { return want ? list.filter(function (t) { return t.chain === want; }) : list; };
      cols.new.show(pick(l.newPairs || []).slice(0, 40), d.observedAt);
      cols.final.show(pick(merge([curve, l.bonding || []])).sort(byProgress).slice(0, 40), d.observedAt);
      cols.migrated.show(pick(merge([moved, l.migrated || []])).slice(0, 40), d.observedAt);
    }
    function onLive(e) { show(e.detail); }
    window.addEventListener("qhlive", onLive);
    window.addEventListener("qh-chain", function onChain() { if (!root.isConnected) { window.removeEventListener("qh-chain", onChain); return; } if (L.latest && L.latest()) show(L.latest()); });
    if (L.latest && L.latest()) show(L.latest());
    if (L.start) L.start();
    var t = setInterval(function () { if (!root.isConnected) { clearInterval(t); return; } COLS.forEach(function (c) { cols[c].clock(); }); }, 1000);
  }

  var css = document.createElement("style");
  css.textContent = ".lp-fresh{margin-left:auto;font-size:10px;color:var(--mut);white-space:nowrap;font-variant-numeric:tabular-nums}" +
    ".lp-pill{display:block;width:calc(100% - 20px);margin:6px 10px;height:28px;border:1px solid var(--acc);background:var(--s2);color:var(--acc);border-radius:4px;font-size:12px;cursor:pointer}" +
    ".pulse-tile-img{object-fit:cover;padding:0;background:var(--s2)}.pulse-tile-wrap{position:relative;line-height:0}" +
    ".pulse-chain-tag{position:absolute;right:-2px;bottom:-2px;font-size:8px;line-height:12px;font-weight:700;letter-spacing:.04em;padding:0 3px;background:var(--bg,#0b0c0e);color:var(--mut);border:1px solid var(--line);border-radius:3px}" +
    ".pulse-press{background:rgba(242,105,92,.55);overflow:hidden}.pulse-press i{display:block;height:100%;background:var(--up)}.pulse-press-none{background:var(--line)}" +
    ".pulse-mc-band0{color:var(--mut)}.pulse-mc-band1{color:var(--mut)}.pulse-mc-band2{color:var(--acc)}.pulse-mc-band3{color:var(--up)}.pulse-mc-band4{color:#7ad7ff}" +
    "@keyframes lpflash{from{background:rgba(76,195,138,.18)}to{background:transparent}}.lp-flash{animation:lpflash .6s ease-out}";
  document.head.appendChild(css);
  window.LivePulse = { attach: attach };
})();
;
/* js/live-wallet.js */
/* live-wallet.js: one live wallet view used by #/wallet/<address> and by Portfolio (the visitor's wallet).
   Reads /api/portfolio/<evm|solana>/<w> (balances and values on every chain, QHooks cost basis),
   /api/terminal/activity?w= (trades on QHooks markets) once per visit; Refresh reads again. No timers,
   because portfolio reads cost the site paid provider units. Written by Claude. */
(function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm;

  function cls(v) { return F.ok(v) && Number(v) !== 0 ? (Number(v) > 0 ? "lw-up" : "lw-dn") : ""; }
  function card(k, v, c) { return '<div class="lw-card"><div class="lw-k">' + k + '</div><div class="lw-v ' + (c || "") + '">' + v + "</div></div>"; }
  function holdRow(h, canSell) {
    var name = h.href ? '<a href="' + F.esc(h.href) + '">' + F.esc(h.symbol) + "</a>" : F.esc(h.symbol);
    return '<div class="lw-tr"><span class="lw-tok">' + (h.logo ? '<img src="' + F.esc(h.logo) + '" alt="">' : '<i>' + F.esc(String(h.symbol || "?").charAt(0)) + "</i>") +
      "<b>" + name + '</b><em>' + F.esc(h.chain) + "</em></span><span>" + F.num(h.amount) + "</span><span>" + F.usd(h.value) + "</span>" +
      '<span class="' + cls(h.change) + '">' + F.pct(h.change, true) + '</span><span class="' + cls(h.pnl) + '">' + (h.pnl == null ? F.DASH : F.usd(h.pnl)) + "</span>" +
      (canSell && h.href && !h.native ? '<a class="lw-sell" href="' + F.esc(h.href) + '">Sell</a>' : "<span></span>") + "</div>";
  }
  function tradeRow(t) {
    return '<div class="lw-tr lw-act"><span>' + F.age((Date.now() - t.time) / 1000) + '</span><span class="' + (t.side === "buy" ? "lw-up" : "lw-dn") + '">' + (t.side === "buy" ? "Buy" : "Sell") + "</span>" +
      '<span><a href="' + F.esc(t.href) + '">' + F.esc(t.symbol) + "</a></span><span>" + F.num(t.amount) + "</span><span>" + F.num(t.paid) + " " + F.esc(t.quoteSymbol) + "</span>" +
      "<span>" + (t.usd == null ? F.DASH : F.usd(t.usd)) + "</span><span>" + (t.txUrl ? '<a href="' + F.esc(t.txUrl) + '" target="_blank" rel="noopener">Tx</a>' : "") + "</span></div>";
  }

  /* opts: mine (Portfolio), embedded (the profile page draws its own header and cards), onTotals.
     Sell buttons show only when this wallet is the one connected in the browser. */
  function render(root, w, opts) {
    opts = opts || {};
    var L = window.QHLive, canSell = !!(L.connected && L.connected() && L.connected() === String(w).toLowerCase()), shown = 20, trades = null;
    var head = opts.embedded ? "" : '<div class="lw-head q-wallet-header"><div><div class="lw-k">' + (opts.mine ? "Your wallet" : "Wallet") + '</div><div class="lw-addr">' + F.esc(w) + "</div></div>" +
      '<div class="lw-actions"><span class="lw-fresh">Reading balances</span><button class="lw-btn lw-refresh">Refresh</button>' + (opts.extra || "") + "</div></div>" +
      '<div class="lw-cards">' + card("Total value", F.DASH) + card("24h", F.DASH) + card("QHooks PnL", F.DASH) + card("Chains", F.DASH) + "</div><div class=\"lw-chains\"></div>";
    root.innerHTML = '<div class="lw-wrap' + (opts.embedded ? " lw-emb" : "") + '">' + head + '<h3 class="lw-h">Holdings</h3><div class="lw-table lw-hold"><div class="lw-tr lw-th"><span>Token</span><span>Amount</span><span>Value</span><span>24h</span><span>PnL</span><span></span></div><div class="lw-body"><div class="lw-note">Reading balances on every chain</div></div></div>' +
      '<h3 class="lw-h">Trades on QHooks</h3><div class="lw-table lw-trades"><div class="lw-tr lw-th lw-act"><span>Age</span><span>Side</span><span>Token</span><span>Amount</span><span>Paid / got</span><span>USD</span><span></span></div><div class="lw-body"><div class="lw-note">Reading trades</div></div></div><div class="lw-more-wrap"></div></div>';
    function q(sel) { return root.querySelector(sel); }
    function fresh(t) { var el = q(".lw-fresh"); if (el) el.textContent = t; }
    function drawTrades() {
      var el = q(".lw-trades .lw-body"), more = q(".lw-more-wrap");
      el.innerHTML = trades.length ? trades.slice(0, shown).map(tradeRow).join("") : '<div class="lw-note">No trades on QHooks markets yet.</div>';
      more.innerHTML = trades.length > shown ? '<button class="lw-btn lw-more">Show more (' + (trades.length - shown) + ")</button>" : "";
      var b = q(".lw-more"); if (b) b.onclick = function () { shown += 20; drawTrades(); };
    }
    function load(again) {
      fresh("Refreshing");
      L.holdings(w, again).then(function (r) {
        var body = q(".lw-hold .lw-body");
        if (!r.ok) { body.innerHTML = '<div class="lw-note">Balances are unavailable right now. Refresh to try again.</div>'; fresh(F.DASH); if (opts.onTotals) opts.onTotals(null); return; }
        var list = r.rows, tot = r.totals || {}, pnl = 0, any = false;
        list.forEach(function (h) { if (h.pnl != null) { pnl += h.pnl; any = true; } });
        var by = tot.byChain || {}, ids = Object.keys(by).filter(function (k) { return F.n(by[k]) >= 0.01; }).sort(function (a, c) { return by[c] - by[a]; });
        if (!opts.embedded) {
          q(".lw-cards").innerHTML = card("Total value", F.usd(tot.valueUsd)) + card("24h", (F.n(tot.change24Usd) > 0 ? "+" : "") + F.usd(tot.change24Usd), cls(tot.change24Usd)) +
            card("QHooks PnL", any ? (pnl > 0 ? "+" : "") + F.usd(pnl) : F.DASH, cls(any ? pnl : null)) + card("Chains", String(ids.length));
          q(".lw-chains").innerHTML = ids.map(function (k) { return '<span class="lw-chip">' + F.esc(N.chain(k).name) + " <b>" + F.usd(by[k]) + "</b></span>"; }).join("");
        }
        body.innerHTML = list.length ? list.map(function (h) { return holdRow(h, canSell); }).join("") : '<div class="lw-note">No priced holdings on the chains QHooks reads.</div>';
        fresh(F.fresh(r.at));
        if (opts.onTotals) opts.onTotals(tot, ids);
      });
      if (L.family(w) !== "evm") { q(".lw-trades .lw-body").innerHTML = '<div class="lw-note">QHooks trade history covers EVM wallets.</div>'; return; }
      L.trades(w).then(function (r) {
        if (!r.ok) { q(".lw-trades .lw-body").innerHTML = '<div class="lw-note">Trades are unavailable right now.</div>'; return; }
        trades = r.rows;
        return Promise.all(trades.map(function (t) { return L.usdOf ? L.usdOf(t.paid, t.quoteSymbol) : null; })).then(function (u) {
          trades.forEach(function (t, i) { t.usd = u[i]; }); drawTrades();
          if (opts.onTrades) opts.onTrades(trades);
        });
      });
    }
    var rb = q(".lw-refresh"); if (rb) rb.onclick = function () { load(true); };
    load();
    return { reload: load };
  }

  var css = document.createElement("style");
  css.textContent = ".lw-wrap{padding:12px 16px;max-width:1200px;margin:0 auto}.lw-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}" +
    ".lw-k{font-size:11px;letter-spacing:.06em;color:var(--mut);text-transform:uppercase}.lw-addr{font-size:13px;font-family:ui-monospace,monospace;word-break:break-all}" +
    ".lw-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.lw-fresh{font-size:11px;color:var(--mut)}.lw-btn{height:32px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;padding:0 10px;cursor:pointer;font-size:12px}" +
    ".lw-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.lw-card{background:var(--s1);border:1px solid var(--line);border-radius:6px;padding:10px}.lw-v{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:4px}" +
    ".lw-chains{display:flex;gap:6px;flex-wrap:wrap}.lw-chip{font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:4px;padding:3px 6px}.lw-chip b{color:var(--tx)}" +
    ".lw-h{font-size:13px;margin:16px 0 6px}.lw-table{background:var(--s1);border:1px solid var(--line);border-radius:6px;overflow:hidden}" +
    ".lw-tr{display:grid;grid-template-columns:minmax(0,2fr) 1fr 1fr .8fr 1fr 56px;gap:8px;align-items:center;min-height:40px;padding:0 10px;border-top:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums}" +
    ".lw-tr>span{text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lw-tr>span:first-child{text-align:left}.lw-th{border-top:0;min-height:30px;color:var(--mut);font-size:11px}" +
    ".lw-tok{display:flex;align-items:center;gap:6px}.lw-tok img,.lw-tok i{width:22px;height:22px;border-radius:4px;object-fit:cover;background:var(--s2);font-style:normal;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--mut)}" +
    ".lw-tok em{font-style:normal;color:var(--mut);font-size:10px}.lw-tr a{color:var(--tx);text-decoration:none}.lw-act{grid-template-columns:56px 50px minmax(0,1fr) 1fr 1fr .8fr 40px}.lw-more-wrap{display:flex;justify-content:center;margin-top:8px}.lw-more{min-width:160px}.lw-emb{padding:0;max-width:none}" +
    ".lw-sell{border:1px solid var(--dn);color:var(--dn)!important;border-radius:4px;text-align:center;height:28px;line-height:26px}" +
    ".lw-note{padding:14px 10px;color:var(--mut);font-size:12px}.lw-up{color:var(--up)}.lw-dn{color:var(--dn)}" +
    "@media (max-width:767px){.lw-cards{grid-template-columns:1fr 1fr}.lw-tr{grid-template-columns:minmax(0,1.6fr) 1fr .8fr 52px}.lw-hold .lw-tr>*:nth-child(2),.lw-hold .lw-tr>*:nth-child(5){display:none}" +
    ".lw-act{grid-template-columns:40px 36px minmax(0,1fr) 1fr}.lw-act{grid-template-columns:40px 36px minmax(0,1fr) 1fr 1fr}.lw-act>*:nth-child(4),.lw-act>*:nth-child(7){display:none}.lw-btn{height:44px}.lw-sell{height:44px;line-height:42px}}";
  document.head.appendChild(css);
  window.QHWalletView = { render: render };
})();
;
/* js/profile-rh.js */
/* profile-rh.js: Robinhood Chain wallet profile block on #/wallet/<address>. Written by Fable.
   Source: GET /api/wallets/profile/4663/<address> (our own on-chain index). Shown first on the profile for any
   EVM wallet with Robinhood Chain history; the older reads stay below as the fallback and for other chains.
   Every figure is read from the API. A value the index could not price shows a dash with the reason, never a guess.
   One read per visit, a few spaced retries while the profile is still being built. No template literals. */
window.QHProfileRH = (function () {
  "use strict";
  var F = window.QHFmt, CHAIN = "4663", SCAN = "https://robinhoodchain.blockscout.com";

  function cls(v) { return F.ok(v) && Math.abs(Number(v)) >= 0.005 ? (Number(v) > 0 ? "prh-up" : "prh-dn") : ""; }
  function signed(v) { if (!F.ok(v)) return F.DASH; var n = Math.abs(Number(v)) < 0.005 ? 0 : Number(v); return (n > 0 ? "+" : "") + F.usd(n); }
  function hold(sec) { return F.ok(sec) ? (sec < 60 ? Math.round(sec) + "s" : F.age(sec)) : F.DASH; }
  function stat(k, v, c, sub) { return '<div class="prh-stat"><span>' + k + '</span><b class="' + (c || "") + '">' + v + "</b>" + (sub ? "<em>" + sub + "</em>" : "") + "</div>"; }
  function tok(a, sym) { return '<a class="prh-tok" href="#/token/' + CHAIN + "/" + F.esc(a) + '">' + F.esc(sym || F.short(a)) + "</a>"; }
  function wal(a) { return '<a class="q-addr-link" href="#/wallet/' + F.esc(a) + '">' + F.esc(F.short(a)) + "</a>"; }

  var WINS = [["7d", "7D"], ["30d", "30D"], ["all", "All"]];
  function draw(box, p, win) {
    win = win || "all";
    var s = p.summary || {}, cov = p.coverage || {}, per = (s.periods || {})[win] || {};
    var hs = (p.holdings || []).filter(function (h) { return !h.lookalike && Number(h.valueUsd) >= 0.01; }).sort(function (a, b) { return b.valueUsd - a.valueUsd; });
    var trades = (p.trades || []).slice().sort(function (a, b) { return b.ts - a.ts; });
    var known = s.closedWithKnownPnl || 0, closed = s.closedPositions || 0;
    var partial = s.realizedPartial ? "Some buys came in by transfer, so cost is unknown" : "";
    var labels = (p.labels || []).slice(0, 3).map(function (l) { return '<span class="prh-label">' + F.esc(l.text) + "</span>"; }).join("");
    var fund = p.funder && p.funder.known && p.funder.funder ? '<span class="prh-label">First funded by ' + wal(p.funder.funder) + "</span>" : "";
    /* Realized PnL follows the 7D / 30D / All switch (summary.periods); roi and winRate are fractions, null means unknown. */
    var realized = win === "all" && !("realizedUsd" in per) ? s.realizedUsd : per.realizedUsd;
    var rsub = F.ok(realized) ? (F.ok(per.roi) ? F.pct(per.roi * 100, true) + " on cost · " : "") + F.int(per.sells) + " sells" : (per.sells === 0 && win !== "all" ? "No sells in this period" : partial);
    var h = '<div class="prh-bar"><b>On Robinhood Chain</b><span class="prh-cov">Read from ' + F.int(cov.txs) + " transactions" + (p.kind === "contract" ? " · contract" : "") + '</span><div class="prh-wins">' +
      WINS.map(function (x) { return '<button type="button" data-w="' + x[0] + '"' + (x[0] === win ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="prh-stats">' +
      stat("Holdings", F.usd(s.holdingsValueUsd), "", hs.length + " tokens") +
      stat("Realized PnL", signed(realized), cls(realized), rsub) +
      stat("Unrealized", signed(s.unrealizedUsd), cls(s.unrealizedUsd)) +
      stat("Win rate", F.ok(s.winRate) ? F.pct(s.winRate * 100) : F.DASH, "", closed ? known + " of " + closed + " closed with known cost" : "No closed positions") +
      stat("Bought", F.usd(s.buyUsd), "", F.int(s.buys) + " buys") +
      stat("Sold", F.usd(s.sellUsd), "", F.int(s.sells) + " sells") +
      stat("Avg hold", hold(s.avgHoldSec), "", F.int(s.tokensTraded) + " tokens traded") + "</div>" +
      (labels || fund ? '<div class="prh-labels">' + labels + fund + "</div>" : "");
    h += '<div class="prh-cols"><div class="prh-card"><div class="prh-h">Holdings</div>' + (hs.length ? '<div class="prh-row prh-head"><span>Token</span><span>Balance</span><span>Value</span><span>Unrealized</span></div>' +
      hs.slice(0, 12).map(function (x) {
        return '<div class="prh-row"><span>' + tok(x.token, x.symbol) + "</span><span>" + F.num(x.balance) + "</span><span>" + F.usd(x.valueUsd) + '</span><span class="' + cls(x.unrealizedUsd) + '">' + signed(x.unrealizedUsd) + "</span></div>";
      }).join("") + (hs.length > 12 ? '<div class="prh-more">' + (hs.length - 12) + " more under " + F.usd(hs[11].valueUsd) + "</div>" : "") : '<div class="prh-note">No priced holdings on Robinhood Chain.</div>') + "</div>";
    h += '<div class="prh-card"><div class="prh-h">Trades</div>' + (trades.length ? '<div class="prh-row prh-head prh-t"><span>Age</span><span>Side</span><span>Token</span><span>Value</span><span></span></div>' +
      trades.slice(0, 20).map(function (t) {
        return '<div class="prh-row prh-t"><span class="prh-mut">' + F.age(Date.now() / 1000 - t.ts) + '</span><span class="' + (t.side === "buy" ? "prh-up" : "prh-dn") + '">' + (t.side === "buy" ? "Buy" : "Sell") + "</span><span>" + tok(t.token, t.symbol) +
          "</span><span>" + F.usd(t.usd) + '</span><span><a class="prh-tx" href="' + SCAN + "/tx/" + F.esc(t.tx) + '" target="_blank" rel="noopener">Tx</a></span></div>';
      }).join("") + (trades.length > 20 ? '<div class="prh-more">' + (trades.length - 20) + " earlier trades</div>" : "") : '<div class="prh-note">No swaps found for this wallet on Robinhood Chain.</div>') + "</div></div>";
    box.innerHTML = h; box.style.display = "";
    box.querySelectorAll(".prh-wins button").forEach(function (b) { b.onclick = function () { draw(box, p, b.getAttribute("data-w")); }; });
  }

  function mount(box, w) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(w))) return;
    var tries = 0;
    function read() {
      window.QHApi.get("/api/wallets/profile/" + CHAIN + "/" + String(w).toLowerCase(), { timeout: 30000 }).then(function (r) {
        if (!box.isConnected) return;
        var b = r.body || {}, p = b.profile;
        if (r.ok && b.state === "ready" && p) {
          var any = (p.trades || []).length || (p.holdings || []).length || (p.coverage || {}).txs;
          if (any) draw(box, p); else box.style.display = "none";
          return;
        }
        /* Still being built (or briefly unavailable): say so once, check back a few times, then leave the fallback. */
        if (r.ok && b.state && b.state !== "ready" && tries < 5) {
          box.style.display = ""; box.innerHTML = '<div class="prh-bar"><b>On Robinhood Chain</b><span class="prh-cov">Reading this wallet\'s history</span></div>';
          tries++; setTimeout(read, 7000); return;
        }
        box.style.display = "none";
      });
    }
    read();
  }

  var css = document.createElement("style");
  css.textContent = ".prh{background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0}" +
    ".prh-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.prh-bar b{font-family:var(--display,inherit);font-size:15px}.prh-cov{font-size:11px;color:var(--mut)}" +
    ".prh-stats{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0;border:1px solid var(--line);border-radius:8px;overflow:hidden}" +
    ".prh-stat{padding:10px 12px;border-right:1px solid var(--line);min-width:0;display:flex;flex-direction:column;gap:3px}.prh-stat:last-child{border-right:0}" +
    ".prh-stat span{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);white-space:nowrap}.prh-stat b{font-family:var(--display,inherit);font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}" +
    ".prh-stat em{font-style:normal;font-size:10.5px;color:var(--mut);line-height:1.3}.prh-up{color:var(--up)}.prh-dn{color:var(--dn)}.prh-mut{color:var(--mut)}" +
    ".prh-wins{display:flex;gap:4px;margin-left:auto}.prh-wins button{height:26px;padding:0 10px;border:1px solid var(--line);background:transparent;color:var(--mut);border-radius:8px;font-size:11px;cursor:pointer}.prh-wins button.on{border-color:var(--acc);color:var(--acc)}.prh-cov{margin-left:8px}" +
    "@media (max-width:767px){.prh-wins button{height:40px;min-width:44px}}" +
    ".prh-labels{display:flex;gap:6px;flex-wrap:wrap}.prh-label{font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:3px 10px}.prh-label a{color:var(--tx)}" +
    ".prh-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.prh-card{border:1px solid var(--line);border-radius:8px;min-width:0;overflow:hidden}" +
    ".prh-h{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);padding:8px 12px;border-bottom:1px solid var(--line)}" +
    ".prh-row{display:grid;grid-template-columns:minmax(0,1.3fr) 1fr 1fr 1fr;gap:8px;align-items:center;min-height:32px;padding:0 12px;border-bottom:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums}" +
    ".prh-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}.prh-row span:first-child{text-align:left}.prh-row:last-child{border-bottom:0}" +
    ".prh-t{grid-template-columns:44px 40px minmax(0,1fr) 84px 28px}.prh-t span:nth-child(2),.prh-t span:nth-child(3){text-align:left}" +
    ".prh-head{color:var(--mut);font-size:10px;text-transform:uppercase;letter-spacing:.06em;min-height:26px}.prh-tok{color:var(--tx);font-weight:600;text-decoration:none}.prh-tok:hover{color:var(--acc)}" +
    ".prh-tx{color:var(--mut);font-size:11px}.prh-more,.prh-note{padding:8px 12px;font-size:11px;color:var(--mut)}" +
    "@media (max-width:1099px){.prh-stats{grid-template-columns:repeat(4,minmax(0,1fr))}.prh-stat{border-bottom:1px solid var(--line)}}" +
    "@media (max-width:767px){.prh-stats{grid-template-columns:1fr 1fr}.prh-stat:nth-child(2n){border-right:0}.prh-cols{grid-template-columns:1fr}.prh-row{min-height:40px}.prh-tx{display:inline-flex;align-items:center;min-height:40px}}";
  document.head.appendChild(css);
  return { mount: mount };
})();
;
/* js/profile-page.js */
/* profile-page.js: the wallet profile at #/wallet/<address> (contract parity: GMGN wallet page). Written by Claude.
   Identity header (short address + copy, chain badges, first seen, Follow / Copy trades / Share from flows.js),
   a 7d / 30d / All PnL block from /api/wallets/card (realized, unrealized, win rate, best trades), then the
   live holdings and trades from live-wallet.js. Reads run once per visit and per period picked; Refresh reads again. */
window.QHProfile = (function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm;
  var WINS = [["7d", "7D"], ["30d", "30D"], ["all", "All"]];

  /* Sub-cent PnL is dust: shown as $0 so a rounding residue never reads as a loss. */
  function cut(v) { return F.ok(v) && Math.abs(Number(v)) < 0.005 ? 0 : v; }
  function cls(v) { v = cut(v); return F.ok(v) && Number(v) !== 0 ? (Number(v) > 0 ? "prf-up" : "prf-dn") : ""; }
  function signed(v) { v = cut(v); return F.ok(v) ? (Number(v) > 0 ? "+" : "") + F.usd(v) : F.DASH; }
  function stat(k, v, c, sub) { return '<div class="prf-stat"><div class="prf-k">' + k + '</div><div class="prf-v ' + (c || "") + '">' + v + "</div>" + (sub ? '<div class="prf-sub">' + sub + "</div>" : "") + "</div>"; }
  function hold(sec) { if (!F.ok(sec)) return F.DASH; return sec < 60 ? Math.round(sec) + "s" : F.age(sec); }
  function date(ms) { var d = new Date(ms); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

  function render(root, w) {
    var L = window.QHLive, mine = !!(L.connected && L.connected() === String(w).toLowerCase()), win = "7d", firstSeen = 0, wallet = null;
    root.innerHTML = '<div class="prf-wrap"><header class="prf-head q-wallet-header"><div class="prf-id"><div class="prf-tile">' + F.esc(String(w).slice(-2).toUpperCase()) + "</div>" +
      '<div class="prf-idt"><div class="prf-addr"><b title="' + F.esc(w) + '">' + F.esc(F.short(w)) + '</b><button class="prf-copy" aria-label="Copy address">Copy</button>' +
      (mine ? '<span class="prf-you">You</span>' : "") + '<span class="prf-tags"></span></div>' +
      '<div class="prf-meta"><span class="prf-chains"></span><span class="prf-seen">First seen ' + F.DASH + '</span><span class="prf-fresh">Reading</span><button class="prf-refresh">Refresh</button></div></div></div></header>' +
      '<section class="prh" style="display:none"></section>' + /* Robinhood Chain profile from our on-chain index, shown first (Fable) */
      '<section class="prf-pnl"><div class="prf-bar"><b>PnL on QHooks markets</b><div class="prf-wins">' + WINS.map(function (x) { return '<button data-w="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="prf-stats"></div><div class="prf-best"></div></section><div class="prf-body"></div></div>';
    function q(s) { return root.querySelector(s); }

    q(".prf-copy").onclick = function () {
      var b = q(".prf-copy"); try { navigator.clipboard.writeText(w); b.textContent = "Copied"; } catch (e) { b.textContent = "Select"; }
      setTimeout(function () { if (b.isConnected) b.textContent = "Copy"; }, 1400);
    };
    function seen(ms) { if (ms > 0 && (!firstSeen || ms < firstSeen)) { firstSeen = ms; q(".prf-seen").textContent = "First seen " + date(ms) + " · " + F.age((Date.now() - ms) / 1000) + " ago"; } }

    function drawPnl(c, bal) {
      var stats = q(".prf-stats");
      if (!c || !c.ok) { stats.innerHTML = '<div class="prf-note">PnL is unavailable right now. Refresh to try again.</div>'; q(".prf-best").innerHTML = ""; return; }
      var wins = c.counted ? Math.round(c.winRate * c.counted) : 0;
      stats.innerHTML = stat("Balance", bal ? F.usd(bal.valueUsd) : F.DASH, "", bal && F.ok(bal.change24Usd) ? '<span class="' + cls(bal.change24Usd) + '">' + signed(bal.change24Usd) + "</span> 24h" : "") +
        stat("Total PnL", signed(c.pnl), cls(c.pnl)) + stat("Realized", signed(c.realized), cls(c.realized)) + stat("Unrealized", signed(c.unrealized), cls(c.unrealized)) +
        stat("Win rate", c.counted ? F.pct(c.winRate * 100) : F.DASH, c.counted ? (c.winRate >= 0.5 ? "prf-up" : "prf-dn") : "", c.counted ? wins + " of " + c.counted + " tokens" : "No closed tokens") +
        stat("Avg hold", hold(c.avgHold), "", c.partial ? "Partial history" : "");
      var best = c.positions.slice().filter(function (p) { return F.ok(p.realized) || F.ok(p.unrealized); })
        .sort(function (a, b) { return ((b.realized || 0) + (b.unrealized || 0)) - ((a.realized || 0) + (a.unrealized || 0)); }).slice(0, 5);
      q(".prf-best").innerHTML = '<div class="prf-k prf-bh">Best trades</div>' + (best.length ? best.map(function (p) {
        var t = (p.realized || 0) + (p.unrealized || 0);
        return '<a class="prf-trade" href="' + F.esc(p.href) + '"><b>' + F.esc(p.symbol) + '</b><span class="prf-mut">' + F.esc(p.chain) + " · " + p.trades + ' trades</span><span class="' + cls(t) + '">' + signed(t) + "</span></a>";
      }).join("") : '<div class="prf-note">No priced positions in this period.</div>');
      c.recent.forEach(function (r) { seen(r.time); });
    }
    var bal = null, lastCard = null;
    function loadPnl(fresh) {
      root.querySelectorAll(".prf-wins button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-w") === win); });
      if (L.family(w) !== "evm") { drawPnl({ ok: false }); q(".prf-stats").innerHTML = '<div class="prf-note">QHooks PnL covers EVM wallets. Holdings below are live.</div>'; return; }
      var want = win;
      L.card(w, win, fresh).then(function (c) { if (want === win) { lastCard = c; drawPnl(c, bal); } });
      if (win !== "all") L.card(w, "all").then(function (c) { if (c.ok) c.recent.forEach(function (r) { seen(r.time); }); });
    }
    root.querySelectorAll(".prf-wins button").forEach(function (b) { b.onclick = function () { win = b.getAttribute("data-w"); loadPnl(); }; });

    if (L.profile) L.profile(w).then(function (p) {
      if (!p.ok) return;
      q(".prf-tags").innerHTML = (p.handle ? '<span class="prf-tag">' + F.esc(p.handle) + "</span>" : "") + p.tags.slice(0, 4).map(function (t) { return '<span class="prf-tag">' + F.esc(t.label || t) + "</span>"; }).join("");
    });
    if (window.QHProfileRH && L.family(w) === "evm") window.QHProfileRH.mount(q(".prh"), w);
    var body = q(".prf-body");
    wallet = window.QHWalletView.render(body, w, { embedded: true,
      onTotals: function (t, ids) {
        bal = t; q(".prf-fresh").textContent = t ? F.fresh(Date.now()) : F.DASH;
        q(".prf-chains").innerHTML = (ids || []).map(function (k) { return '<span class="prf-chain" title="' + F.esc(N.chain(k).name + " " + F.usd(t.byChain[k])) + '">' + F.esc(N.chain(k).name) + "</span>"; }).join("");
        if (lastCard) drawPnl(lastCard, bal);
      },
      onTrades: function (list) { list.forEach(function (t) { seen(t.time); }); } });
    q(".prf-refresh").onclick = function () { q(".prf-fresh").textContent = "Refreshing"; loadPnl(true); if (wallet) wallet.reload(true); };
    loadPnl();
  }

  var css = document.createElement("style");
  css.textContent = ".prf-wrap{padding:12px 16px;max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:12px}" +
    ".prf-head{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px}.prf-id{display:flex;gap:12px;align-items:center;min-width:0}" +
    ".prf-tile{flex:0 0 48px;height:48px;border-radius:6px;background:#3a4a5c;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px}" +
    ".prf-idt{min-width:0;display:flex;flex-direction:column;gap:6px}.prf-addr{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.prf-addr b{font-size:16px;font-family:ui-monospace,monospace}" +
    ".prf-copy,.prf-refresh,.prf-wins button{height:28px;padding:0 10px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;font-size:12px;cursor:pointer}" +
    ".prf-you,.prf-tag{font-size:11px;border:1px solid rgba(210,173,114,.45);color:var(--acc);border-radius:4px;padding:2px 6px}.prf-tag{border-color:var(--line);color:var(--mut)}.prf-tags{display:flex;gap:4px;flex-wrap:wrap}" +
    ".prf-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--mut)}.prf-chains{display:flex;gap:4px;flex-wrap:wrap}" +
    ".prf-chain{font-size:10px;height:16px;line-height:14px;padding:0 5px;border:1px solid var(--line);border-radius:4px;color:var(--tx);background:var(--s2)}" +
    ".prf-pnl{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px}.prf-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;margin-bottom:10px}" +
    ".prf-wins{display:flex;gap:4px}.prf-wins button.on{border-color:var(--acc);color:var(--acc)}" +
    ".prf-stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.prf-stat{background:var(--s2);border-radius:6px;padding:10px;min-width:0}" +
    ".prf-k{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.prf-v{font-size:18px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".prf-sub{font-size:11px;color:var(--mut);margin-top:2px}.prf-up{color:var(--up)}.prf-dn{color:var(--dn)}.prf-mut{color:var(--mut)}.prf-note{font-size:12px;color:var(--mut);padding:8px 0}" +
    ".prf-best{margin-top:10px}.prf-bh{margin-bottom:4px}.prf-trade{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;min-height:36px;padding:0 4px;border-top:1px solid var(--line);font-size:12px;color:var(--tx);text-decoration:none;font-variant-numeric:tabular-nums}" +
    "@media (max-width:1099px){.prf-stats{grid-template-columns:repeat(3,minmax(0,1fr))}}" +
    "@media (max-width:767px){.prf-wrap{padding:8px 10px 72px}.prf-stats{grid-template-columns:1fr 1fr}.prf-copy,.prf-refresh,.prf-wins button{height:44px;min-width:44px}.prf-trade{min-height:44px}.prf-bar{flex-wrap:wrap}}";
  document.head.appendChild(css);
  return { render: render };
})();
;
/* js/live-account.js */
/* live-account.js: the visitor's own numbers. Written by Claude.
   - Top bar: Connect (the injected wallet asks the visitor), balance across chains and the Earned chip,
     read once per visit and kept in memory; em dashes until a wallet is known.
   - Portfolio: the live wallet view for the connected or watched address, or a connect / watch panel. */
(function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm, memo = { w: null, tot: null, earned: null, busy: false };

  function fillTop(earnedEl, balEl, connectBtn) {
    var w = window.QHLive.wallet();
    if (connectBtn) {
      connectBtn.textContent = w ? F.short(w) : "Connect";
      connectBtn.onclick = function () {
        if (w) { location.hash = "#/portfolio"; return; }
        window.QHLive.connect().then(function (a) { if (a) { memo.w = null; location.hash = "#/portfolio"; } else location.hash = "#/portfolio"; });
      };
    }
    function paint() {
      if (earnedEl) earnedEl.innerHTML = "Earned <b>" + (memo.earned ? F.usd(memo.earned.cash + memo.earned.ref) : F.DASH) + "</b>";
      if (!balEl) return;
      var by = memo.tot && memo.tot.byChain || {}, ids = Object.keys(by).filter(function (k) { return F.n(by[k]) >= 0.01; }).sort(function (a, b) { return by[b] - by[a]; });
      balEl.querySelector(".q-balance-btn").innerHTML = (memo.tot ? F.usd(memo.tot.valueUsd) : F.DASH) + ' <span class="q-caret">▾</span>';
      balEl.querySelector(".q-balance-menu").innerHTML = (ids.length ? ids.map(function (k) { return '<div class="q-balance-row"><span>' + F.esc(N.chain(k).name) + "</span><b>" + F.usd(by[k]) + "</b></div>"; }).join("")
        : '<div class="q-balance-row"><span>' + (w ? "Reading balances" : "Connect a wallet to see balances") + "</span><b></b></div>") + '<a class="q-balance-move" href="#/portfolio">Move funds</a>';
    }
    paint();
    if (!w || (memo.w === w && (memo.tot || memo.busy))) return;
    memo.w = w; memo.busy = true;
    window.QHLive.portfolio(w).then(function (r) {
      memo.busy = false;
      if (r.ok && r.body && r.body.totals) memo.tot = r.body.totals;
      if (window.Rewards && window.Rewards.earned && /^0x/.test(w)) return window.Rewards.earned(w).then(function (e) { memo.earned = e; });
    }).then(function () { if (earnedEl && earnedEl.isConnected) paint(); });
  }

  function again(spot) { if (location.hash.indexOf("#/portfolio") === 0) window.dispatchEvent(new Event("hashchange")); else portfolio(spot); }
  function portfolio(spot) {
    var w = window.QHLive.wallet();
    if (w) {
      window.QHWalletView.render(spot, w, { mine: true, extra: '<button class="lw-btn lw-change">Watch another address</button>', onTotals: function (t) { memo.w = w; memo.tot = t; } });
      spot.querySelector(".lw-change").onclick = function () { window.QHLive.watch(null); again(spot); };
      return;
    }
    spot.innerHTML = '<div class="la-panel"><h2>Your portfolio</h2><p>Connect a wallet to see balances, PnL and trades on every chain QHooks reads. Nothing is signed by connecting.</p>' +
      '<button class="la-go la-connect">Connect wallet</button><div class="la-or">or watch any address</div>' +
      '<form class="la-watch"><input class="la-input" placeholder="0x... or Solana address" autocomplete="off" spellcheck="false"><button class="la-go la-sec">Watch</button></form><div class="la-msg"></div></div>';
    spot.querySelector(".la-connect").onclick = function () {
      window.QHLive.connect().then(function (a) { if (a) again(spot); else spot.querySelector(".la-msg").textContent = "No browser wallet found. Paste an address to watch instead."; });
    };
    spot.querySelector(".la-watch").onsubmit = function (e) {
      e.preventDefault();
      var v = spot.querySelector(".la-input").value.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(v) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) { spot.querySelector(".la-msg").textContent = "That does not look like a wallet address."; return; }
      window.QHLive.watch(/^0x/.test(v) ? v.toLowerCase() : v); again(spot);
    };
  }

  var css = document.createElement("style");
  css.textContent = ".la-panel{max-width:520px;margin:24px auto;padding:20px;background:var(--s1);border:1px solid var(--line);border-radius:8px}.la-panel h2{font-size:16px;margin:0 0 6px}" +
    ".la-panel p{font-size:13px;color:var(--mut);margin:0 0 14px}.la-go{height:40px;border:0;border-radius:6px;background:var(--up);color:#04140c;font-weight:600;padding:0 16px;cursor:pointer}" +
    ".la-sec{background:var(--s2);color:var(--tx);border:1px solid var(--line)}.la-or{font-size:12px;color:var(--mut);margin:14px 0 6px}.la-watch{display:flex;gap:6px}" +
    ".la-input{flex:1;min-width:0;height:40px;background:var(--s2);border:1px solid var(--line);border-radius:6px;color:var(--tx);padding:0 10px;font-size:13px}.la-msg{font-size:12px;color:var(--acc);margin-top:8px;min-height:16px}";
  document.head.appendChild(css);
  window.QHAccount = { fillTop: fillTop, portfolio: portfolio };
})();
;
/* js/live-search.js */
/* live-search.js: top-bar search on live data. Written by Claude.
   Local rows (every token the live lists already hold) answer at once; from 2 characters the live search
   route (/api/terminal/x/search: name, symbol or contract on every chain) is asked after 300 ms, and its hits
   join the same dropdown. Results open #/token/<chain>/<address>. When the route is unavailable the dropdown
   keeps the local rows. */
(function () {
  "use strict";
  var seq = 0, timer = null;

  function pool() {
    var live = window.QHLive ? window.QHLive.all() : [], fx = window.QH_FIXTURES || [];
    return live.length ? live.concat(fx) : null;
  }
  function relink(drop) {
    if (!drop || !window.QHLive) return;
    drop.querySelectorAll(".qs-result").forEach(function (row) {
      var a = row.dataset.address, t = a && a.indexOf("/") < 0 ? window.QHLive.find(a) : null;
      if (t && t.live) row.dataset.address = encodeURIComponent(t.chainId) + "/" + encodeURIComponent(t.address);
    });
  }
  function attach(input) {
    if (!input || !window.Search || input.dataset.live) return;
    input.dataset.live = "1";
    if (!window.QH_FIXTURES && Array.isArray(window.QH_TOKENS)) window.QH_FIXTURES = window.QH_TOKENS.slice();
    var show = window.Search.showResults.bind(window.Search);
    window.Search.showResults = function (v) {
      var p = pool(); if (p) window.QH_TOKENS = p;
      show(v); relink(window.Search.dropdown);
    };
    input.addEventListener("input", function () {
      var v = input.value.trim(), my = ++seq;
      clearTimeout(timer);
      if (v.length < 2) return;
      timer = setTimeout(function () {
        window.QHLive.search(v).then(function (r) {
          if (my !== seq || input.value.trim() !== v || !r.ok) return;
          window.Search.showResults(v);
        });
      }, 300);
    });
  }
  window.LiveSearch = { attach: attach };
})();
;
/* js/after-trade.js */
/* after-trade.js: what happens right after a trade fills. Written by Fable.
   A trade should hand you to the next thing in QHooks instead of ending on a "Filled" label. When live-trade.js
   announces a fill (the "qh-traded" event), a short panel appears under the trade button:
   - after a buy: call the token (opens the Community call sheet for it) or open Rewards;
   - after a sell: open Portfolio or Rewards.
   The cashback line is the approved one from QHBlocks. Nothing here estimates an amount. No template literals. */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

  function show(d) {
    var go = document.querySelector(".token-trade-panel .tp-go"); if (!go) return;
    var old = document.querySelector(".at-box"); if (old) old.remove();
    var symEl = document.querySelector(".token-header .token-symbol"), sym = symEl ? symEl.textContent.trim() : "this token";
    var line = window.QHBlocks && window.QHBlocks.CASHBACK ? window.QHBlocks.CASHBACK.split(" · ")[0] : "";
    var buy = d.side !== "sell";
    var box = document.createElement("div"); box.className = "at-box"; box.setAttribute("role", "status");
    box.innerHTML = '<div class="at-h">' + (buy ? "You bought " : "You sold ") + esc(sym) + '</div>' +
      (line ? '<div class="at-l">' + esc(line) + ". It shows in Rewards once the trade is counted.</div>" : "") +
      '<div class="at-acts">' + (buy ? '<button type="button" class="at-b at-gold" data-at="call">Call it</button>' : '<a class="at-b" href="#/portfolio">See your PnL</a>') +
      '<a class="at-b" href="#/rewards">Rewards</a><button type="button" class="at-x" data-at="close" aria-label="Dismiss">Close</button></div>';
    go.parentNode.insertBefore(box, go.nextSibling);
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-at]"); if (!b) return;
      if (b.getAttribute("data-at") === "close") { box.remove(); return; }
      if (window.Community && window.Community.openSheet) window.Community.openSheet(d.token, function () { box.remove(); });
      else location.hash = "#/community";
    });
  }
  window.addEventListener("qh-traded", function (e) { try { show(e.detail || {}); } catch (x) { if (window.console) console.warn("after trade", x); } });
  window.addEventListener("hashchange", function () { var b = document.querySelector(".at-box"); if (b) b.remove(); });

  var css = document.createElement("style");
  css.textContent = ".at-box{margin-top:8px;border:1px solid rgba(210,173,114,.45);background:rgba(210,173,114,.08);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}" +
    ".at-h{font-family:var(--display,inherit);font-weight:700;font-size:14px}.at-l{font-size:12px;color:var(--mut);line-height:1.4}" +
    ".at-acts{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:2px}" +
    ".at-b{display:inline-flex;align-items:center;height:32px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--s1);color:var(--tx);font:inherit;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer}" +
    ".at-gold{background:var(--acc);border-color:var(--acc);color:#17130b}.at-x{margin-left:auto;height:32px;padding:0 8px;background:none;border:0;color:var(--mut);font:inherit;font-size:12px;cursor:pointer}" +
    "@media (max-width:767px){.at-b,.at-x{height:44px}}";
  document.head.appendChild(css);
})();
;
/* js/status-bar.js */
/* status-bar.js: desktop footer status bar (contract section 2). Written by Fable.
   Real values only: connection age and latency come from QHApi.status(); SOL, ETH and HYPE come from
   /api/funding/native-prices. Anything not yet read shows an em dash. Hidden under 768px. */
(function () {
  "use strict";
  var bar = null, prices = {}, pricesAt = 0;

  function cell(label, id) { return "<span class='sb-cell'><span class='sb-l'>" + label + "</span><b id='" + id + "'>\u2014</b></span>"; }
  function set(id, text, cls) { var e = document.getElementById(id); if (!e) return; if (e.textContent !== text) e.textContent = text; e.className = cls || ""; }

  function readPrices() {
    if (!window.QHApi || document.hidden || Date.now() - pricesAt < 60000) return;
    pricesAt = Date.now();
    window.QHApi.get("/api/funding/native-prices?symbols=ETH,SOL,BNB,HYPE").then(function (r) {
      if (r.ok && r.body && r.body.prices) prices = r.body.prices;
    });
  }

  function paint() {
    if (!bar || !window.QHApi || !window.QHApi.status) return;
    var s = window.QHApi.status(), F = window.QHFmt, age = s.okAt ? Math.round((Date.now() - s.okAt) / 1000) : -1;
    var live = age >= 0 && age < 30;
    set("sb-live", live ? "Live \u00b7 " + age + "s ago" : "Refreshing", live ? "sb-up" : "sb-wait");
    set("sb-ms", s.ms > 0 ? s.ms + " ms" : "\u2014");
    ["SOL", "ETH", "HYPE"].forEach(function (k) { var v = prices[k]; set("sb-" + k, v > 0 ? "$" + (v >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2)) : "\u2014"); });
    readPrices();
  }

  function mount() {
    if (bar) return;
    bar = document.createElement("div"); bar.className = "sb-bar";
    bar.innerHTML = "<span class='sb-brand'>QHooks</span><span class='sb-cell'><i class='sb-dot'></i><b id='sb-live'>Refreshing</b></span>" + cell("Latency", "sb-ms") +
      "<span class='sb-sp'></span>" + cell("SOL", "sb-SOL") + cell("ETH", "sb-ETH") + cell("HYPE", "sb-HYPE");
    document.body.appendChild(bar);
    paint(); setInterval(paint, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
;