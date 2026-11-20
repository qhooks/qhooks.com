/* Discover "Live" tab: newest trades across every token, streaming in at the top. Written by Claude.
   Live mode re-reads trades already held by window.QHLive (no new polling routes). Fixture mode adds a
   synthetic trade every 1.6 s so the screen behaves the same. Rows never move while the pointer or a finger
   is on the list (contract v1.1 #3): new trades wait in a buffer and enter with a 150 ms slide when it leaves. */
window.DiscoverLive = (function () {
  "use strict";
  var V = window.QHView, MAX = 80;

  function key(x) { return x.r.sym + ":" + x.time + ":" + (x.trader || "") + ":" + x.usd; }
  function collect(rows) {
    var out = [];
    rows.forEach(function (r) {
      (r.trades || []).slice(0, 12).forEach(function (tr) {
        var usd = Number(tr.usd != null ? tr.usd : tr.valueUsd), time = Number(tr.time != null ? tr.time : tr.ts);
        if (!V.ok(usd) || !V.ok(time)) return;
        out.push({ r: r, side: tr.type || tr.side || "buy", usd: usd, qty: Number(tr.amount), time: time, trader: tr.trader || tr.wallet || "" });
      });
    });
    return out.sort(function (a, b) { return b.time - a.time; });
  }
  function fake(rows, rand) {
    var r = rows[Math.floor(rand() * rows.length)], usd = Math.pow(10, 0.5 + rand() * 3.2);
    var hex = ""; for (var i = 0; i < 40; i++) hex += "0123456789abcdef".charAt(Math.floor(rand() * 16));
    return { r: r, side: rand() < 0.56 ? "buy" : "sell", usd: usd, qty: V.ok(r.price) && r.price > 0 ? usd / r.price : NaN, time: Date.now(), trader: "0x" + hex };
  }
  function line(x) {
    var buy = x.side === "buy";
    return '<a class="lv-row" href="' + V.esc(x.r.href) + '" data-t="' + x.time + '">' +
      '<span class="lv-age" data-t="' + x.time + '">' + V.age((Date.now() - x.time) / 1000) + "</span>" +
      '<span class="lv-side ' + (buy ? "qv-up" : "qv-dn") + '">' + (buy ? "Buy" : "Sell") + "</span>" +
      '<span class="lv-tok"><b>' + V.esc(x.r.sym) + "</b> " + V.tag(x.r.chain) + "</span>" +
      '<span class="lv-usd ' + (buy ? "qv-up" : "qv-dn") + '">' + V.usd(x.usd) + "</span>" +
      '<span class="lv-qty">' + V.num(x.qty) + "</span>" +
      '<span class="lv-mc">' + V.usd(x.r.mcap) + "</span>" +
      '<span class="lv-who">' + V.esc(V.short(x.trader)) + "</span></a>";
  }

  function render(container, rows) {
    var rand = V.rng(Date.now() & 0xffff), seen = {}, held = false, buffer = [], fixtures = V.source() === "fixtures";
    var list = collect(rows).slice(0, 40);
    list.forEach(function (x) { seen[key(x)] = 1; });
    container.innerHTML = '<div class="lv-wrap"><div class="lv-top"><span class="lv-dot-label">Live</span> <span class="lv-fresh qv-mut">· 0s</span>' +
      '<span class="qv-mut lv-hint">Newest trades on every chain you picked</span></div>' +
      '<div class="lv-row lv-head"><span>Age</span><span>Side</span><span>Token</span><span class="lv-usd">Value</span><span class="lv-qty">Amount</span><span class="lv-mc">MC</span><span class="lv-who">Wallet</span></div>' +
      '<div class="lv-body">' + list.map(line).join("") + "</div></div>";
    var body = container.querySelector(".lv-body"), fresh = container.querySelector(".lv-fresh"), last = Date.now();
    function hold(v) { held = v; if (!v) flush(); }
    body.addEventListener("mouseenter", function () { hold(true); });
    body.addEventListener("mouseleave", function () { hold(false); });
    body.addEventListener("touchstart", function () { hold(true); }, { passive: true });
    body.addEventListener("touchend", function () { setTimeout(function () { hold(false); }, 1200); }, { passive: true });
    function flush() {
      if (held || !buffer.length) return;
      buffer.splice(0).reverse().forEach(function (x) {
        var tmp = document.createElement("div"); tmp.innerHTML = line(x);
        var el = tmp.firstChild; el.classList.add("lv-in"); body.insertBefore(el, body.firstChild);
      });
      while (body.children.length > MAX) body.removeChild(body.lastChild);
      last = Date.now();
    }
    var timer = setInterval(function () {
      if (V.gone(container) || !document.body.contains(body)) { clearInterval(timer); return; }
      if (document.hidden) return;
      if (fixtures) buffer.push(fake(rows, rand));
      else collect(V.tokens()).forEach(function (x) { var k = key(x); if (!seen[k]) { seen[k] = 1; buffer.push(x); } });
      flush();
      fresh.textContent = "· " + Math.max(0, Math.round((Date.now() - last) / 1000)) + "s";
      body.querySelectorAll(".lv-age").forEach(function (s) { s.textContent = V.age((Date.now() - Number(s.getAttribute("data-t"))) / 1000); });
    }, 1600);
  }

  var css = document.createElement("style");
  css.textContent =
    ".lv-wrap{background:var(--s1);border:1px solid var(--line);border-radius:8px;overflow:hidden}" +
    ".lv-top{display:flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-bottom:1px solid var(--line);font-size:12px}.lv-dot-label{color:var(--up);font-weight:600}.lv-hint{margin-left:auto;font-size:11px}" +
    ".lv-row{display:grid;grid-template-columns:48px 44px minmax(120px,1.4fr) 1fr 1fr 1fr 1fr;gap:8px;align-items:center;height:32px;padding:0 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--tx);text-decoration:none;font-variant-numeric:tabular-nums}" +
    "a.lv-row:hover{background:var(--s2)}.lv-head{height:28px;color:var(--mut);font-size:11px}" +
    ".lv-usd,.lv-qty,.lv-mc,.lv-who{text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-who{color:var(--mut)}.lv-age{color:var(--mut)}.lv-side{font-weight:600}" +
    ".lv-tok{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "@keyframes lvIn{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}.lv-in{animation:lvIn .15s ease-out;background:rgba(245,181,68,.05)}" +
    "@media (max-width:767px){.lv-row{grid-template-columns:40px 38px minmax(0,1fr) 72px 64px;height:44px;padding:0 10px;gap:6px}.lv-head{height:28px}.lv-qty,.lv-who{display:none}.lv-hint{display:none}}";
  document.head.appendChild(css);
  return { render: render };
})();
