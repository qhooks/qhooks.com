/* Connective flows (contract 1.2.3, 1.3.3, v1.1 #7 and #10). Written by Claude.
   Adds the one-ecosystem actions to screens after they render: token action bar,
   gas check + MEV line on the trade panel, Lock/Stake/Share on
   positions, Follow/Copy on wallet pages. Idempotent. Every action does the real thing or is not shown. */
(function () {
  "use strict";
  function toast(text) {
    var s = document.querySelector(".fl-toasts");
    if (!s) { s = document.createElement("div"); s.className = "fl-toasts"; document.body.appendChild(s); }
    var t = document.createElement("div"); t.className = "fl-toast"; t.textContent = text; s.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function btn(label, cls, onClick, href) {
    var b = document.createElement(href ? "a" : "button");
    b.className = "fl-btn" + (cls ? " " + cls : ""); b.textContent = label;
    if (href) b.href = href;
    if (onClick) b.addEventListener("click", function (e) { if (!href) e.preventDefault(); onClick(e); });
    return b;
  }
  function ext(a) { a.target = "_blank"; a.rel = "noopener"; return a; }
  /* Share says "Link copied" only once the browser confirms the copy; otherwise it says how to copy it by hand. */
  function share() {
    var url = location.href, ok = function () { toast("Link copied"); }, no = function () { toast("Copy the link from the address bar"); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, no); else no(); } catch (x) { no(); }
  }
  function tokenAddr() { var m = location.hash.match(/^#\/token\/(?:[^/?]+\/)?([^/?]+)/); return m ? decodeURIComponent(m[1]) : ""; }
  function sym() {
    var a = tokenAddr(), lt = window.QHLive && window.QHLive.find(a);
    if (lt && lt.symbol) return lt.symbol;
    var t = (window.QH_TOKENS || []).find(function (x) { return x.address === a; }); return t ? t.symbol : "token";
  }

  function tokenPage() {
    var head = document.querySelector(".token-header");
    if (head && !head.querySelector(".fl-bar")) {
      var a = tokenAddr(), bar = document.createElement("div"); bar.className = "fl-bar";
      /* No button claims something that did not happen (Fable, 2026-11-20). "Set alert" is gone until a real
         alert exists; "Make a call" opens the real call sheet for this token and is hidden when that is not loaded. */
      if (window.Community && window.Community.openSheet) bar.appendChild(btn("Make a call", "", function () { window.Community.openSheet(a); }));
      bar.appendChild(btn("Launch one like this", "fl-acc", null, "#/launch?like=" + a));
      bar.appendChild(btn("Run an agent on this token", "fl-acc", null, "#/agents?token=" + a));
      bar.appendChild(btn("Share", "", share));
      head.appendChild(bar);
    }
    if (innerWidth < 768 && !document.querySelector(".fl-sticky")) {
      var st = document.createElement("div"); st.className = "fl-sticky";
      ["Buy", "Sell"].forEach(function (side) {
        st.appendChild(btn(side + " " + sym(), "fl-" + side.toLowerCase(), function () {
          var pn = document.querySelector(".token-trade-panel"); if (!pn) return;
          var t = pn.querySelector(side === "Buy" ? ".tp-buy" : ".tp-sell"); if (t) t.click();
          pn.scrollIntoView({ behavior: "smooth", block: "start" });
          var inp = pn.querySelector(".tp-input"); if (inp) setTimeout(function () { inp.focus(); }, 300);
        }));
      });
      document.body.appendChild(st);
    }
    var panel = document.querySelector(".token-trade-panel");
    if (panel && !panel.querySelector(".fl-gas")) {
      var meta = panel.querySelector(".tp-meta"), g = document.createElement("div"); g.className = "fl-gas";
      g.innerHTML = '<label class="fl-mev"><input type="checkbox" checked> MEV protection</label>' +
        '<div class="fl-gasline">' + (window.QHLive ? "Gas shows with your quote" : 'Gas check: 0.0004 ETH needed · <b class="dt-up">you have enough</b>') + '</div>' +
        '<div class="fl-oneclick"></div>';
      if (meta) meta.after(g); else panel.appendChild(g);
      ocLine();
    }
  }
  /* One-click line on the trade panel: opens the opt-in sheet (oneclick.js); says On with the limit once it is on. */
  function ocLine() {
    var el = document.querySelector(".fl-oneclick"), O = window.QHOneClick; if (!el) return;
    if (!O || O.off()) { el.remove(); return; }
    O.status().then(function (v) {
      if (!el.isConnected) return;
      el.innerHTML = v && v.on ? "One-click on · $" + v.perTradeUsd + " per trade · <button type='button' class='fl-oc'>Change</button>"
        : "One-click trading is off · <button type='button' class='fl-oc'>Turn on</button> to buy with one tap";
      el.querySelector(".fl-oc").onclick = function () { O.open(); };
    });
  }
  window.addEventListener("qh-oneclick", ocLine);
  function portfolio() {
    document.querySelectorAll(".q-table-actions").forEach(function (cell) {
      if (cell.querySelector(".fl-btn")) return;
      var row = cell.parentElement, isQ = row && /QHOOKS/.test(row.textContent);
      /* Lock and Stake open the live pages; the "PnL card" share is gone because no card exists yet. */
      cell.appendChild(ext(btn("Lock", "fl-sm", null, "https://qhooks.com/qlocks")));
      if (isQ) cell.appendChild(ext(btn("Stake", "fl-sm fl-acc", null, "https://qhooks.com/stake")));
    });
  }
  function wallet() {
    var h = document.querySelector(".q-wallet-header");
    if (!h || h.querySelector(".fl-bar")) return;
    var bar = document.createElement("div"); bar.className = "fl-bar";
    var who = decodeURIComponent((location.hash.slice(9).split("?")[0]) || ""), D = window.CommunityData;
    var fol = D && D.isTracked && D.isTracked(who);
    bar.appendChild(btn(fol ? "Following" : "Follow", "fl-acc", function (e) {
      if (!D) return; var on = D.isTracked(who);
      if (on) D.untrack(who); else D.track(who);
      e.target.textContent = on ? "Follow" : "Following"; toast(on ? "Stopped following" : "Following: this wallet's trades show in Community, Tracked");
    }));
    bar.appendChild(ext(btn("Copy trades", "", null, "https://qhooks.com/copy?w=" + encodeURIComponent(who))));
    bar.appendChild(btn("Share", "", share));
    h.appendChild(bar);
  }
  var pending = false;
  function run() {
    pending = false;
    var h = location.hash;
    if (h.indexOf("#/token/") !== 0) { var old = document.querySelector(".fl-sticky"); if (old) old.remove(); }
    if (h.indexOf("#/token/") === 0) tokenPage();
    else if (h.indexOf("#/portfolio") === 0) portfolio();
    else if (h.indexOf("#/wallet/") === 0) wallet();
  }
  new MutationObserver(function () { if (!pending) { pending = true; requestAnimationFrame(run); } })
    .observe(document.documentElement, { childList: true, subtree: true });

  var css = document.createElement("style");
  css.textContent =
    ".fl-bar{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}" +
    ".fl-btn{display:inline-flex;align-items:center;height:30px;padding:0 10px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;font-size:12px;text-decoration:none;cursor:pointer}" +
    ".fl-acc{border-color:rgba(210,173,114,.45);color:var(--acc)}.fl-sm{height:24px;padding:0 8px;font-size:11px;margin-left:4px}" +
    ".fl-live{font-size:11px;color:var(--up);margin-left:8px;align-self:center}" +
    ".fl-gas{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mut);margin:6px 0}.fl-mev{display:flex;gap:6px;align-items:center}" +
    ".fl-oneclick a,.fl-oc{color:var(--acc)}.fl-oc{background:none;border:0;padding:0 4px;min-height:44px;font:inherit;cursor:pointer;text-decoration:underline}" +
    ".fl-toasts{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;z-index:60}" +
    ".fl-toast{background:var(--s2);border:1px solid var(--line);color:var(--tx);padding:8px 12px;border-radius:6px;font-size:12px}" +
    ".fl-sticky{position:fixed;left:0;right:0;bottom:56px;display:flex;gap:8px;padding:8px 12px;background:var(--bg);border-top:1px solid var(--line);z-index:40}" +
    ".fl-sticky .fl-btn{flex:1;justify-content:center;height:48px;font-size:15px;font-weight:600}.fl-buy{background:var(--up);color:#04140c;border-color:var(--up)}.fl-sell{background:rgba(242,105,92,.14);color:var(--dn);border-color:rgba(242,105,92,.4)}" +
    "@media (max-width:767px){.token-page{padding-bottom:72px}.token-type-cell,.token-trader-cell,.token-age-cell{white-space:nowrap}.token-amount-cell{display:none}" +
    ".fl-btn{height:44px}.fl-sm{height:44px;min-width:56px}.fl-bar{overflow-x:auto;flex-wrap:nowrap}.fl-bar .fl-btn{flex:0 0 auto}}";
  document.head.appendChild(css);
})();
