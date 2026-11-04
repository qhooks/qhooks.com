import {
  CLIENT_INSPECTION_TERMS,
  canonical,
  createInspectionValidators,
  dataRecord,
  digest,
  normalizeInspectionRequest
} from "./chunk-3ETD7NFB.js";

// apps/marketplace-preview/l127-inspection-entry.mjs
import { getWalletHub } from "/wallet-hub-fresh.mjs";

// packages/commerce/l127-client-request.mjs
function buildInspectionRequest({ request, orderId, paymentHeader }) {
  const body = canonical(normalizeInspectionRequest(request).request);
  if (new TextEncoder().encode(body).byteLength > 4096) throw new TypeError("Body exceeds maximum size");
  const url = new URL("https://qhooks.com/api/inspection-orders");
  if (orderId !== void 0) {
    if (typeof orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(orderId)) throw new TypeError("Invalid orderId");
    url.pathname += "/" + orderId;
  }
  const headers = { "Content-Type": "application/json", "Accept": "application/json" };
  if (paymentHeader !== void 0) {
    if (orderId === void 0) throw new TypeError("paymentHeader requires orderId");
    if (typeof paymentHeader !== "string" || !paymentHeader.length || paymentHeader.length > 16384 || !/^[A-Za-z0-9+/=]+$/.test(paymentHeader)) throw new TypeError("Invalid paymentHeader");
    headers["Payment-Signature"] = paymentHeader;
  }
  return { url: url.toString(), init: {
    method: "POST",
    headers,
    body,
    credentials: "omit",
    redirect: "manual",
    cache: "no-store",
    referrerPolicy: "no-referrer"
  } };
}

