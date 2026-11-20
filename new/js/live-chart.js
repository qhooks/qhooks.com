/* live-chart.js: candlestick canvas for live bars (USD). Written by Claude.
   Draws at device pixel ratio, keeps the last 120 bars, right-hand price scale, last-price line.
   The last bar follows the header price so chart and header always tick from the same read. */
(function () {
  "use strict";
  var C = { bg: "#121419", line: "#23262d", mut: "#8a8f98", up: "#2ee59d", dn: "#ff4d5e", acc: "#f5b544" };

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
    ctx.fillStyle = C.acc; ctx.fillRect(cw, ly - 8, right, 16); ctx.fillStyle = "#140d00"; ctx.fillText(label(last * mult), cw + 4, ly + 3);
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
