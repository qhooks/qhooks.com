/* hook-blocks.js: one shared catalogue of QHooks hook blocks, used by Launch, Hook Studio and the hook page,
   so each block reads the same everywhere (contract 1.5.1-1.5.4, 1.6.4). Written by Claude.
   Money rule: rates are "set at launch" except the two approved lines (cashback, referrals). */
window.QHBlocks = (function () {
  "use strict";
  var CASHBACK = "30% back on EVM trades · 40% on Robinhood Chain if you hold 100K QHOOKS";
  var REFERRAL = "Bring traders, get 20% of their fee";
  var B = [
    { id: "cashback", group: "rewards", name: "Cashback", when: "After swap", risk: "low",
      does: "Sends part of each trade fee back to the trader who paid it.", sees: CASHBACK,
      why: "Only pays out. It cannot block a sell or raise the fee." },
    { id: "referrals", group: "rewards", name: "Referrals", when: "After swap", risk: "low",
      does: "Pays the wallet that brought a trader a share of that trader's fees.", sees: REFERRAL,
      why: "Only pays out from the fee. Trade prices do not change." },
    { id: "antisnipe", group: "protect", name: "Anti-snipe", when: "Before swap", risk: "low",
      does: "Caps how much one wallet can buy in the first minutes, then lifts by itself.", sees: "Early buys have a size cap for a short window.",
      why: "Limits buys for a fixed window only. Sells are never limited." },
    { id: "revshare", group: "rewards", name: "Holder share", when: "After swap", risk: "low",
      does: "Routes a share of the fee to holders who stake the token.", sees: "Stakers earn from trading volume.",
      why: "Only pays out. The share is fixed at launch." },
    { id: "buyback", group: "support", name: "Buyback", when: "After swap", risk: "low",
      does: "Uses part of the fee to buy the token back from its own pool.", sees: "Fees turn into steady buys.",
      why: "Buys only. It never sells or moves holder tokens." },
    { id: "floor", group: "support", name: "Price floor", when: "Pool", risk: "medium",
      does: "Keeps a reserve that bids at a floor price under the market.", sees: "A reserve bids at the floor while it lasts.",
      why: "The floor holds only while the reserve has funds." },
    { id: "dynfee", group: "protect", name: "Busy-hour fee", when: "Before swap", risk: "medium",
      does: "Raises the fee when price swings hard and lowers it when calm, inside fixed bounds.", sees: "The fee moves inside a range shown before each trade.",
      why: "The fee can change, but never outside the bounds set at launch." },
    { id: "lock", group: "protect", name: "Supply lock", when: "Launch", risk: "low",
      does: "Locks the creator's tokens in QLocks with a public unlock date.", sees: "Creator tokens are locked until a date anyone can check.",
      why: "Removes a dump risk. Nothing to change after launch." },
    { id: "sale", group: "trading", name: "Sale tiers", when: "Launch", risk: "medium",
      does: "Sells the first supply in priced tiers before open trading starts.", sees: "Early tiers fill first, then the pool opens.",
      why: "Trading opens only after the sale ends or sells out." },
    { id: "limits", group: "trading", name: "Limit orders", when: "After swap", risk: "low",
      does: "Fills resting orders inside the pool when the price crosses them.", sees: "Set a price; it fills inside the pool.",
      why: "Fills orders only. It cannot touch other wallets." },
    { id: "arb", group: "protect", name: "Arb recapture", when: "Before swap", risk: "low",
      does: "Keeps the profit from price gaps in the pool instead of losing it to bots.", sees: "Price-gap profit stays with the pool.",
      why: "Changes who earns from gaps, not what traders pay." }
  ];
  var PRESETS = {
    standard: { label: "Standard", note: "Cashback, referrals and anti-snipe", ids: ["cashback", "referrals", "antisnipe"] },
    community: { label: "Community", note: "Standard plus a share for stakers", ids: ["cashback", "referrals", "antisnipe", "revshare"] },
    builder: { label: "Builder", note: "Standard plus buyback and a floor", ids: ["cashback", "referrals", "antisnipe", "buyback", "floor"] }
  };
  /* Library groups, in the order Hook Studio lists them. (Fable) */
  var GROUPS = [{ id: "rewards", label: "Rewards" }, { id: "protect", label: "Protection" }, { id: "support", label: "Price support" }, { id: "trading", label: "Trading" }];
  var RISK = { low: "Low risk", medium: "Watch", high: "High risk" };
  var MAX = 8;

  function get(id) { for (var i = 0; i < B.length; i++) if (B[i].id === id) return B[i]; return null; }
  function has(ids, id) { return ids.indexOf(id) >= 0; }
  /* Plain-language checks on a stack of block ids. Each item: { level: "stop"|"note", text }. */
  function check(ids) {
    var out = [];
    if (has(ids, "antisnipe") && has(ids, "sale")) out.push({ level: "stop", text: "Anti-snipe and Sale tiers both set rules for the first minutes. Keep one." });
    if (has(ids, "floor") && !has(ids, "buyback")) out.push({ level: "note", text: "Price floor has no top-up. Add Buyback so fees refill the reserve." });
    if (ids.length > MAX) out.push({ level: "stop", text: "Up to " + MAX + " blocks per hook. Remove " + (ids.length - MAX) + "." });
    if (!has(ids, "cashback")) out.push({ level: "note", text: "Without Cashback, traders here get nothing back. Most launches keep it." });
    return out;
  }
  function ready(ids) { return ids.length > 0 && check(ids).every(function (c) { return c.level !== "stop"; }); }
  /* Which preset an id list equals, or "custom". */
  function presetOf(ids) {
    var keys = Object.keys(PRESETS);
    for (var i = 0; i < keys.length; i++) {
      var p = PRESETS[keys[i]].ids;
      if (p.length === ids.length && p.every(function (x) { return has(ids, x); })) return keys[i];
    }
    return "custom";
  }
  /* A hook id from a badge or hook page: "std" or a preset name, or a single block id. */
  function fromHookId(id) {
    id = String(id || "").toLowerCase();
    if (id === "std" || id === "standard") return { ids: PRESETS.standard.ids.slice(0), name: "Standard" };
    if (PRESETS[id]) return { ids: PRESETS[id].ids.slice(0), name: PRESETS[id].label };
    var b = get(id);
    if (b) { var ids = PRESETS.standard.ids.slice(0); if (!has(ids, id)) ids.push(id); return { ids: ids, name: b.name }; }
    return null;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  /* One block as a row: name, when, plain what-it-does, what traders see, risk chip + why. Same markup everywhere. */
  function row(b, tail) {
    return '<div class="hb-row" data-block="' + b.id + '"><div class="hb-main"><div class="hb-top"><b>' + esc(b.name) + '</b><span class="hb-when">' + esc(b.when) + "</span>" +
      '<span class="hb-risk hb-' + b.risk + '">' + RISK[b.risk] + "</span></div>" +
      '<div class="hb-does">' + esc(b.does) + "</div>" +
      '<div class="hb-sees"><span>Traders see</span> ' + esc(b.sees) + "</div>" +
      '<div class="hb-why">' + esc(b.why) + "</div></div>" + (tail || "") + "</div>";
  }
  return { list: B, groups: GROUPS, presets: PRESETS, get: get, check: check, ready: ready, presetOf: presetOf, fromHookId: fromHookId, row: row, esc: esc, RISK: RISK, MAX: MAX, CASHBACK: CASHBACK, REFERRAL: REFERRAL };
})();