// packages/commerce/l127-client-transport.mjs
var MAX_RESPONSE = 262144;
var InspectionTransportError = class extends Error {
  constructor(code) {
    super(code);
    this.name = "InspectionTransportError";
    this.code = code;
  }
};
var reject = (code) => {
  throw new InspectionTransportError(code);
};
async function readJson(response, deadline) {
  if (!/^application\/json(?:[ \t]*;[ \t]*charset[ \t]*=[ \t]*(?:utf-8|"utf-8"))?$/i.test(response.headers.get("Content-Type") || "")) reject("invalid_response_type");
  const length = response.headers.get("Content-Length");
  if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_RESPONSE)) reject("invalid_response_length");
  const reader = response.body?.getReader();
  if (!reader) reject("missing_response_body");
  let complete = false, size = 0, reads = 0, text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (; ; ) {
      if (++reads > MAX_RESPONSE + 64) reject("excessive_response_chunks");
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      if (!(value instanceof Uint8Array)) reject("invalid_response_chunk");
      size += value.byteLength;
      if (size > MAX_RESPONSE) reject("response_too_large");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text);
    complete = true;
    return body;
  } finally {
    if (!complete) {
      try {
        Promise.resolve(reader.cancel()).catch(() => {
        });
      } catch {
      }
    }
    try {
      reader.releaseLock();
    } catch {
    }
  }
}
function createInspectionTransport({ fetchImpl = globalThis.fetch.bind(globalThis), timeoutMs = 15e3 } = {}) {
  if (typeof fetchImpl !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15e3) throw new TypeError("Invalid transport options");
  async function post(built) {
    const controller = new AbortController();
    let timer, complete = false;
    const deadline = new Promise((_, fail2) => {
      timer = setTimeout(() => {
        fail2(new InspectionTransportError("inspection_timeout"));
        controller.abort();
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([fetchImpl(built.url, { ...built.init, signal: controller.signal }), deadline]);
      if (!Number.isInteger(response?.status) || response.status < 100 || response.status > 599) reject("invalid_response_status");
      if (response.redirected || response.url && response.url !== built.url || response.status >= 300 && response.status < 400) reject("inspection_redirect_forbidden");
      const paymentRequired = response.headers.get("Payment-Required"), paymentResponse = response.headers.get("Payment-Response");
      if ((paymentRequired?.length || 0) > 16384 || (paymentResponse?.length || 0) > 16384) reject("response_header_too_large");
      const body = await readJson(response, deadline);
      complete = true;
      return { status: response.status, body, paymentRequired, paymentResponse };
    } catch (error) {
      if (error instanceof InspectionTransportError) throw error;
      throw new InspectionTransportError("inspection_transport_failed");
    } finally {
      clearTimeout(timer);
      if (!complete) controller.abort();
    }
  }
  return Object.freeze({
    create: (request) => post(buildInspectionRequest({ request })),
    send(order, paymentHeader) {
      if (typeof paymentHeader !== "string" || !paymentHeader.length) throw new TypeError("Original payment required");
      const built = buildInspectionRequest({ request: order?.request, orderId: order?.id, paymentHeader });
      if (order?.resource?.url !== built.url) throw new TypeError("Wrong order resource");
      return post(built);
    }
  });
}

// packages/commerce/l127-claim-proof.mjs
async function claimInspectionProof({ journal, orderId, header, validatePayment }) {
  if (typeof orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(orderId)) throw new Error("invalid_orderId");
  if (typeof header !== "string" || header.length === 0 || header.length > 16384) throw new Error("invalid_header");
  if (typeof journal?.get !== "function" || typeof journal?.putIfAbsent !== "function" || typeof validatePayment !== "function") throw new Error("invalid_dependencies");
  const order = await journal.get("order:" + orderId);
  if (!order || order.id !== orderId) throw new Error("order_not_found");
  await validatePayment(order, header);
  const rec = await journal.putIfAbsent("proof:" + orderId, { orderId, header });
  if (rec?.orderId !== orderId || rec?.header !== header) throw new Error("reuse_original_payment");
  return { order, header };
}

// packages/commerce/l127-recovery-client.mjs
var validId = (id) => typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
function createInspectionRecoveryClient({ journal, send, validateOrder, validatePayment, validateResult }) {
  for (const fn of [journal?.get, journal?.putIfAbsent, send, validateOrder, validatePayment, validateResult]) {
    if (typeof fn !== "function") throw new TypeError("Explicit recovery dependencies required");
  }
  const inFlight = /* @__PURE__ */ new Map();
  const pending = (id, extra = {}) => ({ state: "pending", orderId: id, ...extra });
  function attempt(order, header) {
    if (inFlight.has(order.id)) return inFlight.get(order.id);
    const task = (async () => {
      const cached = await journal.get("result:" + order.id);
      if (cached !== void 0) return { state: "complete", orderId: order.id, result: await validateResult(order, cached) };
      let response;
      try {
        response = await send(order, header);
      } catch {
        return pending(order.id, { reason: "transport_uncertain" });
      }
      if (response?.status !== 200) return pending(order.id, {
        ...Number.isInteger(response?.status) ? { httpStatus: response.status } : {}
      });
      const result = await validateResult(order, response.body);
      const saved = await journal.putIfAbsent("result:" + order.id, result);
      return { state: "complete", orderId: order.id, result: await validateResult(order, saved) };
    })().finally(() => {
      inFlight.delete(order.id);
    });
    inFlight.set(order.id, task);
    return task;
  }
  return Object.freeze({
    async register(order) {
      const checked = await validateOrder(order);
      if (!validId(checked?.id)) throw new TypeError("Invalid order ID");
      const saved = await journal.putIfAbsent("order:" + checked.id, checked);
      if (canonical(saved) !== canonical(checked)) throw new Error("order_record_conflict");
      return saved;
    },
    async submit(orderId, header) {
      const claimed = await claimInspectionProof({ journal, orderId, header, validatePayment });
      return attempt(claimed.order, claimed.header);
    },
    async retry(orderId) {
      if (!validId(orderId)) throw new TypeError("Invalid order ID");
      const order = await journal.get("order:" + orderId), proof = await journal.get("proof:" + orderId);
      if (order?.id !== orderId || proof?.orderId !== orderId || typeof proof.header !== "string" || !proof.header.length || proof.header.length > 16384) {
        throw new Error("original_payment_required");
      }
      await validatePayment(order, proof.header);
      return attempt(order, proof.header);
    }
  });
}

// packages/commerce/l127-idb-transaction.mjs
function journalTransaction(db, key, encoded, timeoutMs) {
  return new Promise((resolve, reject2) => {
    let transaction, timer, done = false, read = false, stored;
    function fail2(code = "inspection_journal_failed") {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        transaction?.abort();
      } catch {
      }
      reject2(new Error(code));
    }
    try {
      const write = encoded !== void 0;
      transaction = write ? db.transaction("records", "readwrite", { durability: "strict" }) : db.transaction("records", "readonly");
      transaction.onabort = () => fail2();
      transaction.onerror = () => fail2();
      transaction.oncomplete = () => {
        if (done) return;
        if (!read) {
          fail2();
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve(stored);
      };
      if (write && transaction.durability !== "strict") {
        fail2();
        return;
      }
      const store = transaction.objectStore("records");
      const request = store.get(key);
      request.onsuccess = () => {
        if (done) return;
        try {
          stored = request.result;
          if (stored === void 0 && write) {
            store.add(encoded, key);
            stored = encoded;
          }
          read = true;
        } catch {
          fail2();
        }
      };
      timer = setTimeout(() => fail2("inspection_journal_timeout"), timeoutMs);
    } catch {
      fail2();
    }
  });
}

// packages/commerce/l127-indexeddb-journal.mjs
var DATABASE = "qhooks-inspection-payments-v1";
var STORE = "records";
var MAX_BYTES = 262144;
var KEY = /^(order|proof|result):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function validKey(key) {
  if (typeof key !== "string" || !KEY.test(key)) throw new TypeError("Invalid journal key");
}
function encode(value) {
  const encoded = canonical(value);
  if (new TextEncoder().encode(encoded).byteLength > MAX_BYTES) throw new TypeError("Journal record too large");
  return encoded;
}
function decode(encoded) {
  if (encoded === void 0) return void 0;
  try {
    if (typeof encoded !== "string" || new TextEncoder().encode(encoded).byteLength > MAX_BYTES) throw new Error();
    const value = JSON.parse(encoded);
    if (encode(value) !== encoded) throw new Error();
    return value;
  } catch {
    throw new Error("inspection_journal_corrupt");
  }
}
async function openInspectionJournal({ indexedDB = globalThis.indexedDB, timeoutMs = 5e3 } = {}) {
  if (typeof indexedDB?.open !== "function") throw new Error("inspection_storage_unavailable");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5e3) throw new TypeError("Invalid journal timeout");
  const db = await new Promise((resolve, reject2) => {
    let request, timer, done = false;
    function fail2(code = "inspection_storage_unavailable") {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        request?.transaction?.abort();
      } catch {
      }
      try {
        request?.result?.close();
      } catch {
      }
      reject2(new Error(code));
    }
    try {
      request = indexedDB.open(DATABASE, 1);
      timer = setTimeout(() => fail2("inspection_journal_timeout"), timeoutMs);
      request.onblocked = () => fail2("inspection_storage_blocked");
      request.onerror = () => fail2();
      request.onupgradeneeded = (event) => {
        if (done) {
          try {
            request.transaction.abort();
          } catch {
          }
          return;
        }
        try {
          if (event.oldVersion !== 0 || request.result.objectStoreNames.length !== 0) throw new Error();
          request.result.createObjectStore(STORE);
        } catch {
          fail2();
        }
      };
      request.onsuccess = () => {
        if (done) {
          try {
            request.result.close();
          } catch {
          }
          return;
        }
        try {
          const connection = request.result;
          if (connection.name !== DATABASE || connection.version !== 1 || connection.objectStoreNames.length !== 1 || !connection.objectStoreNames.contains(STORE)) throw new Error();
          const store = connection.transaction(STORE, "readonly").objectStore(STORE);
          if (store.keyPath !== null || store.autoIncrement !== false || store.indexNames.length !== 0) throw new Error();
          done = true;
          clearTimeout(timer);
          resolve(connection);
        } catch {
          fail2();
        }
      };
    } catch {
      fail2();
    }
  });
  let closed = false;
  const close = () => {
    closed = true;
    db.close();
  };
  db.onversionchange = close;
  db.onclose = () => {
    closed = true;
  };
  function checkOpen(key) {
    validKey(key);
    if (closed) throw new Error("inspection_journal_closed");
  }
  return Object.freeze({
    async get(key) {
      checkOpen(key);
      return decode(await journalTransaction(db, key, void 0, timeoutMs));
    },
    async putIfAbsent(key, value) {
      checkOpen(key);
      const encoded = encode(value);
      const stored = await journalTransaction(db, key, encoded, timeoutMs);
      if (stored === void 0) throw new Error("inspection_journal_failed");
      return decode(stored);
    },
    close
  });
}

// packages/commerce/l127-inspection-client.mjs
async function openInspectionClient({ expectedPayer, journal, fetchImpl, timeoutMs } = {}) {
  const validators = createInspectionValidators({ expectedPayer });
  const transport = createInspectionTransport({ fetchImpl, timeoutMs });
  const ownsJournal = journal === void 0;
  const storage = ownsJournal ? await openInspectionJournal() : journal;
  let core;
  try {
    core = createInspectionRecoveryClient({ ...validators, journal: storage, send: transport.send });
  } catch (error) {
    if (ownsJournal) {
      try {
        storage.close();
      } catch {
      }
    }
    throw error;
  }
  let closed = false;
  const checkOpen = () => {
    if (closed) throw new Error("inspection_client_closed");
  };
  return Object.freeze({
    async quote(request) {
      checkOpen();
      const response = await transport.create(request);
      checkOpen();
      if (response.status !== 201) throw new Error("inspection_quote_unavailable");
      const order = await validators.fromResponse(request, response.body);
      checkOpen();
      return core.register(order);
    },
    async submit(id, header) {
      checkOpen();
      return core.submit(id, header);
    },
    async retry(id) {
      checkOpen();
      return core.retry(id);
    },
    // Stops new operations. Previously submitted requests may still finish.
    // An injected journal remains its caller's responsibility to close.
    close() {
      if (closed) return;
      closed = true;
      if (ownsJournal) storage.close();
    }
  });
}

// packages/commerce/l127-signing-journal.mjs
var DATABASE2 = "qhooks-inspection-payments-v1";
var STORE2 = "records";
var MAX_BYTES2 = 262144;
var KEY2 = /^(order|proof|result|authorization):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function validKey2(key) {
  if (typeof key !== "string" || key !== key.trim() || !KEY2.test(key)) throw new TypeError("Invalid journal key");
}
function encode2(value) {
  const encoded = canonical(value);
  if (new TextEncoder().encode(encoded).byteLength > MAX_BYTES2) throw new TypeError("Journal record too large");
  return encoded;
}
function decode2(encoded) {
  if (encoded === void 0) return void 0;
  try {
    if (typeof encoded !== "string" || new TextEncoder().encode(encoded).byteLength > MAX_BYTES2) throw new Error();
    const value = JSON.parse(encoded);
    if (encode2(value) !== encoded) throw new Error();
    return value;
  } catch {
    throw new Error("inspection_journal_corrupt");
  }
}
async function openInspectionSigningJournal({ indexedDB = globalThis.indexedDB, timeoutMs = 5e3 } = {}) {
  if (typeof indexedDB?.open !== "function") throw new Error("inspection_storage_unavailable");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5e3) throw new TypeError("Invalid journal timeout");
  const db = await new Promise((resolve, reject2) => {
    let request, timer, done = false;
    function fail2(code = "inspection_storage_unavailable") {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        request?.transaction?.abort();
      } catch {
      }
      try {
        request?.result?.close();
      } catch {
      }
      reject2(new Error(code));
    }
    try {
      request = indexedDB.open(DATABASE2, 1);
      timer = setTimeout(() => fail2("inspection_journal_timeout"), timeoutMs);
      request.onblocked = () => fail2("inspection_storage_blocked");
      request.onerror = () => fail2();
      request.onupgradeneeded = (event) => {
        if (done) {
          try {
            request.transaction.abort();
          } catch {
          }
          return;
        }
        try {
          if (event.oldVersion !== 0 || request.result.objectStoreNames.length !== 0) throw new Error();
          request.result.createObjectStore(STORE2);
        } catch {
          fail2();
        }
      };
      request.onsuccess = () => {
        if (done) {
          try {
            request.result.close();
          } catch {
          }
          return;
        }
        try {
          const connection = request.result;
          if (connection.name !== DATABASE2 || connection.version !== 1 || connection.objectStoreNames.length !== 1 || !connection.objectStoreNames.contains(STORE2)) throw new Error();
          const store = connection.transaction(STORE2, "readonly").objectStore(STORE2);
          if (store.keyPath !== null || store.autoIncrement !== false || store.indexNames.length !== 0) throw new Error();
          done = true;
          clearTimeout(timer);
          resolve(connection);
        } catch {
          fail2();
        }
      };
    } catch {
      fail2();
    }
  });
  let closed = false;
  const close = () => {
    closed = true;
    db.close();
  };
  db.onversionchange = close;
  db.onclose = () => {
    closed = true;
  };
  function checkOpen(key) {
    validKey2(key);
    if (closed) throw new Error("inspection_journal_closed");
  }
  return Object.freeze({
    async get(key) {
      checkOpen(key);
      return decode2(await journalTransaction(db, key, void 0, timeoutMs));
    },
    async putIfAbsent(key, value) {
      checkOpen(key);
      const encoded = encode2(value);
      const stored = await journalTransaction(db, key, encoded, timeoutMs);
      if (stored === void 0) throw new Error("inspection_journal_failed");
      return decode2(stored);
    },
    close
  });
}

