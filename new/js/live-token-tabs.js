/* live-token-tabs.js: token page lower tabs (Trades, Holders, Top traders) and the QProof panel, live.
   Trades are keyed by id: the table is rewritten only when the newest trade changes, new rows flash once.
   QProof shows the newest stored report only (/api/qproof/latest never starts a check). Written by Claude. */
(function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm;
  var EXPLORER = { "4663": "https://robinhoodchain.blockscout.com", "8453": "https://basescan.org", "1": "https://etherscan.io", "42161": "https://arbiscan.io", "56": "https://bscscan.com", "solana": "https://solscan.io" };

  function walletLink(w) { return w ? '<a class="q-addr-link" href="#/wallet/' + encodeURIComponent(w) + '">' + F.esc(F.short(w)) + "</a>" : F.DASH; }
  function table(head, rows) {
    return '<div class="token-trades-table-container"><table class="token-trades-table"><thead><tr>' + head.map(function (h, i) { return "<th" + (i === 0 ? "" : "") + ">" + h + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }
  function note(t) { return '<div class="token-no-data lt-note">' + t + "</div>"; }

  function tradeRows(t, seen) {
    var ex = EXPLORER[t.chainId];
    return t.trades.slice(0, 60).map(function (x) {
      var isNew = seen && !seen[x.id], c = x.type === "buy" ? "token-buy" : "token-sell";
      return "<tr class='token-trade-row " + c + (isNew ? " lt-new" : "") + "'><td>" + F.age((Date.now() - x.time) / 1000) + "</td><td class='token-type-cell " + c + "'>" + (x.type === "buy" ? "Buy" : "Sell") +
        "</td><td>" + F.price(x.price) + "</td><td class='token-amount-cell'>" + F.num(x.amount) + "</td><td>" + F.usd(x.usd) + "</td><td>" + walletLink(x.trader) + "</td><td>" +
        (ex && x.tx ? "<a class='lt-tx' href='" + ex + "/tx/" + F.esc(x.tx) + "' target='_blank' rel='noopener'>Tx</a>" : "") + "</td></tr>";
    }).join("");
  }
  function trades(box, t, state) {
    if (!t.trades.length) { box.innerHTML = note(t.tradesOk === false ? "Trades for this pool are unavailable right now." : "No trades yet."); state.top = null; return; }
    var top = t.trades[0].id;
    if (state.top === top && box.querySelector("table")) {
      box.querySelectorAll("tbody tr").forEach(function (tr, i) { var td = tr.firstChild, x = t.trades[i]; if (td && x) td.textContent = F.age((Date.now() - x.time) / 1000); });
      return;
    }
    box.innerHTML = table(["Age", "Side", "Price", "<span class='token-amount-cell'>Amount</span>", "USD", "Trader", ""], tradeRows(t, state.seen));
    state.seen = {}; t.trades.forEach(function (x) { state.seen[x.id] = 1; }); state.top = top;
  }
  function holders(box, t) {
    box.innerHTML = note("Reading holders");
    window.QHLive.holders(t).then(function (r) {
      if (!box.isConnected) return;
      if (!r.ok || !r.rows.length) { box.innerHTML = note(t.chainId === "solana" || t.kind === "qhooks" ? "Holders are unavailable right now." : "Holder lists cover QHooks launches and Solana tokens for now."); return; }
      box.innerHTML = table(["#", "Wallet", "Amount", "Share", "Note"], r.rows.slice(0, 50).map(function (h, i) {
        return "<tr><td>" + (i + 1) + "</td><td>" + walletLink(h.wallet) + "</td><td>" + F.num(h.amount) + "</td><td>" + F.pct(h.share) + "</td><td class='lt-label'>" + F.esc(h.label || "") + "</td></tr>";
      }).join(""));
    });
  }
  function traders(box, t) {
    if (!t.traderRows || !t.traderRows.length) { box.innerHTML = note(t.kind === "qhooks" ? "No trader stats yet." : "Top traders cover QHooks launches for now."); return; }
    var q = F.esc(t.quoteSymbol || t.native);
    box.innerHTML = table(["Wallet", "Bought", "Sold", "Spent (" + q + ")", "Got (" + q + ")", "Trades"], t.traderRows.map(function (r) {
      return "<tr><td>" + walletLink(r.wallet) + "</td><td>" + F.num(r.bought) + "</td><td>" + F.num(r.sold) + "</td><td>" + F.num(r.spent) + "</td><td>" + F.num(r.received) + "</td><td>" + F.int(r.trades) + "</td></tr>";
    }).join(""));
  }

  var LEVEL = { danger: "Danger", caution: "Watch", watch: "Watch", clear: "Clear", unknown: "Not checked", incomplete: "Not checked", info: "" };
  function chip(v) { return "<span class='pulse-qproof pulse-qproof-" + String(v || "Not checked").toLowerCase().replace(" ", "-") + "'>" + F.esc(v || "Not checked") + "</span>"; }
  function qproof(panel, t) {
    panel.innerHTML = "<div class='tq-head'>QProof " + chip("Not checked") + "</div><div class='lt-q-note'>Reading the stored report</div>";
    window.QHLive.qproof(t).then(function (r) {
      if (!panel.isConnected) return;
      if (!r.ok || !r.verdict) {
        panel.innerHTML = "<div class='tq-head'>QProof " + chip("Not checked") + "</div><div class='lt-q-note'>" + (r.ok ? "No stored check for this token yet." : "QProof is unavailable right now.") +
          "</div><a class='lt-q-link' href='https://qhooks.com/qproof' target='_blank' rel='noopener'>Run a check</a>";
        return;
      }
      var order = { danger: 0, caution: 1, watch: 1, unknown: 2, clear: 3 };
      var checks = r.checks.filter(function (c) { return c.status !== "info"; }).sort(function (a, b) { return (order[a.status] == null ? 4 : order[a.status]) - (order[b.status] == null ? 4 : order[b.status]); }).slice(0, 6);
      panel.innerHTML = "<div class='tq-head'>QProof " + chip(r.verdict) + "</div><div class='lt-q-note'>" + F.esc(r.headline) + "</div><ul class='tq-checks'>" + checks.map(function (c) {
        var ev = (c.evidenceLinks || [])[0] || (c.evidenceRefs || [])[0], s = LEVEL[c.status] || "";
        return "<li><b class='lt-q-" + F.esc(c.status) + "'>" + F.esc(s === "Not checked" ? "Partial" : s) + "</b><em>" + F.esc(c.title) + "</em>" + (ev && ev.url ? "<a href='" + F.esc(ev.url) + "' target='_blank' rel='noopener'>evidence</a>" : "<span></span>") + "</li>";
      }).join("") + "</ul><div class='lt-q-foot'>" + (r.checkedAt ? "Checked " + F.age((Date.now() - r.checkedAt) / 1000) + " ago" : "") +
        (r.url ? " · <a href='" + F.esc(r.url) + "' target='_blank' rel='noopener'>Full report</a>" : "") + "</div>";
      var head = document.querySelector(".lt-head-q"); if (head) head.innerHTML = chip(r.verdict);
    });
  }

  var css = document.createElement("style");
  css.textContent = ".lt-note{padding:14px 12px;color:var(--mut);font-size:12px}.lt-tx{color:var(--mut)}.lt-label{color:var(--acc);font-size:11px}" +
    "@keyframes ltnew{from{background:rgba(76,195,138,.14)}to{background:transparent}}.lt-new{animation:ltnew .6s ease-out}" +
    ".lt-q-note{font-size:12px;color:var(--mut);margin:0 0 6px}.lt-q-link,.lt-q-foot a{color:var(--acc);font-size:12px;text-decoration:none}.lt-q-foot{font-size:11px;color:var(--mut);margin-top:6px}" +
    ".token-side .tq-checks li{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:6px;height:auto;min-height:28px;padding:4px 0}.tq-checks li em{font-style:normal;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".tq-checks li a{color:var(--acc);font-size:11px;text-decoration:none}.tq-checks li b{font-size:11px}.lt-q-danger{color:var(--dn)}.lt-q-caution,.lt-q-watch{color:var(--acc)}.lt-q-clear{color:var(--up)}.lt-q-unknown{color:var(--mut)}";
  document.head.appendChild(css);
  window.LiveTokenTabs = { trades: trades, holders: holders, traders: traders, qproof: qproof, chip: chip };
})();
