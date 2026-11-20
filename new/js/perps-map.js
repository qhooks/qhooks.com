/* Perps liquidity map: resting size per price level over time, sampled from Hyperliquid l2Book (grouped levels so walls show).
   Each column is one sample; cells are shaded by USD size so big walls stand out; the right edge is the current depth profile.
   QHooks' own design; the linked liquidity-mapper reference guided the idea only. Written by Claude. */
window.PerpsMap = (function () {
  "use strict";
  var F = window.PerpsFeed, coin = "", cols = [], MAXC = 160, sig = 4, cv = null, wrap = null, info = null, read = null, seq = 0, raf = 0, col = {}, hov = null;

  function colors() {
    var s = getComputedStyle(document.documentElement);
    ["--up", "--dn", "--tx", "--mut", "--line", "--s1", "--s2"].forEach(function (k) { col[k] = (s.getPropertyValue(k) || "").trim() || "#888"; });
  }
  function rgb(hex) { var h = hex.replace("#", ""); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var v = parseInt(h, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function sample() {
    if (!coin) return;
    var my = seq, c = coin;
    F.post({ type: "l2Book", coin: c, nSigFigs: sig }).then(function (d) {
      if (my !== seq || !d || !d.levels) return;
      var lv = [];
      (d.levels[0] || []).forEach(function (l) { var p = F.num(l.px), s = F.num(l.sz); if (isFinite(p * s)) lv.push({ px: p, usd: p * s, side: "bid" }); });
      (d.levels[1] || []).forEach(function (l) { var p = F.num(l.px), s = F.num(l.sz); if (isFinite(p * s)) lv.push({ px: p, usd: p * s, side: "ask" }); });
      if (!lv.length) return;
      var bb = lv.filter(function (x) { return x.side === "bid"; })[0], ba = lv.filter(function (x) { return x.side === "ask"; })[0];
      var mid = bb && ba ? (bb.px + ba.px) / 2 : (bb || ba).px;
      cols.push({ t: Date.now(), lv: lv, mid: mid }); if (cols.length > MAXC) cols.shift();
      walls(lv); draw();
    }).catch(function (e) { if (info && !cols.length) info.textContent = "Map did not load: " + (e && e.message ? e.message : "network error"); });
  }
  function walls(lv) {
    var b = lv.filter(function (x) { return x.side === "bid"; }).sort(function (x, y) { return y.usd - x.usd; });
    var a = lv.filter(function (x) { return x.side === "ask"; }).sort(function (x, y) { return y.usd - x.usd; });
    window.PerpsState.walls = b.slice(0, 2).concat(a.slice(0, 2));
    if (window.PerpsState.redrawChart) window.PerpsState.redrawChart();
    info.textContent = "";
    [[b[0], "Biggest bid "], [a[0], "Biggest ask "]].forEach(function (p) {
      if (!p[0]) return; var s = F.el("span", p[0].side === "bid" ? "up" : "dn", p[1] + F.usd(p[0].usd) + " at " + F.px(p[0].px)); info.appendChild(s);
    });
  }
  function draw() { if (!raf) raf = requestAnimationFrame(paint); }
  function paint() {
    raf = 0; if (!cv || !wrap.isConnected || !cols.length) return;
    var dpr = window.devicePixelRatio || 1, W = wrap.clientWidth, H = wrap.clientHeight; if (W < 10 || H < 10) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    var PROF = W < 500 ? 64 : 96, mw = W - PROF, last = cols[cols.length - 1];
    var lo = Infinity, hi = -Infinity, mx = 0, prices = [];
    last.lv.forEach(function (l) { if (l.px < lo) lo = l.px; if (l.px > hi) hi = l.px; prices.push(l.px); });
    cols.forEach(function (c) { c.lv.forEach(function (l) { if (l.px >= lo && l.px <= hi && l.usd > mx) mx = l.usd; }); });
    prices.sort(function (a, b) { return a - b; });
    var step = Infinity; for (var i = 1; i < prices.length; i++) { var dd = prices[i] - prices[i - 1]; if (dd > 0 && dd < step) step = dd; }
    if (!isFinite(step)) step = (hi - lo) / 20 || 1;
    lo -= step; hi += step;
    function y(p) { return (hi - p) / (hi - lo) * H; }
    var ch = Math.max(2, step / (hi - lo) * H), cw = mw / Math.max(cols.length, 48), x0 = mw - cols.length * cw;
    var up = rgb(col["--up"]), dn = rgb(col["--dn"]);
    cols.forEach(function (c, k) {
      var x = x0 + k * cw;
      c.lv.forEach(function (l) {
        if (l.px < lo || l.px > hi) return;
        var a = Math.sqrt(l.usd / mx), rc = l.side === "bid" ? up : dn;
        g.fillStyle = "rgba(" + rc[0] + "," + rc[1] + "," + rc[2] + "," + (0.06 + 0.9 * a).toFixed(3) + ")";
        g.fillRect(x, y(l.px) - ch / 2, Math.ceil(cw), ch);
      });
    });
    g.strokeStyle = col["--tx"]; g.lineWidth = 1.5; g.beginPath();
    cols.forEach(function (c, k) { var x = x0 + k * cw, yy = y(c.mid); if (k) g.lineTo(x, yy); else g.moveTo(x, yy); g.lineTo(x + cw, yy); });
    g.stroke(); g.lineWidth = 1;
    g.strokeStyle = col["--line"]; g.beginPath(); g.moveTo(mw + 0.5, 0); g.lineTo(mw + 0.5, H); g.stroke();
    var top = last.lv.slice().sort(function (a, b) { return b.usd - a.usd; }).slice(0, 4);
    g.font = "10px system-ui,sans-serif"; g.textBaseline = "middle";
    last.lv.forEach(function (l) {
      var w = l.usd / mx * (PROF - 4), rc = l.side === "bid" ? up : dn, yy = y(l.px);
      g.fillStyle = "rgba(" + rc[0] + "," + rc[1] + "," + rc[2] + ",0.75)"; g.fillRect(mw + 2, yy - ch / 2 + 0.5, Math.max(1, w), Math.max(1, ch - 1));
    });
    var seen = []; g.textAlign = "right";
    top.forEach(function (l) {
      var ly = Math.min(H - 7, Math.max(7, y(l.px))); if (seen.some(function (s) { return Math.abs(s - ly) < 13; })) return; seen.push(ly);
      var t = (PROF >= 96 ? F.px(l.px) + " " : "") + F.usd(l.usd), tw = g.measureText(t).width + 6;
      g.fillStyle = "rgba(11,12,14,0.8)"; g.fillRect(W - tw - 2, ly - 7, tw, 14); g.fillStyle = col["--tx"]; g.fillText(t, W - 5, ly);
    });
    g.textAlign = "left";
    g.fillStyle = col["--mut"];
    for (var t = 1; t < 4; t++) { var pv = hi - (hi - lo) * t / 4; g.fillText(F.px(pv), 4, y(pv)); }
    wrap._geo = { x0: x0, cw: cw, lo: lo, hi: hi, H: H, step: step };
    if (hov) hoverAt(hov[0], hov[1]);
  }
  function hoverAt(mx_, my_) {
    var G = wrap._geo; if (!G || !read) return;
    var k = Math.floor((mx_ - G.x0) / G.cw), c = cols[Math.max(0, Math.min(cols.length - 1, k))], p = G.hi - my_ / G.H * (G.hi - G.lo), best = null;
    if (!c) return;
    c.lv.forEach(function (l) { if (!best || Math.abs(l.px - p) < Math.abs(best.px - p)) best = l; });
    read.textContent = best && Math.abs(best.px - p) <= G.step ? F.px(best.px) + " · " + F.usd(best.usd) + " resting · " + F.time(c.t) : F.px(p);
  }
  function setSig(n, btns) {
    sig = n; cols = []; seq++; btns.forEach(function (b) { b.classList.toggle("on", +b.getAttribute("data-s") === n); });
    sample();
  }
  function mount(root) {
    root.textContent = ""; colors();
    var head = F.el("div", "pz-ph"); head.appendChild(F.el("span", "pz-pt", "Liquidity map"));
    var btns = [];
    [[4, "Near"], [3, "Wide"]].forEach(function (o) {
      var b = F.el("button", "pz-chip" + (o[0] === sig ? " on" : ""), o[1]); b.type = "button"; b.setAttribute("data-s", o[0]);
      b.addEventListener("click", function () { setSig(o[0], btns); }); btns.push(b); head.appendChild(b);
    });
    read = F.el("span", "pz-sub ppl-read", "Resting size by price over time"); head.appendChild(read);
    wrap = F.el("div", "ppl-wrap"); cv = document.createElement("canvas"); wrap.appendChild(cv);
    info = F.el("div", "ppl-info", "Sampling the book");
    root.appendChild(head); root.appendChild(wrap); root.appendChild(info);
    wrap.addEventListener("mousemove", function (e) { var r = wrap.getBoundingClientRect(); hov = [e.clientX - r.left, e.clientY - r.top]; hoverAt(hov[0], hov[1]); });
    wrap.addEventListener("mouseleave", function () { hov = null; read.textContent = "Resting size by price over time"; });
    try { new ResizeObserver(draw).observe(wrap); } catch (x) { window.addEventListener("resize", draw); }
    F.every(sample, 2500);
  }
  function setCoin(c) { coin = c; cols = []; seq++; window.PerpsState.walls = []; if (info) info.textContent = "Sampling the book"; sample(); }
  return { mount: mount, setCoin: setCoin };
})();
