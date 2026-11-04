// Lab public-chain deployment: pure planning and checking for any template the build service describes.
// No DOM, wallet or network here. The build manifest (kind qhooks-lab-deploy-build) carries the contracts and a
// declarative plan; this module turns it into exact transactions, predicts every address (CREATE2 throughout),
// mines hook salts, checks deployed code byte for byte and writes the deployment manifest other tools register.
import {keccak_256} from './full-launch/prototypes/qpools/client/vendor/hashes/sha3.js';

export const DETERMINISTIC_DEPLOYER = '0x4e59b44847b379578588920ca78fbf26c0b4956c';
export const DEPLOYMENT_KIND = 'qhooks-hook-deployment';
const ZERO = '0x0000000000000000000000000000000000000000';
const ensure = (ok, m) => { if (!ok) throw new TypeError(m); };
const strip = h => String(h).replace(/^0x/, '').toLowerCase();
export const toBytes = h => { const s = strip(h); ensure(s.length % 2 === 0 && /^[0-9a-f]*$/.test(s), 'Bad hex'); const b = new Uint8Array(s.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16); return b; };
export const toHex = b => '0x' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
export const keccak = h => toHex(keccak_256(typeof h === 'string' ? toBytes(h) : h));
export const selector = sig => keccak(new TextEncoder().encode(sig)).slice(0, 10);

// ---- Static ABI words (every constructor and call argument a plan uses is static) ----
export function word(type, v) {
  if (type === 'address') { const s = strip(v); ensure(/^[0-9a-f]{40}$/.test(s), 'Bad address'); return s.padStart(64, '0'); }
  if (type === 'bytes32') { const s = strip(v); ensure(/^[0-9a-f]{64}$/.test(s), 'Bad bytes32'); return s; }
  if (type === 'bool') return (v ? '1' : '0').padStart(64, '0');
  const m = /^(u?)int(\d+)$/.exec(type); ensure(m, 'Unsupported type ' + type);
  let n = BigInt(v); const bits = BigInt(m[2]);
  if (m[1]) ensure(n >= 0n && n < 1n << bits, type + ' out of range');
  else { ensure(n >= -(1n << (bits - 1n)) && n < 1n << (bits - 1n), type + ' out of range'); if (n < 0n) n += 1n << 256n; }
  return n.toString(16).padStart(64, '0');
}
export const encode = (types, values) => { ensure(types.length === values.length, 'ABI arity'); return types.map((t, i) => word(t, values[i])).join(''); };

export function create2(deployer, salt, initcodeHash) {
  return '0x' + keccak('0xff' + strip(deployer) + strip(salt) + strip(initcodeHash)).slice(-40);
}
/// The first salt (counting up from 0, so every browser finds the same one) whose CREATE2 address carries exactly
/// `flags` in its low 14 bits, as Uniswap v4 reads hook permissions from the address.
export function mineSalt(deployer, initcodeHash, flags, limit = 2_000_000) {
  const pre = toBytes('0xff' + strip(deployer) + '00'.repeat(32) + strip(initcodeHash)), want = BigInt(flags);
  for (let i = 0; i < limit; i++) {
    let n = i;
    for (let j = 52; j >= 21 && n > 0; j--) { pre[j] = n & 0xff; n = Math.floor(n / 256); }
    const h = keccak_256(pre), low = (BigInt(h[30]) << 8n | BigInt(h[31])) & 0x3fffn;
    if (low === want) { const salt = '0x' + i.toString(16).padStart(64, '0'); return { salt, address: '0x' + toHex(h).slice(-40), tries: i + 1 }; }
  }
  throw new Error('No hook salt found');
}

/// Resolves one value reference in a plan: {config}, {input}, {chain}, {ref}, {const}, {mine}.
export function resolve(spec, ctx) {
  if (Object.hasOwn(spec, 'config')) { ensure(Object.hasOwn(ctx.artifact.configuration, spec.config), 'Unknown configuration field ' + spec.config); return ctx.artifact.configuration[spec.config]; }
  if (Object.hasOwn(spec, 'input')) { const v = ctx.inputs[spec.input]; ensure(v != null, 'Missing ' + spec.input); return v; }
  if (Object.hasOwn(spec, 'chain')) { const v = ctx.artifact.chain[spec.chain]; ensure(v, 'Unknown chain value'); return v; }
  if (Object.hasOwn(spec, 'ref')) { const v = ctx.addresses[spec.ref]; ensure(v, 'Unknown contract ' + spec.ref); return v; }
  if (Object.hasOwn(spec, 'const')) return typeof spec.const === 'string' && Object.hasOwn(ctx.artifact.salts, spec.const) ? ctx.artifact.salts[spec.const] : spec.const;
  throw new TypeError('Unknown plan value');
}
const initcode = (ctx, contract, types, args) => ctx.artifact.contracts[contract].bytecode + encode(types, args.map(a => resolve(a, ctx)));

