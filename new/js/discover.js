/* Discover page (contract section 6, parity row "Discovery"). Written by Claude.
   Tabs: Trending, New, Near graduation, Hot, Stocks, Live. Each list's default sort matches its name (v1.1 #11).
   Chain chips are multi-select ("All" clears them). Data comes from window.QHView.tokens() (live first,
   fixtures otherwise). The table lives in discover-table.js, the trade stream in dc-live.js. */
window.Discover = (function () {
  "use strict";
  var V = window.QHView;
  var TABS = [
    { id: "trending", l: "Trending", sort: { k: "vol", dir: -1 } },
    { id: "new", l: "New", sort: { k: "ageSec", dir: 1 } },
    { id: "near", l: "Near graduation", sort: { k: "progress", dir: -1 }, extra: "progress", only: function (r) { return r.bonding && V.ok(r.progress); } },
    { id: "hot", l: "Hot", sort: { k: "growth", dir: -1 }, extra: "growth", only: function (r) { return V.ok(r.growth); } },
    { id: "stocks", l: "Stocks", sort: { k: "vol", dir: -1 }, only: function (r) { return r.stock; } },
    { id: "live", l: "Live" }
  ];
  var state = { tab: "trending", chains: {} };

  function picked(rows) {
    var any = Object.keys(state.chains).length > 0;
    return any ? rows.filter(function (r) { return state.chains[r.chain]; }) : rows;
  }
  function tabOf(id) { return TABS.filter(function (t) { return t.id === id; })[0] || TABS[0]; }

  function render(root) {
    var m = /[?&]tab=([a-z]+)/.exec(location.hash); if (m && tabOf(m[1]).id === m[1]) state.tab = m[1];
    root.innerHTML = '<div class="dc-page"><div class="dc-top"><div class="dc-tabs" role="tablist"></div><span class="dc-src qv-mut"></span></div>' +
      '<div class="dc-chainrow"><div class="qv-chips dc-chains"></div></div><div class="dc-body"></div></div>';
    var tabsEl = root.querySelector(".dc-tabs"), chainsEl = root.querySelector(".dc-chains"), body = root.querySelector(".dc-body");
    var all = V.tokens();
    root.querySelector(".dc-src").textContent = V.source() === "live" ? "Live" : "Sample data";

    function drawTabs() {
      var rows = picked(all);
      tabsEl.innerHTML = TABS.map(function (t) {
        var n = t.id === "live" ? "" : (t.only ? rows.filter(t.only) : rows).length;
        return '<button class="dc-tab' + (t.id === state.tab ? " on" : "") + '" role="tab" data-t="' + t.id + '">' + t.l + (n !== "" ? ' <small>' + n + "</small>" : "") + "</button>";
      }).join("");
      tabsEl.querySelectorAll(".dc-tab").forEach(function (b) {
        b.onclick = function () { state.tab = b.getAttribute("data-t"); drawTabs(); drawBody(); };
      });
    }
    function drawChains() {
      var names = V.chains(all), none = !Object.keys(state.chains).length;
      chainsEl.innerHTML = '<button class="qv-chip' + (none ? " on" : "") + '" data-c="">All chains</button>' + names.map(function (c) {
        return '<button class="qv-chip' + (state.chains[c] ? " on" : "") + '" data-c="' + V.esc(c) + '" aria-pressed="' + !!state.chains[c] + '">' + V.esc(c) + "</button>";
      }).join("");
      chainsEl.querySelectorAll(".qv-chip").forEach(function (b) {
        b.onclick = function () {
          var c = b.getAttribute("data-c");
          if (!c) state.chains = {}; else if (state.chains[c]) delete state.chains[c]; else state.chains[c] = 1;
          if (Object.keys(state.chains).length === names.length) state.chains = {};
          drawChains(); drawTabs(); drawBody();
        };
      });
    }
    function drawBody() {
      var t = tabOf(state.tab), rows = picked(all);
      if (t.id === "live") { window.DiscoverLive.render(body, rows); return; }
      if (t.only) rows = rows.filter(t.only);
      window.DiscoverTable.render(body, rows.slice(0), { tab: t.id, sort: t.sort, extra: t.extra });
    }
    drawChains(); drawTabs(); drawBody();
  }

  var css = document.createElement("style");
  css.textContent =
    ".dc-page{display:flex;flex-direction:column;gap:8px;min-width:0}" +
    ".dc-top{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line);min-width:0}" +
    ".dc-tabs{display:flex;gap:18px;overflow-x:auto;scrollbar-width:none;min-width:0;flex:1}.dc-tabs::-webkit-scrollbar{display:none}" +
    ".dc-tab{flex:0 0 auto;background:none;border:0;border-bottom:2px solid transparent;color:var(--mut);font-size:16px;font-weight:600;padding:8px 0;cursor:pointer;white-space:nowrap}" +
    ".dc-tab small{font-size:11px;font-weight:400;color:var(--mut);margin-left:2px}.dc-tab.on{color:var(--tx);border-bottom-color:var(--acc)}" +
    ".dc-src{font-size:11px;white-space:nowrap}.dc-chainrow{display:flex;align-items:center;gap:8px;min-width:0}.dc-chains{flex:1;min-width:0}" +
    ".dc-body{min-width:0}" +
    "@media (max-width:767px){.q-discover{padding:8px 10px}.dc-tabs{gap:14px}.dc-tab{font-size:14px;min-height:44px}.dc-src{display:none}}";
  document.head.appendChild(css);
  return { render: render };
})();
