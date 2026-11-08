// apps/marketplace-preview/chain-catalog.mjs
import {BUILT,hiddenChainsOn} from './chains.mjs';
var launchChains = Object.freeze([
  Object.freeze({ id: "8453", slug: "base", name: "Base", gas: "ETH", feeModel: "op-stack", coreHref: "deploy.html", status: "QPool core setup available" }),
  Object.freeze({ id: "4663", slug: "robinhood", name: "Robinhood Chain", gas: "ETH", feeModel: "nitro", coreHref: null, status: "Integration in progress" }),
  Object.freeze({ id: "1", slug: "ethereum", name: "Ethereum", gas: "ETH", feeModel: "ethereum", coreHref: null, status: "Integration in progress" }),
  Object.freeze({ id: "42161", slug: "arbitrum", name: "Arbitrum One", gas: "ETH", feeModel: "nitro", coreHref: null, status: "Integration in progress" }),
  Object.freeze({ id: "56", slug: "bnb", name: "BNB Chain", gas: "BNB", feeModel: "bsc", coreHref: null, status: "Integration in progress" }),
  Object.freeze({ id: "5042", slug: "arc", name: "Arc", gas: "USDC", feeModel: "arc-stablecoin", coreHref: null, status: "Integration in progress" }),
  Object.freeze({ id: "99801", slug: "elysium", name: "Elysium Testnet", gas: "HYPE", feeModel: "nitro", coreHref: null, status: "Integration in progress" })
]);
function launchChain(id) {
  if (typeof id !== "string") throw new TypeError("Choose a chain ID");
  const chain = launchChains.find((c) => c.id === id);
  if (!chain) throw new TypeError("Chain is not in this rollout");
  return chain;
}

// apps/marketplace-preview/l131-market-cards.mjs
function renderMarketCards({ document: d, container, rows, chainFor, onOpen }) {
  container.replaceChildren();
  for (const row of rows) {
    const article = d.createElement("article");
    article.className = "market-card";
    const chain = chainFor(row.chainId);
    const chainPara = d.createElement("p");
    chainPara.className = "market-chain";
    const img = d.createElement("img");
    img.src = "/chain-symbol-icons/" + chain.slug + ".svg";
    img.width = 20;
    img.height = 20;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    const span = d.createElement("span");
    span.textContent = chain.name;
    chainPara.append(img, span);
    const h2 = d.createElement("h2");
    h2.textContent = row.tokenName;
    const symbolP = d.createElement("p");
    symbolP.className = "market-symbol";
    symbolP.textContent = row.symbol;
    const addressP = d.createElement("p");
    addressP.className = "market-address";
    addressP.textContent = row.token;
    const statusP = d.createElement("p");
    statusP.textContent = row.status === "unavailable" ? "Market unavailable" : row.status === "observed" ? "Recently checked" : "Refreshes when you trade";
    const button = d.createElement("button");
    button.type = "button";
    button.className = "workspace-button";
    button.textContent = "Open market";
    button.disabled = row.status === "unavailable";
    button.addEventListener("click", () => onOpen(row));
    article.append(chainPara, h2, symbolP, addressP, statusP, button);
    container.append(article);
  }
}

