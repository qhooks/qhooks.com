/* profile-rh.js: Robinhood Chain wallet profile block on #/wallet/<address>. Written by Fable.
   Source: GET /api/wallets/profile/4663/<address> (our own on-chain index). Shown first on the profile for any
   EVM wallet with Robinhood Chain history; the older reads stay below as the fallback and for other chains.
   Every figure is read from the API. A value the index could not price shows a dash with the reason, never a guess.
   One read per visit, a few spaced retries while the profile is still being built. No template literals. */
window.QHProfileRH = (function () {
  "use strict";
  var F = window.QHFmt, CHAIN = "4663", SCAN = "https://robinhoodchain.blockscout.com";

  function cls(v) { return F.ok(v) && Math.abs(Number(v)) >= 0.005 ? (Number(v) > 0 ? "prh-up" : "prh-dn") : ""; }
  function signed(v) { if (!F.ok(v)) return F.DASH; var n = Math.abs(Number(v)) < 0.005 ? 0 : Number(v); return (n > 0 ? "+" : "") + F.usd(n); }
  function hold(sec) { return F.ok(sec) ? (sec < 60 ? Math.round(sec) + "s" : F.age(sec)) : F.DASH; }
  function stat(k, v, c, sub) { return '<div class="prh-stat"><span>' + k + '</span><b class="' + (c || "") + '">' + v + "</b>" + (sub ? "<em>" + sub + "</em>" : "") + "</div>"; }
  function tok(a, sym) { return '<a class="prh-tok" href="#/token/' + CHAIN + "/" + F.esc(a) + '">' + F.esc(sym || F.short(a)) + "</a>"; }
  function wal(a) { return '<a class="q-addr-link" href="#/wallet/' + F.esc(a) + '">' + F.esc(F.short(a)) + "</a>"; }

  function draw(box, p) {
    var s = p.summary || {}, cov = p.coverage || {};
    var hs = (p.holdings || []).filter(function (h) { return !h.lookalike && Number(h.valueUsd) >= 0.01; }).sort(function (a, b) { return b.valueUsd - a.valueUsd; });
    var trades = (p.trades || []).slice().sort(function (a, b) { return b.ts - a.ts; });
    var known = s.closedWithKnownPnl || 0, closed = s.closedPositions || 0;
    var partial = s.realizedPartial ? "Some buys came in by transfer, so cost is unknown" : "";
    var labels = (p.labels || []).slice(0, 3).map(function (l) { return '<span class="prh-label">' + F.esc(l.text) + "</span>"; }).join("");
    var fund = p.funder && p.funder.known && p.funder.funder ? '<span class="prh-label">First funded by ' + wal(p.funder.funder) + "</span>" : "";
    var h = '<div class="prh-bar"><b>On Robinhood Chain</b><span class="prh-cov">Read from ' + F.int(cov.txs) + " transactions" + (p.kind === "contract" ? " · contract" : "") + "</span></div>" +
      '<div class="prh-stats">' +
      stat("Holdings", F.usd(s.holdingsValueUsd), "", hs.length + " tokens") +
      stat("Realized PnL", signed(s.realizedUsd), cls(s.realizedUsd), F.ok(s.realizedUsd) ? "" : partial) +
      stat("Unrealized", signed(s.unrealizedUsd), cls(s.unrealizedUsd)) +
      stat("Win rate", F.ok(s.winRate) ? F.pct(Number(s.winRate) <= 1 ? s.winRate * 100 : s.winRate) : F.DASH, "", closed ? known + " of " + closed + " closed with known cost" : "No closed positions") +
      stat("Bought", F.usd(s.buyUsd), "", F.int(s.buys) + " buys") +
      stat("Sold", F.usd(s.sellUsd), "", F.int(s.sells) + " sells") +
      stat("Avg hold", hold(s.avgHoldSec), "", F.int(s.tokensTraded) + " tokens traded") + "</div>" +
      (labels || fund ? '<div class="prh-labels">' + labels + fund + "</div>" : "");
    h += '<div class="prh-cols"><div class="prh-card"><div class="prh-h">Holdings</div>' + (hs.length ? '<div class="prh-row prh-head"><span>Token</span><span>Balance</span><span>Value</span><span>Unrealized</span></div>' +
      hs.slice(0, 12).map(function (x) {
        return '<div class="prh-row"><span>' + tok(x.token, x.symbol) + "</span><span>" + F.num(x.balance) + "</span><span>" + F.usd(x.valueUsd) + '</span><span class="' + cls(x.unrealizedUsd) + '">' + signed(x.unrealizedUsd) + "</span></div>";
      }).join("") + (hs.length > 12 ? '<div class="prh-more">' + (hs.length - 12) + " more under " + F.usd(hs[11].valueUsd) + "</div>" : "") : '<div class="prh-note">No priced holdings on Robinhood Chain.</div>') + "</div>";
    h += '<div class="prh-card"><div class="prh-h">Trades</div>' + (trades.length ? '<div class="prh-row prh-head prh-t"><span>Age</span><span>Side</span><span>Token</span><span>Value</span><span></span></div>' +
      trades.slice(0, 20).map(function (t) {
        return '<div class="prh-row prh-t"><span class="prh-mut">' + F.age(Date.now() / 1000 - t.ts) + '</span><span class="' + (t.side === "buy" ? "prh-up" : "prh-dn") + '">' + (t.side === "buy" ? "Buy" : "Sell") + "</span><span>" + tok(t.token, t.symbol) +
          "</span><span>" + F.usd(t.usd) + '</span><span><a class="prh-tx" href="' + SCAN + "/tx/" + F.esc(t.tx) + '" target="_blank" rel="noopener">Tx</a></span></div>';
      }).join("") + (trades.length > 20 ? '<div class="prh-more">' + (trades.length - 20) + " earlier trades</div>" : "") : '<div class="prh-note">No swaps found for this wallet on Robinhood Chain.</div>') + "</div></div>";
    box.innerHTML = h; box.style.display = "";
  }

  function mount(box, w) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(w))) return;
    var tries = 0;
    function read() {
      window.QHApi.get("/api/wallets/profile/" + CHAIN + "/" + String(w).toLowerCase(), { timeout: 30000 }).then(function (r) {
        if (!box.isConnected) return;
        var b = r.body || {}, p = b.profile;
        if (r.ok && b.state === "ready" && p) {
          var any = (p.trades || []).length || (p.holdings || []).length || (p.coverage || {}).txs;
          if (any) draw(box, p); else box.style.display = "none";
          return;
        }
        /* Still being built (or briefly unavailable): say so once, check back a few times, then leave the fallback. */
        if (r.ok && b.state && b.state !== "ready" && tries < 5) {
          box.style.display = ""; box.innerHTML = '<div class="prh-bar"><b>On Robinhood Chain</b><span class="prh-cov">Reading this wallet\'s history</span></div>';
          tries++; setTimeout(read, 7000); return;
        }
        box.style.display = "none";
      });
    }
    read();
  }

  var css = document.createElement("style");
  css.textContent = ".prh{background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0}" +
    ".prh-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.prh-bar b{font-family:var(--display,inherit);font-size:15px}.prh-cov{font-size:11px;color:var(--mut)}" +
    ".prh-stats{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0;border:1px solid var(--line);border-radius:8px;overflow:hidden}" +
    ".prh-stat{padding:10px 12px;border-right:1px solid var(--line);min-width:0;display:flex;flex-direction:column;gap:3px}.prh-stat:last-child{border-right:0}" +
    ".prh-stat span{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);white-space:nowrap}.prh-stat b{font-family:var(--display,inherit);font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}" +
    ".prh-stat em{font-style:normal;font-size:10.5px;color:var(--mut);line-height:1.3}.prh-up{color:var(--up)}.prh-dn{color:var(--dn)}.prh-mut{color:var(--mut)}" +
    ".prh-labels{display:flex;gap:6px;flex-wrap:wrap}.prh-label{font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:3px 10px}.prh-label a{color:var(--tx)}" +
    ".prh-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.prh-card{border:1px solid var(--line);border-radius:8px;min-width:0;overflow:hidden}" +
    ".prh-h{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);padding:8px 12px;border-bottom:1px solid var(--line)}" +
    ".prh-row{display:grid;grid-template-columns:minmax(0,1.3fr) 1fr 1fr 1fr;gap:8px;align-items:center;min-height:32px;padding:0 12px;border-bottom:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums}" +
    ".prh-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}.prh-row span:first-child{text-align:left}.prh-row:last-child{border-bottom:0}" +
    ".prh-t{grid-template-columns:44px 40px minmax(0,1fr) 84px 28px}.prh-t span:nth-child(2),.prh-t span:nth-child(3){text-align:left}" +
    ".prh-head{color:var(--mut);font-size:10px;text-transform:uppercase;letter-spacing:.06em;min-height:26px}.prh-tok{color:var(--tx);font-weight:600;text-decoration:none}.prh-tok:hover{color:var(--acc)}" +
    ".prh-tx{color:var(--mut);font-size:11px}.prh-more,.prh-note{padding:8px 12px;font-size:11px;color:var(--mut)}" +
    "@media (max-width:1099px){.prh-stats{grid-template-columns:repeat(4,minmax(0,1fr))}.prh-stat{border-bottom:1px solid var(--line)}}" +
    "@media (max-width:767px){.prh-stats{grid-template-columns:1fr 1fr}.prh-stat:nth-child(2n){border-right:0}.prh-cols{grid-template-columns:1fr}.prh-row{min-height:40px}.prh-tx{display:inline-flex;align-items:center;min-height:40px}}";
  document.head.appendChild(css);
  return { mount: mount };
})();
