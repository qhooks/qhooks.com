// packages/commerce/l126-inspection-params.mjs
var INSPECTION_CHAINS = Object.freeze([1, 56, 8453, 42161, 4663]);
function normalizeInspectionParams(method, params) {
  if (!Array.isArray(params) || Object.getPrototypeOf(params) !== Array.prototype) throw new TypeError("Invalid params");
  const d = Object.getOwnPropertyDescriptors(params), length = d.length?.value;
  if (!Number.isInteger(length) || length < 0 || length > 2) throw new TypeError("Invalid params");
  const keys = Reflect.ownKeys(d);
  if (keys.length !== length + 1 || keys.some((k) => typeof k !== "string" || k !== "length" && !Array.from({ length }, (_, i) => String(i)).includes(k))) throw new TypeError("Invalid params");
  const normalized = [];
  for (let i = 0; i < length; i++) {
    const v = d[String(i)];
    if (!v || !v.enumerable || !Object.hasOwn(v, "value")) throw new TypeError("Invalid params");
    normalized.push(v.value);
  }
  const chain = (v) => typeof v === "number" && Number.isInteger(v) && INSPECTION_CHAINS.includes(v);
  const address2 = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
  switch (method) {
    case "qhooks_chains":
      if (length !== 0) throw new TypeError("Invalid params");
      break;
    case "qhooks_decodePermissions":
      if (length !== 1 || !address2(normalized[0])) throw new TypeError("Invalid params");
      break;
    case "qhooks_chainStatus":
      if (length !== 1 || !chain(normalized[0])) throw new TypeError("Invalid params");
      break;
    case "qhooks_getHook":
      if (length !== 2 || !chain(normalized[0]) || !address2(normalized[1])) throw new TypeError("Invalid params");
      break;
    default:
      throw new TypeError("Invalid method");
  }
  return Object.freeze(normalized.map((v) => typeof v === "string" ? v.toLowerCase() : v));
}

// packages/commerce/l126-inspection-request.mjs
function dataRecord(value, required, optional = []) {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("Invalid object");
  const d = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(d);
  if (required.some((k) => !Object.hasOwn(d, k)) || keys.some((k) => typeof k !== "string" || ![...required, ...optional].includes(k) || !d[k].enumerable || !Object.hasOwn(d[k], "value"))) throw new TypeError("Invalid fields");
  return Object.fromEntries(keys.map((k) => [k, d[k].value]));
}
function normalizeInspectionRequest(input) {
  const v = dataRecord(input, ["jsonrpc", "method", "params", "id"]);
  if (v.jsonrpc !== "2.0" || typeof v.method !== "string" || !(typeof v.id === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(v.id) || Number.isSafeInteger(v.id))) throw new TypeError("Invalid request");
  const params = normalizeInspectionParams(v.method, v.params);
  const request = Object.freeze({ jsonrpc: "2.0", method: v.method, params, id: v.id });
  return Object.freeze({ request, upstream: Object.freeze({ ...request }) });
}
function canonical(value, depth = 0) {
  if (depth > 16) throw new TypeError("JSON nesting limit");
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("Invalid array");
    const d = Object.getOwnPropertyDescriptors(value), n = d.length.value;
    if (Reflect.ownKeys(d).length !== n + 1) throw new TypeError("Invalid array");
    return "[" + Array.from({ length: n }, (_, i) => {
      const v2 = d[String(i)];
      if (!v2?.enumerable || !Object.hasOwn(v2, "value")) throw new TypeError("Invalid array");
      return canonical(v2.value, depth + 1);
    }).join(",") + "]";
  }
  const keys = Reflect.ownKeys(value ?? {});
  if (keys.some((k) => typeof k !== "string")) throw new TypeError("Invalid JSON");
  const v = dataRecord(value, keys);
  return "{" + keys.sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k], depth + 1)).join(",") + "}";
}
async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// packages/commerce/l126-permission-flags.mjs
function validatePermissionFlags(address2, flags) {
  if (typeof address2 !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address2)) throw new TypeError("Invalid address format");
  if (!Array.isArray(flags) || Object.getPrototypeOf(flags) !== Array.prototype) throw new TypeError("Flags must be an ordinary array");
  const array = Object.getOwnPropertyDescriptors(flags);
  if (array.length.value !== 14 || Reflect.ownKeys(array).length !== 15) throw new TypeError("Flags must have exactly 14 elements");
  const expectedNames = [
    "beforeInitialize",
    "afterInitialize",
    "beforeAddLiquidity",
    "afterAddLiquidity",
    "beforeRemoveLiquidity",
    "afterRemoveLiquidity",
    "beforeSwap",
    "afterSwap",
    "beforeDonate",
    "afterDonate",
    "beforeSwapReturnDelta",
    "afterSwapReturnDelta",
    "afterAddLiquidityReturnDelta",
    "afterRemoveLiquidityReturnDelta"
  ];
  for (let i = 0; i < 14; i++) {
    const entry = array[String(i)];
    if (!entry?.enumerable || !Object.hasOwn(entry, "value")) throw new TypeError("Flags must be dense data");
    const flag = entry.value;
    if (typeof flag !== "object" || flag === null || Object.getPrototypeOf(flag) !== Object.prototype) throw new TypeError("Each flag must be an ordinary object");
    const descriptors = Object.getOwnPropertyDescriptors(flag), ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.length !== 3 || !["name", "bit", "enabled"].every((k) => Object.hasOwn(descriptors, k))) throw new TypeError("Each flag must have name, bit, and enabled properties");
    for (const key of ownKeys) if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")) throw new TypeError("Flags must be enumerable data");
    const name = descriptors.name.value, bit = descriptors.bit.value, enabled = descriptors.enabled.value;
    if (typeof name !== "string" || name !== expectedNames[i]) throw new TypeError(`Invalid name at index ${i}`);
    if (typeof bit !== "number" || bit !== 13 - i) throw new TypeError(`Invalid bit at index ${i}`);
    if (typeof enabled !== "boolean") throw new TypeError(`Invalid enabled at index ${i}`);
    const expectedEnabled = Boolean(BigInt(address2) & 16383n & 1n << BigInt(13 - i));
    if (enabled !== expectedEnabled) throw new TypeError(`Enabled value does not match address bits at index ${i}`);
  }
  return true;
}

