/* Live trade estimate (contract 1.4.11) + trade feedback states (1.2.7).
   Written by Claude. Fixture math until real quotes are wired:
   native price NATIVE_USD, QHooks router fee 1%, cashback 30% of that fee,
   network fee NET_FEE native, price impact = order USD / liquidity. */
window.TradeEstimate = (function () {
  "use strict";
  var NATIVE_USD = 3000, ROUTER_FEE = 0.01, CASHBACK = 0.30, NET_FEE = 0.0004, SLIP = 0.20;

  function usd(v) {
    if (!isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(2) + "K";
    if (a >= 1) return "$" + v.toFixed(2);
    return "$" + v.toFixed(4);
  }
  function num(v) {
    if (!isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(2) + "K";
    return v.toFixed(a >= 1 ? 2 : 6);
  }
  function line(label, value, cls) {
    return '<div class="te-line' + (cls ? " " + cls : "") + '"><span>' + label + "</span><b>" + value + "</b></div>";
  }

  function compute(tok, amt, side) {
    var price = Number(tok.price) || 0, liq = Number(tok.liquidity) || 0, supply = Number(tok.supply) || 1e8;
    var orderUsd = amt * NATIVE_USD;
    var feeNative = amt * ROUTER_FEE, back = feeNative * CASHBACK;
    var impact = liq > 0 ? (orderUsd / liq) * 100 : NaN;
    var effPrice = price * (1 + (isFinite(impact) ? impact / 100 : 0) * (side === "buy" ? 1 : -1));
    var tokens = effPrice > 0 ? (orderUsd - feeNative * NATIVE_USD) / effPrice : NaN;
    return {
      orderUsd: orderUsd, feeNative: feeNative, back: back, impact: impact, tokens: tokens,
      minTokens: tokens * (1 - SLIP), total: amt + NET_FEE, share: tokens / supply * 100, effPrice: effPrice
    };
  }

  function render(box, tok, amt, side) {
    if (!(amt > 0)) { box.innerHTML = '<div class="te-empty">Enter an amount to see what you get</div>'; return; }
    var r = compute(tok, amt, side), sym = tok.symbol || "";
    var h = side === "buy"
      ? line("You receive ≈", num(r.tokens) + " " + sym + " (" + usd(r.tokens * r.effPrice) + ")") + line("Min received", num(r.minTokens) + " " + sym)
      : line("You receive ≈", num(amt * (1 - ROUTER_FEE)) + " ETH (" + usd(amt * (1 - ROUTER_FEE) * NATIVE_USD) + ")");
    h += line("Price impact", isFinite(r.impact) ? r.impact.toFixed(2) + "%" : "—", r.impact >= 5 ? "te-bad" : "");
    h += line("QHooks fee (1%)", num(r.feeNative) + " ETH · " + usd(r.feeNative * NATIVE_USD));
    h += line("Network fee", num(NET_FEE) + " ETH · " + usd(NET_FEE * NATIVE_USD));
    h += line("Cashback (30%)", "−" + num(r.back) + " ETH · " + usd(r.back * NATIVE_USD), "te-good");
    h += line("Total", num(r.total) + " ETH · " + usd(r.total * NATIVE_USD), "te-total");
    if (side === "buy") h += line("Position", num(r.tokens) + " " + sym + " · " + (isFinite(r.share) ? r.share.toFixed(3) : "—") + "% of supply");
    h += '<div class="te-age">Quote · <span class="te-sec">0</span>s</div>';
    box.innerHTML = h;
  }

  function toast(text) {
    var stack = document.querySelector(".te-toasts");
    if (!stack) { stack = document.createElement("div"); stack.className = "te-toasts"; document.body.appendChild(stack); }
    var t = document.createElement("div"); t.className = "te-toast"; t.textContent = text; stack.appendChild(t);
    setTimeout(function () { t.remove(); }, 5000);
  }

  function attach(root, tok) {
    var side = "buy", input = root.querySelector(".tp-input"), go = root.querySelector(".tp-go");
    var meta = root.querySelector(".tp-meta");
    if (!input || !go || !meta) return;
    var box = document.createElement("div"); box.className = "te-box"; meta.parentNode.insertBefore(box, meta.nextSibling);
    var timer = null, age = 0;
    function update() { render(box, tok, parseFloat(input.value), side); age = 0; }
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(update, 150); });
    root.querySelectorAll(".tp-amt").forEach(function (b) { b.addEventListener("click", function () { input.value = b.textContent; update(); }); });
    var buyB = root.querySelector(".tp-buy"), sellB = root.querySelector(".tp-sell");
    function setSide(s) {
      side = s; if (buyB) buyB.classList.toggle("active", s === "buy"); if (sellB) sellB.classList.toggle("active", s === "sell");
      go.classList.toggle("tp-go-sell", s === "sell"); go.textContent = (s === "buy" ? "Buy " : "Sell ") + (tok.symbol || ""); update();
    }
    if (buyB) buyB.addEventListener("click", function () { setSide("buy"); });
    if (sellB) sellB.addEventListener("click", function () { setSide("sell"); });
    setInterval(function () { age++; var s = box.querySelector(".te-sec"); if (s) s.textContent = age; if (age >= 3 && parseFloat(input.value) > 0) update(); }, 1000);
    go.addEventListener("click", function () {
      var amt = parseFloat(input.value);
      if (!(amt > 0)) { input.focus(); return; }
      var label = go.textContent, steps = ["Quoting…", "Sign in wallet…", "Sending…", "Confirming…"], i = 0;
      go.disabled = true;
      (function next() {
        if (i < steps.length) { go.textContent = steps[i++]; setTimeout(next, 450); return; }
        var r = compute(tok, amt, side);
        go.textContent = "Filled at " + usd(r.effPrice);
        toast((side === "buy" ? "Bought " : "Sold ") + num(side === "buy" ? r.tokens : amt) + " " + (tok.symbol || "") + " at " + usd(r.effPrice));
        setTimeout(function () { go.textContent = label; go.disabled = false; }, 1800);
      })();
    });
    update();
  }
  return { attach: attach, compute: compute };
})();
