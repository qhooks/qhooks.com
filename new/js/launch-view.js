/* launch-view.js: markup for the one-screen launch (contract 1.3.3, 1.3.4, 1.5.1, 1.5.4). Written by Claude.
   Three zones (Identity, Market, Hooks) + cost box + live preview. Every fee is "set at launch"
   except the approved cashback and referral lines. No template literals. */
window.LaunchView = (function () {
  "use strict";
  var S = window.QHLaunchState, K = window.QHBlocks, esc = K.esc;
  function count(v, max) { return '<span class="lx-count' + (v.length > max ? " lx-over" : "") + '">' + v.length + "/" + max + "</span>"; }
  function pill(k, v, label, on, extra) { return '<button type="button" class="lx-pill' + (on ? " on" : "") + '" data-set="' + k + '" data-v="' + esc(v) + '">' + label + (extra || "") + "</button>"; }
  function field(k, label, max, val, ph, extra) {
    return '<label class="lx-field"><span class="lx-lab">' + label + (max ? " " + count(val, max) : "") + "</span>" +
      '<input class="lx-in" data-k="' + k + '" value="' + esc(val) + '" placeholder="' + ph + '" autocomplete="off"' + (extra || "") + "></label>";
  }
  /* Inline checks for name and ticker; the ticker check looks for the same symbol on the same chain. */
  function nameMsg(s) {
    if (!s.name) return "";
    if (s.name.length > 32 || /[<>]/.test(s.name)) return '<div class="lx-msg lx-bad">Use 1 to 32 characters, no angle brackets.</div>';
    return "";
  }
  function tickerMsg(s) {
    if (!s.ticker) return "";
    if (!/^[A-Z0-9]{2,10}$/.test(s.ticker)) return '<div class="lx-msg lx-bad">2 to 10 letters or numbers.</div>';
    var taken = (window.QH_TOKENS || []).some(function (t) { return t.symbol === s.ticker && String(t.chain).toLowerCase() === s.chain.toLowerCase(); });
    return taken ? '<div class="lx-msg lx-warn">' + s.ticker + " already trades on " + s.chain + ". You can still use it, but buyers may mix them up.</div>"
      : '<div class="lx-msg lx-ok">' + s.ticker + " is free on " + s.chain + ".</div>";
  }
  function identity(s) {
    var tile = s.img ? '<img src="' + s.img + '" alt="">' : '<span>' + esc((s.ticker || s.name || "?").charAt(0)) + "</span>";
    return '<section class="lx-zone"><div class="lx-zh"><b>1</b> Identity</div>' +
      '<div class="lx-idrow"><label class="lx-drop" title="Add image">' + tile + '<input type="file" accept="image/*" data-img hidden></label>' +
      '<div class="lx-idtext"><div class="lx-hint">Square image, 5 MB max. Drop it here or paste it; we crop it square.</div>' +
      '<label class="lx-filebtn">Choose image<input type="file" accept="image/*" data-img hidden></label></div></div>' +
      '<div class="lx-two">' + field("name", "Name", 32, s.name, "Night Market") + field("ticker", "Ticker", 10, s.ticker, "NIGHT", ' autocapitalize="characters"') + "</div>" +
      nameMsg(s) + tickerMsg(s) +
      '<button type="button" class="lx-more" data-more>' + (s.more ? "Hide description and links" : "Add description and links (optional)") + "</button>" +
      (s.more ? '<label class="lx-field"><span class="lx-lab">Description ' + count(s.desc, 256) + '</span><textarea class="lx-in" data-k="desc" rows="3" placeholder="A line or two. Links go below.">' + esc(s.desc) + "</textarea></label>" +
        '<div class="lx-three">' + field("x", "X", 0, s.x, "@handle") + field("tg", "Telegram", 0, s.tg, "t.me/group") + field("web", "Website", 0, s.web, "https://") + "</div>" : "") +
      "</section>";
  }
  function market(s) {
    var cfg = S.CHAINS[s.chain], unit = cfg.unit;
    var types = cfg.types.map(function (t) {
      return '<button type="button" class="lx-type' + (s.type === t ? " on" : "") + '" data-set="type" data-v="' + t + '"><b>' + S.TYPES[t].label + "</b><span>" + S.TYPES[t].note + "</span></button>";
    }).join("");
    var pairs = cfg.pairs.map(function (p) { return pill("pair", p, p, s.pair === p, S.isStock(p) ? ' <span class="lx-tag">Stock</span>' : ""); }).join("");
    var dev = parseFloat(s.dev);
    return '<section class="lx-zone"><div class="lx-zh"><b>2</b> Market</div>' +
      '<div class="lx-lab">Chain</div><div class="lx-pills">' + Object.keys(S.CHAINS).map(function (c) { return pill("chain", c, c, s.chain === c); }).join("") + "</div>" +
      '<div class="lx-lab">Launch type</div><div class="lx-types">' + types + "</div>" +
      '<div class="lx-lab">Trades against</div><div class="lx-pills">' + pairs + "</div>" +
      (S.isStock(s.pair) ? '<div class="lx-msg lx-warn">Stock pairs are not offered to US persons. We check this before you sign.</div>' : "") +
      '<div class="lx-two">' + '<label class="lx-field"><span class="lx-lab">Your first buy (optional, ' + unit + ')</span><input class="lx-in" data-k="dev" inputmode="decimal" value="' + esc(s.dev) + '" placeholder="0"></label>' +
      '<div class="lx-field"><span class="lx-lab">Start and liquidity</span><div class="lx-fixed">Supply 1B · start MC set at launch</div></div></div>' +
      (dev > 0 ? '<div class="lx-msg">Bought in the same signature as the launch. Share of supply: see the estimate below.</div>' : "") +
      "</section>";
  }
  function hooks(s) {
    var ps = K.presets, keys = Object.keys(ps);
    var pills = keys.map(function (k) { return pill("preset", k, ps[k].label, s.preset === k); }).join("") + pill("preset", "custom", "Custom", s.preset === "custom");
    var rows = s.blocks.map(function (id) {
      var b = K.get(id); if (!b) return "";
      return K.row(b, '<button type="button" class="lx-x" data-drop="' + id + '" aria-label="Remove ' + esc(b.name) + '">Remove</button>');
    }).join("");
    var checks = K.check(s.blocks).map(function (c) { return '<div class="lx-msg ' + (c.level === "stop" ? "lx-bad" : "lx-warn") + '">' + esc(c.text) + "</div>"; }).join("");
    return '<section class="lx-zone"><div class="lx-zh"><b>3</b> Hooks <span class="lx-zn">' + s.blocks.length + " blocks</span></div>" +
      '<div class="lx-pills">' + pills + "</div>" +
      '<div class="lx-hint">' + (ps[s.preset] ? ps[s.preset].note : "Your own mix from Hook Studio") + ". Every block below says what it does and its risk.</div>" +
      '<div class="lx-blocks">' + (rows || '<div class="lx-msg">No hooks. The pool trades plain.</div>') + "</div>" + checks +
      '<a class="lx-studio" href="#/hooks/studio?from=launch">Customize hooks in Hook Studio</a></section>';
  }
  function precheck(s) {
    var bad = K.check(s.blocks).filter(function (c) { return c.level === "stop"; });
    if (bad.length) return '<div class="lx-pre lx-bad">QProof pre-check: needs a fix. ' + esc(bad[0].text) + "</div>";
    var watch = s.blocks.filter(function (id) { var b = K.get(id); return b && b.risk !== "low"; }).length;
    return '<div class="lx-pre ' + (watch ? "lx-warn" : "lx-ok") + '">QProof pre-check: ' + (watch ? "Watch" : "Clear") +
      ". Sells stay open, fees stay inside fixed bounds, no owner switch over trading" + (watch ? "; " + watch + " block" + (watch > 1 ? "s" : "") + " with timed or moving rules." : ".") + "</div>";
  }
  function cost(s) {
    var unit = S.CHAINS[s.chain].unit, dev = parseFloat(s.dev) > 0 ? s.dev + " " + unit : "None";
    var acts = ["Creates " + (s.ticker || "your token") + " with 1B supply", "Opens the " + S.TYPES[s.type].label.toLowerCase() + " against " + s.pair, "Attaches " + s.blocks.length + " hook blocks"];
    if (parseFloat(s.dev) > 0) acts.push("Buys " + dev + " for you");
    return '<section class="lx-cost"><div class="lx-lab">What you pay</div>' +
      '<div class="lx-cr"><span>Launch fee</span><b class="lx-ph">Set at launch</b></div>' +
      '<div class="lx-cr"><span>Network fee</span><b class="lx-ph">Your wallet shows it</b></div>' +
      '<div class="lx-cr"><span>First buy</span><b>' + esc(dev) + "</b></div>" +
      '<div class="lx-cr"><span>Trading fee on this pool</span><b class="lx-ph">Set at launch</b></div>' +
      '<div class="lx-cr lx-tot"><span>Total</span><b>' + (parseFloat(s.dev) > 0 ? esc(dev) + " + fees set at launch" : "Fees set at launch") + "</b></div>" +
      '<div class="lx-acts"><div class="lx-lab">One signature does all of this</div>' + acts.map(function (a) { return "<div>" + esc(a) + "</div>"; }).join("") + "</div>" +
      (s.blocks.indexOf("cashback") >= 0 ? '<div class="lx-perk">' + esc(K.CASHBACK) + "</div>" : "") +
      (s.blocks.indexOf("referrals") >= 0 ? '<div class="lx-perk">' + esc(K.REFERRAL) + "</div>" : "") +
      precheck(s) + "</section>";
  }
  function draftToken(s) {
    var risk = s.blocks.some(function (id) { var b = K.get(id); return b && b.risk !== "low"; }) ? "medium" : "low";
    var hk = K.presets[s.preset] ? K.presets[s.preset].label : "Custom";
    return { address: "draft", href: "#/launch", symbol: s.ticker || "TICKER", name: s.name || "Your token", ageSec: 0, holders: 0, volume: 0, mcap: 0,
      top10: 0, dev: 0, sniper: 0, bundler: 0, qProof: "Not checked", chain: s.chain, native: S.CHAINS[s.chain].unit, logo: s.img || "", candles: [],
      hook: { id: s.preset === "custom" ? "custom" : s.preset, name: hk, risk: risk } };
  }
  function preview(s) {
    var t = draftToken(s), row = window.PulseRow && window.PulseRow.renderRow ? window.PulseRow.renderRow(t) : "";
    var tile = s.img ? '<img src="' + s.img + '" alt="">' : esc(t.symbol.charAt(0));
    return '<aside class="lx-prev"><div class="lx-lab">How it shows in Pulse</div><div class="lx-prow">' + row + "</div>" +
      '<div class="lx-lab">Token page header</div><div class="lx-head"><div class="lx-htile">' + tile + '</div><div><b>' + esc(t.symbol) + "</b> <span>" + esc(t.name) + "</span>" +
      '<div class="lx-hsub">' + esc(s.chain) + " · " + S.TYPES[s.type].label + " · " + esc(s.pair) + " pair · " + (window.HookBadge ? window.HookBadge.html(t).replace("<a ", "<span ").replace(/ href="[^"]*"/, "").replace("</a>", "</span>") : "") + "</div></div></div>" +
      '<div class="lx-lab">Share card</div><div class="lx-card"><div class="lx-ctile">' + tile + '</div><div><b>$' + esc(t.symbol) + "</b><div>" + esc(t.name) + "</div>" +
      '<div class="lx-hsub">New on QHooks · ' + esc(s.chain) + "</div></div></div></aside>";
  }
  return { identity: identity, market: market, hooks: hooks, cost: cost, preview: preview, draftToken: draftToken };
})();
