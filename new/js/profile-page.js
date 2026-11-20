/* profile-page.js: the wallet profile at #/wallet/<address> (contract parity: GMGN wallet page). Written by Claude.
   Identity header (short address + copy, chain badges, first seen, Follow / Copy trades / Share from flows.js),
   a 7d / 30d / All PnL block from /api/wallets/card (realized, unrealized, win rate, best trades), then the
   live holdings and trades from live-wallet.js. Reads run once per visit and per period picked; Refresh reads again. */
window.QHProfile = (function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm;
  var WINS = [["7d", "7D"], ["30d", "30D"], ["all", "All"]];

  /* Sub-cent PnL is dust: shown as $0 so a rounding residue never reads as a loss. */
  function cut(v) { return F.ok(v) && Math.abs(Number(v)) < 0.005 ? 0 : v; }
  function cls(v) { v = cut(v); return F.ok(v) && Number(v) !== 0 ? (Number(v) > 0 ? "prf-up" : "prf-dn") : ""; }
  function signed(v) { v = cut(v); return F.ok(v) ? (Number(v) > 0 ? "+" : "") + F.usd(v) : F.DASH; }
  function stat(k, v, c, sub) { return '<div class="prf-stat"><div class="prf-k">' + k + '</div><div class="prf-v ' + (c || "") + '">' + v + "</div>" + (sub ? '<div class="prf-sub">' + sub + "</div>" : "") + "</div>"; }
  function hold(sec) { if (!F.ok(sec)) return F.DASH; return sec < 60 ? Math.round(sec) + "s" : F.age(sec); }
  function date(ms) { var d = new Date(ms); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

  function render(root, w) {
    var L = window.QHLive, mine = !!(L.connected && L.connected() === String(w).toLowerCase()), win = "7d", firstSeen = 0, wallet = null;
    root.innerHTML = '<div class="prf-wrap"><header class="prf-head q-wallet-header"><div class="prf-id"><div class="prf-tile">' + F.esc(String(w).slice(-2).toUpperCase()) + "</div>" +
      '<div class="prf-idt"><div class="prf-addr"><b title="' + F.esc(w) + '">' + F.esc(F.short(w)) + '</b><button class="prf-copy" aria-label="Copy address">Copy</button>' +
      (mine ? '<span class="prf-you">You</span>' : "") + '<span class="prf-tags"></span></div>' +
      '<div class="prf-meta"><span class="prf-chains"></span><span class="prf-seen">First seen ' + F.DASH + '</span><span class="prf-fresh">Reading</span><button class="prf-refresh">Refresh</button></div></div></div></header>' +
      '<section class="prh" style="display:none"></section>' + /* Robinhood Chain profile from our on-chain index, shown first (Fable) */
      '<section class="prf-pnl"><div class="prf-bar"><b>PnL on QHooks markets</b><div class="prf-wins">' + WINS.map(function (x) { return '<button data-w="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="prf-stats"></div><div class="prf-best"></div></section><div class="prf-body"></div></div>';
    function q(s) { return root.querySelector(s); }

    q(".prf-copy").onclick = function () {
      var b = q(".prf-copy"); try { navigator.clipboard.writeText(w); b.textContent = "Copied"; } catch (e) { b.textContent = "Select"; }
      setTimeout(function () { if (b.isConnected) b.textContent = "Copy"; }, 1400);
    };
    function seen(ms) { if (ms > 0 && (!firstSeen || ms < firstSeen)) { firstSeen = ms; q(".prf-seen").textContent = "First seen " + date(ms) + " · " + F.age((Date.now() - ms) / 1000) + " ago"; } }

    function drawPnl(c, bal) {
      var stats = q(".prf-stats");
      if (!c || !c.ok) { stats.innerHTML = '<div class="prf-note">PnL is unavailable right now. Refresh to try again.</div>'; q(".prf-best").innerHTML = ""; return; }
      var wins = c.counted ? Math.round(c.winRate * c.counted) : 0;
      stats.innerHTML = stat("Balance", bal ? F.usd(bal.valueUsd) : F.DASH, "", bal && F.ok(bal.change24Usd) ? '<span class="' + cls(bal.change24Usd) + '">' + signed(bal.change24Usd) + "</span> 24h" : "") +
        stat("Total PnL", signed(c.pnl), cls(c.pnl)) + stat("Realized", signed(c.realized), cls(c.realized)) + stat("Unrealized", signed(c.unrealized), cls(c.unrealized)) +
        stat("Win rate", c.counted ? F.pct(c.winRate * 100) : F.DASH, c.counted ? (c.winRate >= 0.5 ? "prf-up" : "prf-dn") : "", c.counted ? wins + " of " + c.counted + " tokens" : "No closed tokens") +
        stat("Avg hold", hold(c.avgHold), "", c.partial ? "Partial history" : "");
      var best = c.positions.slice().filter(function (p) { return F.ok(p.realized) || F.ok(p.unrealized); })
        .sort(function (a, b) { return ((b.realized || 0) + (b.unrealized || 0)) - ((a.realized || 0) + (a.unrealized || 0)); }).slice(0, 5);
      q(".prf-best").innerHTML = '<div class="prf-k prf-bh">Best trades</div>' + (best.length ? best.map(function (p) {
        var t = (p.realized || 0) + (p.unrealized || 0);
        return '<a class="prf-trade" href="' + F.esc(p.href) + '"><b>' + F.esc(p.symbol) + '</b><span class="prf-mut">' + F.esc(p.chain) + " · " + p.trades + ' trades</span><span class="' + cls(t) + '">' + signed(t) + "</span></a>";
      }).join("") : '<div class="prf-note">No priced positions in this period.</div>');
      c.recent.forEach(function (r) { seen(r.time); });
    }
    var bal = null, lastCard = null;
    function loadPnl(fresh) {
      root.querySelectorAll(".prf-wins button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-w") === win); });
      if (L.family(w) !== "evm") { drawPnl({ ok: false }); q(".prf-stats").innerHTML = '<div class="prf-note">QHooks PnL covers EVM wallets. Holdings below are live.</div>'; return; }
      var want = win;
      L.card(w, win, fresh).then(function (c) { if (want === win) { lastCard = c; drawPnl(c, bal); } });
      if (win !== "all") L.card(w, "all").then(function (c) { if (c.ok) c.recent.forEach(function (r) { seen(r.time); }); });
    }
    root.querySelectorAll(".prf-wins button").forEach(function (b) { b.onclick = function () { win = b.getAttribute("data-w"); loadPnl(); }; });

    if (L.profile) L.profile(w).then(function (p) {
      if (!p.ok) return;
      q(".prf-tags").innerHTML = (p.handle ? '<span class="prf-tag">' + F.esc(p.handle) + "</span>" : "") + p.tags.slice(0, 4).map(function (t) { return '<span class="prf-tag">' + F.esc(t.label || t) + "</span>"; }).join("");
    });
    if (window.QHProfileRH && L.family(w) === "evm") window.QHProfileRH.mount(q(".prh"), w);
    var body = q(".prf-body");
    wallet = window.QHWalletView.render(body, w, { embedded: true,
      onTotals: function (t, ids) {
        bal = t; q(".prf-fresh").textContent = t ? F.fresh(Date.now()) : F.DASH;
        q(".prf-chains").innerHTML = (ids || []).map(function (k) { return '<span class="prf-chain" title="' + F.esc(N.chain(k).name + " " + F.usd(t.byChain[k])) + '">' + F.esc(N.chain(k).name) + "</span>"; }).join("");
        if (lastCard) drawPnl(lastCard, bal);
      },
      onTrades: function (list) { list.forEach(function (t) { seen(t.time); }); } });
    q(".prf-refresh").onclick = function () { q(".prf-fresh").textContent = "Refreshing"; loadPnl(true); if (wallet) wallet.reload(true); };
    loadPnl();
  }

  var css = document.createElement("style");
  css.textContent = ".prf-wrap{padding:12px 16px;max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:12px}" +
    ".prf-head{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px}.prf-id{display:flex;gap:12px;align-items:center;min-width:0}" +
    ".prf-tile{flex:0 0 48px;height:48px;border-radius:6px;background:#3a4a5c;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px}" +
    ".prf-idt{min-width:0;display:flex;flex-direction:column;gap:6px}.prf-addr{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.prf-addr b{font-size:16px;font-family:ui-monospace,monospace}" +
    ".prf-copy,.prf-refresh,.prf-wins button{height:28px;padding:0 10px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;font-size:12px;cursor:pointer}" +
    ".prf-you,.prf-tag{font-size:11px;border:1px solid rgba(210,173,114,.45);color:var(--acc);border-radius:4px;padding:2px 6px}.prf-tag{border-color:var(--line);color:var(--mut)}.prf-tags{display:flex;gap:4px;flex-wrap:wrap}" +
    ".prf-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--mut)}.prf-chains{display:flex;gap:4px;flex-wrap:wrap}" +
    ".prf-chain{font-size:10px;height:16px;line-height:14px;padding:0 5px;border:1px solid var(--line);border-radius:4px;color:var(--tx);background:var(--s2)}" +
    ".prf-pnl{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px}.prf-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;margin-bottom:10px}" +
    ".prf-wins{display:flex;gap:4px}.prf-wins button.on{border-color:var(--acc);color:var(--acc)}" +
    ".prf-stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.prf-stat{background:var(--s2);border-radius:6px;padding:10px;min-width:0}" +
    ".prf-k{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.prf-v{font-size:18px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".prf-sub{font-size:11px;color:var(--mut);margin-top:2px}.prf-up{color:var(--up)}.prf-dn{color:var(--dn)}.prf-mut{color:var(--mut)}.prf-note{font-size:12px;color:var(--mut);padding:8px 0}" +
    ".prf-best{margin-top:10px}.prf-bh{margin-bottom:4px}.prf-trade{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;min-height:36px;padding:0 4px;border-top:1px solid var(--line);font-size:12px;color:var(--tx);text-decoration:none;font-variant-numeric:tabular-nums}" +
    "@media (max-width:1099px){.prf-stats{grid-template-columns:repeat(3,minmax(0,1fr))}}" +
    "@media (max-width:767px){.prf-wrap{padding:8px 10px 72px}.prf-stats{grid-template-columns:1fr 1fr}.prf-copy,.prf-refresh,.prf-wins button{height:44px;min-width:44px}.prf-trade{min-height:44px}.prf-bar{flex-wrap:wrap}}";
  document.head.appendChild(css);
  return { render: render };
})();
