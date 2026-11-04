import {
  CLIENT_INSPECTION_TERMS,
  canonical,
  createInspectionValidators,
  dataRecord,
  digest
} from "./chunk-3ETD7NFB.js";
import {
  ExactEvmScheme
} from "./chunk-JVQVTIS6.js";

// packages/commerce/l127-authorization-view.mjs
function authorizationView({ order, payer, authorization, typedData, now }) {
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("now must be a safe nonnegative integer");
  const expiry = Math.min(order.expiresAt, now + 12e4, (Number(authorization.validBefore) - 30) * 1e3);
  if (!Number.isSafeInteger(expiry) || expiry < 0) throw new TypeError("expiry must be a safe nonnegative integer");
  if (expiry <= now) throw new TypeError("expiry must be greater than now");
  return {
    schema: 1,
    orderId: order.id,
    requestHash: order.requestHash,
    payer,
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    amount: "10000",
    recipient: "0x2b1Cf7c4071A98A59709166DFA73C7acb7E83E71",
    approvalExpiresAt: expiry,
    typedData,
    unsignedPayment: {
      x402Version: 2,
      resource: order.resource,
      accepted: order.paymentRequired.accepts[0],
      payload: { authorization }
    }
  };
}

// packages/commerce/l127-prepare-authorization.mjs
var requireThat = (condition, message) => {
  if (!condition) throw new TypeError(message);
};
var fields = [
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
var equal = (a, b) => canonical(a) === canonical(b);
var sameAddress = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
async function prepareInspectionAuthorization({ order, expectedPayer, now = Date.now } = {}) {
  const validators = createInspectionValidators({ expectedPayer, now });
  const checked = await validators.validateOrder(order);
  let captured;
  const placeholder = "0x" + "00".repeat(65);
  const captureOnlySigner = {
    address: expectedPayer,
    async signTypedData(value) {
      requireThat(captured === void 0, "Unexpected additional signing operation");
      captured = value;
      return placeholder;
    }
  };
  const built = dataRecord(await new ExactEvmScheme(captureOnlySigner).createPaymentPayload(2, CLIENT_INSPECTION_TERMS), ["x402Version", "payload"]);
  const inner = dataRecord(built.payload, ["authorization", "signature"]);
  const authorization = dataRecord(inner.authorization, ["from", "to", "value", "validAfter", "validBefore", "nonce"]);
  const at = now();
  requireThat(Number.isSafeInteger(at) && at >= 0, "Invalid approval clock");
  requireThat(built.x402Version === 2 && inner.signature === placeholder, "Unexpected payment preparation");
  requireThat(sameAddress(authorization.from, expectedPayer) && sameAddress(authorization.to, CLIENT_INSPECTION_TERMS.payTo) && authorization.value === CLIENT_INSPECTION_TERMS.amount && authorization.validAfter === "0", "Wrong authorization terms");
  requireThat(typeof authorization.validBefore === "string" && /^[0-9]{1,16}$/.test(authorization.validBefore) && Number.isSafeInteger(Number(authorization.validBefore)) && Number(authorization.validBefore) > Math.floor(at / 1e3) && Number(authorization.validBefore) <= Math.floor(at / 1e3) + CLIENT_INSPECTION_TERMS.maxTimeoutSeconds, "Wrong authorization expiry");
  requireThat(typeof authorization.nonce === "string" && /^0x[0-9a-f]{64}$/.test(authorization.nonce), "Invalid authorization nonce");
  const typed = dataRecord(captured, ["domain", "types", "primaryType", "message"]);
  const domain = dataRecord(typed.domain, ["name", "version", "chainId", "verifyingContract"]);
  requireThat(domain.name === CLIENT_INSPECTION_TERMS.extra.name && domain.version === CLIENT_INSPECTION_TERMS.extra.version && domain.chainId === 8453 && sameAddress(domain.verifyingContract, CLIENT_INSPECTION_TERMS.asset), "Wrong typed-data domain");
  requireThat(typed.primaryType === "TransferWithAuthorization" && equal(typed.types, { TransferWithAuthorization: fields }), "Wrong typed-data types");
  const message = dataRecord(typed.message, ["from", "to", "value", "validAfter", "validBefore", "nonce"]);
  requireThat(sameAddress(message.from, authorization.from) && sameAddress(message.to, authorization.to) && message.value === BigInt(authorization.value) && message.validAfter === BigInt(authorization.validAfter) && message.validBefore === BigInt(authorization.validBefore) && message.nonce === authorization.nonce, "Typed data does not match authorization");
  const typedData = {
    domain,
    types: { EIP712Domain: domainFields, TransferWithAuthorization: fields },
    primaryType: typed.primaryType,
    message: {
      ...message,
      value: authorization.value,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore
    }
  };
  const view = JSON.parse(canonical(authorizationView({
    order: checked,
    payer: expectedPayer,
    authorization,
    typedData,
    now: at
  })));
  return { ...view, approvalId: await digest(view) };
}
export {
  prepareInspectionAuthorization
};
