/* Hook page (contract 1.5.3 + 1.6.2 + 1.6.4: every hook badge opens a plain explainer).
   Written by Claude. Block rows come from QHBlocks so they match Launch and Hook Studio exactly.
   Hook facts are fixtures until the hook registry is wired. */
window.HookPage = (function () {
  "use strict";
  var OWNER = { std: "No owner controls. The contract is fixed once deployed." };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function render(root, id) {
    var K = window.QHBlocks, h = K ? K.fromHookId(id) : null;
    var blocks = h ? h.ids.map(K.get).filter(Boolean) : [];
    var risk = blocks.some(function (b) { return b.risk !== "low"; }) ? "medium" : (h ? "low" : "medium");
    var users = (window.QH_TOKENS || []).filter(function (t) { return !t.hook || t.hook.id === id; }).slice(0, 8);
    var sim = { blocks: h ? h.ids : [], vol: 50000, holders: 400, type: "pool" };
    root.innerHTML =
      '<div class="hp-wrap"><div class="hp-k">HOOK</div><h1>' + esc(h ? h.name : id) + ' <span class="hk-badge hk-' + risk + '">' + risk + " risk</span></h1>" +
      '<section class="hp-card"><h2>What it does</h2>' +
      (blocks.length ? blocks.map(function (b) { return K.row(b); }).join("") : '<div class="hp-row">We have not explained this hook yet. Check its QProof report before trading.</div>') +
      '<div class="hp-row hp-mut">' + esc(OWNER[id] || (h ? "Fees and splits are set at launch and fixed after that." : "Unknown")) + "</div></section>" +
      (window.LaunchSim && h ? '<section class="hp-card hp-sim">' + window.LaunchSim.html(sim) + "</section>" : "") +
      '<section class="hp-card"><h2>Tokens using it</h2>' + users.map(function (t) {
        return '<a class="hp-row hp-tok" href="#/token/' + esc(t.address) + '"><b>' + esc(t.symbol) + '</b><span>' + esc(t.name) + "</span></a>";
      }).join("") + "</section>" +
      '<a class="hp-cta" href="#/launch?hook=' + esc(id) + '">Launch with this hook</a></div>';
    if (window.LaunchSim && h) window.LaunchSim.bind(root, sim);
  }
  var css = document.createElement("style");
  css.textContent =
    ".hp-wrap{padding:16px;max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:12px}.hp-k{font-size:11px;letter-spacing:.06em;color:var(--acc)}" +
    ".hp-wrap h1{font-size:24px;margin:0;display:flex;align-items:center;gap:10px}.hp-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:14px}" +
    ".hp-card h2{font-size:14px;margin:0 0 6px}.hp-row{font-size:13px;padding:9px 0;border-top:1px solid var(--line)}.hp-mut{color:var(--mut)}" +
    ".hp-tok{display:flex;gap:8px;color:var(--tx);text-decoration:none;min-height:24px}.hp-tok span{color:var(--mut)}" +
    ".hp-cta{display:flex;align-items:center;justify-content:center;height:48px;border-radius:6px;background:var(--acc);color:#140d00;font-weight:600;text-decoration:none}";
  document.head.appendChild(css);
  return { render: render };
})();
