import { getWalletHub } from "/wallet-hub.mjs";
import { ExchangeClient, HttpTransport, createWalletClient, custom, privateKeyToAccount, generatePrivateKey } from "./vendor/hyperliquid/hl.mjs";
import { ADDRESS, normalizeConfig, orderResult, positive } from "./qx-perps-core.mjs";
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", BRIDGE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";
const feeKeyFor = (owner) => "qhooks:perps:builder-fee:v1:" + owner.toLowerCase();
const keyFor = (owner) => "qhooks:perps:agent:v1:" + owner.toLowerCase();
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
function createPerpsWallet({ hub = getWalletHub(window), storage = { getItem: (k) => globalThis.localStorage.getItem(k), setItem: (k, v) => globalThis.localStorage.setItem(k, v), removeItem: (k) => globalThis.localStorage.removeItem(k) }, transport = new HttpTransport({ timeout: 15e3 }), sdk = { ExchangeClient, createWalletClient, custom, privateKeyToAccount, generatePrivateKey } } = {}) {
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
  function read(owner) {
    try {
      const record = JSON.parse(storage.getItem(keyFor(owner)));
      if (!record || record.owner !== owner.toLowerCase() || !/^0x[0-9a-f]{64}$/i.test(record.key)) return null;
      const account = sdk.privateKeyToAccount(record.key);
      return { ...record, account };
    } catch {
      return null;
    }
  }
  function save(owner, record) {
    const text = JSON.stringify(record);
    storage.setItem(keyFor(owner), text);
    if (storage.getItem(keyFor(owner)) !== text) throw Error("Browser storage is locked.");
  }
  function ready(config) {
    const c = hub.snapshot().current, r = c && read(c.owner), cfg = normalizeConfig(config);
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
    let record = read(c.owner);
    if (!record?.approved) {
      record = { owner: c.owner.toLowerCase(), key: sdk.generatePrivateKey(), approved: false, builder: null };
      save(c.owner, record);
      const account = sdk.privateKeyToAccount(record.key);
      try {
        orderResult(await ownerClient(c).approveAgent({ agentAddress: account.address, agentName: "QHooks" }));
        await guard(c);
      } catch (e) {
        storage.removeItem(keyFor(c.owner));
        throw e;
      }
      record.approved = true;
      save(c.owner, record);
    }
    if (cfg.builder && record.builder !== cfg.builder) {
      await builderApproval(c, cfg);
      record.builder = cfg.builder;
      save(c.owner, { owner: record.owner, key: record.key, approved: true, builder: record.builder });
    }
  }
  return {
    ready,
    hasAgent: () => {
      const c = hub.snapshot().current;
      return !!(c && read(c.owner)?.approved);
    },
    setup,
    turnOff() {
      const c = current();
      storage.removeItem(keyFor(c.owner));
      storage.removeItem(feeKeyFor(c.owner));
      if (storage.getItem(keyFor(c.owner)) !== null) throw Error("Clear site data to remove the local trading key.");
    },
    async order(action, { config, closing = false, leverage } = {}) {
      const c = current();
      await guard(c);
      const cfg = normalizeConfig(config);
      if (closing && (!action.orders.length || action.orders.some((o) => !o.r))) throw Error("Closing orders must be reduce-only.");
      if (closing && leverage) throw Error("Closing does not change leverage.");
      if (!ready(cfg)) {
        if (!closing) throw Error("Turn on fast trading first.");
        await setup(cfg);
      }
      await guard(c);
      const record = read(c.owner);
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
      if (!read(c.owner)?.approved) await setup({ builder: null, builderFeeTenthsBp: 100 });
      await guard(c);
      const record = read(c.owner);
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
  usdcUnits
};
