/* Portfolio bottom row: positions (Active / History) on the left, Activity on the right. Written by Claude.
   Active rows keep one-tap Sell 25/50/100 with Undo; the ".q-table-actions" cell is where flows.js adds
   Lock / Stake / Share. Rows are real links to the token page. A pending price shows a one-line note per row
   (v1.1 #9), never a coverage headline. */
window.PfPositions = (function () {
  "use strict";
  var V = window.QHView, view = "active";

  function cb(r) { return V.tag(r.chain); }
  function held(s) { return V.age(s); }
  function activeRow(p, i) {
    var gone = p.remaining <= 0.005;
    return '<a class="pp-row" href="' + V.esc(p.href) + '" data-i="' + i + '">' +
      '<span class="pp-tok"><b>' + V.esc(p.sym) + "</b> " + cb(p) + (p.pricing ? '<small class="qv-mut">1 token pricing</small>' : "") + "</span>" +
      '<span class="pp-n">' + V.usd(p.bought) + "</span>" +
      '<span class="pp-n">' + V.usd(p.sold) + "</span>" +
      '<span class="pp-n pp-2"><span>' + (gone ? '<span class="qv-mut">Sold out</span>' : V.usd(p.remaining)) + "</span><small>" + (gone ? "" : V.num(p.qty) + " " + V.esc(p.sym)) + "</small></span>" +
      '<span class="pp-n pp-2 ' + V.cls(p.pnl) + '"><span>' + V.usd(p.pnl) + "</span><small>" + V.pct(p.pnlPct, true) + "</small></span>" +
      '<span class="pp-n pp-held">' + held(p.heldSec) + "</span>" +
      '<span class="q-table-actions pp-act">' + [25, 50, 100].map(function (n) {
        return '<button class="pp-sell" data-p="' + n + '"' + (gone ? " disabled" : "") + ' aria-label="Sell ' + n + ' percent"><span class="pp-sw">Sell </span>' + n + "%</button>";
      }).join("") + "</span></a>";
  }
  function histRow(h) {
    return '<a class="pp-row pp-hist" href="' + V.esc(h.href) + '"><span class="pp-tok"><b>' + V.esc(h.sym) + "</b> " + cb(h) + "</span>" +
      '<span class="pp-n">' + V.usd(h.cost) + '</span><span class="pp-n">' + V.usd(h.cost + h.pnl) + "</span>" +
      '<span class="pp-n pp-2 ' + V.cls(h.pnl) + '"><span>' + V.usd(h.pnl) + "</span><small>" + V.pct(h.pnlPct, true) + "</small></span>" +
      '<span class="pp-n pp-held">' + V.age((Date.now() - h.closed) / 1000) + " ago</span></a>";
  }

  function render(root, data, chains) {
    var on = function (x) { return !chains || !Object.keys(chains).length || chains[x.chain]; };
    root.innerHTML = '<div class="pp-grid"><section class="pp-card"><div class="pp-tabs"><button data-v="active">Active positions</button><button data-v="history">History</button></div><div class="pp-body"></div></section>' +
      '<div class="pp-right"><div class="pp-cal"></div><section class="pp-card pp-actcard"><div class="pp-tabs"><button class="on">Activity</button></div><div class="pp-feed"></div></section></div></div>';
    var body = root.querySelector(".pp-body");

    function draw() {
      root.querySelectorAll(".pp-tabs button[data-v]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === view); });
      if (view === "history") {
        var hs = data.history.filter(on);
        body.innerHTML = '<div class="pp-row pp-head pp-hist"><span>Token</span><span class="pp-n">Cost</span><span class="pp-n">Returned</span><span class="pp-n">PnL</span><span class="pp-n">Closed</span></div>' +
          (hs.length ? hs.map(histRow).join("") : '<div class="pp-none">No closed trades on these chains.</div>');
        return;
      }
      var ps = data.positions.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return on(x.p); });
      body.innerHTML = '<div class="pp-row pp-head"><span>Token</span><span class="pp-n">Bought</span><span class="pp-n">Sold</span><span class="pp-n">Remaining</span><span class="pp-n">PnL</span><span class="pp-n pp-held">Held</span><span class="pp-n">Sell in one tap</span></div>' +
        (ps.length ? ps.map(function (x) { return activeRow(x.p, x.i); }).join("") : '<div class="pp-none">No open positions on these chains.</div>');
    }
    body.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".pp-sell");
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var row = b.closest(".pp-row"), p = data.positions[Number(row.getAttribute("data-i"))], pct = Number(b.getAttribute("data-p"));
      var before = { remaining: p.remaining, sold: p.sold, qty: p.qty }, got = p.remaining * pct / 100;
      p.remaining -= got; p.qty -= p.qty * pct / 100; p.sold += got;
      draw();
      V.toast("Sold " + pct + "% of " + p.sym + " for " + V.usd(got), "Undo", function () { p.remaining = before.remaining; p.sold = before.sold; p.qty = before.qty; draw(); });
    });
    root.querySelectorAll(".pp-tabs button[data-v]").forEach(function (b) { b.onclick = function () { view = b.getAttribute("data-v"); draw(); }; });
    draw();

    var feed = data.activity.filter(function (a) { return on(a.r); });
    root.querySelector(".pp-feed").innerHTML = feed.length ? feed.map(function (a) {
      var buy = a.side === "buy";
      return '<a class="pp-arow" href="' + V.esc(a.r.href) + '"><span class="' + (buy ? "qv-up" : "qv-dn") + '">' + (buy ? "Buy" : "Sell") + "</span>" +
        "<span><b>" + V.esc(a.r.sym) + "</b> " + cb(a.r) + '</span><span class="pp-n">' + V.usd(a.usd) + '</span><span class="pp-n qv-mut">' + V.usd(a.mcap) + '</span><span class="pp-n qv-mut">' + V.age((Date.now() - a.time) / 1000) + "</span></a>";
    }).join("") : '<div class="pp-none">No activity on these chains.</div>';
  }

  var css = document.createElement("style");
  css.textContent =
    ".pp-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:8px;min-width:0;align-items:start}.pp-right{display:flex;flex-direction:column;gap:8px;min-width:0}" +
    ".pp-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;overflow:hidden;min-width:0}" +
    ".pp-tabs{display:flex;gap:16px;padding:0 12px;border-bottom:1px solid var(--line);height:38px;align-items:stretch}" +
    ".pp-tabs button{background:none;border:0;border-bottom:2px solid transparent;color:var(--mut);font-size:13px;font-weight:600;cursor:pointer;padding:0}.pp-tabs button.on{color:var(--tx);border-bottom-color:var(--acc)}" +
    ".pp-row{display:grid;grid-template-columns:minmax(120px,1.3fr) .8fr .8fr 1fr 1fr 52px 344px;gap:8px;align-items:center;min-height:44px;padding:4px 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--tx);text-decoration:none;font-variant-numeric:tabular-nums}" +
    ".pp-hist{grid-template-columns:minmax(120px,1.3fr) 1fr 1fr 1fr 1fr}.pp-head{min-height:30px;color:var(--mut);font-size:11px}a.pp-row:hover{background:var(--s2)}" +
    ".pp-n{text-align:right;white-space:nowrap}.pp-2{display:flex;flex-direction:column;align-items:flex-end;line-height:15px}.pp-2 small{font-size:10px;color:var(--mut)}.pp-2.qv-up small{color:var(--up)}.pp-2.qv-dn small{color:var(--dn)}" +
    ".pp-tok{display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;overflow:hidden}.pp-tok b{font-size:13px}.pp-tok small{font-size:10px}" +
    ".pp-act{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:4px}.pp-act .fl-sm{padding:0 8px}.pp-act .fl-sm{margin-left:0}" +
    ".pp-sell{height:24px;padding:0 7px;border:1px solid rgba(255,77,94,.4);background:rgba(255,77,94,.08);color:var(--dn);border-radius:4px;font-size:11px;cursor:pointer}.pp-sell:disabled{opacity:.35;cursor:default}" +
    ".pp-none{padding:14px 12px;color:var(--mut);font-size:12px}" +
    ".pp-feed{max-height:360px;overflow-y:auto}.pp-arow{display:grid;grid-template-columns:34px minmax(0,1fr) 64px 64px 34px;gap:6px;align-items:center;height:32px;padding:0 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--tx);text-decoration:none;font-variant-numeric:tabular-nums}a.pp-arow:hover{background:var(--s2)}" +
    "@media (max-width:1100px){.pp-grid{grid-template-columns:1fr}.pp-held{display:none}.pp-row{grid-template-columns:minmax(110px,1.3fr) .8fr .8fr 1fr 1fr 344px}.pp-hist{grid-template-columns:minmax(110px,1.3fr) 1fr 1fr 1fr}}" +
    "@media (max-width:767px){.pp-head{display:none}.pp-row{grid-template-columns:minmax(0,1fr) auto auto;grid-template-areas:'t r p' 'a a a';padding:8px 10px;row-gap:6px}" +
    ".pp-row>.pp-n:nth-child(2),.pp-row>.pp-n:nth-child(3){display:none}.pp-tok{grid-area:t}.pp-row>.pp-2:nth-child(4){grid-area:r}.pp-row>.pp-2:nth-child(5){grid-area:p}.pp-act{grid-area:a;justify-content:flex-start}" +
    ".pp-hist{grid-template-columns:minmax(0,1fr) auto auto;grid-template-areas:none}.pp-hist>.pp-n:nth-child(2),.pp-hist>.pp-n:nth-child(3){display:none}.pp-hist>.pp-2{grid-area:auto}" +
    ".pp-sell{height:44px;min-width:46px;padding:0 6px;font-size:12px}.pp-sw{display:none}.pp-act .fl-sm{min-width:44px;padding:0 7px}.pp-act::before{content:'Sell';align-self:center;font-size:11px;color:var(--mut);margin-right:2px}.pp-tabs{height:auto}.pp-tabs button{min-height:44px}.pp-arow{height:44px;grid-template-columns:34px minmax(0,1fr) 64px 34px}.pp-arow>:nth-child(4){display:none}}";
  document.head.appendChild(css);
  return { render: render };
})();