// apps/qhooks-api/l126-inspections.mjs
function validateInspection(input, result) {
  const { request } = normalizeInspectionRequest(input);
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid inspection");
  const [chain, address2] = request.params;
  if (request.method === "qhooks_chains") {
    if (!Array.isArray(result.chains) || result.chains.length !== INSPECTION_CHAINS.length || new Set(result.chains.map((c) => c.chainId)).size !== INSPECTION_CHAINS.length || result.chains.some((c) => !INSPECTION_CHAINS.includes(c.chainId) || c.transaction_submission_supported !== false || typeof c.name !== "string")) throw new Error("Invalid chain directory");
  } else if (request.method === "qhooks_decodePermissions") {
    if (result.address !== chain || result.bitLength !== 14 || result.value !== Number(BigInt(chain) & 16383n) || !result.flags || typeof result.flags !== "object") throw new Error("Wrong permissions response");
    validatePermissionFlags(chain, result.flags);
  } else {
    if (result.chainId !== chain || result.chainIdHex !== "0x" + chain.toString(16)) throw new Error("Wrong inspection chain");
    if (request.method === "qhooks_chainStatus" && (result.status !== "healthy" || !Number.isSafeInteger(result.blockNumber) || result.blockNumber < 0 || typeof result.blockNumberHex !== "string" || !/^0x[0-9a-f]+$/i.test(result.blockNumberHex) || Number(BigInt(result.blockNumberHex)) !== result.blockNumber)) throw new Error("Chain inspection unavailable");
    if (request.method === "qhooks_getHook" && (result.address !== address2 || !Number.isSafeInteger(result.codeByteLength) || result.codeByteLength < 0 || result.runtimeFingerprint?.algorithm !== "SHA-256" || !/^[0-9a-f]{64}$/.test(result.runtimeFingerprint?.fingerprint))) throw new Error("Wrong hook inspection");
    if (request.method === "qhooks_getHook") {
      if (result.permissions?.value !== Number(BigInt(address2) & 16383n)) throw new Error("Wrong hook permissions");
      validatePermissionFlags(address2, result.permissions.flags);
    }
  }
  return result;
}

