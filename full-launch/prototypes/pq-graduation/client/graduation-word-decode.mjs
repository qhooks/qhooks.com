import { abiWord } from "../../../packages/launchpad/abi-word.mjs";

export function decodeGraduationWords(raw, types) {
  if (!Array.isArray(types) || types.length < 1 || types.length > 64) throw new TypeError('Invalid types array');
  const descriptors = Object.getOwnPropertyDescriptors(types);
  for (let i = 0; i < types.length; i++) {
    const d = descriptors[i];
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value') || typeof d.value !== 'string') throw new TypeError('Own data type strings required');
  }
  types = Array.from({length:types.length}, (_,i) => descriptors[i].value);
  if (!Array.isArray(types) || types.length === 0 || types.length > 64 ||
      types.some((t, i) => typeof t !== "string" || !/^(address|bytes32|uint(8|24|64|128|160|256)|int(24|256))$/.test(t))) {
    throw new TypeError("Invalid types shape or length");
  }

  if (typeof raw !== "string" || !/^0x[0-9a-f]+$/.test(raw) || raw.length !== 2 + 64 * types.length) {
    throw new TypeError("Invalid raw data");
  }

  const values = [];
  for (let i = 0; i < types.length; i++) {
    const word = raw.slice(2 + 64 * i, 2 + 64 * (i + 1));
    let value;

    switch (types[i]) {
      case "address":
        value = "0x" + word.slice(24);
        break;
      case "bytes32":
        value = "0x" + word;
        break;
      case "uint8":
      case "uint24":
      case "uint64":
      case "uint128":
      case "uint160":
      case "uint256":
        value = BigInt("0x" + word).toString();
        break;
      case "int24":
      case "int256":
        value = BigInt.asIntN(256, BigInt("0x" + word)).toString();
        break;
      default:
        throw new TypeError("Unsupported type");
    }

    if (abiWord(types[i], value) !== word) {
      throw new TypeError("ABI word mismatch");
    }

    values.push(value);
  }

  return Object.freeze(values);
}
