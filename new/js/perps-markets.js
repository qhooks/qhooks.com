/* Perps market selector: left rail on desktop, top picker strip on phone. Live mids via the shared feed. Written by Claude. */
window.PerpsMarkets = (function () {
  "use strict";
  var F = window.PerpsFeed, rows = {}, info = {}, last = {}, onPick = null, current = "", listEl = null, filter = "";

  function makeRow(c) {
    var a = F.el("button", "ppm-row"); a.type = "button"; a.setAttribute("data-c", c);
    a.appendChild(F.el("span", "ppm-sym", c));
    a.appendChild(F.el("span", "ppm-lev", info[c] ? info[c].maxLev + "x" : ""));
    a.appendChild(F.el("span", "ppm-px", F.DASH));
    a.appendChild(F.el("span", "ppm-ch", F.DASH));
    a.addEventListener("click", function () { pick(c); });
    return a;
  }
  function paint(c, mid) {
    var r = rows[c], i = info[c]; if (!r) return;
    var p = F.num(mid); if (!isFinite(p)) return;
    var prev = last[c]; last[c] = p;
    r.querySelector(".ppm-px").textContent = F.px(p);
    var ch = i && isFinite(i.prev) && i.prev > 0 ? (p - i.prev) / i.prev * 100 : NaN, chEl = r.querySelector(".ppm-ch");
    chEl.textContent = F.pct(ch); chEl.className = "ppm-ch " + (ch >= 0 ? "up" : "dn");
    if (prev && prev !== p) { r.classList.remove("ppm-fu", "ppm-fd"); void r.offsetWidth; r.classList.add(p > prev ? "ppm-fu" : "ppm-fd"); }
  }
  function applyFilter() {
    Object.keys(rows).forEach(function (c) { rows[c].style.display = !filter || c.toLowerCase().indexOf(filter) >= 0 ? "" : "none"; });
  }
  function pick(c) {
    current = c;
    Object.keys(rows).forEach(function (k) { rows[k].classList.toggle("on", k === c); });
    try { rows[c].scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (x) {}
    if (onPick) onPick(c, info[c] || { maxLev: 20, szDec: 3 });
  }
  function build(list) {
    listEl.textContent = ""; rows = {};
    list.forEach(function (c) { rows[c] = makeRow(c); listEl.appendChild(rows[c]); });
    applyFilter();
  }
  /* universe sorted by 24h notional volume; top 40 */
  function load(prefer) {
    return F.post({ type: "metaAndAssetCtxs" }).then(function (j) {
      var uni = j[0].universe, ctx = j[1], all = [];
      uni.forEach(function (u, i) {
        if (u.isDelisted) return;
        var c = ctx[i] || {};
        info[u.name] = { maxLev: u.maxLeverage || 20, szDec: u.szDecimals, prev: F.num(c.prevDayPx), vol: F.num(c.dayNtlVlm), ctx: c };
        all.push(u.name);
      });
      all.sort(function (a, b) { return (info[b].vol || 0) - (info[a].vol || 0); });
      var top = all.slice(0, 40);
      if (prefer && top.indexOf(prefer) < 0 && info[prefer]) top.unshift(prefer);
      build(top);
      top.forEach(function (c) { var cx = info[c].ctx; paint(c, cx.midPx || cx.markPx); });
      return top;
    });
  }
  function mount(root, opts) {
    onPick = opts.onPick;
    root.textContent = "";
    var head = F.el("div", "ppm-head");
    var q = F.el("input", "ppm-q"); q.type = "search"; q.placeholder = "Find market"; q.setAttribute("aria-label", "Find market");
    q.addEventListener("input", function () { filter = q.value.trim().toLowerCase(); applyFilter(); });
    head.appendChild(q);
    var cols = F.el("div", "ppm-cols"); ["Market", "Price", "24h"].forEach(function (t) { cols.appendChild(F.el("span", "", t)); });
    listEl = F.el("div", "ppm-list");
    root.appendChild(head); root.appendChild(cols); root.appendChild(listEl);
    listEl.appendChild(F.el("div", "pz-msg", "Loading markets"));
    F.on("allMids", function (d) { var m = d && d.mids; if (!m) return; Object.keys(rows).forEach(function (c) { if (m[c] != null) paint(c, m[c]); }); });
    F.sub({ type: "allMids" });
    function attempt() {
      load(opts.coin).then(function (top) { pick(top.indexOf(opts.coin) >= 0 ? opts.coin : top[0]); }).catch(function (e) {
        listEl.textContent = "";
        var m = F.el("div", "pz-msg", "Markets did not load: " + (e && e.message ? e.message : "network error") + " ");
        var b = F.el("button", "pz-retry", "Retry"); b.type = "button"; b.addEventListener("click", attempt); m.appendChild(b); listEl.appendChild(m);
      });
    }
    attempt();
  }
  return { mount: mount, info: function (c) { return info[c]; }, current: function () { return current; } };
})();
