/* Perps order panel UI: side, type, size, leverage, TP/SL, live estimates. It never signs and never sends:
   "Place order" only explains that the user's own wallet places orders through the QHooks perps route. Written by Claude. */
window.PerpsOrder = (function () {
  "use strict";
  var F = window.PerpsFeed, TAKER = 0.00045, MAKER = 0.00015;
  var st = { side: "long", type: "market", lev: 10, maxLev: 20, coin: "" }, R = {};

  function seg(labels, key, cls) {
    var w = F.el("div", "ppo-seg " + cls);
    labels.forEach(function (l) {
      var b = F.el("button", "ppo-sb", l[1]); b.type = "button"; b.setAttribute("data-v", l[0]);
      b.addEventListener("click", function () { st[key] = l[0]; sync(); });
      w.appendChild(b);
    });
    return w;
  }
  function field(label, ph, unit) {
    var w = F.el("label", "ppo-f"); w.appendChild(F.el("span", "ppo-fl", label));
    var i = F.el("input", "ppo-in"); i.type = "text"; i.inputMode = "decimal"; i.placeholder = ph; i.autocomplete = "off";
    w.appendChild(i); if (unit) w.appendChild(F.el("span", "ppo-u", unit));
    i.addEventListener("input", calc);
    return { w: w, i: i };
  }
  function line(label) { var r = F.el("div", "ppo-ln"); r.appendChild(F.el("span", "", label)); var v = F.el("b", "", F.DASH); r.appendChild(v); R.lines.appendChild(r); return v; }
  function ref() { var S = window.PerpsState; return F.num(S.last) || F.num(S.mid) || F.num(S.mark); }
  function calc() {
    try {
      var entry = st.type === "limit" ? F.num(R.px.i.value) : ref(), usd = F.num(R.size.i.value), lev = st.lev;
      var mmr = 1 / (2 * st.maxLev), ok = isFinite(entry) && entry > 0;
      var liq = !ok ? NaN : st.side === "long" ? entry * (1 - 1 / lev) / (1 - mmr) : entry * (1 + 1 / lev) / (1 + mmr);
      if (liq < 0) liq = NaN;
      var rate = st.type === "limit" ? MAKER : TAKER;
      R.entry.textContent = F.px(entry);
      R.qty.textContent = ok && usd > 0 ? F.sz(usd / entry, 4) + " " + st.coin : F.DASH;
      R.margin.textContent = usd > 0 ? F.usd(usd / lev) : F.DASH;
      R.liq.textContent = usd > 0 ? F.px(liq) : F.DASH;
      R.liq.className = st.side === "long" ? "dn" : "up";
      R.dist.textContent = usd > 0 && ok && isFinite(liq) ? F.pct((liq - entry) / entry * 100, 1) : F.DASH;
      R.fee.textContent = usd > 0 ? F.usd(usd * rate) + " (" + (rate * 100).toFixed(3) + "% " + (st.type === "limit" ? "maker" : "taker") + ")" : (rate * 100).toFixed(3) + "% " + (st.type === "limit" ? "maker" : "taker");
    } catch (x) { [R.entry, R.qty, R.margin, R.liq, R.dist, R.fee].forEach(function (e) { e.textContent = F.DASH; }); }
  }
  function sync() {
    R.side.querySelectorAll(".ppo-sb").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === st.side); });
    R.type.querySelectorAll(".ppo-sb").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === st.type); });
    R.side.setAttribute("data-side", st.side);
    R.px.w.style.display = st.type === "limit" ? "" : "none";
    if (st.type === "limit" && !R.px.i.value) { var p = ref(); if (isFinite(p)) R.px.i.value = String(+p.toPrecision(6)); }
    R.go.className = "ppo-go " + (st.side === "long" ? "long" : "short");
    R.go.textContent = "Place order";
    R.note.style.display = "none";
    calc();
  }
  function setLev(v) {
    st.lev = Math.max(1, Math.min(st.maxLev, Math.round(F.num(v)) || 1));
    R.slider.value = String(st.lev); R.levv.textContent = st.lev + "x";
    R.slider.style.setProperty("--p", ((st.lev - 1) / Math.max(1, st.maxLev - 1) * 100).toFixed(1) + "%");
    calc();
  }
  function mount(root) {
    root.textContent = ""; R = {};
    R.side = seg([["long", "Long"], ["short", "Short"]], "side", "ppo-side");
    R.type = seg([["market", "Market"], ["limit", "Limit"]], "type", "ppo-type");
    root.appendChild(R.side); root.appendChild(R.type);
    R.px = field("Limit price", "0.00", "USD"); root.appendChild(R.px.w);
    R.size = field("Size", "0", "USD"); root.appendChild(R.size.w);
    var q = F.el("div", "ppo-quick");
    [100, 500, 1000, 5000].forEach(function (v) {
      var b = F.el("button", "pz-chip", F.usd(v)); b.type = "button"; b.addEventListener("click", function () { R.size.i.value = String(v); calc(); }); q.appendChild(b);
    });
    root.appendChild(q);
    var lw = F.el("div", "ppo-lev"), lh = F.el("div", "ppo-ln");
    lh.appendChild(F.el("span", "", "Leverage · isolated")); R.levv = F.el("b", "", "10x"); lh.appendChild(R.levv); lw.appendChild(lh);
    R.slider = F.el("input", "ppo-slider"); R.slider.type = "range"; R.slider.min = "1"; R.slider.step = "1"; R.slider.setAttribute("aria-label", "Leverage");
    R.slider.addEventListener("input", function () { setLev(R.slider.value); }); lw.appendChild(R.slider);
    R.levmax = F.el("div", "ppo-levs"); lw.appendChild(R.levmax); root.appendChild(lw);
    var tpsl = F.el("div", "ppo-tpsl"); R.tp = field("Take profit", "Price", ""); R.sl = field("Stop loss", "Price", "");
    tpsl.appendChild(R.tp.w); tpsl.appendChild(R.sl.w); root.appendChild(tpsl);
    R.lines = F.el("div", "ppo-lines"); root.appendChild(R.lines);
    R.entry = line(st.type === "limit" ? "Entry" : "Entry (est.)"); R.qty = line("Position"); R.margin = line("Margin needed");
    R.liq = line("Est. liq. price"); R.dist = line("Liq. distance"); R.fee = line("Exchange fee");
    var bl = F.el("div", "ppo-ln"); bl.appendChild(F.el("span", "", "QHooks builder fee")); bl.appendChild(F.el("b", "", "Shown before you sign")); R.lines.appendChild(bl);
    R.go = F.el("button", "ppo-go long", "Place order"); R.go.type = "button"; root.appendChild(R.go);
    R.note = F.el("div", "ppo-note", ""); R.note.style.display = "none"; root.appendChild(R.note);
    R.go.addEventListener("click", function () {
      R.note.textContent = "Nothing was sent. Orders are signed and placed by your own wallet through the QHooks perps route (prepare_perps_order). Connect a wallet to review and sign this " + st.side + " order.";
      R.note.style.display = "";
    });
    var pos = F.el("div", "ppo-pos"); pos.appendChild(F.el("div", "pz-pt", "Positions"));
    pos.appendChild(F.el("div", "pz-sub", "Connect a wallet to see open positions and orders.")); root.appendChild(pos);
    F.every(calc, 1000);
    sync();
  }
  function setCoin(c, inf) {
    st.coin = c; st.maxLev = inf && inf.maxLev > 0 ? inf.maxLev : 20;
    R.slider.max = String(st.maxLev); R.levmax.textContent = "";
    [1, Math.round(st.maxLev / 4), Math.round(st.maxLev / 2), st.maxLev].forEach(function (v) {
      var b = F.el("button", "ppo-lv", Math.max(1, v) + "x"); b.type = "button"; b.addEventListener("click", function () { setLev(v); }); R.levmax.appendChild(b);
    });
    R.px.i.value = ""; R.size.w.querySelector(".ppo-u").textContent = "USD";
    setLev(Math.min(st.lev, st.maxLev)); sync();
  }
  return { mount: mount, setCoin: setCoin };
})();
