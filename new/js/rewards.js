/* Rewards hub (contract 1.2.5). Written by Claude. Uses Randall's approved wording for cashback and referrals.
   Amounts come from /api/qhooks/rewards?wallet= (on-chain events plus what is claimable now), priced with
   /api/funding/native-prices; nothing is estimated. Claims happen in the live claim flow on qhooks.com. */
window.Rewards = (function () {
  "use strict";
  var STABLE = { USDC: 1, USDG: 1, USDT: 1 };
  var WRAP = { WETH: "ETH", WBNB: "BNB", WHYPE: "HYPE", WSOL: "SOL" };

  function usdOf(sym, wei, dec, prices) {
    var units = Number(wei || 0) / Math.pow(10, dec || 18), s = WRAP[sym] || sym;
    var p = STABLE[s] != null ? STABLE[s] : prices[s];
    return isFinite(units) && isFinite(Number(p)) ? units * Number(p) : (units === 0 ? 0 : NaN);
  }
  function sum(body, prices) {
    var out = { claim: 0, cash: 0, ref: 0, rows: [] };
    (body.chains || []).forEach(function (c) {
      var cl = 0, ca = 0, rf = 0;
      (c.currencies || []).forEach(function (x) {
        cl += usdOf(x.symbol, x.claimableWei, x.decimals, prices); ca += usdOf(x.symbol, x.cashbackEarnedWei, x.decimals, prices);
        rf += usdOf(x.symbol, x.referralEarnedWei, x.decimals, prices);
      });
      out.claim += cl; out.cash += ca; out.ref += rf;
      out.rows.push([c.name || c.chainId, ca, cl]);
    });
    return out;
  }
  function money(v) { return window.QHFmt ? window.QHFmt.usd(v) : "—"; }

  function shell(root, s, w, link) {
    var F = window.QHFmt;
    root.innerHTML =
      '<div class="rw-wrap"><section class="rw-top"><div><div class="rw-k">EARNED, READY TO CLAIM</div><div class="rw-big">' + (s ? money(s.claim) : "—") + '</div>' +
      '<div class="rw-sub">' + (w ? F.esc(F.short(w)) + ' <span class="rw-fresh"></span>' : "Connect a wallet to see what you have earned") + '</div></div>' +
      (w ? '<a class="rw-claim" href="https://qhooks.com/me" target="_blank" rel="noopener">Claim all</a>' : '<button class="rw-claim rw-connect">Connect</button>') + "</section>" +
      '<section class="rw-grid">' +
      '<div class="rw-card"><h2>Cashback</h2><p class="rw-line">30% back on EVM trades · 40% on Robinhood Chain if you hold 100K QHOOKS</p>' +
      (s ? s.rows.map(function (c) { return '<div class="rw-row"><span>' + F.esc(c[0]) + "</span><b>" + money(c[1]) + '<em> earned · ' + money(c[2]) + " to claim</em></b></div>"; }).join("") : '<div class="rw-row"><span>Per chain</span><b>—</b></div>') + "</div>" +
      '<div class="rw-card"><h2>Referrals</h2><p class="rw-line">Bring traders, get 20% of their fee</p><div class="rw-ref"><code>' + F.esc(link || "Connect to get your link") + '</code><button class="rw-copy"' + (link ? "" : " disabled") + ">Copy</button></div>" +
      '<div class="rw-row"><span>Referral earnings</span><b>' + (s ? money(s.ref) : "—") + "</b></div></div>" +
      '<div class="rw-card"><h2>QHOOKS holder tier</h2><div class="rw-row"><span>Your QHOOKS (wallet + staked + locked)</span><b>—</b></div><div class="rw-row"><span>Next tier</span><b>100K for 40% on Robinhood Chain</b></div><a class="rw-link" href="https://qhooks.com/stake">Stake or lock QHOOKS</a></div>' +
      '<div class="rw-card"><h2>Competitions</h2><div class="rw-row"><span>This week</span><b>PnL, Return, Perps boards</b></div><div class="rw-row"><span>Your rank</span><b>—</b></div><a class="rw-link" href="https://qhooks.com/compete">See standings</a></div>' +
      "</section></div>";
    var cp = root.querySelector(".rw-copy");
    if (cp && link) cp.onclick = function () { try { navigator.clipboard.writeText(link); cp.textContent = "Copied"; } catch (e) {} };
    var cn = root.querySelector(".rw-connect");
    if (cn) cn.onclick = function () { window.QHLive.connect().then(function (a) { if (a) render(root); else cn.textContent = "No wallet found"; }); };
  }

  function render(root) {
    var L = window.QHLive, w = L && L.wallet();
    shell(root, null, w, null);
    if (!w) return;
    Promise.all([L.rewards(w), L.natives()]).then(function (r) {
      if (!root.isConnected) return;
      var res = r[0];
      if (!res.ok || !res.body) { root.querySelector(".rw-sub").textContent = "Rewards are unavailable right now. Open this page again in a moment."; return; }
      shell(root, sum(res.body, r[1] || {}), w, res.body.referralLink || null);
      var f = root.querySelector(".rw-fresh"); if (f) f.textContent = "· " + window.QHFmt.fresh(res.body.observedAt);
    });
  }
  function earned(w) {
    var L = window.QHLive;
    return Promise.all([L.rewards(w), L.natives()]).then(function (r) { return r[0].ok && r[0].body ? sum(r[0].body, r[1] || {}) : null; });
  }

  var css = document.createElement("style");
  css.textContent =
    ".rw-wrap{padding:16px;max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:12px}" +
    ".rw-top{display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--s1);border:1px solid rgba(245,181,68,.4);border-radius:8px;padding:16px}" +
    ".rw-k{font-size:11px;letter-spacing:.06em;color:var(--mut)}.rw-big{font-size:30px;font-weight:600;color:var(--acc);font-variant-numeric:tabular-nums}.rw-sub{font-size:12px;color:var(--mut);margin-top:2px}" +
    ".rw-claim{height:40px;border:0;border-radius:6px;background:var(--acc);color:#140d00;font-weight:600;padding:0 18px;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none;white-space:nowrap}" +
    ".rw-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rw-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:14px}" +
    ".rw-card h2{font-size:14px;margin:0 0 6px}.rw-line{font-size:12px;color:var(--acc);margin:0 0 8px}" +
    ".rw-row{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:7px 0;border-top:1px solid var(--line)}.rw-row b{font-variant-numeric:tabular-nums;text-align:right}.rw-row em{font-style:normal;color:var(--mut);font-weight:400}" +
    ".rw-ref{display:flex;gap:6px;margin-bottom:6px}.rw-ref code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--s2);border:1px solid var(--line);border-radius:4px;padding:6px 8px;font-size:12px}" +
    ".rw-copy{border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;padding:0 10px;cursor:pointer}" +
    ".rw-link{display:inline-block;margin-top:8px;font-size:12px;color:var(--acc);text-decoration:none}" +
    "@media (max-width:767px){.rw-grid{grid-template-columns:1fr}.rw-big{font-size:24px}.rw-top{flex-wrap:wrap}.rw-row em{display:block}.rw-card{min-width:0}}";
  document.head.appendChild(css);
  return { render: render, earned: earned };
})();
