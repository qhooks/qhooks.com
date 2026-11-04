// prototypes/pq-graduation/client/graduation-setup-fields.mjs
function normalizeGraduationSetupFields(input) {
  const fields = ["tokenName", "symbol", "decimals", "totalSupply", "quoteSupply", "notice"];
  if (input === null || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
    throw new TypeError("Input must be a plain data object");
  }
  const d = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(d);
  if (keys.length !== 6 || !keys.every((k) => fields.includes(k))) {
    throw new TypeError("Input must have exactly the six required fields");
  }
  const result = {};
  for (const k of fields) {
    const desc = d[k];
    if (!desc.enumerable || !Object.hasOwn(desc, "value") || typeof desc.value !== "string") {
      throw new TypeError("Field descriptors must be enumerable data strings");
    }
    result[k] = desc.value;
  }
  result.tokenName = result.tokenName.trim();
  if (!result.tokenName.isWellFormed() || new TextEncoder().encode(result.tokenName).length < 1 || new TextEncoder().encode(result.tokenName).length > 64) {
    throw new TypeError("tokenName must be well-formed and 1-64 bytes in UTF-8");
  }
  result.symbol = result.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(result.symbol)) {
    throw new TypeError("symbol must be 1-10 uppercase alphanumeric characters");
  }
  const bounds = {
    decimals: [0n, 18n],
    totalSupply: [1n, (1n << 256n) - 1n],
    quoteSupply: [1n, (1n << 256n) - 1n],
    notice: [3600n, 2592000n]
  };
  for (const k of ["decimals", "totalSupply", "quoteSupply", "notice"]) {
    const s = result[k];
    if (s.length > 78 || !/^(0|[1-9][0-9]*)$/.test(s)) {
      throw new TypeError("Numeric fields must be canonical unsigned decimal strings");
    }
    const n = BigInt(s);
    if (n < bounds[k][0] || n > bounds[k][1]) {
      throw new TypeError("Numeric field out of bounds");
    }
  }
  return Object.freeze(result);
}

// packages/token-launch/token-fields.mjs
function normalizeTokenFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
    throw new TypeError("Plain token fields required");
  }
  const fields = ["tokenName", "symbol", "decimals", "totalSupply"];
  const d = Object.getOwnPropertyDescriptors(input), keys = Reflect.ownKeys(d);
  if (keys.length !== fields.length || !keys.every((k) => fields.includes(k))) throw new TypeError("Exactly four token fields required");
  const values = {};
  for (const k of fields) {
    if (!d[k].enumerable || !Object.hasOwn(d[k], "value") || typeof d[k].value !== "string") throw new TypeError("Enumerable token data strings required");
    values[k] = d[k].value;
  }
  const normalized = normalizeGraduationSetupFields({ ...values, quoteSupply: "1", notice: "3600" });
  return Object.freeze(Object.fromEntries(fields.map((k) => [k, normalized[k]])));
}

