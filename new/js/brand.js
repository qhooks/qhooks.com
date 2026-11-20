/* brand.js: the QHooks layer that sits on every screen. Written by Fable.
   - Ecosystem strip under the top bar: Rewards, Hooks, Launch, Agents, Calls, each one tap away from anywhere.
   - Page titles carry the name ("Pulse · QHooks").
   - The brand line "For the next generation of token builders / callers / holders / traders" on desktop.
   Money wording uses the approved line from QHBlocks only. No template literals. */
(function () {
  "use strict";
  var HOOK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M7 1v6.2a2.6 2.6 0 0 1-5.2 0V6.4"/></svg>';
  var WORDS = ["builders", "callers", "holders", "traders"], wi = 0;
  var TITLES = { pulse: "Pulse", discover: "Discover", launch: "Launch", perps: "Perps", community: "Community", agents: "Agents", portfolio: "Portfolio", rewards: "Rewards", token: "Token", wallet: "Wallet", hooks: "Hook Studio", hook: "Hook", more: "More" };

  function back() {
    var line = window.QHBlocks && window.QHBlocks.CASHBACK ? window.QHBlocks.CASHBACK.split(" on ")[0] : "";
    return line || "Cashback";
  }
  function strip() {
    var here = location.hash || "#/pulse";
    function a(href, label, text, gold) {
      return '<a href="' + href + '"' + (gold ? ' class="eco-gold"' : "") + (here.indexOf(href) === 0 ? ' aria-current="page"' : "") + ">" + (gold ? HOOK : "") + label + " <b>" + text + "</b></a>";
    }
    return '<nav class="eco" aria-label="QHooks">' +
      a("#/rewards", "Rewards", back(), true) +
      a("#/hooks/studio", "Hooks", "Build yours") +
      a("#/launch", "Launch", "Start a token") +
      a("#/agents", "Agents", "Put one to work") +
      a("#/community", "Calls", "See who called it") +
      '<div class="eco-line">For the next generation of token <span>' + WORDS[wi] + "</span></div></nav>";
  }
  function title() {
    var seg = (location.hash || "#/pulse").replace(/^#\//, "").split(/[/?]/)[0];
    var t = (TITLES[seg] || "QHooks") + " · QHooks";
    if (document.title !== t) document.title = t;
  }
  function mount() {
    var main = document.querySelector("main.q-main"); if (!main) return;
    var cur = main.querySelector(":scope > .eco");
    if (cur && cur.getAttribute("data-at") === location.hash) return;
    if (cur) cur.remove();
    var box = document.createElement("div"); box.innerHTML = strip();
    var el = box.firstChild; el.setAttribute("data-at", location.hash);
    main.insertBefore(el, main.firstChild);
    title();
  }
  var pending = false;
  new MutationObserver(function () { if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; mount(); }); } })
    .observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", function () { setTimeout(mount, 0); });
  setInterval(function () {
    var s = document.querySelector(".eco-line span"); if (!s || document.hidden) return;
    s.style.opacity = "0";
    setTimeout(function () { wi = (wi + 1) % WORDS.length; s.textContent = WORDS[wi]; s.style.opacity = "1"; }, 180);
  }, 3200);
  window.QHBrand = { hook: HOOK };
})();
