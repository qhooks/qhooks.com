/* community-cards.js: shared pieces for the Community board and the token Community tab.
   Written by Claude. Call cards, leaderboard rows, called-token rows, tracked wallets,
   one-touch Buy with an undo toast. All copy is QHooks' own. */
window.CommunityCards = (function () {
  "use strict";
  var TILE = ["#3a4a5c", "#4a3f5c", "#5c4a3a", "#3a5c4f", "#5c3a46", "#45503a"];
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function usd(v) {
    v = v || 0; var a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "K";
    return "$" + Math.round(v);
  }
  function ago(t) {
    var s = Math.max(1, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return s + "s"; if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h"; return Math.floor(s / 86400) + "d";
  }
  function short(a) { return a && a.length > 10 ? a.slice(0, 6) + "…" + a.slice(-4) : (a || ""); }
  function mult(m) { return (m >= 10 ? m.toFixed(0) : m.toFixed(m >= 1 ? 1 : 2)) + "x"; }
  function native(t) { return t.chain === "Solana" ? "SOL" : t.chain === "BNB" ? "BNB" : "ETH"; }
  function size(t) { return t.chain === "Solana" ? "0.1" : t.chain === "BNB" ? "0.05" : "0.01"; }
  function tile(t, px) {
    var code = (t.symbol || "?").charCodeAt(0) || 0;
    return '<a class="cm-tile" style="width:' + px + "px;height:" + px + "px;background:" + TILE[code % TILE.length] + '" href="' + esc(th(t)) + '">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy">' : esc((t.symbol || "?").charAt(0))) + "</a>";
  }
  function th(t) { return t.href || "#/token/" + t.address; }
  function px(v) { return window.QHFmt ? window.QHFmt.price(v) : "$" + v; }
  function sample() { return '<span class="cm-sample">Sample data</span>'; }
  function qp(t) { var q = t.qProof || "Not checked"; return '<span class="pulse-qproof pulse-qproof-' + q.toLowerCase().replace(" ", "-") + '">' + esc(q) + "</span>"; }
  function hook(t) { return window.HookBadge ? window.HookBadge.inRow(t) : ""; }
  function buyBtn(t) { if (t.href) return '<a class="cm-buy" href="' + esc(t.href) + '">Trade</a>'; return '<button class="cm-buy" data-buy="' + esc(t.address) + '" aria-label="Buy">' + size(t) + " " + native(t) + "</button>"; }
  function walletLink(name, addr) { return addr ? '<a class="cm-who" href="#/wallet/' + esc(addr) + '">' + esc(name) + "</a>" : '<span class="cm-who">' + esc(name) + "</span>"; }

  function callCard(c) {
    var t = c.token, m = window.CommunityData.multiple(c), cls = m >= 1 ? "cm-up" : "cm-dn";
    var nums = c.live ? "<span><i>Entry</i>" + (c.entryPrice ? px(c.entryPrice) : "—") + "</span><span><i>Now</i>" + (c.nowPrice ? px(c.nowPrice) : "—") + "</span>" + (m ? '<b class="' + cls + '">' + mult(m) + "</b>" : '<b class="cm-mut">' + (c.kind === "buy" ? "Bought" : "Called") + "</b>")
      : "<span><i>Entry</i>" + usd(c.entryMc) + "</span><span><i>Now</i>" + usd(t.mcap) + '</span><b class="' + cls + '">' + mult(m) + "</b>";
    return '<article class="cm-call">' + tile(t, 40) +
      '<div class="cm-call-body"><div class="cm-call-top">' + walletLink(c.caller, c.wallet) + '<span class="cm-mut">called</span><a class="cm-sym" href="' + esc(th(t)) + '">' + esc(t.symbol) + "</a>" + '<span class="cm-mut">' + ago(c.at) + "</span>" + '<span class="cm-chips">' + qp(t) + hook(t) + "</span></div>" +
      (c.note ? '<p class="cm-note">' + esc(c.note) + "</p>" : "") +
      '<div class="cm-call-nums">' + nums + '<span class="cm-chain">' + esc(t.chain || "") + "</span>" + buyBtn(t) + "</div></div></article>";
  }
  function leaderHead(sort) {
    function h(k, l) { return '<button class="cm-sort' + (sort === k ? " on" : "") + '" data-sort="' + k + '">' + l + "</button>"; }
    return '<div class="cm-lb cm-lb-head"><span>#</span><span>Caller</span>' + h("calls", "Calls") + h("hitRate", "Hit rate") + h("best", "Best") + "</div>";
  }
  function leaderHeadLive(sort) {
    function h(k, l) { return '<button class="cm-sort' + (sort === k ? " on" : "") + '" data-sort="' + k + '">' + l + "</button>"; }
    return '<div class="cm-lb cm-lb-head"><span>#</span><span>Trader</span>' + h("pnl", "PnL 7d") + h("winRate", "Win rate") + h("trades", "Trades") + "</div>";
  }
  function leaderRowLive(x, i) {
    return '<div class="cm-lb"><span class="cm-mut">' + (i + 1) + '</span><span class="cm-lb-who">' + walletLink(x.caller, x.wallet) + "</span>" +
      '<b class="' + (x.pnl >= 0 ? "cm-up" : "cm-dn") + '">' + (x.pnl >= 0 ? "+" : "-") + usd(Math.abs(x.pnl || 0)) + "</b><b>" + (x.winRate == null ? "—" : Math.round(x.winRate * 100) + "%") + "</b><b>" + x.trades + "</b></div>";
  }
  function leaderRow(x, i) {
    return '<div class="cm-lb"><span class="cm-mut">' + (i + 1) + "</span>" + '<span class="cm-lb-who">' + walletLink(x.caller, x.wallet) + '<span class="cm-mut cm-addr">' + short(x.wallet) + "</span></span>" +
      "<b>" + x.calls + "</b><b>" + Math.round(x.hitRate * 100) + '%</b><b class="cm-up">' + mult(x.best) + "</b></div>";
  }
  function tokenRowLive(x) {
    var t = x.token;
    return '<div class="cm-trow">' + tile(t, 36) + '<div class="cm-trow-id"><a class="cm-sym" href="' + esc(th(t)) + '">' + esc(t.symbol) + '</a><span class="cm-mut">' + esc(t.name || "") + '</span><span class="cm-chips"><span class="cm-chain">' + esc(t.chain || "") + "</span>" + (x.kind === "token" ? "" : '<span class="cm-qh">QHooks launch</span>') + "</span></div>" +
      '<div class="cm-trow-n"><b>' + x.calls + '</b><i>posts</i></div><div class="cm-trow-n"><b>' + (x.last ? ago(x.last) : "—") + "</b><i>last post</i></div>" + buyBtn(t) + "</div>";
  }
  function tokenRow(x) {
    var t = x.token, m = x.firstMc ? (t.mcap || 0) / x.firstMc : 0;
    return '<div class="cm-trow">' + tile(t, 36) + '<div class="cm-trow-id"><a class="cm-sym" href="#/token/' + esc(t.address) + '">' + esc(t.symbol) + '</a><span class="cm-mut">' + esc(t.name || "") + '</span><span class="cm-chips">' + qp(t) + hook(t) + "</span></div>" +
      '<div class="cm-trow-n"><b>' + x.calls + '</b><i>calls</i></div><div class="cm-trow-n"><b>' + usd(t.mcap) + '</b><i class="' + (m >= 1 ? "cm-up" : "cm-dn") + '">' + mult(m) + " since first call</i></div>" + buyBtn(t) + "</div>";
  }
  function walletBlock(w) {
    var trades = w.trades.length ? w.trades.map(function (tr) {
      return '<div class="cm-wt"><span class="' + (tr.side === "buy" ? "cm-up" : "cm-dn") + '">' + (tr.side === "buy" ? "Bought" : "Sold") + '</span><a class="cm-sym" href="' + esc(th(tr.token)) + '">' + esc(tr.token.symbol) + "</a><b>" + (tr.usd == null ? "—" : usd(tr.usd)) + '</b><span class="cm-mut">' + ago(tr.at) + "</span></div>";
    }).join("") : '<div class="cm-wt cm-mut">' + esc(w.note || "No trades on QHooks markets yet") + "</div>";
    return '<div class="cm-wallet"><div class="cm-wallet-h">' + walletLink(w.label, w.address) + '<span class="cm-mut cm-addr">' + short(w.address) + "</span></div>" + trades + "</div>";
  }
  function trackedPanel(list, isSample) {
    return '<section class="cm-tracked"><div class="cm-h">TRACKED WALLETS<span class="cm-mut">' + list.length + "</span>" + (isSample ? sample() : "") + "</div>" +
      '<form class="cm-track"><input class="cm-input" placeholder="Paste a wallet to track" aria-label="Wallet address"><button class="cm-btn" type="submit">Track</button></form>' +
      list.map(walletBlock).join("") + "</section>";
  }

  function toast(text, undo) {
    var s = document.querySelector(".fl-toasts");
    if (!s) { s = document.createElement("div"); s.className = "fl-toasts"; document.body.appendChild(s); }
    var t = document.createElement("div"); t.className = "fl-toast cm-toast"; t.textContent = text;
    if (undo) { var u = document.createElement("button"); u.className = "cm-undo"; u.textContent = "Undo"; u.onclick = function () { t.textContent = "Order cancelled"; setTimeout(function () { t.remove(); }, 1200); }; t.appendChild(u); }
    s.appendChild(t); setTimeout(function () { if (t.parentNode) t.remove(); }, 4000);
  }
  /* One touch (contract 1.3.3): delegated, so every card on every screen gets it. */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-buy]"); if (!b) return;
    e.preventDefault();
    var t = (window.QH_TOKENS || []).find(function (x) { return x.address === b.getAttribute("data-buy"); }); if (!t) return;
    toast("Buying " + size(t) + " " + native(t) + " of " + t.symbol + " at " + usd(t.mcap) + " MC", true);
  });
  document.addEventListener("submit", function (e) {
    var f = e.target; if (!f.classList || !f.classList.contains("cm-track")) return;
    e.preventDefault(); var v = (f.querySelector("input").value || "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(v) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) { toast("That doesn't look like a wallet address"); return; }
    window.CommunityData.track(v); toast("Tracking " + short(v)); window.dispatchEvent(new Event("hashchange"));
  });

  return { esc: esc, usd: usd, ago: ago, sample: sample, callCard: callCard, leaderHead: leaderHead, leaderRow: leaderRow, leaderHeadLive: leaderHeadLive, leaderRowLive: leaderRowLive, tokenRow: tokenRow, tokenRowLive: tokenRowLive, trackedPanel: trackedPanel, toast: toast };
})();
