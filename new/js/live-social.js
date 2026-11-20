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
          return { id: c.id, wallet: c.author, kind: c.kind, note: c.text || "", at: N.num(c.createdAt) || 0, chainId: ch, address: addr,
            boardKind: bd.kind, href: N.href(ch, addr), entryPrice: N.num(cl.price), nowPrice: N.num(cl.nowPrice), tx: c.receipt && c.receipt.tx };
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
            entryPrice: p.call ? N.num(p.call.price) : null, nowPrice: p.call ? N.num(p.call.priceNow) : null };
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
