/* Perps live trade tape from the shared WS trades channel. Newest on top, large prints marked. Written by Claude. */
window.PerpsTape = (function () {
  "use strict";
  var F = window.PerpsFeed, coin = "", list = null, MAX = 40, BIG = 100000;

  function add(t) {
    var p = F.num(t.px), s = F.num(t.sz), u = p * s, buy = t.side === "B";
    var r = F.el("div", "ppt-row " + (buy ? "up" : "dn") + (u >= BIG ? " big" : ""));
    r.appendChild(F.el("span", "ppt-px", F.px(p)));
    r.appendChild(F.el("span", "ppt-sz", F.usd(u)));
    r.appendChild(F.el("span", "ppt-tm", F.time(t.time)));
    list.insertBefore(r, list.firstChild);
    while (list.children.length > MAX) list.removeChild(list.lastChild);
    if (isFinite(p)) window.PerpsState.last = p;
  }
  function onTrades(arr) {
    if (!arr || !arr.length || !list) return;
    var mine = arr.filter(function (t) { return t.coin === coin; });
    if (!mine.length) return;
    var e = list.querySelector(".pz-msg"); if (e) e.remove();
    mine.sort(function (a, b) { return a.time - b.time; }).forEach(add);
    if (window.PerpsState.onTrade) { try { window.PerpsState.onTrade(mine[mine.length - 1]); } catch (x) {} }
  }
  function mount(root) {
    root.textContent = "";
    var head = F.el("div", "pz-ph"); head.appendChild(F.el("span", "pz-pt", "Trades"));
    head.appendChild(F.el("span", "pz-sub", "Large prints ≥ " + F.usd(BIG)));
    root.appendChild(head);
    var cols = F.el("div", "ppt-row ppt-cols"); ["Price", "Size", "Time"].forEach(function (t) { cols.appendChild(F.el("span", "", t)); });
    root.appendChild(cols);
    list = F.el("div", "ppt-list"); root.appendChild(list);
    F.on("trades", onTrades);
  }
  function setCoin(c) {
    coin = c; if (!list) return;
    list.textContent = ""; list.appendChild(F.el("div", "pz-msg", "Waiting for the next trade"));
  }
  return { mount: mount, setCoin: setCoin };
})();