// packages/commerce/l127-authorization-validation.mjs
var requireThat = (value, message2) => {
  if (!value) throw new TypeError(message2);
};
var equal = (a, b) => canonical(a) === canonical(b);
var sameAddress = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
var authorizationFields = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" }
];
var domainFields = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" }
];
async function validateInspectionAuthorization({ order, prepared, expectedPayer, now = Date.now }) {
  const checked = await createInspectionValidators({ expectedPayer, now }).validateOrder(order);
  const data = dataRecord(prepared, [
    "schema",
    "orderId",
    "requestHash",
    "payer",
    "network",
    "asset",
    "amount",
    "recipient",
    "approvalExpiresAt",
    "typedData",
    "unsignedPayment",
    "approvalId"
  ]);
  const { approvalId, ...view } = data;
  requireThat(typeof approvalId === "string" && /^[0-9a-f]{64}$/.test(approvalId) && await digest(view) === approvalId, "inspection_approval_changed");
  requireThat(view.schema === 1 && view.orderId === checked.id && view.requestHash === checked.requestHash && sameAddress(view.payer, expectedPayer), "inspection_approval_wrong_order");
  requireThat(view.network === CLIENT_INSPECTION_TERMS.network && view.asset === CLIENT_INSPECTION_TERMS.asset && view.amount === CLIENT_INSPECTION_TERMS.amount && view.recipient === CLIENT_INSPECTION_TERMS.payTo, "inspection_approval_wrong_fee");
  const unsigned = dataRecord(view.unsignedPayment, ["x402Version", "resource", "accepted", "payload"]);
  requireThat(unsigned.x402Version === 2 && equal(unsigned.resource, checked.resource) && equal(unsigned.accepted, CLIENT_INSPECTION_TERMS), "inspection_approval_wrong_resource");
  const inner = dataRecord(unsigned.payload, ["authorization"]);
  const a = dataRecord(inner.authorization, ["from", "to", "value", "validAfter", "validBefore", "nonce"]);
  requireThat(sameAddress(a.from, expectedPayer) && sameAddress(a.to, CLIENT_INSPECTION_TERMS.payTo) && a.value === CLIENT_INSPECTION_TERMS.amount && a.validAfter === "0" && typeof a.nonce === "string" && /^0x[0-9a-f]{64}$/.test(a.nonce), "inspection_approval_wrong_authorization");
  const at = now();
  requireThat(Number.isSafeInteger(at) && at >= 0, "Invalid approval clock");
  requireThat(typeof a.validBefore === "string" && /^(0|[1-9][0-9]{0,15})$/.test(a.validBefore) && Number.isSafeInteger(Number(a.validBefore)) && Number(a.validBefore) > Math.floor(at / 1e3) && Number(a.validBefore) <= Math.floor(at / 1e3) + CLIENT_INSPECTION_TERMS.maxTimeoutSeconds, "inspection_authorization_expired");
  requireThat(Number.isSafeInteger(view.approvalExpiresAt) && view.approvalExpiresAt > at && view.approvalExpiresAt <= checked.expiresAt && view.approvalExpiresAt <= at + 12e4 && view.approvalExpiresAt <= (Number(a.validBefore) - 30) * 1e3, "inspection_approval_expired");
  const typed = dataRecord(view.typedData, ["domain", "types", "primaryType", "message"]);
  const domain = dataRecord(typed.domain, ["name", "version", "chainId", "verifyingContract"]);
  requireThat(domain.name === CLIENT_INSPECTION_TERMS.extra.name && domain.version === CLIENT_INSPECTION_TERMS.extra.version && domain.chainId === 8453 && sameAddress(domain.verifyingContract, CLIENT_INSPECTION_TERMS.asset), "inspection_approval_wrong_domain");
  requireThat(typed.primaryType === "TransferWithAuthorization" && equal(typed.types, {
    EIP712Domain: domainFields,
    TransferWithAuthorization: authorizationFields
  }), "inspection_approval_wrong_types");
  const message2 = dataRecord(typed.message, ["from", "to", "value", "validAfter", "validBefore", "nonce"]);
  requireThat(sameAddress(message2.from, a.from) && sameAddress(message2.to, a.to) && message2.value === a.value && message2.validAfter === a.validAfter && message2.validBefore === a.validBefore && message2.nonce === a.nonce, "inspection_approval_message_changed");
  return JSON.parse(canonical(data));
}

