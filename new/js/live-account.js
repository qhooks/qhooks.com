/* live-account.js: the visitor's own numbers. Written by Claude.
   - Top bar: Connect (the injected wallet asks the visitor), balance across chains and the Earned chip,
     read once per visit and kept in memory; em dashes until a wallet is known.
   - Portfolio: the live wallet view for the connected or watched address, or a connect / watch panel. */
(function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm, memo = { w: null, tot: null, earned: null, busy: false };

  function fillTop(earnedEl, balEl, connectBtn) {
    var w = window.QHLive.wallet();
    if (connectBtn) {
      connectBtn.textContent = w ? F.short(w) : "Connect";
      connectBtn.onclick = function () {
        if (w) { location.hash = "#/portfolio"; return; }
        window.QHLive.connect().then(function (a) { if (a) { memo.w = null; location.hash = "#/portfolio"; } else location.hash = "#/portfolio"; });
      };
    }
    function paint() {
      if (earnedEl) earnedEl.innerHTML = "Earned <b>" + (memo.earned ? F.usd(memo.earned.cash + memo.earned.ref) : F.DASH) + "</b>";
      if (!balEl) return;
      var by = memo.tot && memo.tot.byChain || {}, ids = Object.keys(by).filter(function (k) { return F.n(by[k]) >= 0.01; }).sort(function (a, b) { return by[b] - by[a]; });
      balEl.querySelector(".q-balance-btn").innerHTML = (memo.tot ? F.usd(memo.tot.valueUsd) : F.DASH) + ' <span class="q-caret">▾</span>';
      balEl.querySelector(".q-balance-menu").innerHTML = (ids.length ? ids.map(function (k) { return '<div class="q-balance-row"><span>' + F.esc(N.chain(k).name) + "</span><b>" + F.usd(by[k]) + "</b></div>"; }).join("")
        : '<div class="q-balance-row"><span>' + (w ? "Reading balances" : "Connect a wallet to see balances") + "</span><b></b></div>") + '<a class="q-balance-move" href="#/portfolio">Move funds</a>';
    }
    paint();
    if (!w || (memo.w === w && (memo.tot || memo.busy))) return;
    memo.w = w; memo.busy = true;
    window.QHLive.portfolio(w).then(function (r) {
      memo.busy = false;
      if (r.ok && r.body && r.body.totals) memo.tot = r.body.totals;
      if (window.Rewards && window.Rewards.earned && /^0x/.test(w)) return window.Rewards.earned(w).then(function (e) { memo.earned = e; });
    }).then(function () { if (earnedEl && earnedEl.isConnected) paint(); });
  }

  function again(spot) { if (location.hash.indexOf("#/portfolio") === 0) window.dispatchEvent(new Event("hashchange")); else portfolio(spot); }
  function portfolio(spot) {
    var w = window.QHLive.wallet();
    if (w) {
      window.QHWalletView.render(spot, w, { mine: true, extra: '<button class="lw-btn lw-change">Watch another address</button>', onTotals: function (t) { memo.w = w; memo.tot = t; } });
      spot.querySelector(".lw-change").onclick = function () { window.QHLive.watch(null); again(spot); };
      return;
    }
    spot.innerHTML = '<div class="la-panel"><h2>Your portfolio</h2><p>Connect a wallet to see balances, PnL and trades on every chain QHooks reads. Nothing is signed by connecting.</p>' +
      '<button class="la-go la-connect">Connect wallet</button><div class="la-or">or watch any address</div>' +
      '<form class="la-watch"><input class="la-input" placeholder="0x... or Solana address" autocomplete="off" spellcheck="false"><button class="la-go la-sec">Watch</button></form><div class="la-msg"></div></div>';
    spot.querySelector(".la-connect").onclick = function () {
      window.QHLive.connect().then(function (a) { if (a) again(spot); else spot.querySelector(".la-msg").textContent = "No browser wallet found. Paste an address to watch instead."; });
    };
    spot.querySelector(".la-watch").onsubmit = function (e) {
      e.preventDefault();
      var v = spot.querySelector(".la-input").value.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(v) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) { spot.querySelector(".la-msg").textContent = "That does not look like a wallet address."; return; }
      window.QHLive.watch(/^0x/.test(v) ? v.toLowerCase() : v); again(spot);
    };
  }

  var css = document.createElement("style");
  css.textContent = ".la-panel{max-width:520px;margin:24px auto;padding:20px;background:var(--s1);border:1px solid var(--line);border-radius:8px}.la-panel h2{font-size:16px;margin:0 0 6px}" +
    ".la-panel p{font-size:13px;color:var(--mut);margin:0 0 14px}.la-go{height:40px;border:0;border-radius:6px;background:var(--up);color:#04140c;font-weight:600;padding:0 16px;cursor:pointer}" +
    ".la-sec{background:var(--s2);color:var(--tx);border:1px solid var(--line)}.la-or{font-size:12px;color:var(--mut);margin:14px 0 6px}.la-watch{display:flex;gap:6px}" +
    ".la-input{flex:1;min-width:0;height:40px;background:var(--s2);border:1px solid var(--line);border-radius:6px;color:var(--tx);padding:0 10px;font-size:13px}.la-msg{font-size:12px;color:var(--acc);margin-top:8px;min-height:16px}";
  document.head.appendChild(css);
  window.QHAccount = { fillTop: fillTop, portfolio: portfolio };
})();
