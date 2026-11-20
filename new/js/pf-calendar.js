/* PnL calendar (parity row "Portfolio": GMGN-style month grid). Written by Claude.
   Each day is tinted green or red by the size of that day's realized PnL relative to the month's biggest day.
   The header shows the month's net, winning days, losing days and win rate; arrows step through months. */
window.PfCalendar = (function () {
  "use strict";
  var V = window.QHView, D = window.PfData;
  var WD = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var offset = 0;

  function short(v) {
    if (!V.ok(v) || v === 0) return "";
    var a = Math.abs(v), s = v < 0 ? "-" : "+";
    return s + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + "K" : Math.round(a));
  }

  function render(root) {
    var now = new Date(), first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    var days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
    var vals = [], max = 0, net = 0, win = 0, loss = 0;
    for (var d = 1; d <= days; d++) {
      var v = D.daily(new Date(first.getFullYear(), first.getMonth(), d));
      vals.push(v);
      if (v != null) { max = Math.max(max, Math.abs(v)); net += v; if (v > 0) win++; else if (v < 0) loss++; }
    }
    var cells = "";
    for (var i = 0; i < lead; i++) cells += '<span class="pc-d pc-pad"></span>';
    var today = now.getDate(), isThis = offset === 0;
    vals.forEach(function (v, i2) {
      var day = i2 + 1, style = "", cls = "pc-d";
      if (v == null) cls += " pc-fut";
      else if (v !== 0) {
        var a = 0.12 + 0.6 * Math.sqrt(Math.abs(v) / (max || 1));
        style = ' style="background:' + (v > 0 ? "rgba(46,229,157," : "rgba(255,77,94,") + a.toFixed(2) + ')"';
      }
      if (isThis && day === today) cls += " pc-today";
      cells += '<span class="' + cls + '"' + style + ' title="' + (v == null ? "" : V.usd(v)) + '"><i>' + day + "</i><b>" + short(v) + "</b></span>";
    });
    var rate = win + loss ? (win / (win + loss)) * 100 : NaN;
    root.innerHTML = '<section class="pc-card"><div class="pc-top"><b>PnL calendar</b><span class="pc-nav">' +
      '<button class="pc-prev" aria-label="Previous month">‹</button><span class="pc-m">' + MONTHS[first.getMonth()] + " " + first.getFullYear() + "</span>" +
      '<button class="pc-next" aria-label="Next month"' + (offset >= 0 ? " disabled" : "") + ">›</button></span></div>" +
      '<div class="pc-stats"><span>Net <b class="' + V.cls(net) + '">' + V.usd(net) + "</b></span><span>Winning days <b class=\"qv-up\">" + win +
      "</b></span><span>Losing days <b class=\"qv-dn\">" + loss + "</b></span><span>Win rate <b>" + V.pct(rate) + "</b></span></div>" +
      '<div class="pc-grid">' + WD.map(function (w) { return '<span class="pc-wd">' + w + "</span>"; }).join("") + cells + "</div></section>";
    root.querySelector(".pc-prev").onclick = function () { offset--; render(root); };
    root.querySelector(".pc-next").onclick = function () { if (offset < 0) { offset++; render(root); } };
  }

  var css = document.createElement("style");
  css.textContent =
    ".pc-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px}" +
    ".pc-top{display:flex;align-items:center;justify-content:space-between;font-size:13px}.pc-nav{display:flex;align-items:center;gap:6px;font-size:12px}" +
    ".pc-nav button{width:26px;height:26px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;cursor:pointer;font-size:14px;line-height:1}.pc-nav button:disabled{opacity:.35;cursor:default}" +
    ".pc-m{min-width:110px;text-align:center}" +
    ".pc-stats{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11px;color:var(--mut)}.pc-stats b{font-weight:600;color:var(--tx);font-variant-numeric:tabular-nums}.pc-stats b.qv-up{color:var(--up)}.pc-stats b.qv-dn{color:var(--dn)}" +
    ".pc-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.pc-wd{font-size:10px;color:var(--mut);text-align:center;line-height:16px}" +
    ".pc-d{height:38px;border-radius:4px;background:var(--s2);display:flex;flex-direction:column;justify-content:space-between;padding:3px 4px;font-variant-numeric:tabular-nums;min-width:0;overflow:hidden}" +
    ".pc-d i{font-style:normal;font-size:10px;color:var(--mut)}.pc-d b{font-size:10px;font-weight:600;text-align:right;color:var(--tx)}" +
    ".pc-pad{background:none}.pc-fut{opacity:.4}.pc-today{box-shadow:inset 0 0 0 1px var(--acc)}" +
    "@media (max-width:767px){.pc-nav button{width:44px;height:44px}.pc-d{height:40px}}";
  document.head.appendChild(css);
  return { render: render };
})();
