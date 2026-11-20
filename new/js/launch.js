/* launch.js: one-screen fast launch at #/launch (contract 1.3.3, 1.3.4, 1.5.1, 1.5.4, 1.6.1, 1.6.2). Written by Claude.
   State: QHLaunchState (shared with Hook Studio). Markup: LaunchView, LaunchSim. No real signing here:
   Launch asks the live prepare route, then the user's own wallet signs one transaction on the page it returns. */
window.Launch = (function () {
  "use strict";
  var S = window.QHLaunchState, V = window.LaunchView, K = window.QHBlocks, esc = K.esc;
  var run = { phase: "form", link: "", err: "", token: null, touched: false };

  function suggest(name) {
    var words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(" ").filter(Boolean);
    if (!words.length) return "";
    return (words[0].length >= 3 ? words[0] : words.join("")).slice(0, 8);
  }
  function valid(s) { return s.name && s.name.length <= 32 && !/[<>]/.test(s.name) && /^[A-Z0-9]{2,10}$/.test(s.ticker) && K.ready(s.blocks); }
  function missing(s) {
    if (!s.name) return "Add a name";
    if (!/^[A-Z0-9]{2,10}$/.test(s.ticker)) return "Add a 2 to 10 character ticker";
    if (!K.ready(s.blocks)) return "Fix the hook check above";
    return "";
  }
  function action(s) {
    var t = s.ticker || "token", miss = missing(s);
    if (run.phase === "signing") return '<button class="lx-go" disabled>' + esc(run.step || "Sign in your wallet") + '</button><div class="lx-gosub">One transaction from your own wallet. The token page opens when it confirms.</div>';
    if (run.phase === "preparing") return '<button class="lx-go" disabled>Preparing your launch</button><div class="lx-gosub">Asking the live launch route</div>';
    if (run.phase === "sign") return '<a class="lx-go" href="' + esc(run.link) + '" target="_blank" rel="noopener">Sign in your wallet</a>' +
      '<div class="lx-gosub">One transaction, signed by your wallet on qhooks.com. Name, ticker and chain carry over; check pair and hooks there before you sign.</div>' +
      '<button type="button" class="lx-btn" data-signed>I signed it, show my launch</button>';
    return '<button class="lx-go" data-launch' + (valid(s) ? "" : " disabled") + ">Launch " + esc(t) + "</button>" +
      '<div class="lx-gosub">' + (miss ? esc(miss) + " to continue" : "One signature from your wallet. Nothing else to approve.") + "</div>" +
      (run.err ? '<div class="lx-msg lx-bad">Launch did not start: ' + esc(run.err) + ' Everything is still filled in. <button type="button" class="lx-link" data-launch>Retry</button></div>' : "");
  }
  function success(s) {
    var t = run.token, url = location.href.split("#")[0] + "#/token/" + t.address;
    var tweet = "https://x.com/intent/post?text=" + encodeURIComponent("$" + t.symbol + " is live on QHooks " + url);
    return '<div class="lx-done"><div class="lx-k">LAUNCH SIGNED</div><h1>$' + esc(t.symbol) + " is launching on " + esc(s.chain) + "</h1>" +
      '<div class="lx-hint">This page shows your draft until the chain confirms the token. Then the numbers go live.</div>' +
      '<div class="lx-donegrid"><a class="lx-go" href="#/token/' + esc(t.address) + '">Open token page</a>' +
      '<div class="lx-share"><input class="lx-in" readonly value="' + esc(url) + '" aria-label="Share link"><button type="button" class="lx-btn" data-copy>Copy link</button>' +
      '<a class="lx-btn" href="' + esc(tweet) + '" target="_blank" rel="noopener">Post on X</a></div></div>' +
      '<div class="lx-lab">Next steps</div><div class="lx-next">' +
      '<a class="lx-step lx-acc" href="#/portfolio"><b>Set up QLocks</b><span>Lock your first buy and any team tokens. Buyers see the unlock date on the token page.</span></a>' +
      '<a class="lx-step" href="#/token/' + esc(t.address) + '"><b>Make a call</b><span>Post your entry so followers see it first.</span></a>' +
      '<a class="lx-step" href="#/agents?token=' + esc(t.address) + '"><b>Run an agent</b><span>Have an agent watch the token for you.</span></a>' +
      '<button type="button" class="lx-step" data-again><b>Launch another</b><span>Start a fresh form.</span></button></div></div>';
  }
  function draw(root) {
    var s = S.get();
    if (run.phase === "done") { root.innerHTML = '<div class="lx">' + success(s) + "</div>"; return; }
    root.innerHTML = '<div class="lx"><div class="lx-top"><div><h1>Launch a token</h1><div class="lx-hint">Name, ticker and image are all it needs. Everything else starts on a setting that works; change what you like.</div></div>' +
      '<div class="lx-topa"><button type="button" class="lx-btn" data-reset>Start over</button><a class="lx-btn" href="#/agents">Create an agent instead</a></div></div>' +
      (s.hookNote ? '<div class="lx-note">' + esc(s.hookNote) + "</div>" : "") +
      '<div class="lx-grid"><div class="lx-form">' + V.identity(s) + V.market(s) + V.hooks(s) +
      '<div class="lx-sim">' + window.LaunchSim.html(simState(s)) + "</div></div>" +
      '<div class="lx-side">' + V.preview(s) + V.cost(s) + '<div class="lx-bar">' + action(s) + "</div></div></div></div>";
  }
  function simState(s) { s.unit = S.CHAINS[s.chain].unit; return s; }
  /* Square-crop an image file to 256 px and keep it as a data URL. */
  function takeImage(file, root) {
    if (!file || !/^image\//.test(file.type)) return;
    if (file.size > 5 * 1024 * 1024) { alertMsg(root, "That image is over 5 MB. Pick a smaller one."); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement("canvas"), n = Math.min(im.width, im.height); c.width = c.height = 256;
        c.getContext("2d").drawImage(im, (im.width - n) / 2, (im.height - n) / 2, n, n, 0, 0, 256, 256);
        S.get().img = c.toDataURL("image/png"); draw(root);
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function alertMsg(root, text) { var z = root.querySelector(".lx-idtext"); if (z) z.insertAdjacentHTML("beforeend", '<div class="lx-msg lx-bad">' + esc(text) + "</div>"); }
  function launch(root) {
    var s = S.get(); if (!valid(s)) return;
    run.phase = "preparing"; run.err = ""; draw(root);
    var live = window.QHLive && window.QHLive.prepareLaunch;
    var req = { name: s.name, ticker: s.ticker, chain: S.CHAINS[s.chain].id };
    /* In-page launch (2026-11-20): needs prepare-launch to take the creator and return the unsigned deploy transaction.
       It does not yet (it answers "Unknown argument: creator." and returns only a qhooks.com link), so this stays off. */
    if (window.QH_LAUNCH_SIGN === true && window.QHWallet && window.QHWallet.address()) req.creator = window.QHWallet.address();
    var p = live ? window.QHLive.prepareLaunch(req) : Promise.resolve({ ok: false, body: { error: "The live launch route is not reachable from here." } });
    p.then(function (r) {
      var b = r && r.body;
      if (r && r.ok && b && Array.isArray(b.transactions) && b.transactions.length && window.QHSign) { signLaunch(root, b); return; }
      if (r && r.ok && b && b.link) { run.phase = "sign"; run.link = b.link; }
      else { run.phase = "form"; run.err = (b && b.error) || "The launch route did not answer."; }
      draw(root);
    });
  }
  /* Signs the launch in the visitor's wallet and opens the new token page on confirm (contract 1.3.3 Launch row). */
  function signLaunch(root, b) {
    var s = S.get(), chain = String(b.chain || S.CHAINS[s.chain].id), tt = window.QHSign.toast({ title: "Launch $" + s.ticker, chainId: chain });
    run.phase = "signing"; run.step = "Connect your wallet"; draw(root);
    window.QHWallet.ensure("evm").then(function (me) {
      if (!me) throw new Error("Connect a wallet to launch.");
      return window.QHSign.evm({ provider: me.provider, from: me.address, chainId: chain, txs: b.transactions, on: function (st, d) {
        if (st === "sign") run.step = "Sign in your wallet";
        if (st === "sent") { run.step = "Confirming on chain"; tt.set("submitted", { text: "Submitted", hash: d.hash }); }
        draw(root);
      } });
    }).then(function (x) {
      var token = b.token || b.predictedToken, h = x.hashes[x.hashes.length - 1];
      tt.set("confirmed", { text: "Launched", hash: h }); S.reset(); run.phase = "form";
      location.hash = token ? "#/token/" + chain + "/" + String(token).toLowerCase() : "#/portfolio";
    }).catch(function (e) {
      var why = window.QHSign.reason(e); run.phase = "form"; run.err = why; draw(root);
      tt.set("failed", { text: why, hash: e && e.hash, retry: function () { launch(root); } });
    });
  }
  function finish(root) {
    var s = S.get(), hex = "0x";
    for (var i = 0; i < 40; i++) hex += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
    var t = V.draftToken(s); t.address = hex; t.href = null; t.trades = []; t.stage = "new"; t.price = 0; t.liquidity = 0; t.insider = 0;
    window.QH_DRAFTS = (window.QH_DRAFTS || []).concat([t]);
    run.token = t; run.phase = "done"; draw(root); window.scrollTo(0, 0);
  }
  function setKey(s, k, v) {
    if (k === "ticker") { run.touched = v !== ""; s.ticker = v.toUpperCase().replace(/[^A-Z0-9]/g, ""); return; }
    s[k] = v;
    if (k === "name" && !run.touched) s.ticker = suggest(v);
  }
  function render(root) {
    run.phase = "form"; run.err = ""; run.touched = !!S.get().ticker;
    S.fromRoute(location.hash); draw(root);
    window.LaunchSim.bind(root, S.get(), function () { S.save(); });
    root.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var s = S.get();
      if (b.hasAttribute("data-launch")) { launch(root); return; }
      if (b.hasAttribute("data-signed")) { finish(root); return; }
      if (b.hasAttribute("data-more")) { s.more = !s.more; S.save(); draw(root); return; }
      if (b.hasAttribute("data-reset") || b.hasAttribute("data-again")) { S.reset(); run.phase = "form"; run.touched = false; history.replaceState(null, "", "#/launch"); draw(root); return; }
      if (b.hasAttribute("data-copy")) { var inp = root.querySelector(".lx-share input"); try { navigator.clipboard.writeText(inp.value); } catch (x) {} b.textContent = "Copied"; return; }
      if (b.dataset.drop) { S.setBlocks(s.blocks.filter(function (x) { return x !== b.dataset.drop; })); S.save(); draw(root); return; }
      if (b.dataset.set) {
        var k = b.dataset.set, v = b.dataset.v;
        if (k === "chain") S.setChain(v);
        else if (k === "preset") { if (K.presets[v]) S.setBlocks(K.presets[v].ids); else location.hash = "#/hooks/studio?from=launch"; }
        else s[k] = v;
        s.hookNote = ""; S.save(); draw(root);
      }
    });
    root.addEventListener("input", function (e) {
      var k = e.target.dataset && e.target.dataset.k; if (!k) return;
      var pos = e.target.selectionStart; setKey(S.get(), k, e.target.value); S.save(); draw(root);
      var el = root.querySelector('[data-k="' + k + '"]');
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) {} }
    });
    root.addEventListener("change", function (e) { if (e.target.hasAttribute && e.target.hasAttribute("data-img")) takeImage(e.target.files[0], root); });
    root.addEventListener("dragover", function (e) { if (e.target.closest(".lx-drop")) e.preventDefault(); });
    root.addEventListener("drop", function (e) { if (!e.target.closest(".lx-drop")) return; e.preventDefault(); takeImage(e.dataTransfer.files[0], root); });
    root.addEventListener("paste", function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) if (/^image\//.test(items[i].type)) { takeImage(items[i].getAsFile(), root); e.preventDefault(); return; }
    });
  }
  return { render: render };
})();
