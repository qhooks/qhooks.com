/* Portfolio Wallets tab (contract section 5 + parity row "Portfolio": GMGN-style multi-wallet groups).
   Written by Claude. Left: wallet groups (Solana, EVM) with select boxes, volume, tokens, stablecoins, native.
   Right: totals for the selected wallets and the move-money actions. Actions toast until the flows are wired. */
window.PfWallets = (function () {
  "use strict";
  var V = window.QHView, sel = null, open = { SOL: true, EVM: true };
  var ACTIONS = [["Deposit", "Add funds from an exchange or card"], ["Buy", "Buy a token with the selected wallets"], ["Withdraw", "Send funds out"],
    ["Consolidate", "Gather balances into one wallet"], ["Distribute", "Split a balance across wallets"], ["Transfer", "Move between your wallets"], ["Bridge", "Move funds between Solana and EVM"]];

  function render(root, data) {
    var ws = data.wallets;
    if (!sel) { sel = {}; ws.forEach(function (w, i) { sel[i] = true; }); }
    var nSol = ws.filter(function (w) { return w.family === "SOL"; }).length, nEvm = ws.length - nSol;
    root.innerHTML = '<div class="pw-grid"><section class="pw-card"><div class="pw-top"><b>Wallets</b> <span class="qv-mut">Solana ' + nSol + " · EVM " + nEvm + "</span>" +
      '<span class="pw-add"><button data-a="Add a Solana wallet">+ Solana wallet</button><button data-a="Add an EVM wallet">+ EVM wallet</button><button data-a="Import a wallet">Import</button></span></div>' +
      '<div class="pw-row pw-head"><label class="pw-cbx"><input type="checkbox" class="pw-all"> All</label><span class="pw-n">7d volume</span><span class="pw-n">Tokens</span><span class="pw-n">Stablecoins</span><span class="pw-n">Native</span></div>' +
      '<div class="pw-groups"></div></section><section class="pw-card pw-side"></section></div>';
    var groups = root.querySelector(".pw-groups"), side = root.querySelector(".pw-side"), allBox = root.querySelector(".pw-all");

    function drawGroups() {
      groups.innerHTML = ["SOL", "EVM"].map(function (fam) {
        var list = ws.map(function (w, i) { return { w: w, i: i }; }).filter(function (x) { return x.w.family === fam; });
        var tot = 0; list.forEach(function (x) { tot += x.w.usd; });
        return '<div class="pw-g"><button class="pw-gh" data-f="' + fam + '"><span class="pw-car">' + (open[fam] ? "▾" : "▸") + "</span>" + (fam === "SOL" ? "Solana wallets" : "EVM wallets") +
          '<span class="qv-mut">' + list.length + '</span><span class="pw-gt">' + V.usd(tot) + "</span></button>" +
          (open[fam] ? list.map(function (x) {
            var w = x.w;
            return '<div class="pw-row"><label class="pw-cbx"><input type="checkbox" data-i="' + x.i + '"' + (sel[x.i] ? " checked" : "") + '><span class="pw-nm"><b>' + V.esc(w.name) + "</b>" +
              '<span class="qv-mut pw-ad">' + V.esc(V.short(w.addr)) + "</span></span></label>" +
              '<span class="pw-n">' + V.usd(w.vol) + '</span><span class="pw-n">' + w.tokens + '</span><span class="pw-n">' + V.usd(w.stable) + "</span>" +
              '<span class="pw-n pw-2"><span>' + w.native.toFixed(3) + " " + w.nativeSym + "</span><small>" + V.usd(w.native * w.px) + "</small></span></div>";
          }).join("") : "") + "</div>";
      }).join("");
      groups.querySelectorAll(".pw-gh").forEach(function (b) { b.onclick = function () { var f = b.getAttribute("data-f"); open[f] = !open[f]; drawGroups(); }; });
      groups.querySelectorAll("input[data-i]").forEach(function (c) { c.onchange = function () { sel[c.getAttribute("data-i")] = c.checked; drawSide(); }; });
      drawSide();
    }
    function drawSide() {
      var picked = ws.filter(function (w, i) { return sel[i]; }), bal = 0, vol = 0;
      picked.forEach(function (w) { bal += w.usd; vol += w.vol; });
      allBox.checked = picked.length === ws.length; allBox.indeterminate = picked.length > 0 && picked.length < ws.length;
      var pnl = 0; data.positions.forEach(function (p) { pnl += p.pnl; });
      side.innerHTML = '<div class="pw-top"><b>' + (picked.length === ws.length ? "All wallets" : picked.length + " of " + ws.length + " wallets") + "</b></div>" +
        '<div class="pw-sum"><div class="ps-k">Balance</div><div class="ps-big">' + V.usd(bal) + "</div>" +
        '<div class="pw-kv"><span>7d volume <b>' + V.usd(vol) + '</b></span><span>Open PnL <b class="' + V.cls(pnl) + '">' + V.usd(pnl) + "</b></span>" +
        "<span>Tokens held <b>" + picked.reduce(function (a, w) { return a + w.tokens; }, 0) + '</b></span><span>Unrealized <b class="' + V.cls(data.unreal) + '">' + V.usd(data.unreal) + "</b></span></div></div>" +
        '<div class="pw-acts">' + ACTIONS.map(function (a) { return '<button class="pw-act" data-a="' + a[0] + '" title="' + a[1] + '"><b>' + a[0] + "</b><small>" + a[1] + "</small></button>"; }).join("") + "</div>";
      side.querySelectorAll(".pw-act").forEach(function (b) {
        b.onclick = function () { V.toast(b.getAttribute("data-a") + ": " + (picked.length ? picked.length + " wallet" + (picked.length > 1 ? "s" : "") + " selected" : "pick a wallet first")); };
      });
    }
    allBox.onchange = function () { ws.forEach(function (w, i) { sel[i] = allBox.checked; }); drawGroups(); };
    root.querySelectorAll(".pw-add button").forEach(function (b) { b.onclick = function () { V.toast(b.getAttribute("data-a") + ": opens in your wallet"); }; });
    drawGroups();
  }

  var css = document.createElement("style");
  css.textContent =
    ".pw-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:8px}" +
    ".pw-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;overflow:hidden;min-width:0}" +
    ".pw-top{display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 12px;border-bottom:1px solid var(--line);font-size:13px;flex-wrap:wrap}" +
    ".pw-add{margin-left:auto;display:flex;gap:6px}.pw-add button{height:26px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;font-size:11px;padding:0 8px;cursor:pointer}" +
    ".pw-row{display:grid;grid-template-columns:minmax(150px,1.6fr) 1fr .6fr 1fr 1fr;gap:8px;align-items:center;min-height:40px;padding:0 12px;border-bottom:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums}" +
    ".pw-head{min-height:30px;color:var(--mut);font-size:11px}.pw-n{text-align:right;white-space:nowrap}.pw-2{display:flex;flex-direction:column;align-items:flex-end;line-height:15px}.pw-2 small{color:var(--mut);font-size:10px}" +
    ".pw-cbx{display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer}.pw-cbx input{accent-color:var(--acc);width:14px;height:14px;margin:0}" +
    ".pw-nm{display:flex;gap:8px;align-items:baseline;min-width:0;white-space:nowrap;overflow:hidden}.pw-ad{font-size:11px}" +
    ".pw-gh{display:flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 12px;background:var(--s2);border:0;border-bottom:1px solid var(--line);color:var(--tx);font-size:12px;font-weight:600;cursor:pointer;text-align:left}" +
    ".pw-car{width:10px;color:var(--mut)}.pw-gt{margin-left:auto;font-variant-numeric:tabular-nums}" +
    ".pw-sum{padding:12px;display:flex;flex-direction:column;gap:4px;border-bottom:1px solid var(--line)}.pw-kv{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px;color:var(--mut)}.pw-kv b{color:var(--tx);font-weight:600;font-variant-numeric:tabular-nums}.pw-kv b.qv-up{color:var(--up)}.pw-kv b.qv-dn{color:var(--dn)}" +
    ".pw-acts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;padding:12px}" +
    ".pw-act{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;cursor:pointer;text-align:left}" +
    ".pw-act b{font-size:13px;font-weight:600}.pw-act small{font-size:11px;color:var(--mut)}.pw-act:hover{border-color:rgba(245,181,68,.5)}" +
    "@media (max-width:900px){.pw-grid{grid-template-columns:1fr}}" +
    "@media (max-width:767px){.pw-row{grid-template-columns:minmax(0,1fr) 90px 92px;min-height:52px}.pw-row>.pw-n:nth-child(3),.pw-row>.pw-n:nth-child(4){display:none}" +
    ".pw-cbx input{width:20px;height:20px}.pw-cbx{min-height:44px}.pw-gh{height:44px}.pw-add button{height:44px}.pw-acts{grid-template-columns:1fr 1fr}.pw-act{min-height:52px}.pw-nm{flex-direction:column;gap:0}.pw-ad{line-height:18px}}";
  document.head.appendChild(css);
  return { render: render };
})();
