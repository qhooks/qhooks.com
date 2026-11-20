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
    if (c.live) return c.entryPrice && c.nowPrice ? c.nowPrice / c.entryPrice : 0;
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
        return { id: c.id, live: true, caller: sh(c.wallet), wallet: c.wallet, token: t, at: c.at, note: c.note, kind: c.kind, entryPrice: c.entryPrice, nowPrice: c.nowPrice || t.price || null };
      });
      emit(); if (r && r.ok) names();
    });
    A.leaders("7d").then(function (r) {
      if (r.ok) live.leaders = r.rows.map(function (x) { return { live: true, caller: sh(x.wallet), wallet: x.wallet, pnl: x.pnl, winRate: x.winRate, trades: x.trades, volume: x.volume, calls: x.trades }; });
      emit(); loadWallets();
    });
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
    })).then(function (ws) { live.wallets = ws; live.walletsTop = top; emit(); });
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
