/* Discover table (contract section 6 + parity row "Discovery"). Written by Claude.
   Dense trending table: sparkline from candles, MC with change, Liq, 24h volume, buys/sells, holders, fees,
   QProof + hook badge, quick buy. Each tab passes its default sort (rule 11) and an optional extra column
   (bonding progress or volume growth). A non-default sort shows "Sorted by X · Reset". Rows are real links. */
window.DiscoverTable = (function () {
  "use strict";
  var V = window.QHView;
  var BASE = [
    { k: "sym", l: "Token", left: true },
    { k: "ageSec", l: "Age" },
    { k: "spark", l: "Chart", nosort: true },
    { k: "mcap", l: "MC" },
    { k: "liq", l: "Liq" },
    { k: "vol", l: "24h Vol" },
    { k: "txs", l: "24h TXs" },
    { k: "holders", l: "Holders" },
    { k: "fees", l: "Fees" }
  ];
  var EXTRA = { progress: { k: "progress", l: "Bonding" }, growth: { k: "growth", l: "Vol 1h" } };
  var sorts = {};

  function cell(r, k) {
    if (k === "sym") {
      return '<span class="dt-l1"><b class="dt-sym">' + V.esc(r.sym) + "</b>" + (r.pair ? '<span class="dt-pair">/' + V.esc(r.pair) + "</span>" : "") +
        ' <span class="dt-name">' + V.esc(r.name) + "</span> " + V.tag(r.chain) + "</span>" +
        '<span class="dt-mchips">' + chips(r) + "</span>";
    }
    if (k === "ageSec") return V.age(r.ageSec);
    if (k === "spark") return V.spark(r.spark, 72, 22);
    if (k === "mcap") return '<span class="dt-2"><span>' + V.usd(r.mcap) + '</span><small class="' + V.cls(r.change) + '">' + V.pct(r.change, true) + "</small></span>";
    if (k === "liq") return V.usd(r.liq);
    if (k === "vol") return V.usd(r.vol);
    if (k === "txs") return '<span class="dt-2"><span>' + V.num(r.txs) + '</span><small><span class="qv-up">' + V.num(r.buys) + '</span> / <span class="qv-dn">' + V.num(r.sells) + "</span></small></span>";
    if (k === "holders") return V.num(r.holders);
    if (k === "fees") return V.usd(r.fees);
    if (k === "progress") {
      var p = V.ok(r.progress) ? Math.max(0, Math.min(100, r.progress)) : NaN;
      return '<span class="dt-prog"><span class="dt-bar"><i style="width:' + (V.ok(p) ? p.toFixed(1) : 0) + '%"></i></span><span>' + V.pct(p) + "</span></span>";
    }
    if (k === "growth") return '<span class="' + V.cls(r.growth) + '">' + V.pct(r.growth, true) + "</span>";
    if (k === "qp") return chips(r);
    return "";
  }
  function chips(r) {
    var q = r.qProof || "Not checked";
    return '<span class="pulse-qproof pulse-qproof-' + q.toLowerCase().replace(" ", "-") + '">' + V.esc(q) + "</span>" + (window.HookBadge ? " " + window.HookBadge.inRow(r.t) : "");
  }
  function val(r, k) { return k === "sym" ? String(r.sym) : r[k]; }

  function render(container, rows, opts) {
    opts = opts || {};
    var tab = opts.tab || "trending", def = opts.sort || { k: "vol", dir: -1 };
    if (!sorts[tab]) sorts[tab] = { k: def.k, dir: def.dir };
    var st = sorts[tab], cols = BASE.slice(0);
    if (opts.extra && EXTRA[opts.extra]) cols.splice(3, 0, EXTRA[opts.extra]);
    cols.push({ k: "qp", l: "QProof", left: true, nosort: true });
    var labelOf = {}; cols.forEach(function (c) { labelOf[c.k] = c.l; });

    function draw() {
      rows.sort(function (a, b) {
        var va = val(a, st.k), vb = val(b, st.k);
        if (typeof va === "string") return st.dir * va.localeCompare(vb);
        return st.dir * ((V.ok(va) ? va : 1e18 * st.dir) - (V.ok(vb) ? vb : 1e18 * st.dir));
      });
      var head = '<div class="dt-row dt-head">' + cols.map(function (c) {
        if (c.nosort) return '<span class="dt-h dt-k-' + c.k + (c.left ? " dt-left" : "") + '">' + c.l + "</span>";
        var on = c.k === st.k;
        return '<button class="dt-h dt-k-' + c.k + (c.left ? " dt-left" : "") + (on ? " dt-sorted" : "") + '" data-k="' + c.k + '">' + c.l + (on ? (st.dir < 0 ? " ▾" : " ▴") : "") + "</button>";
      }).join("") + '<span class="dt-h dt-k-buy"></span></div>';
      var body = rows.length ? rows.map(function (r) {
        return '<a class="dt-row" href="' + V.esc(r.href) + '">' + cols.map(function (c) {
          return '<span class="dt-c dt-k-' + c.k + (c.left ? " dt-left" : "") + '">' + cell(r, c.k) + "</span>";
        }).join("") + '<span class="dt-c dt-k-buy"><button class="pulse-buy-btn dt-buy" data-sym="' + V.esc(r.sym) + '"><span class="dt-bw">Buy </span>0.01 ' + V.esc(r.native) + "</button></span></a>";
      }).join("") : '<div class="dt-empty">No tokens on these chains in this tab yet.</div>';
      var custom = st.k !== def.k || st.dir !== def.dir;
      var chip = '<div class="dt-sortchip">Sorted by ' + V.esc(labelOf[st.k] || st.k) + (st.dir < 0 ? ", high first" : ", low first") +
        (custom ? ' <button class="dt-reset">Reset</button>' : "") + "</div>";
      container.innerHTML = chip + '<div class="dt-table' + (opts.extra ? " dt-hasx" : "") + '">' + head + body + "</div>";
      var rs = container.querySelector(".dt-reset");
      if (rs) rs.onclick = function () { st.k = def.k; st.dir = def.dir; draw(); };
      container.querySelectorAll("button.dt-h").forEach(function (b) {
        b.onclick = function () { var k = b.getAttribute("data-k"); if (k === st.k) st.dir = -st.dir; else { st.k = k; st.dir = k === "ageSec" ? 1 : -1; } draw(); };
      });
      container.querySelectorAll(".dt-buy").forEach(function (b) {
        b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); V.toast("Connect a wallet to buy " + b.getAttribute("data-sym") + " in one tap"); };
      });
    }
    draw();
  }

  var GRID = "minmax(200px,2.1fr) 44px 80px 0.9fr 0.8fr 0.8fr 0.9fr 0.7fr 0.8fr minmax(118px,1.1fr) 120px";
  var GRIDX = "minmax(200px,2.1fr) 44px 80px 96px 0.9fr 0.8fr 0.8fr 0.9fr 0.7fr 0.8fr minmax(118px,1.1fr) 120px";
  var css = document.createElement("style");
  css.textContent =
    ".dt-table{background:var(--s1);border:1px solid var(--line);border-radius:8px;overflow:hidden}" +
    ".dt-row{display:grid;grid-template-columns:" + GRID + ";align-items:center;gap:8px;height:44px;padding:0 12px;border-bottom:1px solid var(--line);color:var(--tx);text-decoration:none;font-size:12px;font-variant-numeric:tabular-nums}" +
    ".dt-hasx .dt-row{grid-template-columns:" + GRIDX + "}" +
    "a.dt-row:hover{background:var(--s2)}.dt-head{height:32px;position:sticky;top:0;background:var(--s1);z-index:1}" +
    ".dt-h{background:none;border:0;color:var(--mut);font-size:11px;text-align:right;cursor:pointer;padding:0;white-space:nowrap}span.dt-h{cursor:default}.dt-h.dt-sorted{color:var(--tx)}" +
    ".dt-c{text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.dt-left{text-align:left}" +
    ".dt-k-spark{display:flex;justify-content:flex-end}.dt-k-buy{text-align:right}" +
    ".dt-l1{display:block;overflow:hidden;text-overflow:ellipsis}.dt-sym{font-size:13px;font-weight:600}.dt-pair{color:var(--acc);font-size:11px}.dt-name{color:var(--mut)}" +
    ".dt-2{display:flex;flex-direction:column;align-items:flex-end;line-height:15px}.dt-2 small{font-size:10px;color:var(--mut)}" +
    ".dt-prog{display:flex;flex-direction:column;align-items:flex-end;gap:3px;line-height:12px;font-size:11px}" +
    ".dt-bar{display:block;width:72px;height:4px;background:var(--s2);border-radius:2px;overflow:hidden}.dt-bar i{display:block;height:100%;background:var(--acc)}" +
    ".dt-sortchip{font-size:11px;color:var(--mut);margin:0 0 6px;display:flex;align-items:center;gap:6px}" +
    ".dt-reset{border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;height:24px;padding:0 8px;cursor:pointer;font-size:11px}" +
    ".dt-mchips{display:none}.dt-k-qp .pulse-qproof{font-size:10px}.dt-empty{padding:16px 12px;color:var(--mut);font-size:12px}" +
    "@media (max-width:1180px){.dt-row,.dt-hasx .dt-row{grid-template-columns:minmax(170px,2fr) 72px 0.9fr 0.8fr 0.9fr 0.8fr 96px}.dt-hasx .dt-row{grid-template-columns:minmax(170px,2fr) 72px 90px 0.9fr 0.8fr 0.9fr 0.8fr 96px}" +
    ".dt-k-ageSec,.dt-k-liq,.dt-k-holders,.dt-k-qp{display:none}.dt-mchips{display:flex;gap:4px;align-items:center;margin-top:2px}.dt-mchips .pulse-qproof,.dt-mchips .hk-badge{font-size:9px;padding:0 5px}.dt-c.dt-k-sym{display:flex;flex-direction:column}}" +
    "@media (max-width:767px){.dt-row,.dt-hasx .dt-row{grid-template-columns:minmax(0,1fr) 56px 76px 80px;height:56px;gap:6px;padding:0 10px}" +
    ".dt-k-fees,.dt-k-vol,.dt-k-txs{display:none}.dt-hasx .dt-k-spark{display:none}.dt-hasx .dt-row{grid-template-columns:minmax(0,1fr) 76px 76px 80px}" +
    ".dt-name{display:none}.dt-bar{width:60px}.dt-buy{min-height:44px;width:80px;padding:0 4px;font-size:11px}.dt-bw{display:none}.dt-reset{height:44px;padding:0 12px}.dt-head{height:36px}}";
  document.head.appendChild(css);
  return { render: render };
})();