// packages/market-directory/l128-directory-select.mjs
function selectMarkets(rows, { chainId = "all", query = "", offset = 0, limit = 24 } = {}) {
  const ensure3 = (ok, message) => {
    if (!ok) throw new TypeError(message);
  };
  const chains2 = ["1", "56", "8453", "42161", "4663", "5042", "99801"];
  const address = (value) => typeof value === "string" && value.length === 42 && /^0x[0-9a-f]{40}$/.test(value) && BigInt(value) > 0n;
  ensure3(Array.isArray(rows) && rows.length <= 1e3, "Bounded market rows required");
  ensure3(chainId === "all" || chains2.includes(chainId), "Invalid directory chain");
  ensure3(typeof query === "string" && query.length <= 100, "Search text must be at most 100 characters");
  ensure3(Number.isSafeInteger(offset) && offset >= 0 && offset <= 1e3, "Invalid directory offset");
  ensure3(Number.isSafeInteger(limit) && limit >= 1 && limit <= 24, "Invalid directory limit");
  const search = query.trim().toLowerCase(), seen = /* @__PURE__ */ new Set(), filtered = [];
  const fields2 = ["chainId", "controller", "token", "tokenName", "symbol", "listedAt"];
  for (const input of rows) {
    ensure3(input && Object.getPrototypeOf(input) === Object.prototype, "Plain directory row required");
    const descriptors = Object.getOwnPropertyDescriptors(input);
    ensure3(fields2.every((k) => descriptors[k]?.enumerable && Object.hasOwn(descriptors[k], "value")), "Directory data properties required");
    const r = Object.fromEntries(fields2.map((k) => [k, descriptors[k].value]));
    ensure3(chains2.includes(r.chainId) && address(r.controller) && address(r.token), "Invalid directory identity");
    ensure3([r.tokenName, r.symbol].every((v) => typeof v === "string" && v.length >= 1 && v.length <= 64), "Invalid directory token labels");
    ensure3(Number.isSafeInteger(r.listedAt) && r.listedAt >= 0, "Invalid listing time");
    const id = r.chainId + ":" + r.controller;
    ensure3(!seen.has(id), "Duplicate directory identity");
    seen.add(id);
    if (chainId !== "all" && r.chainId !== chainId) continue;
    if (search && ![r.tokenName, r.symbol, r.token, r.controller].some((v) => v.toLowerCase().includes(search))) continue;
    filtered.push(r);
  }
  filtered.sort((a, b) => b.listedAt - a.listedAt || Number(a.chainId) - Number(b.chainId) || (a.controller < b.controller ? -1 : a.controller > b.controller ? 1 : 0));
  const page = filtered.slice(offset, offset + limit).map(Object.freeze);
  return Object.freeze({ total: filtered.length, offset, nextOffset: offset + page.length < filtered.length ? offset + page.length : null, rows: Object.freeze(page) });
}

// prototypes/pq-graduation/client/graduation-setup-fields.mjs
function normalizeGraduationSetupFields(input) {
  const fields2 = ["tokenName", "symbol", "decimals", "totalSupply", "quoteSupply", "notice"];
  if (input === null || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
    throw new TypeError("Input must be a plain data object");
  }
  const d = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(d);
  if (keys.length !== 6 || !keys.every((k) => fields2.includes(k))) {
    throw new TypeError("Input must have exactly the six required fields");
  }
  const result = {};
  for (const k of fields2) {
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
  const fields2 = ["tokenName", "symbol", "decimals", "totalSupply"];
  const d = Object.getOwnPropertyDescriptors(input), keys = Reflect.ownKeys(d);
  if (keys.length !== fields2.length || !keys.every((k) => fields2.includes(k))) throw new TypeError("Exactly four token fields required");
  const values = {};
  for (const k of fields2) {
    if (!d[k].enumerable || !Object.hasOwn(d[k], "value") || typeof d[k].value !== "string") throw new TypeError("Enumerable token data strings required");
    values[k] = d[k].value;
  }
  const normalized = normalizeGraduationSetupFields({ ...values, quoteSupply: "1", notice: "3600" });
  return Object.freeze(Object.fromEntries(fields2.map((k) => [k, normalized[k]])));
}

// packages/multichain-swap/pool-package.mjs
var ensure = (ok, message) => {
  if (!ok) throw new TypeError(message);
};
var chains = BUILT.map(c => c.id);
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
  const raw = exact(p.tokenFields, ["tokenName", "symbol", "decimals", "totalSupply"]), fields2 = normalizeTokenFields(raw);
  for (const k of Object.keys(raw)) ensure(raw[k] === fields2[k] && !/\r|\n|\u2028|\u2029/.test(raw[k]), "Canonical token metadata required");
  return Object.freeze({ ...p, constructor: Object.freeze(c), tokenFields: fields2 });
}

// apps/marketplace-preview/trade-pool-links.mjs
function tradePoolLink(text) {
  const p = readSwapPoolPackage(text);
  return "/trade.html#pool=" + encodeURIComponent(JSON.stringify(p));
}

