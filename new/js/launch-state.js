/* launch-state.js: the one launch draft shared by Launch (#/launch) and Hook Studio (#/hooks/studio).
   Autosaves to this browser (contract 1.5.1 "drafts autosave"); reads ?like=ADDR, ?hook=ID and ?from=studio. Written by Claude. */
window.QHLaunchState = (function () {
  "use strict";
  var KEY = "qh-launch-draft-v1";
  var STOCKS = ["SPY", "META", "PLTR", "AAPL", "TSLA"];
  /* Chains that the live one-tap launch route accepts, with what each can trade against. */
  var CHAINS = {
    Robinhood: { id: "robinhood", unit: "ETH", pairs: ["ETH", "USDG"].concat(STOCKS), types: ["curve", "pool", "sale"] },
    Base: { id: "base", unit: "ETH", pairs: ["ETH"], types: ["curve", "pool", "sale"] },
    Arbitrum: { id: "arbitrum", unit: "ETH", pairs: ["ETH"], types: ["curve", "pool"] },
    BNB: { id: "bnb", unit: "BNB", pairs: ["BNB"], types: ["curve", "pool"] },
    Elysium: { id: "elysium", unit: "ETH", pairs: ["ETH"], types: ["curve", "pool"] },
    Solana: { id: "solana", unit: "SOL", pairs: ["SOL"], types: ["curve"] }
  };
  var TYPES = {
    curve: { label: "Bonding curve", note: "Price rises as people buy. Moves to a pool when it fills." },
    pool: { label: "Direct pool", note: "Opens straight into a pool. You add the first liquidity." },
    sale: { label: "Sale first", note: "Priced tiers sell first, then the pool opens." }
  };
  function fresh() {
    return { name: "", ticker: "", desc: "", x: "", tg: "", web: "", img: "", chain: "Robinhood", type: "curve", pair: "ETH", dev: "",
      preset: "standard", blocks: window.QHBlocks.presets.standard.ids.slice(0), more: false, vol: 50000, holders: 400,
      like: null, hookNote: "", phase: "form" };
  }
  var st = fresh();
  try { var raw = localStorage.getItem(KEY); if (raw) { var d = JSON.parse(raw); for (var k in d) if (k in st) st[k] = d[k]; } } catch (e) {}
  st.phase = "form";

  function save() {
    try { var c = {}; for (var k in st) if (k !== "img" && k !== "phase") c[k] = st[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
  }
  function reset() { var f = fresh(); Object.keys(f).forEach(function (k) { st[k] = f[k]; }); save(); return st; }
  function isStock(p) { return STOCKS.indexOf(p) >= 0; }
  function setChain(c) {
    if (!CHAINS[c]) return;
    st.chain = c; var cfg = CHAINS[c];
    if (cfg.pairs.indexOf(st.pair) < 0) st.pair = cfg.pairs[0];
    if (cfg.types.indexOf(st.type) < 0) st.type = cfg.types[0];
  }
  function setBlocks(ids) { st.blocks = ids.slice(0); st.preset = window.QHBlocks.presetOf(st.blocks); }
  function chainName(raw) {
    raw = String(raw || "").toLowerCase();
    for (var k in CHAINS) if (k.toLowerCase() === raw || CHAINS[k].id === raw) return k;
    return null;
  }
  function query(hash) {
    var q = {}, i = hash.indexOf("?");
    if (i < 0) return q;
    hash.slice(i + 1).split("&").forEach(function (p) { var kv = p.split("="); if (kv[0]) q[kv[0]] = decodeURIComponent(kv[1] || ""); });
    return q;
  }
  /* Apply the route's query to the draft. Returns a short note for the banner, or "". */
  function fromRoute(hash) {
    var q = query(hash || location.hash), note = "";
    if (q.like) {
      var t = (window.QH_TOKENS || []).filter(function (x) { return String(x.address).toLowerCase() === q.like.toLowerCase(); })[0];
      if (t) {
        var c = chainName(t.chain); if (c) setChain(c);
        var stage = t.stage === "migrated" ? "pool" : "curve";
        if (CHAINS[st.chain].types.indexOf(stage) >= 0) st.type = stage;
        if (t.quote && CHAINS[st.chain].pairs.indexOf(t.quote) >= 0) st.pair = t.quote;
        var hk = window.QHBlocks.fromHookId(t.hook && t.hook.id ? t.hook.id : "std");
        if (hk) setBlocks(hk.ids);
        st.like = { symbol: t.symbol, address: t.address };
        note = "Copied the setup of " + t.symbol + ": " + st.chain + ", " + TYPES[st.type].label.toLowerCase() + ", " + st.pair + " pair and its hooks. Name and image are yours to pick.";
      } else {
        st.like = { symbol: "", address: q.like };
        note = "We could not load that token, so this starts from the usual setup.";
      }
    }
    if (q.hook) {
      var h = window.QHBlocks.fromHookId(q.hook);
      if (h) { setBlocks(h.ids); note = (note ? note + " " : "") + h.name + " hook preselected."; }
      else note = (note ? note + " " : "") + "That hook is not in the library yet, so Standard is selected.";
    }
    if (q.from === "studio") note = "Hooks from Hook Studio are in. " + st.blocks.length + " blocks.";
    st.hookNote = note; save();
    return note;
  }
  return {
    get: function () { return st; }, save: save, reset: reset, setChain: setChain, setBlocks: setBlocks, fromRoute: fromRoute,
    isStock: isStock, CHAINS: CHAINS, TYPES: TYPES, STOCKS: STOCKS
  };
})();