/// Every transaction of the plan, with each created address predicted before anything is sent.
export function planTransactions(artifact, inputs) {
  ensure(artifact?.kind === 'qhooks-lab-deploy-build' && artifact.schemaVersion === 1, 'Not a Lab deploy build');
  const ctx = { artifact, inputs, addresses: {}, mined: {} }, txs = [];
  for (const step of artifact.plan) {
    if (step.kind === 'create2') {
      const code = initcode(ctx, step.contract, step.types, step.args), hash = keccak(code);
      let salt;
      if (step.salt.mine) { const m = mineSalt(DETERMINISTIC_DEPLOYER, hash, step.salt.mine.flags); salt = m.salt; ctx.mined[step.id] = m; }
      else salt = resolve(step.salt, ctx);
      const address = create2(DETERMINISTIC_DEPLOYER, salt, hash);
      ctx.addresses[step.id] = address;
      txs.push({ id: step.id, kind: 'create2', label: step.label, detail: step.detail, shared: !!step.shared, contract: step.contract, to: DETERMINISTIC_DEPLOYER, data: '0x' + strip(salt) + strip(code), salt, initcodeHash: hash, creates: address, deployer: DETERMINISTIC_DEPLOYER });
    } else if (step.kind === 'call') {
      const to = resolve(step.to, ctx), values = [];
      let created = null;
      for (const a of step.args) {
        if (a.mine) {
          const m = a.mine, deployer = resolve(m.deployer, ctx), code = initcode(ctx, m.contract, m.types, m.args), hash = keccak(code);
          const found = mineSalt(deployer, hash, m.flags); ctx.mined[step.id] = found;
          created = { address: found.address, contract: m.contract, deployer, salt: found.salt, initcodeHash: hash };
          values.push(found.salt);
        } else values.push(resolve(a, ctx));
      }
      if (step.creates) { ensure(created, 'Plan step creates nothing'); ctx.addresses[step.creates] = created.address; }
      txs.push({ id: step.id, kind: 'call', label: step.label, detail: step.detail, onlyOwner: !!step.onlyOwner, to, data: selector(step.signature) + encode(step.types, values),
        contract: created?.contract, creates: created?.address || null, deployer: created?.deployer, salt: created?.salt, initcodeHash: created?.initcodeHash });
    } else if (step.kind === 'initialize') {
      const k = step.key, key = { currency0: resolve(k.currency0, ctx), currency1: resolve(k.currency1, ctx), fee: Number(resolve(k.fee, ctx)), tickSpacing: Number(resolve(k.tickSpacing, ctx)), hooks: resolve(k.hooks, ctx) };
      ensure(inputs.sqrtPriceX96 != null, 'Set a starting price');
      const keyWords = encode(['address', 'address', 'uint24', 'int24', 'address'], [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]);
      txs.push({ id: step.id, kind: 'initialize', label: step.label, detail: step.detail, to: artifact.chain.poolManager, key, poolId: keccak('0x' + keyWords), sqrtPriceX96: String(inputs.sqrtPriceX96),
        data: selector('initialize((address,address,uint24,int24,address),uint160)') + keyWords + word('uint160', inputs.sqrtPriceX96) });
    } else throw new TypeError('Unknown plan step ' + step.kind);
  }
  return { txs, addresses: ctx.addresses, mined: ctx.mined };
}

/// The on-chain checks a template declares (getter reads against expected values), as eth_call requests.
export function plannedChecks(artifact, inputs, addresses) {
  const ctx = { artifact, inputs, addresses };
  return artifact.checks.map(c => ({ contract: c.contract, read: c.read, to: addresses[c.contract], data: selector(c.read), expected: resolve(c.expect, ctx) }));
}
/// True when a 32-byte return word equals the expected address / bytes32 / number.
export function wordMatches(ret, expected) {
  const r = strip(ret).slice(0, 64); if (r.length !== 64) return false;
  const e = typeof expected === 'string' && expected.startsWith('0x') ? strip(expected).padStart(64, '0') : BigInt(expected).toString(16).padStart(64, '0');
  return r === e;
}

