/* token-community.js: the Community tab on the token page (contract 1.3 token tabs + parity row).
   Written by Claude. Adds a "Community" tab to .token-tabs after the page renders; when it is on,
   the trades table is hidden and this token's calls and comments show in its place. */
(function () {
  "use strict";
  /* Live token routes are #/token/<chain>/<address>; take the last segment. (Fable) */
  function addr() { var m = location.hash.match(/^#\/token\/([^?]+)/); return m ? m[1].split("/").pop() : ""; }
  function token() {
    var a = addr().toLowerCase(), t = (window.QH_TOKENS || []).find(function (x) { return (x.address || "").toLowerCase() === a; });
    if (t || !a) return t;
    var sy = document.querySelector(".token-header .token-symbol");
    return { address: addr(), symbol: sy && sy.textContent.trim() ? sy.textContent.trim() : "this token" };
  }

  function chainId() { var m = location.hash.match(/^#\/token\/([^/?]+)\/[^/?]+/); return m ? decodeURIComponent(m[1]) : ""; }
  function boardUrl(t, c) { var lt = window.QHLive && window.QHLive.find(c, t.address); return "https://qhooks.com/board.html#" + (lt && lt.kind === "qhooks" ? "m=" : "t=") + c + ":" + ((lt && lt.controller) || t.address); }
  function commentRow(c, K) {
    var who = c.wallet ? '<a class="cm-who" href="#/wallet/' + K.esc(c.wallet) + '">' + K.esc(c.who || (c.wallet.slice(0, 6) + "…" + c.wallet.slice(-4))) + "</a>" : '<span class="cm-who">' + K.esc(c.who) + "</span>";
    return '<div class="cm-comment"><div class="cm-call-top">' + who + '<span class="cm-mut">' + K.ago(c.at) + "</span>" + (c.kind === "call" ? '<span class="cm-qh">Call</span>' : "") + '</div><p class="cm-note">' + K.esc(c.text) + "</p></div>";
  }
  /* Calls and comments: live from the token's board when the page has a chain; the seeded sample only when no
     live answer exists, and then always under a "Sample data" tag. */
  function panel(t, box) {
    var D = window.CommunityData, K = window.CommunityCards, c = chainId(), liveCalls = !D.isSample("calls");
    var calls = D.load("calls", t.address).slice(0, 6);
    box.innerHTML = '<div class="cm-tc-head"><div class="cm-h">CALLS ON ' + K.esc(t.symbol) + '<span class="cm-mut">' + calls.length + "</span>" + (liveCalls ? "" : K.sample()) + '</div><button class="cm-make" data-tc-make="">Make a call</button></div>' +
      (calls.map(K.callCard).join("") || '<div class="cm-empty">Nobody has called ' + K.esc(t.symbol) + " yet.</div>") +
      '<div class="cm-h cm-h-gap">COMMENTS<span class="cm-mut cm-ccount"></span><span class="cm-ctag"></span></div><div class="cm-clist"><div class="cm-empty">Reading the board</div></div>';
    function sample() {
      var list = D.load("comments", t.address);
      box.querySelector(".cm-ccount").textContent = list.length; box.querySelector(".cm-ctag").innerHTML = K.sample();
      box.querySelector(".cm-clist").innerHTML = '<form class="cm-cform"><input class="cm-input" maxlength="200" placeholder="Say something about ' + K.esc(t.symbol) + '" aria-label="Comment"><button class="cm-btn" type="submit">Post</button></form>' + list.map(function (x) { return commentRow(x, K); }).join("");
    }
    if (!c || !D.boardFor) { sample(); return; }
    var lt = window.QHLive && window.QHLive.find(c, t.address);
    D.boardFor(c, (lt && lt.kind === "qhooks" && lt.controller) || t.address, lt && lt.kind === "qhooks" ? "launch" : "token", function (posts) {
      if (!box.isConnected) return;
      if (!posts) { sample(); return; }
      box.querySelector(".cm-ccount").textContent = posts.length;
      box.querySelector(".cm-clist").innerHTML = '<div class="cm-live-note">Posting needs a wallet sign-in. <a href="' + K.esc(boardUrl(t, c)) + '" target="_blank" rel="noopener">Open the board to post</a></div>' +
        (posts.map(function (x) { return commentRow(x, K); }).join("") || '<div class="cm-empty">No posts on this board yet. Be the first.</div>');
    });
  }

  function show(on, tabs, id) {
    var main = tabs.parentNode, t = token();
    tabs.querySelectorAll(".token-tab").forEach(function (x) { x.classList.toggle("active", on ? x.getAttribute("data-tab") === "community" : x.getAttribute("data-tab") === (id || "trades")); });
    Array.prototype.forEach.call(main.children, function (el) {
      if (el.classList.contains("token-trades-table-container") || el.classList.contains("token-no-data") || el.classList.contains("lt-tabbody")) el.style.display = on ? "none" : "";
    });
    var box = main.querySelector(".cm-tc");
    if (!on) { if (box) box.style.display = "none"; return; }
    if (!box) { box = document.createElement("section"); box.className = "cm-tc"; main.appendChild(box); }
    box.style.display = ""; if (t) panel(t, box);
    box.onclick = function (e) { if (e.target.closest("[data-tc-make]") && window.Community) window.Community.openSheet(t.address, function () { show(true, tabs); }); };
    box.onsubmit = function (e) {
      e.preventDefault(); var inp = box.querySelector(".cm-cform input"), v = (inp.value || "").trim();
      if (!v || !t) return; window.CommunityData.postComment(t.address, v); show(true, tabs);
    };
  }

  function attach() {
    if (location.hash.indexOf("#/token/") !== 0 || !window.CommunityData) return;
    var tabs = document.querySelector(".token-tabs");
    if (!tabs || tabs.querySelector("[data-tab='community']")) return;
    var tab = document.createElement("div"); tab.className = "token-tab"; tab.setAttribute("data-tab", "community");
    tab.setAttribute("role", "button"); tab.tabIndex = 0; tab.textContent = "Community";
    tabs.appendChild(tab);
    tabs.addEventListener("click", function (e) {
      var x = e.target.closest(".token-tab"); if (!x) return;
      var id = x.getAttribute("data-tab");
      show(id === "community", tabs, id);
    });
  }
  window.addEventListener("qh-community", function () {
    var box = document.querySelector(".cm-tc"), t = token();
    if (box && box.style.display !== "none" && t && !box.querySelector(".cm-sheet")) panel(t, box);
  });
  var pending = false;
  new MutationObserver(function () { if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; attach(); }); } })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
