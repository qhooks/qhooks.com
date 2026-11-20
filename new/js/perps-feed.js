/* Perps shared feed: ONE Hyperliquid WebSocket for every perps component, REST helper, timers and number formatters.
   Closes itself when the route leaves #/perps. Written by Claude. */
window.PerpsFeed = (function () {
  "use strict";
  var WS_URL = "wss://api.hyperliquid.xyz/ws", INFO_URL = "https://api.hyperliquid.xyz/info";
  var ws = null, subs = {}, handlers = {}, timers = [], lastMsg = 0, running = false, retry = 0, retryT = null;
  var DASH = "—";

  function key(s) { return JSON.stringify(s); }
  function send(o) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (x) {} }
  function dispatch(ch, data) {
    var list = handlers[ch]; if (!list) return;
    list.slice().forEach(function (fn) { try { fn(data); } catch (x) {} });
  }
  function connect() {
    if (!running) return;
    try { ws = new WebSocket(WS_URL); } catch (x) { schedule(); return; }
    ws.onopen = function () { retry = 0; Object.keys(subs).forEach(function (k) { send({ method: "subscribe", subscription: subs[k] }); }); };
    ws.onmessage = function (m) {
      try { var d = JSON.parse(m.data); lastMsg = Date.now(); if (d && d.channel) dispatch(d.channel, d.data); } catch (x) {}
    };
    ws.onclose = function () { ws = null; schedule(); };
    ws.onerror = function () { try { ws.close(); } catch (x) {} };
  }
  function schedule() {
    if (!running || retryT) return;
    retry = Math.min(retry + 1, 6);
    retryT = setTimeout(function () { retryT = null; connect(); }, 500 * retry * retry);
  }
  function onRoute() { if (location.hash.indexOf("#/perps") !== 0) stop(); }
  function start() {
    if (running) return;
    running = true; connect();
    window.addEventListener("hashchange", onRoute);
    every(function () { send({ method: "ping" }); }, 45000);
  }
  function stop() {
    running = false;
    window.removeEventListener("hashchange", onRoute);
    timers.forEach(function (t) { clearInterval(t); }); timers = [];
    if (retryT) { clearTimeout(retryT); retryT = null; }
    try { if (ws) { ws.onclose = null; ws.close(); } } catch (x) {}
    ws = null; subs = {}; handlers = {}; lastMsg = 0;
  }
  function sub(s) { var k = key(s); if (subs[k]) return; subs[k] = s; send({ method: "subscribe", subscription: s }); }
  function unsub(s) { var k = key(s); if (!subs[k]) return; delete subs[k]; send({ method: "unsubscribe", subscription: s }); }
  function on(ch, fn) {
    (handlers[ch] = handlers[ch] || []).push(fn);
    return function () { var l = handlers[ch] || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  }
  function every(fn, ms) { var t = setInterval(function () { if (!running) { clearInterval(t); return; } try { fn(); } catch (x) {} }, ms); timers.push(t); return t; }
  function post(body) {
    return fetch(INFO_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) { lastMsg = lastMsg || Date.now(); return j; });
  }
  function age() { return lastMsg ? Math.max(0, Math.round((Date.now() - lastMsg) / 1000)) : null; }
  function liveText() { var a = age(); return a === null ? "Connecting" : "Live · " + a + "s ago"; }

  /* formatters: anything invalid renders as an em dash */
  function n(v) { var x = typeof v === "number" ? v : parseFloat(v); return isFinite(x) ? x : NaN; }
  function px(v) {
    try {
      var x = n(v); if (!isFinite(x)) return DASH;
      var a = Math.abs(x), d = a >= 10000 ? 0 : a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : 7;
      return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    } catch (e) { return DASH; }
  }
  function usd(v) {
    try {
      var x = n(v); if (!isFinite(x)) return DASH;
      var a = Math.abs(x), s = x < 0 ? "−$" : "$", u = "", m = a;
      if (a >= 1e9) { m = a / 1e9; u = "B"; } else if (a >= 1e6) { m = a / 1e6; u = "M"; } else if (a >= 1e3) { m = a / 1e3; u = "K"; }
      var t = String(parseFloat(m.toPrecision(u ? 4 : (a >= 1 ? 6 : 3))));
      if (!u && a >= 1) t = m.toFixed(2);
      return s + t + u;
    } catch (e) { return DASH; }
  }
  function pct(v, d) {
    try { var x = n(v); if (!isFinite(x)) return DASH; return (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d == null ? 2 : d) + "%"; }
    catch (e) { return DASH; }
  }
  function sz(v, dec) {
    try {
      var x = n(v); if (!isFinite(x)) return DASH;
      var d = dec == null ? (x >= 1000 ? 0 : x >= 1 ? 2 : 4) : dec;
      return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    } catch (e) { return DASH; }
  }
  function time(ms) {
    try { var t = new Date(n(ms)); if (!isFinite(t.getTime())) return DASH; return t.toTimeString().slice(0, 8); } catch (e) { return DASH; }
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  return { start: start, stop: stop, sub: sub, unsub: unsub, on: on, every: every, post: post, age: age, liveText: liveText,
    running: function () { return running; }, num: n, px: px, usd: usd, pct: pct, sz: sz, time: time, el: el, DASH: DASH };
})();
