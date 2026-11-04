export function describeConstructor(contract) {
  if (typeof contract !== 'object' || contract === null || Array.isArray(contract)) {
    throw new TypeError('Unsupported constructor ABI');
  }
  const name = contract.name;
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,95}$/.test(name)) {
    throw new TypeError('Unsupported constructor ABI');
  }
  const abi = contract.abi;
  if (!Array.isArray(abi) || abi.length > 512) {
    throw new TypeError('Unsupported constructor ABI');
  }
  const constructors = abi.filter(item => item?.type === 'constructor');
  if (constructors.length !== 1) throw new TypeError('Unsupported constructor ABI');
  const constructor = constructors[0];
  const stateMutability = constructor.stateMutability;
  if (stateMutability !== 'nonpayable' && stateMutability !== 'payable') {
    throw new TypeError('Unsupported constructor ABI');
  }
  const inputs = constructor.inputs;
  if (!Array.isArray(inputs) || inputs.length > 32) {
    throw new TypeError('Unsupported constructor ABI');
  }
  const validTypes = new Set(['address', 'bool', 'bytes', 'bytes32', 'uint8', 'uint24', 'uint64', 'uint128', 'uint160', 'uint256', 'int24', 'int256']);
  const mapped = Array.from(inputs, (x, index) => {
    if (typeof x !== 'object' || x === null || Array.isArray(x)) {
      throw new TypeError('Unsupported constructor ABI');
    }
    const inputName = x.name;
    if (typeof inputName !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,95}$/.test(inputName)) {
      throw new TypeError('Unsupported constructor ABI');
    }
    const inputType = x.type;
    if (!validTypes.has(inputType)) throw new TypeError('Unsupported constructor ABI');
    return Object.freeze({ position: index, name: inputName, type: inputType });
  });
  return Object.freeze({contractName: name, stateMutability, inputs: Object.freeze(mapped)});
}
