export function parsePoolTransfer(input) {
  if (!input || typeof input !== 'object' || ![null,Object.prototype].includes(Object.getPrototypeOf(input))) throw new TypeError('Plain input required');
  const descriptors=Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).length!==3 || !['kind','amount','recipient'].every(k=>Object.hasOwn(descriptors,k)&&Object.hasOwn(descriptors[k],'value')&&descriptors[k].enumerable)) throw new TypeError('Exactly three own data fields required');

  const kind = input.kind;
  const amount = input.amount;
  const recipient = input.recipient;

  if (typeof kind !== "string" || kind !== "deposit" && kind !== "withdraw") {
    throw new TypeError("kind must be exactly 'deposit' or 'withdraw'");
  }

  if (typeof amount !== "string" || amount.length === 0 || amount.length > 78) {
    throw new TypeError("amount must be a non-empty string with length <= 78");
  }

  if (!/^[1-9][0-9]*$/.test(amount)) {
    throw new TypeError("amount must be a canonical positive decimal base units string");
  }

  try {
    const amountBigInt = BigInt(amount);
    if (amountBigInt < 0n || amountBigInt > 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn) {
      throw new TypeError("amount must be a valid positive decimal base units string");
    }
  } catch {
    throw new TypeError("amount must be a valid positive decimal base units string");
  }

  if (typeof recipient !== "string") {
    throw new TypeError("recipient must be a string");
  }

  if (kind === "deposit") {
    if (recipient !== "") {
      throw new TypeError("deposit requires exactly empty string for recipient");
    }
  } else if (kind === "withdraw") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
      throw new TypeError("withdraw requires recipient to be a valid Ethereum address");
    }
    if (recipient === "0x0000000000000000000000000000000000000000") {
      throw new TypeError("recipient must not be the zero address");
    }
  }

  return Object.freeze({
    kind,
    amount,
    recipient: recipient.toLowerCase()
  });
}
