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
