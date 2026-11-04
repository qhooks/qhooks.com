// apps/marketplace-preview/chain-catalog.mjs
var launchChains = Object.freeze([
  Object.freeze({ id: "8453", slug: "base", name: "Base", gas: "ETH", feeModel: "op-stack", coreHref: "deploy.html", status: "QPool core setup available" }),
  Object.freeze({ id: "4663", slug: "robinhood", name: "Robinhood Chain", gas: "ETH", feeModel: "nitro", coreHref: null, status: "Integration in progress" }),
  Object.freeze({ id: "1", slug: "ethereum", name: "Ethereum", gas: "ETH", feeModel: "ethereum", coreHref: null, status: "Integration in progress" }),
  Object.freeze({ id: "42161", slug: "arbitrum", name: "Arbitrum One", gas: "ETH", feeModel: "nitro", coreHref: null, status: "Integration in progress" }),
  Object.freeze({ id: "56", slug: "bnb", name: "BNB Chain", gas: "BNB", feeModel: "bsc", coreHref: null, status: "Integration in progress" }),
  Object.freeze({ id: "5042", slug: "arc", name: "Arc", gas: "USDC", feeModel: "arc-stablecoin", coreHref: null, status: "Integration in progress" })
]);
function launchChain(id) {
  if (typeof id !== "string") throw new TypeError("Choose a chain ID");
  const chain = launchChains.find((c) => c.id === id);
  if (!chain) throw new TypeError("Chain is not in this rollout");
  return chain;
}

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

