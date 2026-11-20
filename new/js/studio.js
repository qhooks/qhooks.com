/* studio.js: Hook Studio at #/hooks/studio (contract 1.5.2, 1.5.4). Rewritten by Claude.
   Opens with the launch draft's blocks (QHLaunchState); "Use these hooks" writes them back and returns to #/launch.
   Block rows come from QHBlocks so they read exactly as on Launch and the hook page. No template literals. */
window.Studio = (function () {
  "use strict";
  var K = window.QHBlocks, S = window.QHLaunchState, esc = K.esc;
  var ui = { tab: "compose", view: "blocks", blocks: [], test: "", open: null };

  function chip(ids) {
    var ok = K.ready(ids);
    return '<span class="sx-chip ' + (ok ? "sx-ok" : "sx-bad") + '">' + (ok ? "Ready" : ids.length ? "Needs a fix" : "Empty") + "</span>";
  }
  function presets() {
    return '<div class="sx-presets">' + Object.keys(K.presets).map(function (k) {
      var p = K.presets[k], on = K.presetOf(ui.blocks) === k;
      return '<button type="button" class="sx-preset' + (on ? " on" : "") + '" data-preset="' + k + '"><b>' + p.label + "</b><span>" + p.ids.length + " blocks · " + esc(p.note) + "</span></button>";
    }).join("") + "</div>";
  }
  /* Library in groups (Rewards / Protection / Price support / Trading). Each group folds; on phone only the
     first starts open, so the page is a short list of headers instead of every block at once. (Fable) */
  function library() {
    if (!ui.open) { ui.open = {}; K.groups.forEach(function (g, i) { ui.open[g.id] = window.innerWidth >= 768 || i === 0; }); }
    return '<div class="sx-lib">' + K.groups.map(function (g) {
      var items = K.list.filter(function (b) { return b.group === g.id; }), open = ui.open[g.id];
      var added = items.filter(function (b) { return ui.blocks.indexOf(b.id) >= 0; }).length;
      return '<section class="sx-grp' + (open ? " open" : "") + '"><button type="button" class="sx-gh" data-group="' + g.id + '" aria-expanded="' + (open ? "true" : "false") + '">' +
        '<b>' + esc(g.label) + '</b><span class="sx-gn">' + (open ? items.length + " blocks" : esc(items.map(function (b) { return b.name; }).join(" · "))) + "</span>" +
        '<span class="sx-ga' + (added ? " on" : "") + '">' + added + " added</span><span class=\"sx-gx\">" + (open ? "Hide" : "Show") + "</span></button>" +
        (open ? items.map(function (b) {
          var on = ui.blocks.indexOf(b.id) >= 0;
          return K.row(b, '<button type="button" class="sx-add' + (on ? " on" : "") + '" data-toggle="' + b.id + '">' + (on ? "Added" : "Add") + "</button>");
        }).join("") : "") + "</section>";
    }).join("") + "</div>";
  }
  /* The order a buy meets the blocks: before swap, pool, after swap; launch-only blocks listed apart. */
  function ordered() {
    var rank = { "Launch": 0, "Before swap": 1, "Pool": 2, "After swap": 3 };
    return ui.blocks.map(K.get).filter(Boolean).sort(function (a, b) { return rank[a.when] - rank[b.when]; });
  }
  function stack() {
    if (!ui.blocks.length) return '<div class="sx-empty">Add a block from the list. A hook with no blocks trades as a plain pool.</div>';
    if (ui.view === "path") {
      return '<div class="sx-path"><div class="sx-step sx-end">A buy comes in</div>' + ordered().map(function (b, i) {
        return '<div class="sx-step"><span class="sx-n">' + (i + 1) + "</span><b>" + esc(b.name) + '</b><span class="sx-w">' + esc(b.when) + "</span><div>" + esc(b.sees) + "</div></div>";
      }).join("") + '<div class="sx-step sx-end">Tokens reach the buyer</div></div>';
    }
    return '<div class="sx-stack">' + ordered().map(function (b) {
      return '<div class="sx-it"><div><b>' + esc(b.name) + '</b><span class="hb-risk hb-' + b.risk + '">' + K.RISK[b.risk] + "</span><div>" + esc(b.does) + "</div></div>" +
        '<button type="button" class="sx-rm" data-toggle="' + b.id + '" aria-label="Remove ' + esc(b.name) + '">Remove</button></div>';
    }).join("") + "</div>";
  }
  function testBuy() {
    var has = function (id) { return ui.blocks.indexOf(id) >= 0; }, lines = [];
    lines.push("The buyer pays 1 ETH plus the trading fee, which is set at launch.");
    if (has("antisnipe")) lines.push("Anti-snipe: in the first minutes, a buy over the cap is trimmed to the cap.");
    if (has("dynfee")) lines.push("Busy-hour fee: the fee sits inside its fixed range, shown before the buy.");
    if (has("arb")) lines.push("Arb recapture: any price gap profit stays with the pool.");
    if (has("cashback")) lines.push("Cashback: 30% of the fee goes back to the buyer (40% on Robinhood Chain with 100K QHOOKS).");
    if (has("referrals")) lines.push("Referrals: if someone brought this buyer, they get 20% of the fee.");
    if (has("buyback")) lines.push("Buyback: part of the fee buys the token back from the pool.");
    if (has("revshare")) lines.push("Holder share: part of the fee goes to stakers.");
    if (has("floor")) lines.push("Price floor: part of the fee tops up the floor reserve.");
    lines.push("A sell of the same tokens goes through. No block here can stop it.");
    return '<div class="sx-test"><div class="sx-lab">Test buy, 1 ETH <span class="sx-est">Simulated</span></div>' + lines.map(function (l) { return "<div>" + esc(l) + "</div>"; }).join("") + "</div>";
  }
  function draw(root) {
    var s = S.get(), checks = K.check(ui.blocks);
    root.innerHTML = '<div class="sx"><div class="sx-top"><div><div class="sx-k">HOOK STUDIO' + (s.ticker ? " · FOR $" + esc(s.ticker) : "") + "</div><h1>Build the hook for your pool</h1>" +
      '<div class="lx-hint">Pick blocks. Each one says what it does, what traders see and how risky it is. Problems show as you go.</div></div>' +
      '<a class="lx-btn" href="#/launch">Back to launch</a></div>' +
      '<div class="sx-tabs"><button type="button" class="sx-tab' + (ui.tab === "compose" ? " on" : "") + '" data-tab="compose">Pick blocks</button>' +
      '<button type="button" class="sx-tab' + (ui.tab === "preset" ? " on" : "") + '" data-tab="preset">Start from a preset</button></div>' +
      '<div class="sx-grid"><div>' + (ui.tab === "preset" ? presets() : "") + library() + "</div>" +
      '<aside class="sx-card"><div class="sx-ch"><b>Your hook</b><span class="sx-cnt">' + ui.blocks.length + "/" + K.MAX + " blocks</span>" + chip(ui.blocks) + "</div>" +
      '<div class="sx-seg"><button type="button" class="' + (ui.view === "blocks" ? "on" : "") + '" data-view="blocks">Blocks</button><button type="button" class="' + (ui.view === "path" ? "on" : "") + '" data-view="path">Buy path</button></div>' +
      stack() + checks.map(function (c) { return '<div class="lx-msg ' + (c.level === "stop" ? "lx-bad" : "lx-warn") + '">' + esc(c.text) + "</div>"; }).join("") +
      (ui.test ? testBuy() : "") +
      '<button type="button" class="lx-btn sx-run" data-test>' + (ui.test ? "Run the test buy again" : "Run a test buy") + "</button>" +
      '<div class="sx-bar"><button type="button" class="lx-go" data-use' + (K.ready(ui.blocks) || !ui.blocks.length ? "" : " disabled") + ">Use these hooks</button>" +
      '<div class="lx-gosub">Goes back to your launch with these ' + ui.blocks.length + " blocks.</div></div></aside></div></div>";
  }
  function render(root) {
    ui.blocks = S.get().blocks.slice(0); ui.test = ""; ui.view = "blocks";
    draw(root);
    root.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.tab) { ui.tab = b.dataset.tab; }
      else if (b.dataset.view) { ui.view = b.dataset.view; }
      else if (b.dataset.group) { ui.open[b.dataset.group] = !ui.open[b.dataset.group]; }
      else if (b.dataset.preset) { ui.blocks = K.presets[b.dataset.preset].ids.slice(0); ui.test = ""; }
      else if (b.dataset.toggle) {
        var id = b.dataset.toggle, i = ui.blocks.indexOf(id);
        if (i >= 0) ui.blocks.splice(i, 1); else ui.blocks.push(id);
        ui.test = "";
      }
      else if (b.hasAttribute("data-test")) { ui.test = "1"; }
      else if (b.hasAttribute("data-use")) { S.setBlocks(ui.blocks); S.save(); location.hash = "#/launch?from=studio"; return; }
      else return;
      var y = window.scrollY; draw(root); window.scrollTo(0, y);
    });
  }
  return { render: render };
})();
