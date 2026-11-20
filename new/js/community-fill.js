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
