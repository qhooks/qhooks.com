/* Portfolio summary row (contract section 5 + parity row "Portfolio"). Written by Claude.
   Three cards: Balance (total, unrealized, tradeable, 7-day line, cashback and rewards earned -> #/rewards),
   Realized PnL bars (1d/7d/30d/Max), Performance (total PnL, TXNs, win rate, five win-rate buckets). */
window.PfSummary = (function () {
  "use strict";
  var V = window.QHView, D = window.PfData;
  var RANGES = [["1d", 1], ["7d", 7], ["30d", 30], ["Max", 90]];
  var range = 7;

  function bars(list, w, h) {
    var max = 0; list.forEach(function (x) { max = Math.max(max, Math.abs(x.v)); });
    max = max || 1;
    var bw = w / list.length, mid = h / 2, out = '<line x1="0" x2="' + w + '" y1="' + mid + '" y2="' + mid + '" stroke="var(--line)"/>';
    list.forEach(function (x, i) {
      var bh = Math.max(x.v ? 1 : 0, (Math.abs(x.v) / max) * (mid - 2)), y = x.v >= 0 ? mid - bh : mid;
      out += '<rect x="' + (i * bw + bw * 0.15).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, bw * 0.7).toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + (x.v >= 0 ? "var(--up)" : "var(--dn)") + '"><title>' + x.d.toDateString() + ": " + V.usd(x.v) + "</title></rect>";
    });
    return '<svg class="ps-bars" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-label="Realized PnL by day">' + out + "</svg>";
  }
  function kv(k, v, c) { return '<div class="ps-kv"><span>' + k + '</span><b class="' + (c || "") + '">' + v + "</b></div>"; }

  function render(root, data) {
    var s = data, total = s.held + s.tradeable;
    var bal = D.series(7).reduce(function (acc, x) { acc.push((acc.length ? acc[acc.length - 1] : total - 900) + x.v); return acc; }, []);
    var realized = 0; D.series(90).forEach(function (x) { realized += x.v; });
    var all = s.history.concat(s.positions), wins = all.filter(function (x) { return x.pnl > 0; }).length;
    var bk = D.buckets(all), n = all.length || 1;

    root.innerHTML = '<div class="ps-row">' +
      '<section class="ps-card ps-bal"><div class="ps-h">Balance</div><div class="ps-split"><div>' +
        '<div class="ps-k">Total value</div><div class="ps-big">' + V.usd(total) + "</div>" +
        kv("Unrealized PnL", V.usd(s.unreal), V.cls(s.unreal)) + kv("Tradeable", V.usd(s.tradeable)) + kv("In tokens", V.usd(s.held)) +
      '</div><div class="ps-line"><div class="ps-k">Last 7 days</div>' + V.spark(bal, 150, 46) + "</div></div>" +
      '<a class="ps-rw" href="#/rewards"><span class="ps-rwk">Earned with QHooks</span><span class="ps-rwv"></span><span class="ps-rwgo">Open rewards</span></a></section>' +
      '<section class="ps-card"><div class="ps-h">Realized PnL <span class="ps-rng"></span></div><div class="ps-rtot"></div><div class="ps-chart"></div></section>' +
      '<section class="ps-card"><div class="ps-h">Performance</div><div class="ps-perf">' +
        kv("Total PnL", V.usd(realized + s.unreal), V.cls(realized + s.unreal)) + kv("Realized, 90 days", V.usd(realized), V.cls(realized)) +
        kv("Trades", '<span class="qv-up">' + s.buys + '</span> / <span class="qv-dn">' + s.sells + "</span>") +
        kv("Win rate", V.pct((wins / n) * 100) + ' <span class="qv-mut">(' + wins + " of " + all.length + ")</span>") +
      '</div><div class="ps-bk">' + bk.map(function (b) {
        return '<div class="ps-bkr"><i style="background:' + b.c + '"></i><span>' + b.l + "</span><b>" + b.n + "</b></div>";
      }).join("") + '</div><div class="ps-seg">' + bk.map(function (b) {
        return b.n ? '<i style="flex:' + b.n + ";background:" + b.c + '" title="' + b.l + ": " + b.n + '"></i>' : "";
      }).join("") + "</div></section></div>";

    function drawRewards(rw) {
      root.querySelector(".ps-rwv").innerHTML = "Cashback <b>" + V.usd(rw.cash) + "</b> · Referrals <b>" + V.usd(rw.ref) + "</b> · Ready to claim <b class=\"ps-acc\">" + V.usd(rw.claim) + "</b>";
    }
    drawRewards(s.rewards);
    D.liveRewards(function (rw) { s.rewards = rw; if (document.body.contains(root)) drawRewards(rw); });

    function drawChart() {
      var list = range === 1 ? D.series(24).map(function (x, i) { var r = V.rng(V.hash("h" + i)); return { d: x.d, v: (r() - 0.45) * 120 }; }) : D.series(range);
      var sum = 0; list.forEach(function (x) { sum += x.v; });
      root.querySelector(".ps-rtot").innerHTML = '<span class="ps-big ' + V.cls(sum) + '">' + V.usd(sum) + '</span> <span class="qv-mut">' + (range === 1 ? "today" : "last " + range + " days") + "</span>";
      root.querySelector(".ps-chart").innerHTML = bars(list, 300, 110);
      root.querySelector(".ps-rng").innerHTML = RANGES.map(function (r) { return '<button class="ps-rb' + (r[1] === range ? " on" : "") + '" data-d="' + r[1] + '">' + r[0] + "</button>"; }).join("");
      root.querySelectorAll(".ps-rb").forEach(function (b) { b.onclick = function () { range = Number(b.getAttribute("data-d")); drawChart(); }; });
    }
    drawChart();
  }

  var css = document.createElement("style");
  css.textContent =
    ".ps-row{display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:8px}" +
    ".ps-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px;min-width:0}" +
    ".ps-h{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:600}.ps-k{font-size:11px;color:var(--mut)}" +
    ".ps-big{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}.ps-split{display:grid;grid-template-columns:1fr 150px;gap:12px;align-items:end}" +
    ".ps-kv{display:flex;justify-content:space-between;gap:8px;font-size:12px;line-height:20px;color:var(--mut)}.ps-kv b{font-weight:600;color:var(--tx);font-variant-numeric:tabular-nums}.ps-kv b.qv-up{color:var(--up)}.ps-kv b.qv-dn{color:var(--dn)}" +
    ".ps-line{display:flex;flex-direction:column;gap:4px}" +
    ".ps-rw{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:auto;padding:8px 10px;border:1px solid rgba(245,181,68,.35);border-radius:6px;background:rgba(245,181,68,.05);color:var(--mut);font-size:12px;text-decoration:none}" +
    ".ps-rw b{color:var(--tx);font-weight:600;font-variant-numeric:tabular-nums}.ps-rw .ps-acc{color:var(--acc)}.ps-rwk{color:var(--acc);font-weight:600}.ps-rwgo{margin-left:auto;color:var(--acc)}" +
    ".ps-rng{display:flex;gap:2px}.ps-rb{background:none;border:1px solid transparent;color:var(--mut);font-size:11px;height:24px;padding:0 8px;border-radius:4px;cursor:pointer}.ps-rb.on{color:var(--tx);border-color:var(--line);background:var(--s2)}" +
    ".ps-rtot{display:flex;align-items:baseline;gap:8px;font-size:12px}.ps-chart{flex:1;min-height:90px}.ps-bars{width:100%;height:100%;min-height:90px;display:block}" +
    ".ps-bk{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-top:2px}.ps-bkr{display:flex;align-items:center;gap:6px;font-size:11px;line-height:18px;color:var(--mut)}.ps-bkr i{width:8px;height:8px;border-radius:2px}.ps-bkr b{margin-left:auto;color:var(--tx);font-weight:600}" +
    ".ps-seg{display:flex;height:4px;border-radius:2px;overflow:hidden;gap:1px;background:var(--s2)}.ps-seg i{display:block}" +
    "@media (max-width:1100px){.ps-row{grid-template-columns:1fr 1fr}.ps-bal{grid-column:1 / -1}}" +
    "@media (max-width:767px){.ps-row{grid-template-columns:1fr}.ps-split{grid-template-columns:1fr 110px}.ps-split .qv-spark{width:110px}.ps-rb{min-height:44px;min-width:44px}.ps-rw{min-height:44px}}";
  document.head.appendChild(css);
  return { render: render };
})();
