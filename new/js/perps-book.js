/* Perps order book from the shared WS l2Book: asks above the spread, bids below, cumulative depth bars. Rows update in place.
   Written by Claude. */
window.PerpsBook = (function () {
  "use strict";
  var F = window.PerpsFeed, coin = "", szDec = 3, N = 11, askRows = [], bidRows = [], spreadEl = null, unit = "usd", lastBook = null;

  function row(side) {
    var r = F.el("div", "ppb-row " + side);
    r.appendChild(F.el("i", "ppb-bar"));
    r.appendChild(F.el("span", "ppb-px", F.DASH));
    r.appendChild(F.el("span", "ppb-sz", F.DASH));
    r.appendChild(F.el("span", "ppb-tot", F.DASH));
    return r;
  }
  function fill(r, lv, cum, max) {
    var p = lv ? F.num(lv.px) : NaN, s = lv ? F.num(lv.sz) : NaN;
    r.children[1].textContent = F.px(p);
    r.children[2].textContent = unit === "usd" ? F.usd(p * s) : F.sz(s, szDec > 2 ? 3 : szDec);
    r.children[3].textContent = unit === "usd" ? F.usd(cum.usd) : F.sz(cum.sz, szDec > 2 ? 3 : szDec);
    var w = lv && max > 0 ? Math.min(100, cum.usd / max * 100) : 0;
    r.children[0].style.width = (isFinite(w) ? w : 0) + "%";
  }
  function render(d) {
    if (!d || d.coin !== coin || !d.levels) return;
    lastBook = d;
    var bids = (d.levels[0] || []).slice(0, N), asks = (d.levels[1] || []).slice(0, N);
    var cb = [], ca = [], t = { usd: 0, sz: 0 };
    bids.forEach(function (l) { t = { usd: t.usd + F.num(l.px) * F.num(l.sz), sz: t.sz + F.num(l.sz) }; cb.push(t); });
    t = { usd: 0, sz: 0 };
    asks.forEach(function (l) { t = { usd: t.usd + F.num(l.px) * F.num(l.sz), sz: t.sz + F.num(l.sz) }; ca.push(t); });
    var max = Math.max(cb.length ? cb[cb.length - 1].usd : 0, ca.length ? ca[ca.length - 1].usd : 0);
    for (var i = 0; i < N; i++) {
      fill(bidRows[i], bids[i], cb[i] || { usd: NaN, sz: NaN }, max);
      /* asks render top-down from the furthest level so the best ask sits on the spread */
      var k = N - 1 - i; fill(askRows[i], asks[k], ca[k] || { usd: NaN, sz: NaN }, max);
    }
    try {
      var bb = F.num(bids[0].px), ba = F.num(asks[0].px), mid = (bb + ba) / 2, sp = ba - bb;
      spreadEl.children[0].textContent = F.px(mid);
      spreadEl.children[1].textContent = "Spread " + (isFinite(sp) ? String(+sp.toPrecision(3)) : F.DASH) + " · " + (isFinite(sp / mid) ? (sp / mid * 10000).toFixed(1) : F.DASH) + " bps";
      window.PerpsState.mid = mid;
    } catch (x) { spreadEl.children[0].textContent = F.DASH; spreadEl.children[1].textContent = ""; }
  }
  function mount(root) {
    root.textContent = ""; askRows = []; bidRows = [];
    N = window.matchMedia("(max-width:767px)").matches ? 8 : 10;
    var head = F.el("div", "pz-ph"); head.appendChild(F.el("span", "pz-pt", "Order book"));
    var tg = F.el("button", "pz-chip", "USD"); tg.type = "button";
    tg.addEventListener("click", function () { unit = unit === "usd" ? "coin" : "usd"; tg.textContent = unit === "usd" ? "USD" : coin || "Coin"; render(lastBook); });
    head.appendChild(tg); root.appendChild(head);
    var cols = F.el("div", "ppb-row ppb-cols"); cols.appendChild(F.el("i", "ppb-bar")); ["Price", "Size", "Total"].forEach(function (t) { cols.appendChild(F.el("span", "", t)); });
    root.appendChild(cols);
    var body = F.el("div", "ppb-body");
    for (var i = 0; i < N; i++) { askRows.push(row("ask")); body.appendChild(askRows[i]); }
    spreadEl = F.el("div", "ppb-spread"); spreadEl.appendChild(F.el("b", "", F.DASH)); spreadEl.appendChild(F.el("span", "", ""));
    body.appendChild(spreadEl);
    for (var j = 0; j < N; j++) { bidRows.push(row("bid")); body.appendChild(bidRows[j]); }
    root.appendChild(body);
    root._tg = tg;
    F.on("l2Book", render);
  }
  function setCoin(c, inf) {
    coin = c; szDec = inf && isFinite(inf.szDec) ? inf.szDec : 3; lastBook = null;
    askRows.concat(bidRows).forEach(function (r) { fill(r, null, { usd: NaN, sz: NaN }, 0); });
    if (spreadEl) { spreadEl.children[0].textContent = F.DASH; spreadEl.children[1].textContent = ""; }
  }
  return { mount: mount, setCoin: setCoin };
})();