// packages/commerce/l127-reserve-authorization-record.mjs
async function reserveAuthorizationRecord({ journal, orderId, candidate, validate }) {
  if (typeof journal?.putIfAbsent !== "function" || typeof validate !== "function") throw new TypeError("Invalid dependencies");
  if (typeof orderId !== "string" || orderId.length !== 36 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(orderId)) {
    throw new TypeError("Invalid orderId");
  }
  const validated = await validate(candidate);
  const saved = await journal.putIfAbsent("authorization:" + orderId, validated);
  return await validate(saved);
}

// packages/commerce/l127-authorization-reservation.mjs
var validId2 = (value) => typeof value === "string" && value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
var prepareDefault = async (options) => (await import("./chunk-P5ULRUMA.js")).prepareInspectionAuthorization(options);
function createInspectionAuthorizationReservations({ journal, expectedPayer, now = Date.now, prepare = prepareDefault } = {}) {
  const validators = createInspectionValidators({ expectedPayer, now });
  for (const callback of [journal?.get, journal?.putIfAbsent, prepare]) {
    if (typeof callback !== "function") throw new TypeError("Explicit authorization dependencies required");
  }
  const inFlight = /* @__PURE__ */ new Map();
  async function existingProof(order) {
    const stored = await journal.get("proof:" + order.id);
    if (stored === void 0) return;
    const proof = dataRecord(stored, ["orderId", "header"]);
    if (proof.orderId !== order.id) throw new Error("inspection_proof_wrong_order");
    await validators.validatePayment(order, proof.header);
    return { state: "proof_ready", order: JSON.parse(canonical(order)), header: proof.header };
  }
  async function reserve(orderId) {
    const order = await journal.get("order:" + orderId);
    if (order?.id !== orderId) throw new Error("inspection_order_missing");
    const proof = await existingProof(order);
    if (proof) return proof;
    const checked = await validators.validateOrder(order);
    const validate = (prepared) => validateInspectionAuthorization({ order: checked, prepared, expectedPayer, now });
    let saved = await journal.get("authorization:" + orderId);
    if (saved === void 0) {
      const candidate = await prepare({ order: checked, expectedPayer, now });
      saved = await reserveAuthorizationRecord({ journal, orderId, candidate, validate });
    } else {
      saved = await validate(saved);
    }
    const racedProof = await existingProof(checked);
    if (racedProof) return racedProof;
    return { state: "approval_ready", order: checked, prepared: saved };
  }
  return Object.freeze({
    async reserve(orderId) {
      if (!validId2(orderId)) throw new TypeError("Invalid order ID");
      if (inFlight.has(orderId)) return inFlight.get(orderId);
      const task = reserve(orderId).finally(() => {
        inFlight.delete(orderId);
      });
      inFlight.set(orderId, task);
      return task;
    }
  });
}

