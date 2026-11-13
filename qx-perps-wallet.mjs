import { getWalletHub } from "/wallet-hub.mjs";
import { ExchangeClient, HttpTransport, createWalletClient, custom, privateKeyToAccount, generatePrivateKey } from "./vendor/hyperliquid/hl.mjs";
import { ADDRESS, normalizeConfig, orderResult, positive } from "./qx-perps-core.mjs";
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", BRIDGE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";
const feeKeyFor = (owner) => "qhooks:perps:builder-fee:v1:" + owner.toLowerCase();
// perpskey (2026-11-12): the agent (fast trading) key is kept sealed at rest.
// v1 held the private key as plain text in localStorage. It is read only to move it into v2, and is deleted in the same step.
// v2 in localStorage holds public facts (agent address, approval, builder) plus the AES-GCM ciphertext and IV.
// The sealing key is a non-extractable CryptoKey in IndexedDB, one per owner wallet. Nothing here logs or sends the key.
const LEGACY = "qhooks:perps:agent:v1:", SEALED = "qhooks:perps:agent:v2:";
const keyFor = (owner) => LEGACY + owner.toLowerCase();
const sealedFor = (owner) => SEALED + owner.toLowerCase();
const sealId = (owner) => "agent:v2:" + owner.toLowerCase();
const HEX_KEY = /^0x[0-9a-f]{64}$/i;
const locked = () => Error("Browser storage is locked.");
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
const hexBytes = (hex) => Uint8Array.from(hex.slice(2).match(/../g), (pair) => parseInt(pair, 16));
const bytesHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function indexedKeyStore(idb = globalThis.indexedDB, waitMs = 8e3) {
  let opening = null;
  function open() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        if (!idb) return reject(locked());
        let done = false, request;
        const timer = setTimeout(() => { done = true; reject(locked()); }, waitMs);
        try {
          request = idb.open("qhooks-perps-keys", 1);
        } catch {
          clearTimeout(timer);
          return reject(locked());
        }
        request.onupgradeneeded = () => request.result.createObjectStore("sealing-keys");
        request.onsuccess = () => {
          clearTimeout(timer);
          const db = request.result;
          if (done) return db.close();
          done = true;
          db.onversionchange = () => { db.close(); opening = null; };
          resolve(db);
        };
        request.onerror = () => { clearTimeout(timer); done = true; reject(locked()); };
      });
      opening.catch(() => { opening = null; });
    }
    return opening;
  }
  async function run(mode, body) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let tx, result, failure;
      try {
        tx = db.transaction("sealing-keys", mode);
      } catch {
        opening = null;
        return reject(locked());
      }
      body(tx.objectStore("sealing-keys"), (value) => { result = value; }, (error) => { failure = error; });
      tx.oncomplete = () => failure ? reject(failure) : resolve(result);
      tx.onerror = tx.onabort = () => reject(failure || locked());
    });
  }
  return {
    get: (id) => run("readonly", (store, done) => { const r = store.get(id); r.onsuccess = () => done(r.result); }),
    // First writer wins, so two open tabs always share one sealing key.
    add: (id, value) => run("readwrite", (store, done, fail) => {
      const r = store.get(id);
      r.onsuccess = () => {
        if (r.result) return done(r.result);
        try {
          store.put(value, id);
          done(value);
        } catch (e) {
          fail(e);
        }
      };
    }),
    delete: (id) => run("readwrite", (store) => { store.delete(id); })
  };
}
function createSealer({ keys, subtle, random, sdk }) {
  const encoder = new TextEncoder();
  // Binds each ciphertext to its owner and agent address, so a record cannot be swapped between wallets.
  const aad = (owner, address) => encoder.encode("qhooks:perps:agent:v2|" + owner.toLowerCase() + "|" + address.toLowerCase());
  async function sealingKey(owner, create) {
    if (!subtle) throw locked();
    let key = await keys.get(sealId(owner));
    if (!key && create) {
      const fresh = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      try {
        key = await keys.add(sealId(owner), fresh);
      } catch (e) {
        if (e?.name !== "DataCloneError") throw e;
        // A few in-app browsers cannot store a CryptoKey in IndexedDB. They keep random key bytes there instead, never in localStorage.
        key = await keys.add(sealId(owner), random(new Uint8Array(32)));
      }
    }
    if (ArrayBuffer.isView(key)) return subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
    return key || null;
  }
  return {
    async seal(owner, privateKey) {
      if (!HEX_KEY.test(privateKey)) throw Error("Turn on fast trading again.");
      const address = sdk.privateKeyToAccount(privateKey).address.toLowerCase(), key = await sealingKey(owner, true), iv = random(new Uint8Array(12)), plain = hexBytes(privateKey);
      try {
        const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(owner, address) }, key, plain));
        return { address, iv: toBase64(iv), ct: toBase64(ct) };
      } finally {
        plain.fill(0);
      }
    },
    // null when this browser can no longer open the record (its sealing key was cleared, or the record was altered).
    async unseal(record) {
      const key = await sealingKey(record.owner, false);
      if (!key) return null;
      let plain;
      try {
        plain = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: fromBase64(record.iv), additionalData: aad(record.owner, record.address) }, key, fromBase64(record.ct)));
      } catch {
        return null;
      }
      if (plain.length !== 32) return null;
      const account = sdk.privateKeyToAccount("0x" + bytesHex(plain));
      plain.fill(0);
      return account.address.toLowerCase() === record.address ? account : null;
    },
    forget: (owner) => keys.delete(sealId(owner)),
    has: async (owner) => !!await keys.get(sealId(owner))
  };
}
function usdcUnits(amount) {
  const text = String(amount).trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) throw Error("Use up to 6 decimal places.");
  const [w, f = ""] = text.split(".");
  return BigInt(w) * 1000000n + BigInt(f.padEnd(6, "0"));
}
function depositTransaction(owner, amount) {
  if (!ADDRESS.test(owner)) throw Error("Connect your wallet.");
  const units = usdcUnits(amount);
  if (units >= 2n ** 256n) throw Error("Deposit amount is too large.");
  if (units < 5000000n) throw Error("Minimum deposit is 5 USDC.");
  return { from: owner, to: USDC, data: "0xa9059cbb" + BRIDGE.slice(2).toLowerCase().padStart(64, "0") + units.toString(16).padStart(64, "0"), value: "0x0" };
}
const browserStorage = { getItem: (k) => globalThis.localStorage.getItem(k), setItem: (k, v) => globalThis.localStorage.setItem(k, v), removeItem: (k) => globalThis.localStorage.removeItem(k), keys: () => Array.from({ length: globalThis.localStorage.length }, (_, i) => globalThis.localStorage.key(i)) };
function createPerpsWallet({ hub = getWalletHub(window), storage = browserStorage, transport = new HttpTransport({ timeout: 15e3 }), sdk = { ExchangeClient, createWalletClient, custom, privateKeyToAccount, generatePrivateKey }, keys = indexedKeyStore(), subtle = globalThis.crypto?.subtle, random = (bytes) => globalThis.crypto.getRandomValues(bytes) } = {}) {
  const sealer = createSealer({ keys, subtle, random, sdk });
  function current() {
    const c = hub.snapshot().current;
    if (!c || !ADDRESS.test(c.owner) || !c.entry?.provider?.request) throw Error("Connect your wallet.");
    return c;
  }
  async function guard(expected) {
    const c = current();
    if (c.owner !== expected.owner || c.entry.provider !== expected.entry.provider) throw Error("Wallet changed. Review again.");
    const accounts = await c.entry.provider.request({ method: "eth_accounts" });
    if (accounts?.[0]?.toLowerCase() !== expected.owner.toLowerCase()) throw Error("Wallet changed. Reconnect.");
    return c;
  }
  // Public facts only (approval, builder); never opens the key, so ready() and hasAgent() stay synchronous.
  function stored(owner) {
    try {
      const r = JSON.parse(storage.getItem(sealedFor(owner)));
      if (r && r.v === 2 && r.owner === owner.toLowerCase() && ADDRESS.test(r.address) && typeof r.iv === "string" && typeof r.ct === "string") return r;
    } catch {
    }
    try {
      // A v1 record is moved into v2 as the page loads; until that finishes it still answers ready() and hasAgent().
      const old = JSON.parse(storage.getItem(keyFor(owner)));
      if (old && old.owner === owner.toLowerCase() && HEX_KEY.test(old.key)) return { owner: old.owner, approved: !!old.approved, builder: old.builder ?? null, legacy: true };
    } catch {
    }
    return null;
  }
  function save(owner, record) {
    const text = JSON.stringify({ v: 2, owner: owner.toLowerCase(), address: record.address, approved: !!record.approved, builder: record.builder ?? null, iv: record.iv, ct: record.ct });
    storage.setItem(sealedFor(owner), text);
    if (storage.getItem(sealedFor(owner)) !== text) throw Error("Browser storage is locked.");
  }
  async function migrateOne(owner, name = keyFor(owner)) {
    let raw = null;
    try {
      raw = storage.getItem(name);
    } catch {
      return;
    }
    if (raw === null) return;
    const lower = owner.toLowerCase();
    try {
      const old = JSON.parse(raw);
      if (ADDRESS.test(lower) && old && old.owner === lower && HEX_KEY.test(old.key)) save(lower, { ...await sealer.seal(lower, old.key), approved: !!old.approved, builder: old.builder ?? null });
    } catch {
      // Not sealed here: the plain key is still deleted below. Turning fast trading on again approves a fresh agent.
    } finally {
      try {
        storage.removeItem(name);
      } catch {
      }
    }
  }
  // One queue for every move, so a load, setup or turn-off never races a move for the same wallet.
  let queue = Promise.resolve();
  function settle(entries) {
    queue = queue.then(() => Promise.all(entries.map(([owner, name]) => migrateOne(owner, name)))).catch(() => {
    });
    return queue;
  }
  function legacyEntries() {
    try {
      return (storage.keys?.() || []).filter((k) => typeof k === "string" && k.startsWith(LEGACY)).map((k) => [k.slice(LEGACY.length), k]);
    } catch {
      return [];
    }
  }
  const migrated = settle(legacyEntries());
  async function load(owner) {
    await settle([[owner]]);
    const r = stored(owner);
    if (!r || r.legacy) return null;
    const account = await sealer.unseal(r);
    if (!account) {
      try {
        storage.removeItem(sealedFor(owner));
      } catch {
      }
      return null;
    }
    return { ...r, account };
  }
  function ready(config) {
    const c = hub.snapshot().current, r = c && stored(c.owner), cfg = normalizeConfig(config);
    return !!(r?.approved && (!cfg.builder || r.builder === cfg.builder));
  }
  function client(c, wallet) {
    return new sdk.ExchangeClient({ wallet, transport: { isTestnet: false, async request(endpoint, payload, signal) {
      await guard(c);
      return transport.request(endpoint, payload, signal);
    } } });
  }
  function ownerClient(c) {
    return client(c, sdk.createWalletClient({ account: c.owner, transport: sdk.custom({ async request(args) {
      await guard(c);
      return c.entry.provider.request(args);
    } }) }));
  }
  async function builderApproval(c, config) {
    const cfg = normalizeConfig(config);
    if (!cfg.builder) return;
    let approved;
    try {
      approved = storage.getItem(feeKeyFor(c.owner));
    } catch {
    }
    if (approved !== cfg.builder) {
      orderResult(await ownerClient(c).approveBuilderFee({ builder: cfg.builder, maxFeeRate: "0.1%" }));
      await guard(c);
      try {
        storage.setItem(feeKeyFor(c.owner), cfg.builder);
      } catch {
      }
    }
    await guard(c);
  }
  async function setup(config) {
    const c = current(), cfg = normalizeConfig(config);
    await guard(c);
    let record = await load(c.owner);
    if (!record?.approved) {
      const key = sdk.generatePrivateKey();
      record = { ...await sealer.seal(c.owner, key), approved: false, builder: null };
      save(c.owner, record);
      const account = sdk.privateKeyToAccount(key);
      try {
        orderResult(await ownerClient(c).approveAgent({ agentAddress: account.address, agentName: "QHooks" }));
        await guard(c);
      } catch (e) {
        storage.removeItem(sealedFor(c.owner));
        throw e;
      }
      record.approved = true;
      save(c.owner, record);
    }
    if (cfg.builder && record.builder !== cfg.builder) {
      await builderApproval(c, cfg);
      record.builder = cfg.builder;
      save(c.owner, { ...record, approved: true });
    }
  }
  return {
    ready,
    hasAgent: () => {
      const c = hub.snapshot().current;
      return !!(c && stored(c.owner)?.approved);
    },
    setup,
    migrated,
    // "Turn off fast trading": deletes the sealed key, its sealing key and any v1 leftover for this wallet.
    async turnOff() {
      const c = current();
      await settle([[c.owner]]);
      storage.removeItem(sealedFor(c.owner));
      storage.removeItem(keyFor(c.owner));
      storage.removeItem(feeKeyFor(c.owner));
      let left;
      try {
        await sealer.forget(c.owner);
        left = await sealer.has(c.owner);
      } catch {
        left = true;
      }
      if (left || storage.getItem(sealedFor(c.owner)) !== null || storage.getItem(keyFor(c.owner)) !== null) throw Error("Clear site data to remove the local trading key.");
    },
    async order(action, { config, closing = false, leverage } = {}) {
      const c = current();
      await guard(c);
      const cfg = normalizeConfig(config);
      if (closing && (!action.orders.length || action.orders.some((o) => !o.r))) throw Error("Closing orders must be reduce-only.");
      if (closing && leverage) throw Error("Closing does not change leverage.");
      let record = await load(c.owner);
      if (!ready(cfg)) {
        if (!closing) throw Error("Turn on fast trading first.");
        await setup(cfg);
        record = await load(c.owner);
      }
      await guard(c);
      if (!record?.approved || !ready(cfg)) throw Error("Approve fast trading once to close.");
      const exchange = client(c, record.account);
      if (leverage) {
        orderResult(await exchange.updateLeverage(leverage));
      }
      await guard(c);
      return orderResult(await exchange.order(action));
    },
    async cancel(asset, oid) {
      const c = current();
      await guard(c);
      if (!(await load(c.owner))?.approved) await setup({ builder: null, builderFeeTenthsBp: 100 });
      await guard(c);
      const record = await load(c.owner);
      if (!record?.approved) throw Error("Approve fast trading once to close.");
      const exchange = client(c, record.account);
      return orderResult(await exchange.cancel({ cancels: [{ a: asset, o: oid }] }));
    },
    async deposit(amount) {
      const c = current(), tx = depositTransaction(c.owner, amount);
      await guard(c);
      await hub.switchChain("42161");
      const switched = current();
      if (switched.owner !== c.owner) throw Error("Wallet changed. Review again.");
      await guard(switched);
      if (Number(await switched.entry.provider.request({ method: "eth_chainId" })) !== 42161) throw Error("Switch to Arbitrum first.");
      return switched.entry.provider.request({ method: "eth_sendTransaction", params: [tx] });
    },
    async withdraw(amount) {
      const c = current();
      positive(amount, "withdrawal");
      if (usdcUnits(amount) <= 1000000n) throw Error("Withdraw more than the 1 USDC fee.");
      await guard(c);
      return orderResult(await ownerClient(c).withdraw3({ destination: c.owner, amount: String(amount) }));
    }
  };
}
export {
  BRIDGE,
  USDC,
  createPerpsWallet,
  depositTransaction,
  indexedKeyStore,
  usdcUnits
};
