function deepFreeze(obj) {
  if (Object(obj) !== obj || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach(prop => {
    if (obj[prop] !== null && typeof obj[prop] === 'object') deepFreeze(obj[prop]);
  });
  return obj;
}

export function createCompileSession() {
  let ticket = null;
  let status = 'idle';
  let artifact = null;
  return Object.freeze({
    invalidate() {
      ticket = null;
      artifact = null;
      status = 'idle';
    },
    begin(inputSha256) {
      if (typeof inputSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(inputSha256)) {
        throw new TypeError('Expected a lowercase 64-character input digest');
      }
      ticket = Object.freeze({ inputSha256 });
      status = 'building';
      artifact = null;
      return ticket;
    },
    finish(t, result) {
      if (t !== ticket || status !== 'building') return false;
      if (!result || typeof result !== 'object' || Array.isArray(result) ||
          result.schemaVersion !== 1 || result.kind !== 'qhooks-compiled-project' ||
          result.projectInputSha256 !== t.inputSha256 || result.compiled !== true || result.deployed !== false) {
        throw new TypeError('Invalid build result');
      }
      artifact = deepFreeze(structuredClone(result));
      status = 'ready';
      return true;
    },
    fail(t) {
      if (t !== ticket || status !== 'building') return false;
      artifact = null;
      status = 'failed';
      return true;
    },
    get snapshot() { return Object.freeze({ status, artifact }); }
  });
}