// packages/multichain-swap/pool-package.mjs
var ensure = (ok, message) => {
  if (!ok) throw new TypeError(message);
};
var chains = ["8453", "4663", "1", "42161", "56", "5042"];
function exact(value, names) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, "Plain pool data required");
  const keys = Reflect.ownKeys(value), d = Object.getOwnPropertyDescriptors(value);
  ensure(keys.length === names.length && keys.every((k) => typeof k === "string" && names.includes(k) && d[k].enumerable && Object.hasOwn(d[k], "value")), "Exact public pool fields required");
  return Object.fromEntries(names.map((k) => [k, d[k].value]));
}
function hex(value, bytes) {
  ensure(typeof value === "string" && value.length === 2 + bytes * 2 && value.startsWith("0x") && !/[^0-9a-f]/.test(value.slice(2)) && BigInt(value) > 0n, "Canonical nonzero pool identity required");
  return value;
}
function decimal(value, min, max) {
  ensure(typeof value === "string" && value.length > 0 && value.length <= 78 && !/[^0-9]/.test(value) && BigInt(value).toString() === value && BigInt(value) >= min && BigInt(value) <= max, "Canonical bounded pool integer required");
  return value;
}
function readSwapPoolPackage(text) {
  ensure(typeof text === "string" && text.length > 0 && text.length <= 2e4, "Bounded public pool package required");
  const p = exact(JSON.parse(text), ["version", "kind", "chainId", "controller", "nonce", "constructor", "tokenFields"]);
  ensure(p.version === 1 && p.kind === "qhooks-trade-pool" && chains.includes(p.chainId), "Unknown pool package");
  hex(p.controller, 20);
  decimal(p.nonce, 0n, (1n << 64n) - 2n);
  const withBlocks = p.constructor && Object.hasOwn(p.constructor, "blocks");
  const c = exact(p.constructor, ["verifier", "owner", "publicKey", "manager", "currency0", "currency1", "quote", "notice", "collector", ...withBlocks ? ["blocks"] : []]);
  if (withBlocks) ensure(typeof c.blocks === "string" && /^0x[0-9a-f]{40}$/.test(c.blocks) && ![p.controller, c.verifier, c.owner, c.manager, c.currency0, c.currency1, c.collector].includes(c.blocks), "Canonical blocks contract required");
  for (const key of ["verifier", "owner", "manager", "currency0", "currency1", "quote", "collector"]) hex(c[key], 20);
  hex(c.publicKey, 32);
  decimal(c.notice, 3600n, 2592000n);
  ensure(BigInt(c.currency0) < BigInt(c.currency1) && [c.currency0, c.currency1].includes(c.quote), "Sorted token and quote pair required");
  ensure((/* @__PURE__ */ new Set([p.controller, c.verifier, c.owner, c.manager, c.currency0, c.currency1, c.collector])).size === 7, "Distinct launch graph identities required");
  const raw = exact(p.tokenFields, ["tokenName", "symbol", "decimals", "totalSupply"]), fields = normalizeTokenFields(raw);
  for (const k of Object.keys(raw)) ensure(raw[k] === fields[k] && !/\r|\n|\u2028|\u2029/.test(raw[k]), "Canonical token metadata required");
  return Object.freeze({ ...p, constructor: Object.freeze(c), tokenFields: fields });
}

// apps/marketplace-preview/trade-pool-links.mjs
var ensure2 = (ok, message) => {
  if (!ok) throw new TypeError(message);
};
function tradePoolLink(text) {
  const p = readSwapPoolPackage(text);
  return "/trade.html#pool=" + encodeURIComponent(JSON.stringify(p));
}
function readTradePoolLink(hash) {
  ensure2(typeof hash === "string" && hash.length <= 6e4 && hash.startsWith("#pool=") && !hash.includes("&"), "A single public pool link is required");
  const value = hash.slice(6);
  ensure2(value.length > 0, "Pool link is empty");
  return readSwapPoolPackage(decodeURIComponent(value));
}

// apps/marketplace-preview/l132-market-handoff.mjs
function marketListingLink(tradeUrl, origin) {
  if (typeof tradeUrl !== "string" || tradeUrl.length > 65e3) throw new TypeError("Get a public trade link first");
  const url = new URL(tradeUrl, origin);
  if (url.origin !== origin || url.pathname !== "/trade.html" || url.search || url.username || url.password) throw new TypeError("Use this site\u2019s public trade link");
  const pool = readTradePoolLink(url.hash), link = tradePoolLink(JSON.stringify(pool));
  return "/list-market.html" + link.slice("/trade.html".length);
}
function bindMarketHandoff({ document: d = document, target = window } = {}) {
  const link = d.getElementById("qlm-handoff"), input = d.getElementById("qh-trade-url") || d.getElementById("qt-share"), status = d.getElementById("qlm-handoff-status");
  if (!link || !input || !status) throw Error("Public market handoff controls are missing");
  const click = (event) => {
    try {
      link.href = marketListingLink(input.value, target.location.origin);
      status.textContent = "Listing review opens in a new tab. Nothing is submitted yet.";
    } catch {
      event.preventDefault();
      link.href = "/list-market.html";
      status.textContent = "Create or select a public trade link first.";
    }
  };
  const dispose = () => {
    link.removeEventListener("click", click);
    target.removeEventListener("pagehide", dispose);
  };
  link.addEventListener("click", click);
  target.addEventListener("pagehide", dispose);
  return Object.freeze({ dispose });
}

// apps/marketplace-preview/l132-market-handoff-entry.mjs
bindMarketHandoff();
