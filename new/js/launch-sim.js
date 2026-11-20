/* launch-sim.js: economics simulator before signing (contract 1.6.2), also used on hook pages. Written by Claude.
   Fixture math only, every output labelled "estimate". The fee rate and splits are example inputs; real values are set at launch.
   Cashback 30% and referral 20% come from the approved lines. No template literals. */
window.LaunchSim = (function () {
  "use strict";
  var EX = { fee: 1, creator: 25, holders: 10, buyback: 15, floor: 10, referred: 25, bag: 150, startMc: 5000 };
  var PX = { ETH: 3000, SOL: 150, BNB: 600, USDG: 1 };
  function usd(v) { return window.QHFmt ? window.QHFmt.usd(v) : "$" + Math.round(v); }
  function logv(pos, lo, hi) { return Math.round(lo * Math.pow(hi / lo, pos / 100)); }
  function logp(v, lo, hi) { return Math.round(100 * Math.log(v / lo) / Math.log(hi / lo)); }
  function has(s, id) { return (s.blocks || []).indexOf(id) >= 0; }
  function calc(s) {
    var vol = s.vol || 50000, holders = s.holders || 400, fee = s.fee || EX.fee;
    var pool = vol * fee / 100, out = { pool: pool, rows: [] };
    function add(label, share, note) { out.rows.push({ label: label, v: pool * share / 100, share: share, note: note }); }
    if (has(s, "cashback")) add("Cashback to traders", 30, "30% of the fee");
    if (has(s, "referrals")) add("Referrers", 20 * EX.referred / 100, "20% of the fee on referred trades; assumes a quarter of volume is referred");
    if (has(s, "revshare")) add("Stakers", EX.holders, "example share");
    if (has(s, "buyback")) add("Buyback", EX.buyback, "example share");
    if (has(s, "floor")) add("Floor reserve", EX.floor, "example share");
    add("You, the creator", EX.creator, "example share");
    var used = out.rows.reduce(function (a, r) { return a + r.share; }, 0);
    out.rows.push({ label: "Pool and platform", v: pool * Math.max(0, 100 - used) / 100, share: Math.max(0, 100 - used), note: "split set at launch" });
    out.mc = Math.max(EX.startMc, holders * EX.bag);
    out.creator = pool * EX.creator / 100;
    out.cashPerHolder = has(s, "cashback") ? pool * 0.3 / holders : 0;
    out.buyPct = has(s, "buyback") ? 100 * pool * EX.buyback / 100 / out.mc : 0;
    var unit = s.unit || "ETH", dev = parseFloat(s.dev) || 0, px = PX[unit] || 0;
    out.devPct = dev > 0 && px ? 100 * dev * px / (EX.startMc + dev * px) : 0;
    return out;
  }
  /* Curve chart: market cap against share of curve supply sold; the step to a pool and the first buy are marked with lines. */
  function curve(s, r) {
    var w = 320, h = 120, pts = [], i;
    for (i = 0; i <= 40; i++) { var f = i / 40 * 0.8, y = 1 / Math.pow(1 - f, 2); pts.push([(i / 40) * w, h - 8 - (y - 1) / 24 * (h - 16)]); }
    var line = pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
    var dx = Math.min(w, (r.devPct / 80) * w);
    return '<svg class="ls-svg" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" role="img" aria-label="Curve estimate">' +
      '<polyline points="' + line + '" fill="none" stroke="var(--acc)" stroke-width="2"/>' +
      '<line x1="' + (w - 1) + '" y1="0" x2="' + (w - 1) + '" y2="' + h + '" stroke="var(--up)" stroke-dasharray="3 3"/>' +
      (r.devPct > 0 ? '<line x1="' + dx.toFixed(1) + '" y1="0" x2="' + dx.toFixed(1) + '" y2="' + h + '" stroke="var(--mut)"/>' : "") + "</svg>" +
      '<div class="ls-axis"><span>0% sold</span>' + (r.devPct > 0 ? "<span>Your first buy</span>" : "") + '<span class="ls-up">Moves to a pool (MC set at launch)</span></div>';
  }
  function body(s) {
    var r = calc(s), max = r.rows.reduce(function (a, x) { return Math.max(a, x.v); }, 0) || 1;
    var bars = r.rows.map(function (x) {
      return '<div class="ls-row"><span>' + x.label + '</span><span class="ls-bar"><span style="width:' + Math.round(100 * x.v / max) + '%"></span></span><b>' + usd(x.v) + "</b></div>";
    }).join("");
    return '<div class="ls-kpis"><div><span>You earn / day</span><b>' + usd(r.creator) + "</b></div>" +
      "<div><span>Cashback / holder / day</span><b>" + (r.cashPerHolder ? usd(r.cashPerHolder) : "Off") + "</b></div>" +
      "<div><span>Buyback / day vs MC</span><b>" + (r.buyPct ? r.buyPct.toFixed(r.buyPct < 1 ? 2 : 1) + "%" : "Off") + "</b></div>" +
      "<div><span>Your first buy</span><b>" + (r.devPct ? r.devPct.toFixed(1) + "% of supply" : "None") + "</b></div></div>" +
      '<div class="ls-lab">Where a day of fees goes (' + usd(r.pool) + " in fees at the example rate)</div>" + bars +
      (has(s, "floor") ? '<div class="ls-note">Floor reserve grows about ' + usd(r.pool * EX.floor / 100) + " a day at this volume, more if Buyback also tops it up.</div>" : "") +
      (s.type === "curve" || !s.type ? '<div class="ls-lab">Bonding curve</div>' + curve(s, r) : "") +
      '<div class="ls-note">Assumes an MC near ' + usd(r.mc) + " (holders x " + usd(EX.bag) + " average bag). Real fees and splits are set at launch.</div>";
  }
  /* Randall 2026-11-20: "Hide simulator but those are fine figures". Flip SHOW to bring it back. */
  var SHOW = false;
  function html(s) {
    if (!SHOW) return "";
    var vp = logp(s.vol || 50000, 1000, 1000000), hp = logp(s.holders || 400, 10, 10000);
    return '<section class="ls"><div class="ls-head"><b>Economics</b><span class="ls-est">Estimate</span></div>' +
      '<label class="ls-sl"><span>Daily buy volume <b data-o="vol">' + usd(s.vol || 50000) + '</b></span><input type="range" min="0" max="100" value="' + vp + '" data-sim="vol"></label>' +
      '<label class="ls-sl"><span>Holders <b data-o="holders">' + (s.holders || 400).toLocaleString("en-US") + '</b></span><input type="range" min="0" max="100" value="' + hp + '" data-sim="holders"></label>' +
      '<label class="ls-sl"><span>Example fee rate <b data-o="fee">' + (s.fee || EX.fee).toFixed(1) + '%</b> <span class="ls-ph">placeholder, real fee set at launch</span></span><input type="range" min="2" max="30" value="' + Math.round((s.fee || EX.fee) * 10) + '" data-sim="fee"></label>' +
      '<div class="ls-body">' + body(s) + "</div></section>";
  }
  /* Wire sliders inside root; s is mutated; onChange(s) lets the caller autosave. Only the outputs redraw. */
  function bind(root, s, onChange) {
    if (!SHOW) return;
    root.addEventListener("input", function (e) {
      var k = e.target.getAttribute && e.target.getAttribute("data-sim"); if (!k) return;
      var v = +e.target.value;
      if (k === "vol") s.vol = logv(v, 1000, 1000000);
      if (k === "holders") s.holders = logv(v, 10, 10000);
      if (k === "fee") s.fee = v / 10;
      var o = root.querySelector('[data-o="' + k + '"]');
      if (o) o.textContent = k === "vol" ? usd(s.vol) : k === "holders" ? s.holders.toLocaleString("en-US") : s.fee.toFixed(1) + "%";
      var b = root.querySelector(".ls-body"); if (b) b.innerHTML = body(s);
      if (onChange) onChange(s);
    });
  }
  return { html: html, bind: bind, calc: calc };
})();
