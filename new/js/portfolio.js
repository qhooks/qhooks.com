/* Portfolio page (contract section 5, parity row "Portfolio"). Written by Claude.
   Tabs Spot / Wallets / Perpetuals / Compare and a multi-select chain chip row with All.
   Spot = summary cards (pf-summary.js) + positions and activity (pf-positions.js) + PnL calendar (pf-calendar.js).
   Wallets = GMGN-style wallet groups (pf-wallets.js). Compare and Perpetuals are live (pf-live.js).
   Spot is live (live-wallet.js through QHAccount) when a wallet is connected or watched; otherwise the connect
   panel sits over the seeded sample. Every tab that shows pf-data.js numbers carries the "Sample data" tag. */
window.Portfolio = (function () {
  "use strict";
  var V = window.QHView, tab = "spot", chains = {};
  var TABS = [["spot", "Spot"], ["wallets", "Wallets"], ["perps", "Perpetuals"], ["compare", "Compare"]];

  function render(root) {
    var data = window.PfData.get();
    root.innerHTML = '<div class="po-page"><div class="po-top"><div class="po-tabs">' + TABS.map(function (t) {
      return '<button class="po-tab" data-t="' + t[0] + '">' + t[1] + "</button>";
    }).join("") + '</div><span class="po-sample">Sample data</span></div><div class="qv-chips po-chains"></div><div class="po-body"></div></div>';
    var body = root.querySelector(".po-body"), chipsEl = root.querySelector(".po-chains"), tagEl = root.querySelector(".po-sample");
    function live() { return !!(window.QHLive && window.QHLive.wallet() && window.QHAccount); }
    var names = V.chains(data.positions.concat(data.history));

    function drawChips() {
      var none = !Object.keys(chains).length;
      chipsEl.innerHTML = '<button class="qv-chip' + (none ? " on" : "") + '" data-c="">All</button>' + names.map(function (c) {
        return '<button class="qv-chip' + (chains[c] ? " on" : "") + '" data-c="' + V.esc(c) + '">' + V.esc(c) + "</button>";
      }).join("");
      chipsEl.querySelectorAll(".qv-chip").forEach(function (b) {
        b.onclick = function () {
          var c = b.getAttribute("data-c");
          if (!c) chains = {}; else if (chains[c]) delete chains[c]; else chains[c] = 1;
          if (Object.keys(chains).length === names.length) chains = {};
          drawChips(); drawBody();
        };
      });
      chipsEl.style.display = tab === "spot" && !live() ? "" : "none";
    }
    function drawBody() {
      root.querySelectorAll(".po-tab").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-t") === tab); });
      body.innerHTML = "";
      var sample = tab === "wallets" || (tab === "spot" && !live());
      tagEl.style.display = sample ? "" : "none";
      tagEl.textContent = tab === "wallets" ? "Sample data · multi-wallet groups open with wallet sign-in" : "Sample data · connect or watch a wallet to see yours";
      if (tab === "spot" && window.QHAccount) {
        var acct = document.createElement("div"); body.appendChild(acct);
        window.QHAccount.portfolio(acct);
        if (live()) return;
      }
      if (tab === "spot") {
        var sum = document.createElement("div"), pos = document.createElement("div");
        body.appendChild(sum); body.appendChild(pos);
        window.PfSummary.render(sum, data);
        window.PfPositions.render(pos, data, chains);
        window.PfCalendar.render(pos.querySelector(".pp-cal"));
      } else if (tab === "wallets") {
        window.PfWallets.render(body, data);
      } else if (tab === "perps") {
        window.PfLive.perps(body);
      } else {
        window.PfLive.compare(body);
      }
    }
    root.querySelectorAll(".po-tab").forEach(function (b) {
      b.onclick = function () { tab = b.getAttribute("data-t"); drawChips(); drawBody(); };
    });
    drawChips(); drawBody();
  }

  var css = document.createElement("style");
  css.textContent =
    ".po-page{display:flex;flex-direction:column;gap:8px;min-width:0}.po-body{display:flex;flex-direction:column;gap:8px;min-width:0}.po-body>div{min-width:0}" +
    ".po-top{display:flex;align-items:center;border-bottom:1px solid var(--line)}.po-tabs{display:flex;gap:18px;overflow-x:auto;scrollbar-width:none}" +
    ".po-sample{margin-left:auto;font-size:11px;font-weight:600;color:var(--acc);border:1px solid rgba(245,181,68,.45);border-radius:4px;padding:2px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}" +
    ".po-tab{flex:0 0 auto;background:none;border:0;border-bottom:2px solid transparent;color:var(--mut);font-size:16px;font-weight:600;padding:8px 0;cursor:pointer}.po-tab.on{color:var(--tx);border-bottom-color:var(--acc)}" +
    ".po-empty{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:16px;font-size:13px;color:var(--mut)}.po-empty a{color:var(--acc);margin-left:6px}" +
    ".po-cmp{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.po-in{flex:1;min-width:220px;height:36px;background:var(--s2);border:1px solid var(--line);border-radius:4px;color:var(--tx);padding:0 10px;font-size:13px}" +
    ".q-portfolio{padding:12px}" +
    ".q-portfolio .la-panel{max-width:none;margin:0 0 8px;padding:10px 12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}.q-portfolio .la-panel h2{font-size:13px;margin:0}.q-portfolio .la-panel p{margin:0;font-size:12px;flex:1 1 260px}" +
    ".q-portfolio .la-go{height:32px}.q-portfolio .la-or{margin:0}.q-portfolio .la-watch{flex:1 1 300px}.q-portfolio .la-input{height:32px}.q-portfolio .la-msg{min-height:0;margin:0}" +
    "@media (max-width:767px){.q-portfolio{padding:8px 10px}.po-tab{min-height:44px;font-size:14px}.po-in{height:44px;min-width:0;width:100%}.po-empty a{display:inline-flex;align-items:center;min-height:44px}.q-portfolio .la-go,.q-portfolio .la-input{height:44px}.q-portfolio .la-panel p{display:none}}";
  document.head.appendChild(css);
  return { render: render };
})();