// packages/commerce/l127-client-validation.mjs
var CLIENT_INSPECTION_TERMS = Object.freeze({
  scheme: "exact",
  network: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  amount: "10000",
  payTo: "0x2b1Cf7c4071A98A59709166DFA73C7acb7E83E71",
  maxTimeoutSeconds: 300,
  extra: Object.freeze({ name: "USD Coin", version: "2" })
});
var terms = CLIENT_INSPECTION_TERMS;
var address = (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value);
var hex32 = (value) => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
var uuid = (value) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
var copy = (value) => JSON.parse(canonical(value));
var requireThat = (condition, message) => {
  if (!condition) throw new TypeError(message);
};
var equal = (left, right) => canonical(left) === canonical(right);
var orderFields = ["id", "requestHash", "resource", "expiresAt", "paymentRequired"];
function createInspectionValidators({ expectedPayer, now = Date.now } = {}) {
  requireThat(address(expectedPayer) && typeof now === "function", "Explicit payer and clock required");
  const clock = () => {
    const value = now();
    requireThat(Number.isSafeInteger(value) && value >= 0, "Invalid clock");
    return value;
  };
  async function checkOrder(input, fresh) {
    const order = dataRecord(input, [...orderFields, "request"]);
    requireThat(uuid(order.id), "Invalid order ID");
    const { request } = normalizeInspectionRequest(order.request);
    requireThat(order.requestHash === await digest(request), "Order request changed");
    const resource = {
      url: "https://qhooks.com/api/inspection-orders/" + order.id,
      description: "QHooks read-only hook inspection",
      mimeType: "application/json",
      serviceName: "QHooks"
    };
    requireThat(equal(order.resource, resource), "Wrong order resource");
    requireThat(Number.isSafeInteger(order.expiresAt) && order.expiresAt > 0, "Invalid order expiry");
    if (fresh) {
      const at = clock();
      requireThat(order.expiresAt > at && order.expiresAt <= at + 66e4, "Order expired or invalid");
    }
    const offer = dataRecord(order.paymentRequired, ["x402Version", "resource", "accepts"], ["error", "extensions"]);
    requireThat(offer.x402Version === 2 && equal(offer.resource, resource) && equal(offer.accepts, [terms]), "Unexpected fee offer");
    if (offer.error !== void 0) requireThat(typeof offer.error === "string" && offer.error.length <= 256, "Invalid offer message");
    if (offer.extensions !== void 0) requireThat(equal(offer.extensions, {}), "Unsupported payment extensions");
    return copy({ ...order, request });
  }
  return Object.freeze({
    // Always supply the locally submitted request separately; never trust a
    // server-supplied request field when binding the order to the user's intent.
    async fromResponse(request, response) {
      return checkOrder({ ...dataRecord(response, orderFields), request: normalizeInspectionRequest(request).request }, true);
    },
    validateOrder: (value) => checkOrder(value, true),
    async validatePayment(value, header) {
      const order = await checkOrder(value, false);
      requireThat(typeof header === "string" && header.length > 0 && header.length <= 16384 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(header), "Invalid payment encoding");
      const binary = atob(header);
      requireThat(btoa(binary) === header, "Noncanonical payment encoding");
      const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
      const p = dataRecord(payload, ["x402Version", "resource", "accepted", "payload"], ["extensions"]);
      requireThat(p.x402Version === 2 && equal(p.resource, order.resource) && equal(p.accepted, terms), "Payment does not match order");
      if (p.extensions !== void 0) requireThat(equal(p.extensions, {}), "Unsupported payment extensions");
      const inner = dataRecord(p.payload, ["signature", "authorization"]);
      const a = dataRecord(inner.authorization, ["from", "to", "value", "validAfter", "validBefore", "nonce"]);
      requireThat(address(a.from) && a.from.toLowerCase() === expectedPayer.toLowerCase() && address(a.to) && a.to.toLowerCase() === terms.payTo.toLowerCase() && a.value === terms.amount && hex32(a.nonce), "Wrong payment authorization");
      requireThat(typeof inner.signature === "string" && /^0x(?:[0-9a-fA-F]{2}){64,1024}$/.test(inner.signature), "Invalid signature encoding");
      for (const key of ["validAfter", "validBefore"]) requireThat(typeof a[key] === "string" && /^(0|[1-9][0-9]{0,15})$/.test(a[key]) && Number.isSafeInteger(Number(a[key])), "Invalid authorization time");
      requireThat(BigInt(a.validBefore) > BigInt(a.validAfter), "Invalid authorization window");
    },
    async validateResult(value, response) {
      const order = await checkOrder(value, false);
      const body = dataRecord(response, ["jsonrpc", "id", "result", "inspection", "payment"]);
      requireThat(body.jsonrpc === "2.0" && body.id === order.request.id, "Wrong result identity");
      const inspection = dataRecord(body.inspection, ["orderId", "requestHash", "observedAt"]);
      requireThat(inspection.orderId === order.id && inspection.requestHash === order.requestHash && Number.isSafeInteger(inspection.observedAt) && inspection.observedAt >= 0 && inspection.observedAt <= clock() + 6e4, "Wrong inspection receipt");
      const payment = dataRecord(body.payment, ["network", "asset", "amount", "recipient", "transaction"]);
      requireThat(payment.network === terms.network && address(payment.asset) && payment.asset.toLowerCase() === terms.asset.toLowerCase() && payment.amount === terms.amount && address(payment.recipient) && payment.recipient.toLowerCase() === terms.payTo.toLowerCase() && hex32(payment.transaction) && !/^0x0{64}$/.test(payment.transaction), "Wrong payment receipt");
      requireThat(canonical(body.result).length <= 131072, "Result too large");
      validateInspection(order.request, body.result);
      return copy(body);
    }
  });
}

export {
  dataRecord,
  normalizeInspectionRequest,
  canonical,
  digest,
  CLIENT_INSPECTION_TERMS,
  createInspectionValidators
};