// apps/marketplace-preview/l131-market-client.mjs
var ensure2 = (ok, message = "Unexpected market response") => {
  if (!ok) throw new TypeError(message);
};
var statuses = ["observed", "stale", "unavailable"];
var integer = (n) => Number.isSafeInteger(n) && n >= 0;
var metadata = ["chainId", "controller", "token", "tokenName", "symbol", "listedAt"];
function fields(value, names) {
  ensure2(value && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  ensure2(keys.length === names.length && names.every((k) => descriptors[k]?.enumerable && Object.hasOwn(descriptors[k], "value")));
  return Object.fromEntries(names.map((k) => [k, descriptors[k].value]));
}
function rowValue(value, now) {
  const r = fields(value, [...metadata, "status", "checkedAt", "expiresAt", "transactionAuthorized"]);
  selectMarkets([Object.fromEntries(metadata.map((k) => [k, r[k]]))]);
  ensure2(statuses.includes(r.status) && integer(r.checkedAt) && integer(r.expiresAt) && r.expiresAt === r.checkedAt + 12e4 && r.transactionAuthorized === false);
  return Object.freeze({ ...r, status: r.status === "observed" && (now < r.checkedAt || now >= r.expiresAt) ? "stale" : r.status });
}
function marketQuery({ chainId = "all", query = "", offset = 0 } = {}) {
  selectMarkets([], { chainId, query, offset, limit: 24 });
  return Object.freeze({ chainId, query, offset });
}
function readMarketPage(value, options = {}, now = Date.now()) {
  const q = marketQuery(options), p = fields(value, ["version", "kind", "total", "offset", "nextOffset", "rows"]);
  ensure2(integer(now) && p.version === 1 && p.kind === "qhooks-market-directory" && integer(p.total) && p.total <= 1e3 && p.offset === q.offset);
  ensure2(Array.isArray(p.rows) && p.rows.length === Math.min(24, Math.max(0, p.total - p.offset)));
  const rows = p.rows.map((r) => rowValue(r, now)), selected = selectMarkets(rows, { ...q, offset: 0, limit: 24 });
  ensure2(JSON.stringify(selected.rows) === JSON.stringify(rows.map((r) => Object.fromEntries(metadata.map((k) => [k, r[k]])))));
  ensure2(p.nextOffset === (p.offset + rows.length < p.total ? p.offset + rows.length : null));
  return Object.freeze({ ...p, rows: Object.freeze(rows) });
}
function readMarketTradeLink(value, selected) {
  const row = rowValue(selected, Date.now()), v = fields(value, ["pool", "observation", "revision", "listedAt", "invalidatedAt", "status", "transactionAuthorized"]);
  ensure2(row.status !== "unavailable" && ["observed", "stale"].includes(v.status) && v.invalidatedAt === null && v.transactionAuthorized === false && integer(v.revision) && v.revision > 0);
  const pool = readSwapPoolPackage(JSON.stringify(v.pool)), c = pool.constructor;
  ensure2(pool.chainId === row.chainId && pool.controller === row.controller && (c.currency0 === c.quote ? c.currency1 : c.currency0) === row.token && pool.tokenFields.tokenName === row.tokenName && pool.tokenFields.symbol === row.symbol && v.listedAt === row.listedAt, "Market identity changed. Search again.");
  const o = v.observation;
  ensure2(o && o.transactionAuthorized === false && o.chainId === row.chainId && o.controller === row.controller && o.token === row.token);
  return tradePoolLink(JSON.stringify(pool));
}
function failure(code) {
  return Object.assign(new Error(code), { code });
}
function marketErrorText(error) {
  const messages = {
    rate_limited: "Too many requests. Wait a minute, then retry.",
    market_not_found: "This market is no longer listed. Search again.",
    timeout: "The directory took too long to respond. Try again.",
    directory_unavailable: "The market directory is unavailable right now. You can still open a public pool link on the trading page.",
    cancelled: "Request cancelled."
  };
  return Object.hasOwn(messages, error?.code) ? messages[error.code] : "Could not load this market. Retry or open its public pool link on the trading page.";
}
function createMarketBrowserClient({ fetchImpl = globalThis.fetch, origin = globalThis.location?.origin, clock = Date.now, timers = globalThis } = {}) {
  const site = new URL(origin);
  ensure2(site.origin === origin && (site.protocol === "https:" || site.protocol === "http:" && site.hostname === "127.0.0.1"), "Same-origin site required");
  async function request(path, signal) {
    const url = new URL(path, origin).href, controller = new AbortController();
    let reader = null, response = null;
    const abort = () => controller.abort(failure("cancelled"));
    if (signal?.aborted) throw failure("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    const timer = timers.setTimeout(() => controller.abort(failure("timeout")), 1e4);
    let interrupted;
    const stop = new Promise((_, reject) => {
      interrupted = () => {
        try {
          void reader?.cancel().catch(() => {
          });
        } catch {
        }
        reject(controller.signal.reason);
      };
      controller.signal.addEventListener("abort", interrupted, { once: true });
    });
    const read = async () => {
      try {
        response = await fetchImpl(url, { method: "GET", signal: controller.signal, redirect: "error", cache: "no-store", credentials: "omit", mode: "same-origin", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
        if (controller.signal.aborted) {
          try {
            void response.body?.cancel().catch(() => {
            });
          } catch {
          }
          throw controller.signal.reason;
        }
        ensure2(response.redirected === false && (!response.url || response.url === url));
        if (response.status !== 200) throw failure(response.status === 429 ? "rate_limited" : response.status === 404 ? "market_not_found" : "directory_unavailable");
        const type = response.headers.get("Content-Type"), length = response.headers.get("Content-Length");
        ensure2(typeof type === "string" && /^application\/json(?:[ \t]*;[^\r\n]*)?$/i.test(type) && !/[\r\n]/.test(type));
        ensure2(length === null || length.length <= 5 && /^(?:0|[1-9][0-9]*)$/.test(length) && String(Number(length)) === length && Number(length) <= 65536);
        ensure2(typeof response.body?.getReader === "function");
        reader = response.body.getReader();
        const chunks = [];
        let size = 0, reads = 0;
        for (; ; ) {
          if (controller.signal.aborted) throw controller.signal.reason;
          const { done, value } = await reader.read();
          if (done) break;
          ensure2(value instanceof Uint8Array && ++reads <= 1024);
          size += value.byteLength;
          ensure2(size <= 65536);
          chunks.push(value);
        }
        ensure2(size > 0);
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } finally {
        try {
          void (reader ? reader.cancel() : response?.body?.cancel()).catch(() => {
          });
        } catch {
        }
        try {
          reader?.releaseLock();
        } catch {
        }
      }
    };
    try {
      return await Promise.race([read(), stop]);
    } finally {
      timers.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", interrupted);
    }
  }
  return Object.freeze({
    async list(options = {}, { signal } = {}) {
      const q = marketQuery(options), params = new URLSearchParams({ chain: q.chainId, q: q.query, offset: String(q.offset), limit: "24" });
      return readMarketPage(await request("/api/markets?" + params, signal), q, clock());
    },
    async open(row, { signal } = {}) {
      const selected = rowValue(row, clock());
      ensure2(selected.status !== "unavailable", "Market unavailable");
      return readMarketTradeLink(await request("/api/markets/" + selected.chainId + "/" + selected.controller, signal), selected);
    }
  });
}

// apps/marketplace-preview/l131-market-page.mjs
function bindMarketBrowser({ document: d = document, target = window, client = createMarketBrowserClient({ origin: target.location.origin }) } = {}) {
  const ids = ["form", "chain", "search", "results", "status", "count", "previous", "next", "retry"];
  const $ = (id) => d.getElementById("qm-" + id);
  for (const id of ids) if (!$(id)) throw Error("Missing market control " + id);
  let dead = false, revision = 0, pending = null, page = null, query = marketQuery(), requested = query;
  const listeners = [];
  const listen = (element, type, fn) => {
    element.addEventListener(type, fn);
    listeners.push([element, type, fn]);
  };
  const note = (text) => {
    $("status").textContent = text;
  };
  const controls = () => {
    if (dead) return;
    $("results").setAttribute("aria-busy", String(!!pending));
    $("previous").disabled = !!pending || !page || query.offset === 0;
    $("next").disabled = !!pending || page?.nextOffset == null;
  };
  function begin() {
    pending?.abort();
    pending = new AbortController();
    const ticket = ++revision;
    $("retry").hidden = true;
    controls();
    return { ticket, signal: pending.signal };
  }
  const current = (ticket) => !dead && ticket === revision;
  async function open(row) {
    if (dead || pending || !page?.rows.includes(row) || row.status === "unavailable") return;
    // Every listed launch opens in the terminal, where the chart, holders and the trade ticket live.
    if (/^0x[0-9a-f]{40}$/.test(String(row.controller || "")) && /^\d+$/.test(String(row.chainId || ""))) { target.location.assign("/terminal.html#m=" + row.chainId + ":" + row.controller.toLowerCase()); return; }
    const { ticket, signal } = begin();
    note("Opening market\u2026");
    try {
      const link = await client.open(row, { signal });
      if (current(ticket)) {
        if (!link.startsWith("/trade.html#pool=")) throw Error("Invalid trade link");
        target.location.assign(link);
      }
    } catch (error) {
      if (current(ticket)) note(marketErrorText(error));
    } finally {
      if (current(ticket)) {
        pending = null;
        controls();
      }
    }
  }
  async function load(options) {
    if (dead) return;
    let next;
    try {
      next = marketQuery(options);
    } catch {
      note("Choose a supported chain and search text of 100 characters or fewer.");
      return;
    }
    requested = next;
    const { ticket, signal } = begin();
    page = null;
    $("results").replaceChildren();
    $("count").textContent = "";
    note("Loading markets\u2026");
    try {
      const found = await client.list(next, { signal });
      if (!current(ticket)) return;
      query = next;
      page = found;
      renderMarketCards({ document: d, container: $("results"), rows: page.rows, chainFor: launchChain, onOpen: open });
      $("count").textContent = page.total === 1 ? "1 market" : page.total + " markets";
      note(page.rows.length ? "Showing " + (query.offset + 1) + "\u2013" + (query.offset + page.rows.length) + " of " + page.total + "." : "No markets match yet. Try another chain or search.");
    } catch (error) {
      if (current(ticket)) {
        note(marketErrorText(error));
        $("retry").hidden = false;
      }
    } finally {
      if (current(ticket)) {
        pending = null;
        controls();
      }
    }
  }
  $("chain").replaceChildren();
  for (const chain of [{ id: "all", name: "All chains" }, ...launchChains.filter(c => c.id !== "99801" || hiddenChainsOn())]) {
    const option = d.createElement("option");
    option.value = chain.id;
    option.textContent = chain.name;
    $("chain").append(option);
  }
  $("chain").value = "all";
  $("search").value = "";
  const search = () => load({ chainId: $("chain").value, query: $("search").value, offset: 0 });
  listen($("form"), "submit", (event) => {
    event.preventDefault();
    return search();
  });
  listen($("chain"), "change", search);
  listen($("next"), "click", () => {
    if (!pending && page?.nextOffset != null) return load({ ...query, offset: page.nextOffset });
  });
  listen($("previous"), "click", () => {
    if (!pending && page && query.offset > 0) return load({ ...query, offset: Math.max(0, query.offset - 24) });
  });
  listen($("retry"), "click", () => {
    if (!pending) return load(requested);
  });
  function dispose() {
    if (dead) return;
    dead = true;
    revision++;
    pending?.abort();
    pending = null;
    for (const [el, type, fn] of listeners) el.removeEventListener(type, fn);
  }
  listen(target, "pagehide", dispose);
  const ready = load(query);
  return Object.freeze({ ready, dispose, snapshot: () => ({ busy: !!pending, query, page, disposed: dead }) });
}

// apps/marketplace-preview/l131-market-entry.mjs
bindMarketBrowser();
