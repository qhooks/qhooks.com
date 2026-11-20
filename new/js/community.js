/* community.js: the Community board at #/community (contract parity row "Community", v1.7 rule 1).
   Written by Claude. Tabs Calls / Tokens / Leaderboard, a Tracked wallets panel (right column on
   desktop, its own tab on phone) and a "Make a call" sheet. Data comes from CommunityData.load. */
window.Community = (function () {
  "use strict";
  var state = { tab: "calls", sort: "hitRate", filter: "all" };
  var TABS = [["calls", "Calls"], ["tokens", "Tokens"], ["leaders", "Leaderboard"], ["wallets", "Tracked"]];
  var D = function () { return window.CommunityData; }, K = function () { return window.CommunityCards; };

  function callsView() {
    var list = D().load("calls");
    if (state.filter === "hits") list = list.filter(function (c) { return D().multiple(c) >= 2; });
    if (state.filter === "mine") list = list.filter(function (c) { return c.caller === "you"; });
    var chips = [["all", "Newest"], ["hits", "2x and up"], ["mine", "My calls"]].map(function (f) {
      return '<button class="cm-chip' + (state.filter === f[0] ? " on" : "") + '" data-filter="' + f[0] + '">' + f[1] + "</button>";
    }).join("");
    var body = list.slice(0, 40).map(K().callCard).join("") || '<div class="cm-empty">No calls here yet. Make the first one.</div>';
    return '<div class="cm-chips-row">' + chips + tag("calls") + "</div>" + body;
  }
  function tag(kind) { return D().isSample(kind) ? K().sample() : ""; }
  function tokensView() {
    var live = !D().isSample("tokens"), rows = D().load("tokens").slice(0, 30);
    return (live ? '<p class="cm-sub">Boards with the newest posts, QHooks launches and any token.</p>' : '<p class="cm-sub">' + tag("tokens") + "</p>") +
      (rows.map(live ? K().tokenRowLive : K().tokenRow).join("") || '<div class="cm-empty">No boards yet.</div>');
  }
  function leadersView() {
    if (!D().isSample("leaders")) {
      var lk = ["pnl", "winRate", "trades"].indexOf(state.sort) >= 0 ? state.sort : "pnl";
      var lr = D().load("leaders").sort(function (a, b) { return (b[lk] || 0) - (a[lk] || 0); });
      return '<p class="cm-sub">Traders on QHooks markets this week, ranked by real PnL (5 trades or more).</p>' + K().leaderHeadLive(lk) + lr.slice(0, 50).map(K().leaderRowLive).join("");
    }
    var key = ["calls", "hitRate", "best"].indexOf(state.sort) >= 0 ? state.sort : "hitRate", rows = D().load("leaders").sort(function (a, b) { return b[key] - a[key] || b.calls - a.calls; });
    return '<p class="cm-sub">A hit is a call that reached 2x from its entry market cap.' + tag("leaders") + "</p>" + K().leaderHead(key) + rows.map(K().leaderRow).join("");
  }
  function walletsView() { return K().trackedPanel(D().load("wallets"), D().isSample("wallets")); }

  function body() {
    if (state.tab === "tokens") return tokensView();
    if (state.tab === "leaders") return leadersView();
    if (state.tab === "wallets") return walletsView();
    return callsView();
  }

  var hooked = false;
  function render(root) {
    if (!hooked) {
      hooked = true;
      window.addEventListener("qh-community", function () {
        var r = document.querySelector(".cm-page"); if (r && r.parentNode && !document.querySelector(".cm-sheet-wrap")) render(r.parentNode);
      });
    }
    if (window.innerWidth >= 1100 && state.tab === "wallets") state.tab = "calls";
    var tabs = TABS.map(function (t) {
      return '<button class="cm-tab' + (state.tab === t[0] ? " on" : "") + (t[0] === "wallets" ? " cm-tab-phone" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
    }).join("");
    root.innerHTML =
      '<div class="cm-page"><div class="cm-main">' +
        '<div class="cm-bar"><h1 class="cm-title">COMMUNITY</h1><div class="cm-tabs" role="tablist">' + tabs + "</div>" +
        '<button class="cm-make" data-make="">Make a call</button></div>' +
        '<div class="cm-list">' + body() + "</div></div>" +
        '<aside class="cm-side">' + walletsView() + "</aside></div>";
    root.onclick = function (e) {
      var t = e.target.closest("[data-tab]"), s = e.target.closest("[data-sort]"), f = e.target.closest("[data-filter]");
      if (t) { state.tab = t.getAttribute("data-tab"); render(root); }
      else if (s) { state.sort = s.getAttribute("data-sort"); render(root); }
      else if (f) { state.filter = f.getAttribute("data-filter"); render(root); }
      else if (e.target.closest("[data-make]")) openSheet(e.target.closest("[data-make]").getAttribute("data-make"), function () { state.tab = "calls"; state.filter = "all"; render(root); });
    };
  }

  /* Make a call: one sheet, token + one line, posted at the current market cap. */
  function openSheet(addr, done) {
    var toks = window.QH_TOKENS || [], C = K();
    var old = document.querySelector(".cm-sheet-wrap"); if (old) old.remove();
    var w = document.createElement("div"); w.className = "cm-sheet-wrap";
    var opts = toks.slice(0, 40).map(function (t) { return '<option value="' + C.esc(t.address) + '"' + (t.address === addr ? " selected" : "") + ">" + C.esc(t.symbol) + " · " + C.usd(t.mcap) + " MC · " + C.esc(t.chain || "") + "</option>"; }).join("");
    w.innerHTML = '<form class="cm-sheet" role="dialog" aria-label="Make a call"><div class="cm-h">MAKE A CALL</div>' +
      '<label class="cm-lbl">Token<select class="cm-input cm-sel">' + opts + "</select></label>" +
      '<label class="cm-lbl">Why (optional)<textarea class="cm-input cm-ta" maxlength="160" placeholder="One line on why you like it"></textarea></label>' +
      '<p class="cm-sub">Your call is stamped with the market cap right now. Everyone sees the multiple from there.</p>' +
      '<div class="cm-sheet-act"><button type="button" class="cm-btn cm-cancel">Cancel</button><button type="submit" class="cm-make">Post call</button></div></form>';
    document.body.appendChild(w);
    /* The sheet must not follow the user to another screen (back button, link). (Fable) */
    window.addEventListener("hashchange", function gone() { window.removeEventListener("hashchange", gone); if (w.parentNode) w.remove(); });
    w.onclick = function (e) { if (e.target === w || e.target.closest(".cm-cancel")) w.remove(); };
    w.querySelector("form").onsubmit = function (e) {
      e.preventDefault();
      var a = w.querySelector(".cm-sel").value, t = toks.find(function (x) { return x.address === a; });
      if (!t) return;
      if (!D().isSample("calls") && t.chainId) {
        /* Live calls are signed on the token's board (wallet sign-in), so hand off there with the note copied. */
        var note = w.querySelector(".cm-ta").value.trim(); try { if (note) navigator.clipboard.writeText(note); } catch (x) {}
        window.open("https://qhooks.com/board.html#" + (t.kind === "qhooks" ? "m=" : "t=") + t.chainId + ":" + (t.controller || t.address), "_blank", "noopener");
        w.remove(); C.toast("Sign in on the board to post your call" + (note ? ". Your note is copied." : "")); return;
      }
      D().postCall(t, w.querySelector(".cm-ta").value.trim());
      w.remove(); C.toast("Call posted on " + t.symbol + " at " + C.usd(t.mcap) + " MC");
      if (done) done();
    };
  }

  return { render: render, openSheet: openSheet };
})();