/// Byte-for-byte comparison of deployed runtime code with the build's runtime. Immutable slots (positions the
/// compiler reported) are the only bytes allowed to differ; their values are returned for display. A CREATE2
/// address already commits to the exact initcode and constructor arguments that wrote them.
export function compareRuntime(onchain, compiled, immutables = []) {
  const a = toBytes(onchain), b = toBytes(compiled.deployedBytecode);
  if (a.length !== b.length) return { ok: false, reason: `Code length ${a.length} bytes, build has ${b.length}`, bytes: a.length };
  const skip = new Uint8Array(a.length);
  for (const ranges of compiled.immutables || immutables) for (const [start, length] of ranges) skip.fill(1, start, start + length);
  let differing = 0, first = -1;
  for (let i = 0; i < a.length; i++) if (!skip[i] && a[i] !== b[i]) { differing++; if (first < 0) first = i; }
  const values = (compiled.immutables || []).map(ranges => {
    const vals = ranges.map(([s, l]) => toHex(a.subarray(s, s + l)));
    return { value: vals[0], consistent: vals.every(v => v === vals[0]) };
  });
  const consistent = values.every(v => v.consistent);
  return { ok: differing === 0 && consistent, bytes: a.length, differing, firstDifference: first, immutables: values.map(v => v.value), reason: differing ? `${differing} bytes differ (first at ${first})` : consistent ? null : 'An immutable value differs between its copies' };
}

/// Recomputes the build hash the build service published, from the manifest itself.
export async function buildHash(artifact, subtle = globalThis.crypto.subtle) {
  const sha = async s => toHex(new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(s)))).slice(2);
  const contracts = {};
  for (const [k, c] of Object.entries(artifact.contracts)) contracts[k] = { name: c.name, bytecodeSha256: await sha(c.bytecode), deployedBytecodeSha256: await sha(c.deployedBytecode) };
  const identity = { kind: artifact.kind, template: artifact.template, chainId: artifact.chainId, configuration: artifact.configuration, sourceInputSha256: await sha(JSON.stringify(artifact.compilerInput)), plan: artifact.plan, checks: artifact.checks, contracts };
  return sha(JSON.stringify(identity));
}

/// sqrtPriceX96 for "1 token0 = price token1", with each token's decimals. Stays inside the v4 tick range.
export function sqrtPriceX96(priceText, decimals0, decimals1) {
  const s = String(priceText).trim(); ensure(/^\d*(\.\d{0,18})?$/.test(s) && s !== '' && s !== '.', 'Enter a starting price');
  const [i, f = ''] = s.split('.'), num = BigInt(i || '0') * 10n ** 18n + BigInt((f + '0'.repeat(18)).slice(0, 18) || '0');
  ensure(num > 0n, 'The starting price must be above zero');
  const ratioX192 = (num * 10n ** BigInt(decimals1) << 192n) / (10n ** 18n * 10n ** BigInt(decimals0));
  let x = ratioX192, y = (x + 1n) >> 1n; if (x > 1n) while (y < x) { x = y; y = (x + ratioX192 / x) >> 1n; }
  ensure(x >= 4295128739n && x < 1461446703485210103287273052203988822378723970342n, 'That price is outside what a Uniswap v4 pool can hold');
  return x;
}

/// The deployment manifest (kind qhooks-hook-deployment, schema 1): what the share page shows and re-checks and
/// what the Studio marketplace registers. Everything in it is public and re-derivable from the chain plus the build.
export function deploymentManifest({ artifact, hash, inputs, plan, receipts = {}, verification = null, deployer = null }) {
  const contracts = {};
  for (const t of plan.txs) if (t.creates) contracts[t.contract] = { address: t.creates, name: artifact.contracts[t.contract].name, deployer: t.deployer, salt: t.salt, initcodeHash: t.initcodeHash,
    runtimeKeccak: verification?.contracts?.[t.contract]?.runtimeKeccak || null, shared: t.shared || false };
  const pool = plan.txs.find(t => t.kind === 'initialize');
  return {
    schemaVersion: 1, kind: DEPLOYMENT_KIND, template: artifact.template, templateTitle: artifact.templateTitle, chainId: artifact.chainId, chainName: artifact.chain.name,
    projectName: artifact.configuration.projectName, buildHash: hash, sourceInputSha256: artifact.sourceInputSha256, configuration: artifact.configuration,
    hook: { address: plan.addresses.hook, flags: artifact.hook.flags, permissions: artifact.hook.permissions, contract: artifact.contracts.hook.name },
    owner: inputs.owner, publicKey: inputs.publicKey, profile: artifact.profile, poolManager: artifact.chain.poolManager, deployer,
    pool: pool ? { key: pool.key, poolId: pool.poolId, sqrtPriceX96: pool.sqrtPriceX96 } : null, contracts,
    transactions: plan.txs.map(t => ({ step: t.id, hash: receipts[t.id]?.hash || null, block: receipts[t.id]?.block || null, skipped: receipts[t.id]?.skipped || false })),
    verification: verification ? { ok: verification.ok, checkedAt: verification.checkedAt, block: verification.block } : null
  };
}

export const isZero = a => !a || strip(a) === strip(ZERO);
