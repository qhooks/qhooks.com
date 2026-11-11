import {keccakHex} from './qdrops-core.mjs';
import {selector, word as abiWord} from './lab-deploy-core.mjs';
const word = n => abiWord('uint256', n);
const addressWord = a => abiWord('address', a);

// One pool policy, shared by the page and the keeper.
export const ALLOWLIST = Object.freeze({chain: '4663', pool: '0x084a4faeaff8bf8105c72974b33a1aca37cdc4f29bcb27ea7c2512e1f1f12a6f', launch: '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc'});
export const FACTORY = '0xf34de594e8b3a3b9b1ecf1abbf0ac19b1e3e7418';
export const COPY = Object.freeze({intro: "Send this share of your pool's WETH fees into QHOOKS liquidity. The rest of the WETH and all of your token's fees keep coming to your wallet.", disclosure: 'You can turn this off any time. Changes to the percent take 48 hours. Nobody else can change it.', gate: "Only this token's creator can turn this on."});
export const SIGNATURES = Object.freeze({make: 'make(address,(address,address,uint24,int24,address),uint16)', predict: 'predict(address,(address,address,uint24,int24,address),address,uint16)', payout: 'setPayout(bytes32,address)', share: 'setShare(uint16)'});
export const MADE_TOPIC = keccakHex(new TextEncoder().encode('Made(address,bytes32,address,address,uint16)'));
export const MADE_FILTER = Object.freeze({address: FACTORY, topics: Object.freeze([MADE_TOPIC, '0x' + addressWord(ALLOWLIST.launch), ALLOWLIST.pool])});
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const uint = h => { if (!/^0x[0-9a-f]{64}$/i.test(h || '')) throw Error('Incomplete network read'); return BigInt(h); };
const addr = h => { if (uint(h) >= 2n ** 160n) throw Error('Incomplete address read'); return '0x' + h.slice(-40).toLowerCase(); };
const split = (h, length) => { if (!new RegExp(`^0x(?:[0-9a-f]{64}){${length}}$`, 'i').test(h || '')) throw Error('Incomplete network read'); return h.slice(2).match(/.{64}/g).map(w => '0x' + w); };
const codeExists = h => { if (!/^0x(?:[0-9a-f]{2})*$/i.test(h || '')) throw Error('Incomplete code read'); return h !== '0x'; };
const bpsWord = bps => { if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw Error('Choose a percent from 0 to 100'); return word(bps); };
export function allowedPool(search) {
  const p = new URLSearchParams(search).getAll('pool');
  return p.length === 1 && same(p[0], ALLOWLIST.pool);
}
export function decodeMade(log) {
  try {
    if (!same(log?.address, FACTORY) || log.removed || log.topics?.length !== 4 || !same(log.topics[0], MADE_TOPIC) || !same(log.topics[1], MADE_FILTER.topics[1]) || !same(log.topics[2], ALLOWLIST.pool)) return null;
    const [forwarder, bps] = split(log.data, 2), creator = addr(log.topics[3]);
    if (uint(bps) > 10000n || BigInt(creator) === 0n || uint(forwarder) === 0n) return null;
    return {forwarder: addr(forwarder), creator, bps: Number(uint(bps))};
  } catch { return null; }
}
export function encodeKey(key) {
  const k = Array.isArray(key) ? key : [key?.currency0, key?.currency1, key?.fee, key?.tickSpacing, key?.hooks];
  const [a, b, fee, spacing, hook] = k;
  if (k.length !== 5 || !Number.isInteger(fee) || fee < 0 || fee >= 2 ** 24 || !Number.isInteger(spacing) || spacing < -(2 ** 23) || spacing >= 2 ** 23) throw Error('Pool details did not match');
  return addressWord(a) + addressWord(b) + word(fee) + word(spacing < 0 ? 2n ** 256n + BigInt(spacing) : spacing) + addressWord(hook);
}
export function checkKey(key) {
  const encoded = encodeKey(key);
  const hash = keccakHex(Uint8Array.from(encoded.match(/../g), b => parseInt(b, 16)));
  if (!same(hash, ALLOWLIST.pool) || !same('0x' + encoded.slice(-40), ALLOWLIST.launch)) throw Error('Pool details did not match');
  return key;
}
export const makeData = (key, bps) => selector(SIGNATURES.make) + addressWord(ALLOWLIST.launch) + encodeKey(checkKey(key)) + bpsWord(bps);
export const predictData = (key, creator, bps) => selector(SIGNATURES.predict) + addressWord(ALLOWLIST.launch) + encodeKey(checkKey(key)) + addressWord(creator) + bpsWord(bps);
export const payoutData = recipient => selector(SIGNATURES.payout) + ALLOWLIST.pool.slice(2) + addressWord(recipient);
export const shareData = bps => selector(SIGNATURES.share) + bpsWord(bps);
// Factory CREATE2 plan, frozen from the supplied release reference (no server configuration).
export const DEPLOYMENT = {"deployer":"0x4e59b44847b379578588920cA78FbF26c0B4956C","initCodeHash":"0x92425f2cbd5d2f797de977053414cb63cba134b6f44194780d8adbca189403da","calldata":"0x487eafde2502fcbf0307747f47f72f29dfc6163f06662db5f260574c0113aec160c0346100ce57601f611ab138819003918201601f19168301916001600160401b038311848410176100d25780849260409485528339810103126100ce57610052602061004b836100e6565b92016100e6565b90813b1561009d5760805260a0526040516119b690816100fb823960805181818161014801528181610442015261053c015260a0518181816101700152818161035e015261046b0152f35b60405162461bcd60e51b8152602060048201526009602482015268145194ce8819195cdd60ba1b6044820152606490fd5b5f80fd5b634e487b7160e01b5f52604160045260245ffd5b51906001600160a01b03821682036100ce5756fe6080806040526004361015610012575f80fd5b5f3560e01c9081633fc8cef31461052a575080636b8c56bf1461038d57806384b366dc146103495763a4cb680514610048575f80fd5b3461024a5760e036600319011261024a576004356001600160a01b0381169081900361024a5760a036602319011261024a5760c4359061ffff821680920361024a57612710821161033a5760a061009e3661058d565b209160405163d4bf17c560e01b815283600482015261012081602481865afa9081156101ef575f9161024e575b5080516001600160a01b031615801561022c575b61021d5760e001516001600160a01b0316330361020e576101013384846106c9565b6040516112a58082019082821067ffffffffffffffff8311176101fa57610140918391610705833986815261013860208201610625565b3360c08201526001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000811660e08301527f00000000000000000000000000000000000000000000000000000000000000001661010082015261012081018690520301905ff59283156101ef5760209360018060a01b03169260405192848452858401527fa9b044934047321d1f2e95485b25b5448397873625c66f8d126daddf68f6290760403394a4604051908152f35b6040513d5f823e3d90fd5b634e487b7160e01b5f52604160045260245ffd5b6393687c0b60e01b5f5260045ffd5b63a3dffa5160e01b5f5260045ffd5b5060a4356001600160a01b0381169081900361024a578314156100df565b5f80fd5b9050610120813d8211610332575b8161026a610120938361056b565b8101031261024a5760405190610120820182811067ffffffffffffffff8211176101fa5760405261029a8161069a565b82526102a8602082016106ae565b60208301526102b9604082016106ae565b6040830152606081015162ffffff8116810361024a57610326916101009160608501526102e8608082016106bc565b60808501526102f960a082016106bc565b60a085015261030a60c0820161069a565b60c085015261031b60e0820161069a565b60e08501520161069a565b6101008201525f6100cb565b3d915061025c565b6311c56c8960e01b5f5260045ffd5b3461024a575f36600319011261024a576040517f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b3461024a5761010036600319011261024a576004356001600160a01b0381169081810361024a5760a036602319011261024a5760c4356001600160a01b0381169081810361024a5760e4359361ffff851680950361024a576020946104e3936104da60a06103fa3661058d565b2093886112a591604051956104118385018861056b565b8387528287019361070585396040519583870192835261043360408801610625565b60e08701526001600160a01b037f000000000000000000000000000000000000000000000000000000000000000081166101008801527f0000000000000000000000000000000000000000000000000000000000000000166101208701526101408087019190915285526104a96101608661056b565b60405194859383850197518091895e840190838201905f8252519283915e01015f815203601f19810183528261056b565b519020936106c9565b604051918383019160ff60f81b83523060601b6021850152603584015260558301526055825261051460758361056b565b905190206040516001600160a01b039091168152f35b3461024a575f36600319011261024a577f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b90601f8019910116810190811067ffffffffffffffff8211176101fa57604052565b60a090602319011261024a576040519060a0820182811067ffffffffffffffff8211176101fa57604052816024356001600160a01b038116810361024a5781526044356001600160a01b038116810361024a57602082015260643562ffffff8116810361024a5760408201526084358060020b810361024a57606082015260a435906001600160a01b038216820361024a5760800152565b6024356001600160a01b0381169081900361024a5781526044356001600160a01b0381169081900361024a57602082015260643562ffffff811680910361024a5760408201526084358060020b80910361024a57606082015260a4356001600160a01b038116919082900361024a5760800152565b51906001600160a01b038216820361024a57565b51908160020b820361024a57565b5190811515820361024a57565b604080516001600160a01b039283166020820190815291810193909352921660608083019190915281526106fe60808261056b565b5190209056fe61016080604052346103a557806112a5803803809161001e82856103bc565b833981010361014081126103a5578151906001600160a01b038216908183036103a55760a090601f1901126103a5576040519160a083016001600160401b0381118482101761039157604052610076602085016103df565b8352610084604085016103df565b9360208401948552610098606082016103f3565b604085019081526100ab60808301610403565b6060860190815260a083015192906001600160a01b03841684036103a557608087019384526100dc60c083016103df565b936100e960e084016103df565b916101206100fa61010086016103df565b9401519461ffff86168096036103a5576101209760805260018060a01b038a511660018060a01b03195f5416175f5560018060a01b038b511660018060a01b031960015416176001555190600154905160b81b62ffffff60b81b169162ffffff60a01b9060a01b169065ffffffffffff60a01b1916171760015560018060a01b0390511660018060a01b0319600254161760025560a08720938460a05260c05260e0526101005261ffff19600354161760035560246040518094819363d4bf17c560e01b835260048301525afa80156103b1575f906102b5575b80516001600160a01b031661012052608001511590506102a45750516001600160a01b03165b6001600160a01b031661014052604051610e86908161041f823960805181818161013d01528181610acc0152610c7f015260a0518181816109990152610a9f015260c05181818161031c0152818161044b015281816107d801528181610c3e0152610d7d015260e0518181816102040152610953015261010051818181610542015261078701526101205181818160f4015261025601526101405181818161028001526106f90152f35b516001600160a01b031690506101fa565b50610120813d82116103a9575b816102d061012093836103bc565b810103126103a5576040516101208101916001600160401b038311828410176103915761010061038691608094604052610309816103df565b845261031760208201610403565b602085015261032860408201610403565b6040850152610339606082016103f3565b6060850152610349858201610411565b8585015261035960a08201610411565b60a085015261036a60c082016103df565b60c085015261037b60e082016103df565b60e0850152016103df565b6101008201526101d4565b634e487b7160e01b5f52604160045260245ffd5b5f80fd5b3d91506102c2565b6040513d5f823e3d90fd5b601f909101601f19168101906001600160401b0382119082101761039157604052565b51906001600160a01b03821682036103a557565b519062ffffff821682036103a557565b51908160020b82036103a557565b519081151582036103a55756fe608080604052600436101561001c575b50361561001a575f80fd5b005b5f905f3560e01c90816301339c2114610c6d5750806302d05d3f14610c2957806302fb0c5e14610a80578063182148ef146109bc5780633e0dc34e146109825780633fc8cef31461093e5780634c3b3a3c146109215780635d50903e146108fd5780636017779e146108e057806369b41170146108c35780636d0c8d7c146107b657806384b366dc14610772578063930667d81461074957806397aabf6914610728578063999b93af146106e4578063c0406226146101265763fc0c546a0361000f57346101235780600319360112610123576040517f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b80fd5b5034610669575f366003190112610669575f9081907f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316803b156106695760405163839197e360e01b81525f80546001600160a01b039081166004840152600154808216602485015260a081901c62ffffff16604485015260b81c600290810b6064850152541660848301529091829060a490829084905af16106d1575b5060035467ffffffffffffffff8160201c1680151590816106c6575b50610675575b506040516370a0823160e01b81523060048201527f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03169390602081602481885afa90811561051657839161063f575b50801580156103e0575b505061027a7f0000000000000000000000000000000000000000000000000000000000000000610d28565b919384907f0000000000000000000000000000000000000000000000000000000000000000906001600160a01b038216036103ce575b5047610308575b507f493ae8affdadf8bca526bb93601a9be01655081df8a914b104edcfac7ca98f9960806060956040519086825284602083015285604083015287820152a160405192835260208301526040820152f35b93610314904790610d1b565b9380808080477f00000000000000000000000000000000000000000000000000000000000000005af1903d156103c8573d9067ffffffffffffffff82116103b4576040519161036d601f8201601f191660200184610cca565b825260203d92013e5b15610381575f6102b7565b60405162461bcd60e51b815260206004820152600b60248201526a5146533a206e617469766560a81b6044820152606490fd5b634e487b7160e01b81526041600452602490fd5b50610376565b6103d9919550610d28565b935f6102b0565b9150925061ffff60035416908184029184830414171561062b576127109004918281038181116106175783819281610521575b0361041f575b8061024f565b60208161043161048493600554610d1b565b60055560405163a9059cbb60e01b81526001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000166004820152602481019190915291829081906044820190565b038186895af19081156105165783916104d8575b50156104a4575f610419565b60405162461bcd60e51b815260206004820152600c60248201526b28a3299d1031b932b0ba37b960a11b6044820152606490fd5b90506020813d60201161050e575b816104f360209383610cca565b8101031261050a5761050490610d0e565b5f610498565b8280fd5b3d91506104e6565b6040513d85823e3d90fd5b9061052e90600454610d1b565b600490815560405163a9059cbb60e01b81527f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03169181019190915260248101869052602081604481888b5af190811561060c5785916105ce575b501561059d578490610413565b60405162461bcd60e51b8152602060048201526009602482015268145194ce8819195cdd60ba1b6044820152606490fd5b90506020813d602011610604575b816105e960209383610cca565b81010312610600576105fa90610d0e565b5f610590565b8480fd5b3d91506105dc565b6040513d87823e3d90fd5b634e487b7160e01b83526011600452602483fd5b634e487b7160e01b82526011600452602482fd5b90506020813d60201161066d575b8161065a60209383610cca565b8101031261066957515f610245565b5f80fd5b3d915061064d565b60208161ffff7f803d9f94a71ff961b8d1ebd5b9196957937d04fd504fb1257d25a0972b4ece609360101c16806bffffffffffffffff0000ffff19831617600355846040519216178152a15f6101ee565b90504210155f6101e8565b6106dd91505f90610cca565b5f806101cc565b34610669575f366003190112610669576040517f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b34610669575f36600319011261066957602061ffff60035416604051908152f35b34610669575f36600319011261066957602067ffffffffffffffff600354821c16604051908152f35b34610669575f366003190112610669576040517f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b346106695760203660031901126106695760043561ffff8116808203610669577f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031633036108b45761271081116108a557600354906202a3004201804211610891577fdb20c095baa2f67a7535f2874026626d8934858e10eef8b6d9f696816c4cf89d9360409363ffff00006bffffffffffffffff0000000067ffffffffffffffff9460201b169260101b16906bffffffffffffffffffff00001916171780600355835192835260201c166020820152a1005b634e487b7160e01b5f52601160045260245ffd5b6311c56c8960e01b5f5260045ffd5b6393687c0b60e01b5f5260045ffd5b34610669575f3660031901126106695760206040516202a3008152f35b34610669575f366003190112610669576020600454604051908152f35b34610669575f36600319011261066957602061ffff60035460101c16604051908152f35b34610669575f366003190112610669576020600554604051908152f35b34610669575f366003190112610669576040517f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b34610669575f3660031901126106695760206040517f00000000000000000000000000000000000000000000000000000000000000008152f35b34610669575f366003190112610669575f60806040516109db81610cae565b828152826020820152826040820152826060820152015260a0604051610a0081610cae565b600180831b035f54169081815260015462ffffff60208301600180871b038316815260408401908284881c168252606085019360b81c60020b84526080600180891b03600254169501948552604051958652600180881b039051166020860152511660408401525160020b6060830152600180841b039051166080820152f35b34610669575f3660031901126106695760405163d4bf17c560e01b81527f00000000000000000000000000000000000000000000000000000000000000006004820152610120816024817f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03165afa8015610c1e575f90610b1e575b60209061010060018060a01b03910151166040519030148152f35b50610120813d8211610c16575b81610b396101209383610cca565b8101031261066957604051610120810181811067ffffffffffffffff821117610c0257604052610b6882610cec565b8152610b7660208301610d00565b6020820152610b8760408301610d00565b604082015260608201519162ffffff8316830361066957610100610bf7916020946060850152610bb960808201610d0e565b6080850152610bca60a08201610d0e565b60a0850152610bdb60c08201610cec565b60c0850152610bec60e08201610cec565b60e085015201610cec565b610100820152610b03565b634e487b7160e01b5f52604160045260245ffd5b3d9150610b2b565b6040513d5f823e3d90fd5b34610669575f366003190112610669576040517f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b34610669575f366003190112610669577f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b60a0810190811067ffffffffffffffff821117610c0257604052565b90601f8019910116810190811067ffffffffffffffff821117610c0257604052565b51906001600160a01b038216820361066957565b51908160020b820361066957565b5190811515820361066957565b9190820180921161089157565b6001600160a01b0316908115610e74576040516370a0823160e01b8152306004820152602081602481865afa908115610c1e575f91610e42575b50809281610d6e575050565b60405163a9059cbb60e01b81527f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031660048201526024810192909252602090829060449082905f905af1908115610c1e575f91610e08575b5015610dd657565b60405162461bcd60e51b815260206004820152600a60248201526905146533a2073776565760b41b6044820152606490fd5b90506020813d602011610e3a575b81610e2360209383610cca565b8101031261066957610e3490610d0e565b5f610dce565b3d9150610e16565b90506020813d602011610e6c575b81610e5d60209383610cca565b8101031261066957515f610d62565b3d9150610e50565b5f915056fea164736f6c634300081a000aa164736f6c634300081a000a0000000000000000000000000bd7d308f8e1639fab988df18a8011f41eacad730000000000000000000000002e4fbb8e6341faab7b2c9d4e1734b4ef74d31bf9"};
export function verifyFactoryPlan() {
  const p = DEPLOYMENT, bytes = h => Uint8Array.from(h.match(/../g) || [], b => parseInt(b, 16));
  const codeHash = keccakHex(bytes(p.calldata.slice(66)));
  const predicted = '0x' + keccakHex(bytes('ff' + p.deployer.slice(2) + p.calldata.slice(2, 66) + codeHash.slice(2))).slice(-40);
  if (!same(predicted, FACTORY) || !same(codeHash, p.initCodeHash)) throw Error('Setup details did not match');
  return {to: p.deployer, data: p.calldata, value: '0x0'};
}
export async function readFeeShare({search, owner, bps = 5000, io}) {
  if (!allowedPool(search)) return {allowed: false};
  const block = await io.rpc('eth_getBlockByNumber', ['latest', false]);
  if (!/^0x[0-9a-f]+$/i.test(block?.number || '')) throw Error('Incomplete network read');
  const call = (to, data) => io.rpc('eth_call', [{to, data}, block.number]);
  const p = split(await call(ALLOWLIST.launch, selector('launchOf(bytes32)') + ALLOWLIST.pool.slice(2)), 9);
  const token = addr(p[0]), creator = addr(p[7]), payout = addr(p[8]);
  if (BigInt(token) === 0n || BigInt(creator) === 0n) throw Error('Pool details did not match');
  const base = {allowed: true, creator, payout, token, creatorConnected: same(owner, creator)};
  if (!base.creatorConnected) return base;
  const factoryReady = codeExists(await io.rpc('eth_getCode', [FACTORY, block.number]));
  if (!factoryReady) return {...base, factoryReady};
  const market = await io.fetchJson('/api/markets/4663/' + token);
  const pools = market?.meta?.pools || market?.pools || [];
  const pool = pools.find(p => same(p.id || p.poolId, ALLOWLIST.pool));
  const key = checkKey(pool?.key);
  const predicted = addr(await call(FACTORY, predictData(key, creator, bps)));
  if (BigInt(predicted) === 0n) throw Error('Pool details did not match');
  let forwarder = predicted;
  // Restore the active forwarder even after its initial percent has changed or a page reload.
  if (!same(payout, creator) && !same(payout, predicted)) {
    const head = BigInt(block.number); let found = false;
    for (let end = head; end >= 0n; end -= 10000000n) {
      const start = end >= 9999999n ? end - 9999999n : 0n;
      const logs = await io.rpc('eth_getLogs', [{...MADE_FILTER, fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16)}]);
      if (!Array.isArray(logs)) throw Error('Incomplete network read');
      if (logs.some(l => { const m = decodeMade(l); return m && same(m.creator, creator) && same(m.forwarder, payout); })) { forwarder = payout; found = true; break; }
    }
    if (!found) throw Error('The pool payout points to another address. Review it before continuing.');
  }
  const made = codeExists(await io.rpc('eth_getCode', [forwarder, block.number]));
  const state = {...base, factoryReady, key, predicted, forwarder, made};
  if (!made) return state;
  const names = ['shareBps', 'pendingBps', 'pendingAt', 'totalToLiquidity', 'totalWethToCreator', 'active'];
  const values = await Promise.all(names.map(n => call(forwarder, selector(n + '()')).then(uint)));
  if (values[0] > 10000n || values[1] > 10000n || values[5] > 1n || (values[5] === 1n) !== same(payout, forwarder)) throw Error('Incomplete network read');
  return {...state, readout: Object.fromEntries(names.map((n, i) => [n, values[i]])), active: values[5] === 1n};
}
export function actions(state, owner) {
  if (!state?.allowed || !same(owner, state.creator) || !state.creatorConnected) return [];
  if (!state.factoryReady) return ['deploy'];
  if (state.active) return ['change', 'off'];
  return state.made ? ['on'] : ['make'];
}
export function transactionFor(action, state, owner, bps) {
  if (!actions(state, owner).includes(action)) throw Error(COPY.gate);
  const tx = action === 'deploy' ? verifyFactoryPlan() : action === 'make' ? {to: FACTORY, data: makeData(state.key, bps)} : action === 'change' ? {to: state.forwarder, data: shareData(bps)} : {to: ALLOWLIST.launch, data: payoutData(action === 'off' ? state.creator : state.forwarder)};
  return {from: owner, value: '0x0', ...tx};
}
const amount = n => { n = BigInt(n); const f = (n % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, ''); return `${n / 10n ** 18n}${f ? '.' + f : ''} WETH`; };
const percent = n => `${Number(n) / 100}%`;
export function readoutLines(state) {
  const r = state?.readout;
  if (!r) return ['Refreshing'];
  return [`Share: ${percent(r.shareBps)}`, r.pendingAt > 0n ? `Pending change: ${percent(r.pendingBps)} · ${new Date(Number(r.pendingAt) * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}` : 'No pending change', `Total to liquidity: ${amount(r.totalToLiquidity)}`, `Total WETH to creator: ${amount(r.totalWethToCreator)}`, `Active: ${state.active ? 'Yes' : 'No'}`];
}
export function mountFeeShare({document: doc, search, hub, io, pollMs = 30000, sleep = ms => new Promise(r => setTimeout(r, ms))}) {
  const root = doc.getElementById('qfs-root');
  if (!allowedPool(search)) { doc.body.replaceChildren('Not available'); return {ready: Promise.resolve(), dispose() {}}; }
  let state, bps = 5000, reading = false, busy = false, stopped = false, message = '', revision = 0, focusKey;
  const el = (tag, attrs = {}, ...kids) => { const n = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) n.setAttribute(k, v === true ? '' : String(v)); n.append(...kids.flat().filter(k => k != null)); return n; };
  const button = (text, fn, focus = text) => { const b = el('button', {type: 'button', disabled: reading || busy, 'data-focus': focus}, text); b.addEventListener('click', fn); return b; };
  function render() {
    if (stopped) return;
    focusKey = doc.activeElement?.getAttribute?.('data-focus') || focusKey;
    root.setAttribute('aria-busy', String(reading || busy));
    const owner = hub.snapshot().current?.owner;
    const header = [el('p', {class: 'qfs-kicker'}, 'QWERTY · Robinhood Chain'), el('h1', {}, 'A share for liquidity'), el('p', {class: 'qfs-intro'}, COPY.intro)];
    const content = [];
    if (!owner) content.push(el('p', {}, 'Connect your creator wallet to continue.'), button('Connect wallet', () => hub.open()));
    else if (state && (!same(owner, state.creator) || !state.creatorConnected)) content.push(el('p', {role: 'status'}, COPY.gate), button('Choose wallet', () => hub.open()));
    else if (!state) content.push(el('p', {role: 'status'}, 'Refreshing'));
    else {
      const slider = el('input', {type: 'range', id: 'qfs-percent', min: 0, max: 100, step: 1, value: bps / 100, 'data-focus': 'percent'});
      const output = el('output', {for: 'qfs-percent', id: 'qfs-chosen'}, percent(bps));
      slider.addEventListener('input', () => { bps = Number(slider.value) * 100; output.textContent = percent(bps); });
      slider.addEventListener('change', refresh);
      if (reading || busy) slider.disabled = true;
      content.push(el('div', {class: 'qfs-picker'}, el('label', {for: 'qfs-percent'}, 'Share of WETH fees'), output, slider, el('div', {class: 'qfs-range-ends', 'aria-hidden': 'true'}, el('span', {}, '0%'), el('span', {}, '100%'))));
      const steps = actions(state, owner);
      if (steps.includes('deploy')) content.push(el('section', {class: 'qfs-step', 'data-step': 'deploy'}, el('p', {class: 'qfs-kicker'}, 'Step 0'), el('h2', {}, 'Set up the factory'), el('p', {}, 'One network transaction, once. Your wallet shows the network gas.'), button('Set up factory', () => send('deploy'))));
      else if (!state.active) {
        content.push(el('section', {class: 'qfs-step'}, el('p', {class: 'qfs-kicker'}, 'Tap 1'), el('h2', {}, 'Create your fee share'), el('p', {}, state.made ? 'Fee share created.' : 'Your wallet shows the network gas.'), ...(steps.includes('make') ? [button('Create fee share', () => send('make'))] : [])));
        content.push(el('section', {class: 'qfs-step'}, el('p', {class: 'qfs-kicker'}, 'Tap 2'), el('h2', {}, 'Turn on fee sharing'), el('p', {}, 'Point your pool payout to your fee share.'), ...(steps.includes('on') ? [button('Turn on', () => send('on'))] : [])));
      }
      if (state.readout) content.push(el('section', {class: 'qfs-readout', 'aria-label': 'Fee share status'}, el('h2', {}, 'Your fee share'), ...readoutLines(state).map(t => el('p', {}, t))));
      if (state.active) content.push(el('div', {class: 'qfs-actions'}, button('Change %', () => send('change')), button('Turn off', () => send('off'))));
    }
    root.replaceChildren(...header, ...content, el('p', {class: 'qfs-disclosure'}, COPY.disclosure), el('p', {role: 'status', 'aria-live': 'polite', class: 'qfs-message'}, reading ? 'Refreshing' : message), button('Refresh status', refresh));
    if (focusKey && !busy && !reading) root.querySelector?.(`[data-focus="${focusKey}"]`)?.focus();
  }
  async function refresh() {
    if (reading || busy || stopped) return;
    const ticket = revision, owner = hub.snapshot().current?.owner;
    reading = true; render(); io.begin?.();
    try { const next = await readFeeShare({search, owner, bps, io}); if (ticket === revision) state = next; }
    catch { state = null; message = 'Could not read the network. Refresh to try again.'; }
    finally { reading = false; render(); }
    if (ticket !== revision && !stopped) return refresh();
  }
  async function send(action) {
    if (reading || busy || !state || stopped) return;
    let conn = hub.snapshot().current; if (!conn) { hub.open(); return; }
    const owner = conn.owner, before = state, selected = bps;
    busy = true; message = 'Refreshing'; render();
    try {
      if (String(conn.chainId) !== ALLOWLIST.chain) conn = await hub.switchChain(ALLOWLIST.chain);
      if (!same(conn?.owner, owner) || String(conn?.chainId) !== ALLOWLIST.chain) throw Error('Wallet changed');
      io.begin?.(); state = await readFeeShare({search, owner, bps: selected, io});
      if (['on', 'change', 'off'].includes(action) && (!same(state.forwarder, before.forwarder) || !same(state.payout, before.payout))) throw Error('Pool changed');
      const tx = transactionFor(action, state, owner, selected);
      io.begin?.(); await io.rpc('eth_call', [tx, 'latest']);
      const gas = BigInt(await io.rpc('eth_estimateGas', [tx])); if (gas <= 0n) throw Error('Incomplete gas estimate');
      tx.gas = '0x' + (gas * 13n / 10n).toString(16);
      if (!same(hub.snapshot().current?.owner, owner) || String(hub.snapshot().current?.chainId) !== ALLOWLIST.chain) throw Error('Wallet changed');
      message = 'Confirm in your wallet'; render();
      const hash = await conn.entry.provider.request({method: 'eth_sendTransaction', params: [tx]});
      message = 'Refreshing'; render(); let receipt;
      for (let i = 0; i < 90 && !receipt && !stopped; i++) { io.begin?.(); receipt = await io.rpc('eth_getTransactionReceipt', [hash]); if (!receipt) await sleep(2000); }
      if (!receipt) message = 'Still pending. Check your wallet activity, then refresh.';
      else message = BigInt(receipt.status) === 1n ? 'Transaction confirmed.' : 'The transaction did not complete. Check your wallet activity.';
    } catch (e) { message = /reject|denied|cancel/i.test(e?.message || '') ? 'Cancelled in your wallet' : 'Could not complete this step. Refresh and try again.'; }
    finally { busy = false; await refresh(); }
  }
  const ready = refresh();
  const unsubscribe = hub.subscribe(() => { revision++; state = null; render(); refresh(); });
  const timer = pollMs ? setInterval(() => { if (doc.visibilityState !== 'hidden') refresh(); }, pollMs) : null;
  return {ready, refresh, send, getState: () => state, dispose() { stopped = true; if (timer) clearInterval(timer); unsubscribe?.(); }};
}
// The site's read client batches normal reads through /api/rpc/4663. Extra reads use that same relay.
export function createFeeShareIO(client) {
  return {...client, rpc: async (method, params) => {
    if (!['eth_estimateGas', 'eth_getLogs'].includes(method)) return client.rpc(ALLOWLIST.chain, method, params);
    const r = await client.request('/api/rpc/4663', {method: 'POST', headers: {'content-type': 'application/json', 'x-qhooks-read-purpose': 'transaction'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
    if (!r.ok) throw Error('Could not read the network');
    const answer = await r.json(); if (answer.error || !Object.hasOwn(answer, 'result')) throw Error('Could not read the network');
    return answer.result;
  }};
}
