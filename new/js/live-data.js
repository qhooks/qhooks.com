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
    if (cur && cur !== t) { Object.keys(t).forEach(function (k) { if (t[k] != null && !(Array.isArray(t[k]) && !t[k].length && cur[k] && cur[k].length)) cur[k] = t[k]; }); return cur; }
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
