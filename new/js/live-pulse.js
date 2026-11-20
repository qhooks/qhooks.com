/* live-pulse.js: Pulse columns on live data. Written by Claude.
   Rows come from live-boot.js (one shared reader, window event "qhlive"):
   New pairs  = market feed tab "new";
   Final stretch = QHooks launches still on their curve + feed tab "bonding" (highest progress first);
   Migrated   = QHooks launches that graduated + feed tab "migrated".
   Rows are keyed (chain:address). Changed values are patched in place with a short flash, unchanged rows are not
   touched, order freezes while the pointer is over a column, and rows that arrive meanwhile wait in an "N new" pill.
   If the live feed cannot be read the fixture rows stay. */
(function () {
  "use strict";
  var COLS = ["new", "final", "migrated"];
  var PARTS = [".pulse-row-right .pulse-price", ".pulse-row-right .pulse-volume", ".pulse-row-right .pulse-mcap", ".pulse-row-right .pulse-fees", ".pulse-row-right .pulse-press", ".pulse-row-stats", ".pulse-age", ".pulse-qproof", ".pulse-prog"];

  function el(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
  function byProgress(a, b) { return (b.progress || 0) - (a.progress || 0); }
  function merge(lists) {
    var seen = {}, out = [];
    lists.forEach(function (l) { l.forEach(function (t) { if (!seen[t.key]) { seen[t.key] = 1; out.push(t); } }); });
    return out;
  }

  function Column(root, name) {
    var col = root.querySelector(".pulse-col-" + name), list = col && col.querySelector(".pulse-row-list");
    var head = col && col.querySelector(".pulse-col-header"), rows = {}, pending = [], frozen = false, started = false, fresh = 0;
    var tag = document.createElement("span"); tag.className = "lp-fresh"; tag.textContent = "Refreshing";
    var pill = document.createElement("button"); pill.className = "lp-pill"; pill.style.display = "none";
    if (head) head.appendChild(tag);
    if (list) list.parentNode.insertBefore(pill, list);
    col.addEventListener("mouseenter", function () { frozen = true; });
    col.addEventListener("mouseleave", function () { frozen = false; flush(); });
    pill.onclick = function () { frozen = false; flush(); list.scrollTop = 0; };
    var last = [];

    function patch(row, html) {
      var next = el(html);
      PARTS.forEach(function (sel) {
        var a = row.querySelector(sel), b = next.querySelector(sel);
        if (a && b && a.innerHTML !== b.innerHTML) {
          a.innerHTML = b.innerHTML;
          if (sel.indexOf("price") > 0 || sel.indexOf("mcap") > 0) { a.classList.remove("lp-flash"); void a.offsetWidth; a.classList.add("lp-flash"); }
        }
      });
    }
    function flush() {
      if (frozen) return;
      var keys = {};
      last.forEach(function (t) { keys[t.key] = 1; });
      Object.keys(rows).forEach(function (k) { if (!keys[k]) { rows[k].el.remove(); delete rows[k]; } });
      last.forEach(function (t) {
        var html = window.PulseRow.renderRow(t);
        if (!rows[t.key]) rows[t.key] = { el: el(html), html: html };
      });
      var want = last.map(function (t) { return rows[t.key].el; }), cur = Array.prototype.slice.call(list.children);
      var same = want.length === cur.length && want.every(function (e, i) { return cur[i] === e; });
      if (!same) { list.innerHTML = ""; want.forEach(function (e) { list.appendChild(e); }); }
      pending = []; pill.style.display = "none";
      if (!want.length) list.innerHTML = "<div class='pulse-empty'>Nothing in this column right now</div>";
    }
    function show(tokens, observedAt) {
      fresh = observedAt || fresh;
      if (!started) { started = true; list.innerHTML = ""; }
      last = tokens;
      tokens.forEach(function (t) {
        var r = rows[t.key], html;
        if (!r) { if (frozen && pending.indexOf(t.key) < 0) pending.push(t.key); return; }
        html = window.PulseRow.renderRow(t);
        if (html !== r.html) { patch(r.el, html); r.html = html; }
      });
      if (frozen) { pill.textContent = pending.length + " new"; pill.style.display = pending.length ? "" : "none"; return; }
      flush();
    }
    function unavailable() { if (started) return; tag.textContent = "Sample rows"; }
    function clock() { tag.textContent = started ? window.QHFmt.fresh(fresh) : tag.textContent; }
    return { show: show, unavailable: unavailable, clock: clock, ok: !!list };
  }

  function attach(root) {
    if (!window.QHLive || !window.PulseRow) return;
    var L = window.QHLive, cols = {}, mounted = false, waits = 0;
    COLS.forEach(function (c) { cols[c] = Column(root, c); });
    if (!cols.new.ok) return;
    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".pulse-buy-btn");
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var input = b.closest(".pulse-col") && b.closest(".pulse-col").querySelector(".pulse-quick-buy-input");
      try { sessionStorage.setItem("qh-quick-amt", input ? input.value : "0.01"); } catch (x) {}
      var h = b.getAttribute("data-href"); if (h) location.hash = h;
    }, true);

    function show(d) {
      // attach() runs before the page appends root; only stop listening once root has been mounted and then removed.
      if (root.isConnected) mounted = true;
      if (!root.isConnected) { if (mounted) window.removeEventListener("qhlive", onLive); else if (waits++ < 100) setTimeout(function () { show(d); }, 50); return; }
      if (!d || !d.ok) { COLS.forEach(function (c) { cols[c].unavailable(); }); return; }
      var l = d.lists, own = l.launches || [];
      var curve = own.filter(function (t) { return t.stage !== "migrated"; });
      var moved = own.filter(function (t) { return t.stage === "migrated"; });
      cols.new.show((l.newPairs || []).slice(0, 40), d.observedAt);
      cols.final.show(merge([curve, l.bonding || []]).sort(byProgress).slice(0, 40), d.observedAt);
      cols.migrated.show(merge([moved, l.migrated || []]).slice(0, 40), d.observedAt);
    }
    function onLive(e) { show(e.detail); }
    window.addEventListener("qhlive", onLive);
    if (L.latest && L.latest()) show(L.latest());
    if (L.start) L.start();
    var t = setInterval(function () { if (!root.isConnected) { clearInterval(t); return; } COLS.forEach(function (c) { cols[c].clock(); }); }, 1000);
  }

  var css = document.createElement("style");
  css.textContent = ".lp-fresh{margin-left:auto;font-size:10px;color:var(--mut);white-space:nowrap;font-variant-numeric:tabular-nums}" +
    ".lp-pill{display:block;width:calc(100% - 20px);margin:6px 10px;height:28px;border:1px solid var(--acc);background:var(--s2);color:var(--acc);border-radius:4px;font-size:12px;cursor:pointer}" +
    ".pulse-tile-img{object-fit:cover;padding:0;background:var(--s2)}.pulse-tile-wrap{position:relative;line-height:0}" +
    ".pulse-chain-tag{position:absolute;right:-2px;bottom:-2px;font-size:8px;line-height:12px;font-weight:700;letter-spacing:.04em;padding:0 3px;background:var(--bg,#0b0c0e);color:var(--mut);border:1px solid var(--line);border-radius:3px}" +
    ".pulse-press{background:rgba(242,105,92,.55);overflow:hidden}.pulse-press i{display:block;height:100%;background:var(--up)}.pulse-press-none{background:var(--line)}" +
    ".pulse-mc-band0{color:var(--mut)}.pulse-mc-band1{color:var(--mut)}.pulse-mc-band2{color:var(--acc)}.pulse-mc-band3{color:var(--up)}.pulse-mc-band4{color:#7ad7ff}" +
    "@keyframes lpflash{from{background:rgba(76,195,138,.18)}to{background:transparent}}.lp-flash{animation:lpflash .6s ease-out}";
  document.head.appendChild(css);
  window.LivePulse = { attach: attach };
})();
