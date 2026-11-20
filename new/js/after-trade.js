/* after-trade.js: what happens right after a trade fills. Written by Fable.
   A trade should hand you to the next thing in QHooks instead of ending on a "Filled" label. When live-trade.js
   announces a fill (the "qh-traded" event), a short panel appears under the trade button:
   - after a buy: call the token (opens the Community call sheet for it) or open Rewards;
   - after a sell: open Portfolio or Rewards.
   The cashback line is the approved one from QHBlocks. Nothing here estimates an amount. No template literals. */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

  function show(d) {
    var go = document.querySelector(".token-trade-panel .tp-go"); if (!go) return;
    var old = document.querySelector(".at-box"); if (old) old.remove();
    var symEl = document.querySelector(".token-header .token-symbol"), sym = symEl ? symEl.textContent.trim() : "this token";
    var line = window.QHBlocks && window.QHBlocks.CASHBACK ? window.QHBlocks.CASHBACK.split(" · ")[0] : "";
    var buy = d.side !== "sell";
    var box = document.createElement("div"); box.className = "at-box"; box.setAttribute("role", "status");
    box.innerHTML = '<div class="at-h">' + (buy ? "You bought " : "You sold ") + esc(sym) + '</div>' +
      (line ? '<div class="at-l">' + esc(line) + ". It shows in Rewards once the trade is counted.</div>" : "") +
      '<div class="at-acts">' + (buy ? '<button type="button" class="at-b at-gold" data-at="call">Call it</button>' : '<a class="at-b" href="#/portfolio">See your PnL</a>') +
      '<a class="at-b" href="#/rewards">Rewards</a><button type="button" class="at-x" data-at="close" aria-label="Dismiss">Close</button></div>';
    go.parentNode.insertBefore(box, go.nextSibling);
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-at]"); if (!b) return;
      if (b.getAttribute("data-at") === "close") { box.remove(); return; }
      if (window.Community && window.Community.openSheet) window.Community.openSheet(d.token, function () { box.remove(); });
      else location.hash = "#/community";
    });
  }
  window.addEventListener("qh-traded", function (e) { try { show(e.detail || {}); } catch (x) { if (window.console) console.warn("after trade", x); } });
  window.addEventListener("hashchange", function () { var b = document.querySelector(".at-box"); if (b) b.remove(); });

  var css = document.createElement("style");
  css.textContent = ".at-box{margin-top:8px;border:1px solid rgba(210,173,114,.45);background:rgba(210,173,114,.08);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}" +
    ".at-h{font-family:var(--display,inherit);font-weight:700;font-size:14px}.at-l{font-size:12px;color:var(--mut);line-height:1.4}" +
    ".at-acts{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:2px}" +
    ".at-b{display:inline-flex;align-items:center;height:32px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--s1);color:var(--tx);font:inherit;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer}" +
    ".at-gold{background:var(--acc);border-color:var(--acc);color:#17130b}.at-x{margin-left:auto;height:32px;padding:0 8px;background:none;border:0;color:var(--mut);font:inherit;font-size:12px;cursor:pointer}" +
    "@media (max-width:767px){.at-b,.at-x{height:44px}}";
  document.head.appendChild(css);
})();