// apps/marketplace-preview/l132-market-submit.mjs
var fail = (code) => Object.assign(new Error(code), { code });
var cancel = (stream) => {
  try {
    void Promise.resolve(stream?.cancel()).catch(() => {
    });
  } catch {
  }
};
function prepareMarketSubmission(text) {
  const pool = readSwapPoolPackage(text), body = JSON.stringify(pool);
  if (new TextEncoder().encode(body).length > 2e4) throw new TypeError("Public pool details exceed 20 KB");
  return Object.freeze({ pool, body });
}
function marketSubmissionMessage(error) {
  const messages = {
    rate_limited: "Listing requests are busy. Wait a minute, then try again.",
    invalid_pool: "The server could not verify an active QHooks pool for these details.",
    conflict: "The listing changed or already uses different details. Check Markets before trying again.",
    not_enabled: "Market listing is not available yet. Your public trade link still works.",
    uncertain: "The listing result is unknown. Check Markets before submitting again.",
    cancelled: "Stopped waiting. The server may already have received this listing; check Markets before resubmitting."
  };
  return Object.hasOwn(messages, error?.code) ? messages[error.code] : "Could not prepare these public pool details. Use a pool JSON file from a completed QHooks launch, not a key backup.";
}
function createMarketSubmitter({ origin = globalThis.location?.origin, fetchImpl = globalThis.fetch, timers = globalThis } = {}) {
  const site = new URL(origin);
  if (site.origin !== origin || !(site.protocol === "https:" || site.protocol === "http:" && site.hostname === "127.0.0.1")) throw new TypeError("Same-origin site required");
  let active = false;
  return Object.freeze({ async submit(text, { consent = false, signal } = {}) {
    if (consent !== true) throw new TypeError("Review and consent required");
    if (active) throw new TypeError("A listing request is already in progress");
    const prepared = prepareMarketSubmission(text);
    if (signal?.aborted) throw fail("cancelled");
    active = true;
    const url = origin + "/api/markets", controller = new AbortController();
    let response, reader, listener, sent = false;
    const abort = () => controller.abort(fail("cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
    const timer = timers.setTimeout(() => controller.abort(fail("uncertain")), 55e3);
    const cancelled = new Promise((_, reject) => {
      listener = () => {
        cancel(reader);
        reject(controller.signal.reason);
      };
      controller.signal.addEventListener("abort", listener, { once: true });
    });
    async function exchange() {
      try {
        if (controller.signal.aborted) throw controller.signal.reason;
        sent = true;
        response = await fetchImpl(url, { method: "POST", body: prepared.body, signal: controller.signal, mode: "same-origin", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer", headers: { Accept: "application/json", "Content-Type": "application/json" } });
        if (controller.signal.aborted) throw controller.signal.reason;
        if (response.redirected !== false || response.url && response.url !== url) throw fail("uncertain");
        if (response.status !== 200 && response.status !== 201) {
          const codes = { 400: "invalid_pool", 403: "invalid_pool", 409: "conflict", 413: "invalid_pool", 415: "invalid_pool", 421: "not_enabled", 422: "invalid_pool", 429: "rate_limited" };
          throw fail(Object.hasOwn(codes, response.status) ? codes[response.status] : "uncertain");
        }
        const type = response.headers.get("Content-Type"), length = response.headers.get("Content-Length");
        if (typeof type !== "string" || !/^application\/json(?:[ \t]*;[^\r\n]*)?$/i.test(type) || /[\r\n]/.test(type) || length !== null && (!/^(?:0|[1-9][0-9]*)$/.test(length) || String(Number(length)) !== length || Number(length) > 4096)) throw fail("uncertain");
        reader = response.body?.getReader();
        if (!reader) throw fail("uncertain");
        let count = 0, reads = 0;
        const chunks = [];
        for (; ; ) {
          if (controller.signal.aborted) throw controller.signal.reason;
          const { done, value: value2 } = await reader.read();
          if (done) break;
          if (!(value2 instanceof Uint8Array) || ++reads > 256 || (count += value2.length) > 4096) throw fail("uncertain");
          chunks.push(value2);
        }
        if (!count || length !== null && count !== Number(length)) throw fail("uncertain");
        const bytes = new Uint8Array(count);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(",") !== "chainId,controller,revision,transactionAuthorized" || value.chainId !== prepared.pool.chainId || value.controller !== prepared.pool.controller || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.transactionAuthorized !== false || response.status === 201 && value.revision !== 1 || response.status === 200 && value.revision < 2) throw fail("uncertain");
        return Object.freeze({ ...value, created: response.status === 201 });
      } finally {
        cancel(reader || response?.body);
        try {
          reader?.releaseLock();
        } catch {
        }
      }
    }
    try {
      return await Promise.race([exchange(), cancelled]);
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error?.code) throw error;
      throw sent ? fail("uncertain") : error;
    } finally {
      timers.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", listener);
      active = false;
    }
  } });
}

// apps/marketplace-preview/l132-list-market-page.mjs
function bindMarketListing({ document: d = document, target = window, submitter = createMarketSubmitter({ origin: target.location.origin }) } = {}) {
  const ids = ["file", "review", "summary", "consent", "submit", "cancel", "status", "markets", "trade"];
  const $ = (id) => d.getElementById("qlm-" + id);
  for (const id of ids) if (!$(id)) throw Error("Missing market listing control " + id);
  let prepared = null, busy = false, dead = false, epoch = 0, pending = null;
  const listeners = [];
  const listen = (el, event, fn) => {
    el.addEventListener(event, fn);
    listeners.push([el, event, fn]);
  };
  function render() {
    if (dead) return;
    for (const id of ["file", "review"]) $(id).disabled = busy;
    $("consent").disabled = busy || !prepared;
    $("submit").disabled = busy || !prepared || !$("consent").checked;
    $("cancel").disabled = !busy;
  }
  function clear() {
    epoch++;
    pending?.abort();
    pending = null;
    prepared = null;
    busy = false;
    $("consent").checked = false;
    $("summary").replaceChildren();
    $("trade").removeAttribute("href");
    $("trade").hidden = true;
    render();
  }
  function review(text) {
    const next = prepareMarketSubmission(text);
    clear();
    prepared = next;
    const p = prepared.pool, c = p.constructor, chain = launchChain(p.chainId);
    for (const [label, value] of [["Token", p.tokenFields.tokenName + " (" + p.tokenFields.symbol + ")"], ["Chain", chain.name], ["Token address", c.currency0 === c.quote ? c.currency1 : c.currency0], ["Pool controller", p.controller]]) {
      const dt = d.createElement("dt"), dd = d.createElement("dd");
      dt.textContent = label;
      if (label === "Chain") {
        const img = d.createElement("img"), name = d.createElement("span");
        img.src = "/chain-symbol-icons/" + chain.slug + ".svg";
        img.width = 20;
        img.height = 20;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        name.textContent = value;
        dd.className = "trade-chip";
        dd.append(img, name);
      } else dd.textContent = value;
      $("summary").append(dt, dd);
    }
    $("trade").href = tradePoolLink(prepared.body);
    $("trade").hidden = false;
    $("status").textContent = "Review these public details, then choose whether to list this market.";
    render();
  }
  listen($("file"), "change", () => {
    clear();
    $("status").textContent = "Choose Review pool details to read the selected public file.";
  });
  listen($("review"), "click", async () => {
    if (dead || busy) return;
    clear();
    const id = epoch, f = $("file").files?.[0];
    try {
      if (!f || f.size <= 0 || f.size > 2e4) throw Error("Choose a public pool JSON file up to 20 KB.");
      const text = await f.text();
      if (!dead && id === epoch) review(text);
    } catch (error) {
      if (!dead && id === epoch) $("status").textContent = marketSubmissionMessage(error);
    }
  });
  listen($("consent"), "change", render);
  listen($("submit"), "click", async () => {
    if (dead || busy || !prepared || !$("consent").checked) return;
    const id = epoch, text = prepared.body;
    busy = true;
    pending = new AbortController();
    $("consent").checked = false;
    render();
    $("status").textContent = "Checking the pool on-chain and saving its public listing\u2026";
    try {
      const result = await submitter.submit(text, { consent: true, signal: pending.signal });
      if (!dead && id === epoch) {
        $("status").textContent = result.created ? "Market listed. Find it in Markets." : "Market listing refreshed. Find it in Markets.";
      }
    } catch (error) {
      if (!dead && id === epoch) $("status").textContent = marketSubmissionMessage(error);
    } finally {
      if (!dead && id === epoch) {
        busy = false;
        pending = null;
        render();
      }
    }
  });
  listen($("cancel"), "click", () => {
    if (pending) pending.abort();
  });
  function readHash() {
    if (dead || target.location.hash === "#list-market") return;
    clear();
    try {
      if (target.location.hash) review(JSON.stringify(readTradePoolLink(target.location.hash)));
      else $("status").textContent = "Import public pool details from a completed QHooks launch.";
    } catch (error) {
      $("status").textContent = marketSubmissionMessage(error);
    }
  }
  listen(target, "hashchange", readHash);
  function dispose() {
    if (dead) return;
    dead = true;
    epoch++;
    pending?.abort();
    pending = null;
    for (const [el, type, fn] of listeners) el.removeEventListener(type, fn);
  }
  listen(target, "pagehide", dispose);
  readHash();
  render();
  return Object.freeze({ dispose, snapshot: () => ({ prepared, busy, dead }) });
}

// apps/marketplace-preview/l132-list-market-entry.mjs
bindMarketListing();
