/* Perps candle chart: candleSnapshot REST, then the shared WS candle channel; the last candle also ticks from live trades.
   Big resting walls from the liquidity map are drawn as dashed levels. Canvas, no library. Written by Claude. */
window.PerpsChart = (function () {
  "use strict";
  var F = window.PerpsFeed, IV = { "1m": 6e4, "5m": 3e5, "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };
  var coin = "", iv = "15m", candles = [], cv = null, wrap = null, readout = null, msg = null, hover = -1, raf = 0, seq = 0, col = {};

  function colors() {
    var s = getComputedStyle(document.documentElement);
    ["--up", "--dn", "--tx", "--mut", "--line", "--s1", "--s2", "--acc"].forEach(function (k) { col[k] = (s.getPropertyValue(k) || "").trim() || "#888"; });
  }
  function norm(k) { return { t: F.num(k.t), o: F.num(k.o), h: F.num(k.h), l: F.num(k.l), c: F.num(k.c), v: F.num(k.v) }; }
  function merge(k) {
    var c = norm(k); if (!isFinite(c.t) || !isFinite(c.c)) return;
    var n = candles.length;
    if (n && candles[n - 1].t === c.t) candles[n - 1] = c;
    else if (!n || c.t > candles[n - 1].t) { candles.push(c); if (candles.length > 400) candles.shift(); }
    draw();
  }
  function onTrade(t) {
    var n = candles.length; if (!n || !t || t.coin !== coin) return;
    var p = F.num(t.px), last = candles[n - 1], tm = F.num(t.time); if (!isFinite(p)) return;
    if (tm >= last.t && tm < last.t + IV[iv]) { last.c = p; if (p > last.h) last.h = p; if (p < last.l) last.l = p; draw(); }
  }
  function setReadout(c) {
    if (!readout) return;
    if (!c) { readout.textContent = ""; return; }
    var ch = (c.c - c.o) / c.o * 100;
    readout.textContent = "O " + F.px(c.o) + "  H " + F.px(c.h) + "  L " + F.px(c.l) + "  C " + F.px(c.c) + "  " + F.pct(ch) + "  V " + F.usd(c.v * c.c);
  }
  function draw() { if (!raf) raf = requestAnimationFrame(paint); }
  function paint() {
    raf = 0; if (!cv || !wrap.isConnected) return;
    var dpr = window.devicePixelRatio || 1, W = wrap.clientWidth, H = wrap.clientHeight; if (W < 10 || H < 10) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    var AX = 66, TB = 18, cw = W - AX, ph = H - TB, bw = W < 500 ? 6 : 8, cnt = Math.min(candles.length, Math.floor(cw / bw));
    if (!cnt) return;
    var vis = candles.slice(candles.length - cnt), hi = -Infinity, lo = Infinity, vmax = 0;
    vis.forEach(function (c) { if (c.h > hi) hi = c.h; if (c.l < lo) lo = c.l; if (c.v > vmax) vmax = c.v; });
    var pad = (hi - lo) * 0.08 || hi * 0.001; hi += pad; lo -= pad;
    var volH = ph * 0.16, priceH = ph - volH;
    function y(p) { return (hi - p) / (hi - lo) * priceH; }
    g.font = "11px system-ui,sans-serif"; g.textBaseline = "middle"; g.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var pv = lo + (hi - lo) * i / 4, yy = Math.round(y(pv)) + 0.5;
      g.strokeStyle = col["--line"]; g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke();
      g.fillStyle = col["--mut"]; g.fillText(F.px(pv), cw + 6, Math.max(8, Math.min(priceH - 6, yy)));
    }
    var used = [];
    (window.PerpsState.walls || []).forEach(function (w) {
      if (w.px < lo || w.px > hi) return;
      var wy = Math.round(y(w.px)) + 0.5; g.setLineDash([4, 4]); g.strokeStyle = w.side === "bid" ? col["--up"] : col["--dn"];
      g.globalAlpha = 0.55; g.beginPath(); g.moveTo(0, wy); g.lineTo(cw, wy); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      if (used.some(function (u) { return Math.abs(u - wy) < 14; })) return;
      used.push(wy); var wl = (w.side === "bid" ? "Bid wall " : "Ask wall ") + F.usd(w.usd) + " at " + F.px(w.px);
      g.fillStyle = col["--s1"]; g.globalAlpha = 0.85; g.fillRect(4, wy - 16, g.measureText(wl).width + 6, 14); g.globalAlpha = 1;
      g.fillStyle = w.side === "bid" ? col["--up"] : col["--dn"]; g.fillText(wl, 7, wy - 9);
    });
    vis.forEach(function (c, k) {
      var x = k * bw + 1, up = c.c >= c.o, cl = up ? col["--up"] : col["--dn"];
      g.fillStyle = cl; g.strokeStyle = cl;
      g.beginPath(); g.moveTo(x + bw / 2 - 0.5, y(c.h)); g.lineTo(x + bw / 2 - 0.5, y(c.l)); g.stroke();
      var top = y(Math.max(c.o, c.c)), bh = Math.max(1, Math.abs(y(c.o) - y(c.c)));
      g.fillRect(x, top, bw - 2, bh);
      g.globalAlpha = 0.35; var vh = vmax ? c.v / vmax * volH : 0; g.fillRect(x, ph - vh, bw - 2, vh); g.globalAlpha = 1;
    });
    var lc = vis[vis.length - 1], ly = y(lc.c);
    g.setLineDash([2, 3]); g.strokeStyle = col["--mut"]; g.beginPath(); g.moveTo(0, ly); g.lineTo(cw, ly); g.stroke(); g.setLineDash([]);
    g.fillStyle = lc.c >= lc.o ? col["--up"] : col["--dn"]; g.fillRect(cw, ly - 9, AX, 18);
    g.fillStyle = "#0b0c0e"; g.fillText(F.px(lc.c), cw + 6, ly);
    g.fillStyle = col["--mut"]; g.textBaseline = "alphabetic";
    var step = Math.max(1, Math.floor(cnt / (W < 500 ? 3 : 6)));
    for (var j = step; j < cnt; j += step) {
      var d = new Date(vis[j].t), lab = IV[iv] >= 864e5 ? (d.getMonth() + 1) + "/" + d.getDate() : ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
      g.fillText(lab, j * bw - 12, H - 4);
    }
    if (hover >= 0 && hover < cnt) {
      var hx = hover * bw + bw / 2; g.strokeStyle = col["--mut"]; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(hx, 0); g.lineTo(hx, ph); g.stroke(); g.globalAlpha = 1;
      setReadout(vis[hover]);
    } else setReadout(lc);
    wrap._bw = bw; wrap._cnt = cnt;
  }
  function load() {
    var my = ++seq, now = Date.now();
    candles = []; draw(); msg.textContent = "Loading candles"; msg.style.display = "";
    F.post({ type: "candleSnapshot", req: { coin: coin, interval: iv, startTime: now - IV[iv] * 300, endTime: now } }).then(function (arr) {
      if (my !== seq) return;
      candles = (arr || []).map(norm).filter(function (c) { return isFinite(c.t) && isFinite(c.c); });
      msg.style.display = candles.length ? "none" : ""; if (!candles.length) msg.textContent = "No candles for this market yet";
      draw();
    }).catch(function (e) { if (my === seq) msg.textContent = "Candles did not load: " + (e && e.message ? e.message : "network error"); });
  }
  function setIv(n) {
    if (coin) F.unsub({ type: "candle", coin: coin, interval: iv });
    iv = n; if (wrap) wrap.parentNode.querySelectorAll(".ppc-iv").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-iv") === n); });
    if (coin) { F.sub({ type: "candle", coin: coin, interval: iv }); load(); }
  }
  function mount(root) {
    root.textContent = ""; colors();
    var bar = F.el("div", "ppc-bar");
    Object.keys(IV).forEach(function (k) {
      var b = F.el("button", "ppc-iv" + (k === iv ? " on" : ""), k.toUpperCase() === "1D" ? "1D" : k); b.type = "button"; b.setAttribute("data-iv", k);
      b.addEventListener("click", function () { setIv(k); }); bar.appendChild(b);
    });
    readout = F.el("span", "ppc-read", ""); bar.appendChild(readout);
    wrap = F.el("div", "ppc-wrap"); cv = document.createElement("canvas"); wrap.appendChild(cv);
    msg = F.el("div", "pz-msg ppc-msg", "Loading candles"); wrap.appendChild(msg);
    root.appendChild(bar); root.appendChild(wrap);
    wrap.addEventListener("mousemove", function (e) { var r = wrap.getBoundingClientRect(); hover = Math.floor((e.clientX - r.left) / (wrap._bw || 8)); draw(); });
    wrap.addEventListener("mouseleave", function () { hover = -1; draw(); });
    try { new ResizeObserver(draw).observe(wrap); } catch (x) { window.addEventListener("resize", draw); }
    F.on("candle", function (d) { (Array.isArray(d) ? d : [d]).forEach(function (k) { if (k && k.s === coin && k.i === iv) merge(k); }); });
    window.PerpsState.onTrade = onTrade;
    window.PerpsState.redrawChart = draw;
  }
  function setCoin(c) {
    if (coin) F.unsub({ type: "candle", coin: coin, interval: iv });
    coin = c; F.sub({ type: "candle", coin: coin, interval: iv }); load();
  }
  return { mount: mount, setCoin: setCoin };
})();
