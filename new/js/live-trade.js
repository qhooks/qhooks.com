/* live-trade.js: the token page trade panel on the live routes. Written by Claude.
   - Estimate: GET /api/v1/agent/quote (the pool's own quoter, so hook charges are included), on input and then
     every 10 s while an amount is entered and the tab is visible. Cost: one eth_call (about 26 CU) per quote,
     so at most about 360 quotes / 9.4K CU per hour for one visitor with the panel open and an amount typed.
     Solana: GET /api/terminal/sol/order (needs the connected Solana wallet as taker), same 10 s cadence.
   - Buy/Sell, in-page (2026-11-20): one-click first when the visitor turned it on (oneclick.js); otherwise
     POST /api/v1/agent/prepare-trade and QHSign.evm sends approval then swap to the visitor's own wallet, one
     receipt at a time. Solana signs in Phantom (QHSign.sol). States on the button and in a toast (contract 1.2.7).
   - QHooks fee 1% on the input of a buy (as prepare-trade charges it); cashback is 30% of that fee. */
(function () {
  "use strict";
  var F = window.QHFmt, FEE = 0.01, BACK = 0.30, SLIP_BPS = 100, SOL = "So11111111111111111111111111111111111111112";
  var HEX = window.QHSign.HEX;

  function toWei(v, dec) {
    var s = String(v).trim(); if (!/^\d*\.?\d*$/.test(s) || !s || s === ".") return null;
    var p = s.split("."), frac = (p[1] || "").slice(0, dec); while (frac.length < dec) frac += "0";
    var w = (p[0] || "0") + frac; w = w.replace(/^0+/, ""); return w || null;
  }
  function fromWei(w, dec) { var n = Number(w); return isFinite(n) ? n / Math.pow(10, dec) : NaN; }
  function line(k, v, c) { return "<div class='te-line" + (c ? " " + c : "") + "'><span>" + k + "</span><b>" + v + "</b></div>"; }

  function attach(root, tok) {
    var panel = root.querySelector(".token-trade-panel"); if (!panel) return null;
    var t = tok, side = "buy", input = panel.querySelector(".tp-input"), go = panel.querySelector(".tp-go"), meta = panel.querySelector(".tp-meta");
    var box = document.createElement("div"); box.className = "te-box"; meta.parentNode.insertBefore(box, meta.nextSibling);
    var stat = document.createElement("div"); stat.className = "lt-status"; stat.setAttribute("role", "status"); stat.setAttribute("aria-live", "polite"); go.parentNode.insertBefore(stat, go.nextSibling);
    meta.innerHTML = "<span>Slippage 1%</span><span class='lt-unit'></span>";
    var tabs = panel.querySelector(".tp-tabs"); if (tabs) tabs.innerHTML = "<button class='active'>Market</button><a class='lt-more' href='https://qhooks.com/terminal' target='_blank' rel='noopener'>Limit and advanced on qhooks.com</a>";
    var pre = panel.querySelector(".tp-presets"); if (pre) pre.remove();
    var st = panel.querySelector(".tp-stats"); if (st) st.innerHTML = "<div>Bought<b>—</b></div><div>Sold<b>—</b></div><div>Holding<b>—</b></div><div>Trades<b>—</b></div>";
    var isSol = t.chainId === "solana", can = isSol || !!HEX[t.chainId], seq = 0, last = null, age = 0, decimals = 18, busy = false, solDec = null;
    var cb = panel.querySelector(".tp-cashback"); if (cb && !can) cb.style.display = "none";
    function unit() { return side === "buy" ? (isSol ? "SOL" : t.quoteSymbol || t.native) : t.symbol; }
    function label() { return (side === "buy" ? "Buy " : "Sell ") + (t.symbol || ""); }
    function setSide(s) {
      side = s; panel.querySelector(".tp-buy").classList.toggle("active", s === "buy"); panel.querySelector(".tp-sell").classList.toggle("active", s === "sell");
      go.classList.toggle("tp-go-sell", s === "sell"); if (!busy) go.textContent = label();
      panel.querySelectorAll(".tp-amt").forEach(function (b, i) { b.textContent = s === "buy" ? ["0.001", "0.005", "0.01", "0.05"][i] : ["1K", "10K", "100K", "1M"][i]; });
      panel.querySelector(".lt-unit").textContent = "Amount in " + unit(); quote();
    }
    function amount() { var v = String(input.value).replace(/k$/i, "000").replace(/m$/i, "000000"); return parseFloat(v) > 0 ? v : null; }
    function solMe() { var c = window.QHWallet.current(); return c && c.family === "solana" ? c : null; }
    function solAmount(a) {
      if (side === "buy") return Promise.resolve(toWei(a, 9));
      return window.QHSign.solDecimals(solMe().address, t.address).then(function (d) { solDec = d; return d == null ? null : toWei(a, d); });
    }
    function quote() {
      var a = amount(), my = ++seq;
      if (!can) { box.innerHTML = "<div class='te-empty'>Trading this token opens in the QHooks terminal.</div>"; return; }
      if (!a) { box.innerHTML = "<div class='te-empty'>Enter an amount to see what you get</div>"; return; }
      if (isSol) { solQuote(a, my); return; }
      var inWei = toWei(side === "buy" ? String(parseFloat(a) * (1 - FEE)) : a, decimals);
      if (!inWei) { box.innerHTML = "<div class='te-empty'>Check the amount</div>"; return; }
      box.innerHTML = box.querySelector(".te-line") ? box.innerHTML : "<div class='te-empty'>Getting a quote</div>";
      window.QHLive.quote({ chain: t.chainId, token: t.address, side: side, amountIn: inWei }).then(function (r) {
        if (my !== seq || !box.isConnected) return;
        if (!r.ok || !r.body || !r.body.amountOut) { box.innerHTML = "<div class='te-empty'>" + (r.status === 404 ? "This token trades in the QHooks terminal for now." : "No quote right now. It refreshes on its own.") + "</div>"; return; }
        last = r.body; age = 0; paint(a);
      });
    }
    function solQuote(a, my) {
      var me = solMe();
      if (!me) { box.innerHTML = "<div class='te-empty'>Connect Phantom to see your quote</div>"; return; }
      solAmount(a).then(function (amt) {
        if (!amt) throw new Error("Refreshing token details");
        return window.QHSign.solOrder({ input: side === "buy" ? SOL : t.address, output: side === "buy" ? t.address : SOL, amount: amt, taker: me.address, slippageBps: SLIP_BPS });
      }).then(function (r) {
        if (my !== seq || !box.isConnected) return;
        if (!r.ok || !r.body || !r.body.outAmount) { box.innerHTML = "<div class='te-empty'>" + F.esc((r.body && (r.body.detail || r.body.error)) || "No quote right now. It refreshes on its own.") + "</div>"; return; }
        last = r.body; age = 0;
        var outDec = side === "buy" ? solDec : 9, sym = side === "buy" ? t.symbol : "SOL", out = outDec == null ? null : fromWei(last.outAmount, outDec);
        box.innerHTML = (out == null ? line("You receive ≈", F.usd(last.outUsdValue) + " of " + F.esc(sym)) : line("You receive ≈", F.num(out) + " " + F.esc(sym)) + line("Min received", F.num(fromWei(last.minOut || 0, outDec)) + " " + F.esc(sym))) +
          (F.ok(last.priceImpact) ? line("Price impact", F.pct(Math.abs(last.priceImpact))) : "") + "<div class='te-age'>Quote · <span class='te-sec'>0</span>s</div>";
      }).catch(function (e) { if (my === seq) box.innerHTML = "<div class='te-empty'>" + F.esc(e.message) + "</div>"; });
    }
    function paint(a) {
      var out = fromWei(last.amountOut, decimals), amt = parseFloat(a), q = t.quoteSymbol || t.native, px = t.price;
      var fee = side === "buy" ? amt * FEE : NaN, gotUsd = side === "buy" ? out * px : NaN;
      var h = side === "buy" ? line("You receive ≈", F.num(out) + " " + F.esc(t.symbol) + " (" + F.usd(gotUsd) + ")") + line("Min received", F.num(out * (1 - SLIP_BPS / 10000)) + " " + F.esc(t.symbol))
        : line("You receive ≈", F.num(out) + " " + F.esc(q)) + line("Min received", F.num(out * (1 - SLIP_BPS / 10000)) + " " + F.esc(q));
      if (side === "buy") { h += line("QHooks fee (1%)", F.num(fee) + " " + F.esc(q)); h += line("Cashback (30%)", "−" + F.num(fee * BACK) + " " + F.esc(q), "te-good"); }
      h += line("Network gas", F.int(last.gasEstimate) + " units");
      h += "<div class='te-age'>Quote · <span class='te-sec'>0</span>s</div>";
      box.innerHTML = h;
      var gl = document.querySelector(".fl-gasline"); if (gl) gl.textContent = "Gas for this swap: about " + F.int(last.gasEstimate) + " units, paid in " + t.native;
    }
    var timer = null;
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(quote, 350); });
    panel.querySelectorAll(".tp-amt").forEach(function (b) { b.addEventListener("click", function () { input.value = b.textContent; quote(); }); });
    panel.querySelector(".tp-buy").addEventListener("click", function () { setSide("buy"); });
    panel.querySelector(".tp-sell").addEventListener("click", function () { setSide("sell"); });
    var iv = setInterval(function () {
      if (!panel.isConnected) { clearInterval(iv); return; }
      age++; var s = box.querySelector(".te-sec"); if (s) s.textContent = age;
      if (age >= 10 && amount() && !document.hidden && !busy) { age = 0; quote(); }
    }, 1000);
    go.addEventListener("click", function (e) { e.preventDefault(); if (!busy) trade(); });
    var offW = window.QHWallet.on(function () { if (panel.isConnected) quote(); else offW(); });

    /* Button + toast states: Preparing → Sign → Sending → Confirming → Filled, or the exact error with Retry. */
    function say(text, cls) { go.textContent = text; stat.className = "lt-status" + (cls ? " " + cls : ""); }
    function settle(ok, text) {
      busy = false; go.disabled = false; stat.textContent = text || ""; stat.className = "lt-status " + (ok ? "lt-ok" : "lt-bad");
      go.textContent = ok ? label() : "Retry";
    }
    function trade() {
      var a = amount();
      if (!can) { window.open("https://qhooks.com/terminal#t=" + t.chainId + ":" + t.address, "_blank", "noopener"); return; }
      if (!a) { input.focus(); return; }
      var title = (side === "buy" ? "Buy " : "Sell ") + F.esc(a) + " " + unit() + (side === "buy" ? " of " + t.symbol : ""), tt = window.QHSign.toast({ title: title, chainId: t.chainId });
      busy = true; go.disabled = true; say("Preparing"); stat.textContent = "";
      function on(s, d) {
        if (s === "switch") say("Checking network");
        if (s === "sign") say(d.n > 1 ? "Sign " + d.i + " of " + d.n + (d.kind === "approve" ? " · approval" : " · swap") : "Sign in your wallet");
        if (s === "sending") say("Sending");
        if (s === "sent") { say(d.n > 1 && d.i < d.n ? "Confirming approval" : "Confirming"); tt.set("submitted", { text: d.kind === "approve" ? "Approval submitted" : "Submitted", hash: d.hash }); }
      }
      function fail(err) {
        var why = window.QHSign.reason(err); settle(false, why);
        tt.set("failed", { text: why, hash: err && err.hash, retry: function () { if (!busy) trade(); } });
      }
      function filled(hash, confirmed) {
        settle(true, confirmed ? "Filled · " + F.short(hash) : "Sent · confirming on the explorer");
        tt.set(confirmed ? "confirmed" : "submitted", { text: confirmed ? "Confirmed" : "Sent, still confirming", hash: hash });
        input.value = ""; quote(); positions(); try { window.dispatchEvent(new CustomEvent("qh-traded", { detail: { chainId: t.chainId, token: t.address, side: side, hash: hash } })); } catch (x) {}
      }
      if (isSol) {
        window.QHWallet.ensure("solana").then(function (me) {
          if (!me) throw new Error("Connect Phantom to trade this token.");
          return solAmount(a).then(function (amt) {
            if (!amt) throw new Error("Refreshing token details. Try again in a moment.");
            say("Getting the route");
            return window.QHSign.solOrder({ input: side === "buy" ? SOL : t.address, output: side === "buy" ? t.address : SOL, amount: amt, taker: me.address, slippageBps: SLIP_BPS });
          }).then(function (r) {
            if (!r.ok || !r.body || !r.body.transaction) throw new Error((r.body && (r.body.detail || r.body.error)) || "No route for this trade right now.");
            return window.QHSign.sol({ session: me, order: r.body, on: on });
          });
        }).then(function (x) { filled(x.signature, x.confirmed); }).catch(fail);
        return;
      }
      var wei = toWei(a, decimals), oc = window.QHOneClick && window.QHOneClick.isOn();
      (oc ? window.QHOneClick.trade({ chainId: t.chainId, token: t.address, side: side, amountWei: wei, slippageBps: SLIP_BPS }) : Promise.resolve(null)).then(function (r) {
        if (r && r.hashes && r.hashes.length) {
          var h = r.hashes[r.hashes.length - 1], me = window.QHWallet.current(); say("Confirming"); tt.set("submitted", { text: "Sent with one-click", hash: h });
          return (me && me.provider ? window.QHSign.receipt(me.provider, h) : Promise.resolve(null)).then(function (rc) { filled(h, !!rc); return "done"; });
        }
        return window.QHWallet.ensure("evm");
      }).then(function (me) {
        if (me === "done") return null;
        if (!me) throw new Error("Connect a wallet to trade.");
        return window.QHLive.prepareTrade({ chain: t.chainId, token: t.address, side: side, amountIn: wei, slippageBps: SLIP_BPS, trader: me.address }).then(function (r) {
          if (!r.ok || !r.body || !Array.isArray(r.body.transactions)) throw new Error((r.body && (r.body.error || r.body.message)) || "Could not prepare this trade.");
          return window.QHSign.evm({ provider: me.provider, from: me.address, chainId: t.chainId, txs: r.body.transactions, on: on });
        }).then(function (x) { filled(x.hashes[x.hashes.length - 1], true); });
      }).catch(fail);
    }
    setSide("buy");
    var lastSig = t.symbol + "|" + t.quoteSymbol, lastKind = t.kind;
    function positions() {
      var w = window.QHLive.wallet(); if (!w || t.kind !== "qhooks" || !/^0x/.test(w)) return;
      window.QHLive.positions(w).then(function (r) {
        var p = r.ok && r.body && (r.body.positions || []).filter(function (x) { return String(x.chainId) === t.chainId && String(x.controller).toLowerCase() === (t.controller || t.address); })[0];
        if (!p || !st || !st.isConnected) return;
        st.innerHTML = "<div>Bought<b>" + F.num(p.bought) + "</b></div><div>Sold<b>" + F.num(p.sold) + "</b></div><div>Holding<b>" + F.num(p.balance) + "</b></div><div>Trades<b>" + F.int(p.trades) + "</b></div>";
      });
    }
    positions();
    var amt0 = null; try { amt0 = sessionStorage.getItem("qh-quick-amt"); sessionStorage.removeItem("qh-quick-amt"); } catch (x) {}
    if (amt0 && parseFloat(amt0) > 0) { input.value = amt0; quote(); }
    return { update: function (nt) {
      var sig = nt.symbol + "|" + nt.quoteSymbol, re = sig !== lastSig, k = nt.kind !== lastKind; t = nt; lastSig = sig; lastKind = nt.kind;
      if (re) setSide(side); if (k) positions();
    } };
  }

  var css = document.createElement("style");
  css.textContent = ".lt-more{font-size:11px;color:var(--mut);align-self:center;margin-left:auto;text-decoration:none}.tp-go:disabled{opacity:.8;cursor:default}" +
    ".lt-status{font-size:12px;min-height:0;margin-top:6px;overflow-wrap:anywhere}.lt-status:empty{display:none}.lt-ok{color:var(--up)}.lt-bad{color:var(--dn)}";
  document.head.appendChild(css);
  window.LiveTrade = { attach: attach };
})();
