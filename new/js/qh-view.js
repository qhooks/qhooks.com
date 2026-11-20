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