// packages/commerce/l127-signing-coordinator.mjs
var validId3 = (id) => typeof id === "string" && id.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
var address = (value) => typeof value === "string" && value.length === 42 && /^0x[0-9a-fA-F]{40}$/.test(value);
var sameAddress2 = (a, b) => address(a) && address(b) && a.toLowerCase() === b.toLowerCase();
var copy = (value) => JSON.parse(canonical(value));
var events = ["accountsChanged", "chainChanged", "disconnect"];
var fail = (message2) => {
  throw new Error(message2);
};
function createInspectionSigningCoordinator({
  journal,
  provider,
  expectedPayer,
  confirmApproval,
  locks = globalThis.navigator?.locks,
  now = Date.now,
  readTimeoutMs = 5e3
} = {}) {
  if (!address(expectedPayer)) throw new TypeError("Explicit payer required");
  if (!Number.isInteger(readTimeoutMs) || readTimeoutMs < 1 || readTimeoutMs > 15e3) throw new TypeError("Invalid wallet read deadline");
  for (const callback of [provider?.request, provider?.on, provider?.removeListener, locks?.request, confirmApproval]) {
    if (typeof callback !== "function") throw new TypeError("Explicit signing dependencies required");
  }
  const validators = createInspectionValidators({ expectedPayer, now });
  const reservations = createInspectionAuthorizationReservations({ journal, expectedPayer, now });
  const inFlight = /* @__PURE__ */ new Map(), uncommitted = /* @__PURE__ */ new Map();
  let closed = false;
  const checkOpen = () => {
    if (closed) fail("inspection_signer_closed");
  };
  const clock = () => {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) fail("inspection_clock_invalid");
    return value;
  };
  async function saveProof(orderId, candidate) {
    try {
      await claimInspectionProof({ journal, orderId, header: candidate.header, validatePayment: validators.validatePayment });
    } catch {
      fail("inspection_proof_storage_uncertain");
    }
    uncommitted.delete(orderId);
    return { state: "proof_ready", orderId, header: candidate.header, approvalId: candidate.approvalId };
  }
  async function approveLocked(orderId) {
    checkOpen();
    const pending = uncommitted.get(orderId);
    if (pending) return { ...await saveProof(orderId, pending), recovered: true, requiresReview: true };
    const reserved = await reservations.reserve(orderId);
    checkOpen();
    if (reserved.state === "proof_ready") {
      return { state: "proof_ready", orderId, header: reserved.header, recovered: true, requiresReview: true };
    }
    let changed = false;
    const observed = [], onChange = () => {
      changed = true;
    };
    const checkContext = () => {
      checkOpen();
      if (changed) fail("inspection_wallet_context_changed");
    };
    async function readWallet(method) {
      let timer;
      try {
        return await Promise.race([
          Promise.resolve().then(() => provider.request({ method })),
          new Promise((resolve, reject2) => {
            timer = setTimeout(() => reject2(new Error("read timeout")), readTimeoutMs);
          })
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async function checkWallet() {
      checkContext();
      let accounts, chain;
      try {
        accounts = await readWallet("eth_accounts");
        chain = await readWallet("eth_chainId");
      } catch {
        fail("inspection_wallet_unavailable");
      }
      checkContext();
      if (!Array.isArray(accounts) || !sameAddress2(accounts[0], expectedPayer)) fail("inspection_wallet_wrong_account");
      if (typeof chain !== "string" || !/^0x[0-9a-fA-F]{1,16}$/.test(chain) || chain !== chain.trim() || BigInt(chain) !== 8453n) {
        fail("inspection_wallet_wrong_chain");
      }
    }
    try {
      for (const event of events) {
        observed.push(event);
        provider.on(event, onChange);
      }
      await checkWallet();
      const { encodePaymentSignatureHeader } = await import("./chunk-A4XIGODZ.js");
      const prepared = await validateInspectionAuthorization({
        order: reserved.order,
        prepared: reserved.prepared,
        expectedPayer,
        now
      });
      checkContext();
      let consent;
      try {
        consent = await confirmApproval(copy(prepared));
      } catch {
        fail("inspection_approval_rejected");
      }
      checkContext();
      if (consent === false || consent === null || consent === void 0) fail("inspection_approval_rejected");
      const accepted = dataRecord(consent, ["approvalId", "payer", "chainId"]);
      if (accepted.approvalId !== prepared.approvalId || !sameAddress2(accepted.payer, expectedPayer) || accepted.chainId !== 8453) {
        fail("inspection_approval_mismatch");
      }
      const current = await reservations.reserve(orderId);
      checkContext();
      if (current.state === "proof_ready") {
        return { state: "proof_ready", orderId, header: current.header, recovered: true, requiresReview: true };
      }
      if (current.prepared.approvalId !== prepared.approvalId) fail("inspection_approval_changed");
      await checkWallet();
      await validateInspectionAuthorization({ order: current.order, prepared, expectedPayer, now });
      checkContext();
      let signature;
      try {
        signature = await provider.request({
          method: "eth_signTypedData_v4",
          params: [expectedPayer, canonical(prepared.typedData)]
        });
      } catch (error) {
        fail(error?.code === 4001 ? "inspection_signature_rejected" : "inspection_signature_uncertain");
      }
      if (typeof signature !== "string" || signature !== signature.trim() || !/^0x(?:[0-9a-fA-F]{2}){64,1024}$/.test(signature)) {
        fail("inspection_signature_invalid");
      }
      const header = encodePaymentSignatureHeader({
        ...prepared.unsignedPayment,
        payload: { ...prepared.unsignedPayment.payload, signature }
      });
      await validators.validatePayment(current.order, header);
      const candidate = { header, approvalId: prepared.approvalId };
      uncommitted.set(orderId, candidate);
      const result = await saveProof(orderId, candidate);
      return {
        ...result,
        recovered: false,
        requiresReview: changed || closed || clock() >= prepared.approvalExpiresAt
      };
    } finally {
      for (const event of observed) {
        try {
          provider.removeListener(event, onChange);
        } catch {
        }
      }
    }
  }
  return Object.freeze({
    async approve(orderId) {
      checkOpen();
      if (!validId3(orderId)) throw new TypeError("Invalid order ID");
      if (inFlight.has(orderId)) return inFlight.get(orderId);
      const task = Promise.resolve().then(() => locks.request(
        "qhooks-inspection-signature-v1:" + orderId,
        { mode: "exclusive", ifAvailable: true },
        (lock) => {
          if (!lock) fail("inspection_signing_busy");
          return approveLocked(orderId);
        }
      )).finally(() => {
        inFlight.delete(orderId);
      });
      inFlight.set(orderId, task);
      return task;
    },
    // Suppress further wallet prompts. An existing prompt cannot be cancelled;
    // its returned proof is still saved, but requires a fresh review before use.
    close() {
      closed = true;
    }
  });
}

// apps/marketplace-preview/l127-inspection-review.mjs
function renderInspectionReview(d, root, prepared) {
  const h2 = d.createElement("h2");
  h2.textContent = "Review inspection payment";
  const p = d.createElement("p");
  p.textContent = "This signature authorizes a one-time $0.01 USDC payment on Base. It does not grant an unlimited allowance.";
  const dl = d.createElement("dl");
  for (const [label, value] of [
    ["Fee", "$0.01 USDC"],
    ["Payment network", "Base"],
    ["From", prepared.payer],
    ["To", prepared.recipient],
    ["Order", prepared.orderId],
    ["Review expires", new Date(prepared.approvalExpiresAt).toISOString()]
  ]) {
    const dt = d.createElement("dt"), dd = d.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    dl.append(dt, dd);
  }
  const approveButton = d.createElement("button");
  approveButton.type = "button";
  approveButton.textContent = "Approve in wallet";
  approveButton.className = "button primary";
  const cancelButton = d.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.className = "button secondary";
  root.replaceChildren(h2, p, dl, approveButton, cancelButton);
  return { approveButton, cancelButton };
}

// apps/marketplace-preview/l127-inspection-status.mjs
var URL2 = "https://qhooks.com/api/inspection";
async function loadInspectionStatus({ fetchImpl = globalThis.fetch.bind(globalThis), timeoutMs = 5e3 } = {}) {
  if (typeof fetchImpl !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15e3) throw new TypeError("Invalid status options");
  const abort = new AbortController();
  let timer, reader, done = false;
  const deadline = new Promise((resolve, reject2) => {
    timer = setTimeout(() => {
      abort.abort();
      reject2(new Error("inspection_status_timeout"));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([fetchImpl(URL2, { method: "GET", credentials: "omit", redirect: "manual", cache: "no-store", signal: abort.signal }), deadline]);
    if (response.status !== 200 || response.redirected || response.url && response.url !== URL2 || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get("Content-Type") || "")) throw new Error("Invalid status response");
    reader = response.body?.getReader();
    if (!reader) throw new Error("Missing status response");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0, chunks = 0, text = "";
    for (; ; ) {
      if (++chunks > 4160) throw new Error("Too many chunks");
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      if (!(part.value instanceof Uint8Array) || (size += part.value.byteLength) > 4096) throw new Error("Status response too large");
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const value = dataRecord(JSON.parse(text), ["service", "version", "billingEnabled", "standardBuildFee", "inspectionChainIds", "methods", "description"]);
    if (value.service !== "QHooks inspection" || value.version !== "L127" || typeof value.billingEnabled !== "boolean" || value.standardBuildFee !== "0" || canonical(value.inspectionChainIds) !== "[1,56,8453,42161,4663]" || canonical(value.methods) !== '["qhooks_chains","qhooks_decodePermissions","qhooks_chainStatus","qhooks_getHook"]' || typeof value.description !== "string" || value.description.length > 500) throw new Error("Invalid status data");
    done = true;
    return Object.freeze({ billingEnabled: value.billingEnabled, inspectionChainIds: Object.freeze([...value.inspectionChainIds]) });
  } catch {
    throw new Error("inspection_status_unavailable");
  } finally {
    clearTimeout(timer);
    if (!done) {
      abort.abort();
      try {
        Promise.resolve(reader?.cancel()).catch(() => {
        });
      } catch {
      }
    }
    try {
      reader?.releaseLock();
    } catch {
    }
  }
}

// apps/marketplace-preview/l127-inspection-page.mjs
var uuid = (id) => typeof id === "string" && id.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
var message = (error) => ({
  inspection_approval_rejected: "Approval cancelled. No new payment was sent.",
  inspection_signature_rejected: "Signature declined. No payment was sent.",
  inspection_signature_uncertain: "The wallet did not return a signature. Check your wallet before trying this saved order again.",
  inspection_signing_busy: "This order is being reviewed in another tab. Finish there, then load the saved order.",
  inspection_proof_storage_uncertain: "The signature could not be confirmed in storage. Review this same order again to retry saving it; do not create a replacement payment.",
  inspection_wallet_context_changed: "Wallet changed. Reconnect the original account on Base and load this order.",
  inspection_wallet_required: "Connect the paying wallet on Base. The hook itself can be on any listed inspection network.",
  inspection_billing_unavailable: "Paid inspections are not available right now.",
  inspection_order_missing: "That order is not saved in this browser. Use the original browser and site address.",
  inspection_proof_required: "Review and sign this saved order before submitting it."
})[error?.message] || "Could not complete this step. Your saved order has not been replaced. Check the wallet, network and review expiry before retrying.";
function bindInspectionPage({
  document: d,
  target,
  hub,
  fetchImpl = globalThis.fetch.bind(globalThis),
  openJournal = openInspectionSigningJournal,
  now = Date.now
} = {}) {
  if (!d || !target || typeof hub?.snapshot !== "function" || typeof hub?.subscribe !== "function") throw new TypeError("Explicit page dependencies required");
  const $ = (name) => {
    const node = d.getElementById("inspection-" + name);
    if (!node) throw new TypeError("Missing inspection " + name);
    return node;
  };
  const els = Object.fromEntries(["form", "chain", "address", "quote", "wallet", "service", "status", "order", "order-summary", "order-id", "resume-form", "resume-id", "resume", "sign", "send", "new", "result", "review", "review-body"].map((name) => [name, $(name)]));
  let dead = false, busy = false, billing = false, revision = 0, wallet = null, session = null;
  let journal, openingJournal, activeOrder = null, proof = false, complete = false, cancelReview = null, operation = Promise.resolve();
  const listening = [];
  const listen = (node, event, fn) => {
    node.addEventListener(event, fn);
    listening.push(() => node.removeEventListener(event, fn));
  };
  const note = (text) => {
    if (!dead) els.status.textContent = text;
  };
  const onBase = () => wallet && String(wallet.chainId) === "8453";
  const context = () => {
    if (dead || !onBase()) throw new Error("inspection_wallet_required");
    return wallet;
  };
  function render() {
    if (dead) return;
    els.wallet.textContent = wallet ? wallet.owner + (onBase() ? " \xB7 Base" : " \xB7 Switch the paying wallet to Base") : "Connect a wallet to pay on Base.";
    els.quote.disabled = busy || !billing || !onBase() || !!activeOrder;
    els.chain.disabled = busy || !!activeOrder;
    els.address.disabled = busy || !!activeOrder;
    els.resume.disabled = busy || !onBase();
    els["resume-id"].disabled = busy;
    els.sign.disabled = busy || !billing || !onBase() || !activeOrder || proof;
    els.send.disabled = busy || !billing || !onBase() || !activeOrder || !proof || complete;
    els.new.disabled = busy;
    els.order.hidden = !activeOrder;
    if (activeOrder) {
      els["order-id"].textContent = activeOrder.id;
      els["order-summary"].textContent = activeOrder.request.method + " \xB7 " + JSON.stringify(activeOrder.request.params);
    }
  }
  function remember(id) {
    els["resume-id"].value = id || "";
    try {
      const url = new URL(target.location.href);
      url.search = id ? "?order=" + id : "";
      url.hash = "";
      target.history.replaceState(null, "", url.pathname + url.search);
    } catch {
      note("Keep this order ID to resume in this browser: " + id);
    }
  }
  function confirmApproval(prepared) {
    context();
    if (!activeOrder || prepared.orderId !== activeOrder.id) throw new Error("inspection_approval_mismatch");
    const version = revision;
    const { approveButton, cancelButton } = renderInspectionReview(d, els["review-body"], prepared);
    const request = d.createElement("p");
    request.textContent = els["order-summary"].textContent;
    els["review-body"].append(request);
    return new Promise((resolve) => {
      let settled = false, timer;
      const finish = (approved) => {
        if (settled) return;
        settled = true;
        target.clearTimeout(timer);
        approveButton.removeEventListener("click", approve);
        cancelButton.removeEventListener("click", cancel);
        els.review.removeEventListener("cancel", cancel);
        if (els.review.open) els.review.close();
        cancelReview = null;
        resolve(approved ? { approvalId: prepared.approvalId, payer: prepared.payer, chainId: 8453 } : false);
      };
      const approve = () => finish(!dead && version === revision && onBase() && wallet.owner.toLowerCase() === prepared.payer.toLowerCase() && now() < prepared.approvalExpiresAt);
      const cancel = (event) => {
        event?.preventDefault?.();
        finish(false);
      };
      cancelReview = cancel;
      approveButton.addEventListener("click", approve);
      cancelButton.addEventListener("click", cancel);
      els.review.addEventListener("cancel", cancel);
      const remaining = prepared.approvalExpiresAt - now();
      if (remaining <= 0) {
        finish(false);
        return;
      }
      timer = target.setTimeout(cancel, Math.min(remaining, 12e4));
      try {
        els.review.showModal();
        approveButton.focus();
      } catch {
        finish(false);
      }
    });
  }
  async function ensureSession() {
    const current = context(), version = revision;
    if (session?.owner === current.owner && session.provider === current.entry.provider) return session;
    openingJournal ||= Promise.resolve().then(() => openJournal());
    journal = await openingJournal;
    if (dead || version !== revision) throw new Error("inspection_wallet_context_changed");
    const client = await openInspectionClient({ expectedPayer: current.owner, journal, fetchImpl });
    if (dead || version !== revision) {
      client.close();
      throw new Error("inspection_wallet_context_changed");
    }
    const signer = createInspectionSigningCoordinator({
      journal,
      provider: current.entry.provider,
      expectedPayer: current.owner,
      locks: target.navigator?.locks,
      now,
      confirmApproval
    });
    session = {
      client,
      signer,
      provider: current.entry.provider,
      owner: current.owner,
      validators: createInspectionValidators({ expectedPayer: current.owner, now })
    };
    return session;
  }
  function run(action) {
    if (busy || dead) return Promise.resolve(false);
    busy = true;
    render();
    operation = Promise.resolve().then(action).then(() => true, (error) => {
      note(message(error));
      return false;
    }).finally(() => {
      busy = false;
      render();
    });
    return operation;
  }
  const checkBilling = () => {
    if (!billing) throw new Error("inspection_billing_unavailable");
  };
  const ensureSame = (version) => {
    if (dead || version !== revision) throw new Error("inspection_wallet_context_changed");
  };
  async function readWallet(provider, method) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => provider.request({ method })),
        new Promise((resolve, reject2) => {
          timer = target.setTimeout(() => reject2(new Error("inspection_wallet_context_changed")), 5e3);
        })
      ]);
    } finally {
      target.clearTimeout(timer);
    }
  }
  async function loadRecord(id, selected) {
    if (!uuid(id)) throw new TypeError("Invalid order ID");
    const order = await journal.get("order:" + id), saved = await journal.get("proof:" + id);
    if (order?.id !== id) throw new Error("inspection_order_missing");
    if (saved !== void 0) {
      if (saved?.orderId !== id || typeof saved.header !== "string") throw new Error("inspection_proof_required");
      await selected.validators.validatePayment(order, saved.header);
    } else {
      await selected.validators.validateOrder(order);
    }
    return { order: JSON.parse(canonical(order)), proof: saved !== void 0 };
  }
  const quote = () => run(async () => {
    checkBilling();
    if (activeOrder) throw new Error("inspection_order_exists");
    const selected = await ensureSession(), version = revision;
    const input = normalizeInspectionRequest({
      jsonrpc: "2.0",
      id: target.crypto.randomUUID(),
      method: "qhooks_getHook",
      params: [Number(els.chain.value), els.address.value.trim()]
    }).request;
    const order = await selected.client.quote(input);
    ensureSame(version);
    activeOrder = order;
    proof = false;
    complete = false;
    els.result.textContent = "";
    remember(order.id);
    note("Order saved. Review the $0.01 USDC authorization, then submit it separately.");
  });
  const load = () => run(async () => {
    const selected = await ensureSession(), version = revision;
    const saved = await loadRecord(els["resume-id"].value.trim(), selected);
    ensureSame(version);
    activeOrder = saved.order;
    proof = saved.proof;
    complete = false;
    els.result.textContent = "";
    remember(activeOrder.id);
    note(proof ? "Original signed payment loaded. Check or retry this order without signing again." : "Saved order loaded. Review its authorization before signing.");
  });
  const sign = () => run(async () => {
    checkBilling();
    if (!activeOrder) throw new Error("inspection_order_missing");
    const selected = await ensureSession(), version = revision;
    const result = await selected.signer.approve(activeOrder.id);
    ensureSame(version);
    proof = result.state === "proof_ready";
    note(result.requiresReview ? "Original signature saved. Check the account and order above, then explicitly submit or retry." : "Signature saved. No payment submitted yet. Choose Pay & inspect when ready.");
  });
  const submit = () => run(async () => {
    checkBilling();
    if (!activeOrder || !proof) throw new Error("inspection_proof_required");
    const selected = await ensureSession(), version = revision;
    const accounts = await readWallet(selected.provider, "eth_accounts");
    const chain = await readWallet(selected.provider, "eth_chainId");
    ensureSame(version);
    if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || accounts[0].toLowerCase() !== selected.owner.toLowerCase() || typeof chain !== "string" || !/^0x[0-9a-fA-F]{1,16}$/.test(chain) || chain !== chain.trim() || BigInt(chain) !== 8453n) throw new Error("inspection_wallet_context_changed");
    const result = await selected.client.retry(activeOrder.id);
    ensureSame(version);
    complete = result.state === "complete";
    if (complete) {
      els.result.textContent = JSON.stringify(result.result, null, 2);
      note("Inspection delivered. The payment receipt is included below.");
    } else {
      note("Result pending or delivery uncertain. Retry this same order; no new signature is needed.");
    }
  });
  function newInspection() {
    if (busy || dead) return;
    const previousId = activeOrder?.id;
    activeOrder = null;
    proof = false;
    complete = false;
    els.result.textContent = "";
    remember(null);
    if (previousId) els["resume-id"].value = previousId;
    note(previousId ? "Previous order remains saved: " + previousId : "Start a new inspection. Previous records are not deleted.");
    render();
  }
  listen(els.form, "submit", (event) => {
    event.preventDefault();
    void quote();
  });
  listen(els["resume-form"], "submit", (event) => {
    event.preventDefault();
    void load();
  });
  listen(els.sign, "click", () => {
    void sign();
  });
  listen(els.send, "click", () => {
    void submit();
  });
  listen(els.new, "click", newInspection);
  const unsubscribe = hub.subscribe((snapshot) => {
    if (dead) return;
    const next = snapshot.current;
    if (wallet !== next) {
      revision++;
      cancelReview?.();
      session?.signer.close();
      session?.client.close();
      session = null;
    }
    wallet = next;
    render();
  });
  const savedId = new URL(target.location.href).searchParams.get("order");
  if (uuid(savedId)) els["resume-id"].value = savedId;
  const ready = loadInspectionStatus({ fetchImpl }).then((status) => {
    if (dead) return;
    billing = status.billingEnabled;
    els.service.textContent = billing ? "$0.01 USDC per inspection, paid on Base." : "Paid inspections are not available right now. Standard hook builds remain free.";
    render();
  }).catch(() => {
    if (!dead) {
      billing = false;
      els.service.textContent = "Inspection service unavailable. No payment can be started.";
      render();
    }
  });
  async function dispose() {
    if (dead) return;
    dead = true;
    revision++;
    cancelReview?.();
    unsubscribe();
    for (const remove of listening) remove();
    session?.signer.close();
    session?.client.close();
    target.removeEventListener("pagehide", dispose);
    await operation;
    try {
      journal?.close();
    } catch {
    }
  }
  target.addEventListener("pagehide", dispose);
  render();
  return Object.freeze({ ready, quote, load, sign, submit, newInspection, dispose });
}

// apps/marketplace-preview/l127-inspection-entry.mjs
bindInspectionPage({ document, target: window, hub: getWalletHub(window) });
