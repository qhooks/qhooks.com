// QHooks chain registry: the one place a launch chain is described.
// Plain data + tiny helpers, no imports, no network. Browser pages, the worker bundle, Node tests and the
// fork harness all import this file. scripts/chain-coverage.mjs fails when any chain list in the site, worker
// or harness disagrees with it, so adding a chain = add a row here, run the check, fix what it names.
//
// status
//   live     shown everywhere.
//   hidden   fully built, only shown when the hidden-chain flag is on (?chains=all once, remembered in
//            localStorage 'qhooks:chains'; ?chains=public turns it off). The worker indexes it; the public
//            API and public copy leave it out. Arc sits here until a launch there is proven.
//   testnet  like hidden, and never switched to live: a test network for fork/testnet proofs.
//   planned  facts only, nothing built; no surface may list it.
// Switching a chain on = change its status to 'live', run `node scripts/chain-coverage.mjs --fix-static`
// (rewrites the static chain copy on /launch / / / pricing.json) and deploy.
//
// family   'arc' = native coin is also an ERC-20 sharing one balance (Arc USDC at 0x3600…): the Arc launch
//          workspace and shared-balance accounting apply. Every other family is ordinary native gas.
// contracts.extended  this Universal Router's single-pool swap takes one extra word (RH/Arc deployments).
// launchFeeWei  what QLaunchBlocks charges on this chain id (it is in the contract: chain 56 → 7e14,
//          5042 → 5e17, every other chain → 2e14). Changing it needs a new blocks toolkit generation.
// router   QFeeRouter._manager() knows this chain (terminal 1% trades, cashback, referrals). Without it the
//          router refuses every swap there; adding it needs a new extras generation (new CREATE2 address).
// lab      the Lab build service (qhooks-marketplace/scripts/l210-lab-deploy.mjs CHAINS, on the build server)
//          builds deploy plans for this chain. Turning it on = add the chain there, re-pin, update the service.

const rows = [
  {
    id: '8453', hex: '0x2105', key: 'base', name: 'Base', short: 'Base', icon: 'base', status: 'live', family: 'op-stack',
    feeModel: 'op-stack', feeAccounting: 'separate-data-and-operator-fees', feeCapWei: null, gasFloorWei: null,
    native: 'ETH', rpc: 'https://mainnet.base.org', logsRpc: 'https://base-rpc.publicnode.com', logStep: 4000, blockTime: 2,
    explorer: 'https://basescan.org',
    contracts: { manager: '0x498581ff718922c3f8e6a244956af099b2652b2b', stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71', quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d', router: '0x6ff5693b99212da76ad316178a184ab56d299b43', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6, wrapNative: false },
    wrappedNative: '0x4200000000000000000000000000000000000006', usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    launchFee: '0.0002', launchFeeWei: '200000000000000', router: true, lab: true,
    data: { gecko: 'base', dex: 'base', alchemy: 'base-mainnet', zeroEx: true }
  },
  {
    simpleLaunch: '0x023623568f41c032ec2f4bba368dbafc123160cc', simpleLaunchFrom: 108170556,
    id: '4663', hex: '0x1237', key: 'robinhood', name: 'Robinhood Chain', short: 'Robinhood', icon: 'robinhood', status: 'live', family: 'nitro',
    feeModel: 'nitro', feeAccounting: 'data-fee-in-estimate-gas', feeCapWei: '10000000000', gasFloorWei: null,
    native: 'ETH', rpc: 'https://rpc.mainnet.chain.robinhood.com', logsRpc: 'https://rpc.mainnet.chain.robinhood.com', logStep: 25000, blockTime: 0.1,
    explorer: 'https://robinhoodchain.blockscout.com',
    contracts: { manager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b', quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94', router: '0x06afba43fd06227fa663b0daecf536f6eaa6bf99', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: true },
    quote: { address: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', symbol: 'WETH', decimals: 18, wrapNative: true },
    wrappedNative: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', usdc: null,
    launchFee: '0.0002', launchFeeWei: '200000000000000', router: true, lab: true,
    data: { gecko: 'robinhood', dex: 'robinhood', alchemy: 'robinhood-mainnet', zeroEx: true }
  },
  {
    id: '1', hex: '0x1', key: 'ethereum', name: 'Ethereum', short: 'Ethereum', icon: 'ethereum', status: 'live', family: 'ethereum',
    feeModel: 'ethereum', feeAccounting: 'execution-only', feeCapWei: '1000000000000', gasFloorWei: null,
    native: 'ETH', rpc: 'https://ethereum-rpc.publicnode.com', logsRpc: 'https://ethereum-rpc.publicnode.com', logStep: 2000, blockTime: 12,
    explorer: 'https://etherscan.io',
    contracts: { manager: '0x000000000004444c5dc75cb358380d2e3de08a90', stateView: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227', quoter: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203', router: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', decimals: 6, wrapNative: false },
    wrappedNative: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    launchFee: '0.0002', launchFeeWei: '200000000000000', router: true, lab: true,
    data: { gecko: 'eth', dex: 'ethereum', alchemy: 'eth-mainnet', zeroEx: true }
  },
  {
    id: '42161', hex: '0xa4b1', key: 'arbitrum', name: 'Arbitrum One', short: 'Arbitrum', icon: 'arbitrum', status: 'live', family: 'nitro',
    feeModel: 'nitro', feeAccounting: 'data-fee-in-estimate-gas', feeCapWei: '10000000000', gasFloorWei: null,
    native: 'ETH', rpc: 'https://arb1.arbitrum.io/rpc', logsRpc: 'https://arb1.arbitrum.io/rpc', logStep: 25000, blockTime: 0.25,
    explorer: 'https://arbiscan.io',
    contracts: { manager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32', stateView: '0x76fd297e2d437cd7f76d50f01afe6160f86e9990', quoter: '0x3972c00f7ed4885e145823eb7c655375d275a1c5', router: '0x96b2fd2f80e9428daa65d859653117d453981ab4', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', decimals: 6, wrapNative: false },
    wrappedNative: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    launchFee: '0.0002', launchFeeWei: '200000000000000', router: true, lab: true,
    data: { gecko: 'arbitrum', dex: 'arbitrum', alchemy: 'arb-mainnet', zeroEx: true }
  },
  {
    id: '56', hex: '0x38', key: 'bnb', name: 'BNB Chain', short: 'BNB', icon: 'bnb', status: 'live', family: 'bsc',
    feeModel: 'bsc', feeAccounting: 'bsc-execution', feeCapWei: '10000000000', gasFloorWei: null,
    native: 'BNB', rpc: 'https://bsc-dataseed.bnbchain.org', logsRpc: 'https://bsc-rpc.publicnode.com', logStep: 5000, blockTime: 0.45,
    explorer: 'https://bscscan.com',
    contracts: { manager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df', stateView: '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4', quoter: '0x9f75dd27d6664c475b90e105573e550ff69437b0', router: '0x91bf3bfaef8d771a74e1a8fe460b3ee646b2e588', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', symbol: 'WBNB', decimals: 18, wrapNative: true },
    wrappedNative: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', usdc: null,
    launchFee: '0.0007', launchFeeWei: '700000000000000', router: true, lab: true,
    data: { gecko: 'bsc', dex: 'bsc', alchemy: 'bnb-mainnet', zeroEx: true }
  },
  {
    // Contracts support Arc (fee router manager, 0.5 USDC launch fee). Hidden until a launch there is proven
    // (Randall, 2026-11-03). Proof path: Circle's arc-anvil fork (precompile-faithful); see CHAINS.md.
    id: '5042', hex: '0x13b2', key: 'arc', name: 'Arc', short: 'Arc', icon: 'arc', status: 'hidden', family: 'arc',
    feeModel: 'arc-stablecoin', feeAccounting: 'execution-only-native-usdc', feeCapWei: '20000000000000', gasFloorWei: '20000000000',
    native: 'USDC', rpc: 'https://rpc.mainnet.arc.io', logsRpc: 'https://rpc.mainnet.arc.io', logStep: 5000, blockTime: 0.5,
    explorer: 'https://explorer.arc.io',
    contracts: { manager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b', quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94', router: '0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: true },
    quote: { address: '0x3600000000000000000000000000000000000000', symbol: 'USDC', decimals: 6, wrapNative: false },
    wrappedNative: null, usdc: '0x3600000000000000000000000000000000000000',
    launchFee: '0.5', launchFeeWei: '500000000000000000', router: true, lab: false,
    data: { gecko: 'arc', dex: 'arc', alchemy: null, zeroEx: true }
  },
  {
    // Kinetiq's Elysium testnet (Arbitrum Orbit/Nitro, HYPE gas). Uniswap v4 is not deployed there yet: the fork
    // harness places Robinhood Chain's v4 runtime at the same addresses (fork.sh elysium-testnet), so this profile
    // resolves on that fork only. The mainnet row below takes over once Uniswap deploys v4 on Elysium mainnet.
    // Contracts: QLaunchBlocks charges the default 2e14 wei (0.0002 HYPE) and QFeeRouter has no manager here.
    id: '99801', hex: '0x185d9', key: 'elysium-testnet', name: 'Elysium Testnet', short: 'Elysium', icon: 'elysium', status: 'testnet', family: 'nitro',
    feeModel: 'nitro', feeAccounting: 'data-fee-in-estimate-gas', feeCapWei: '10000000000', gasFloorWei: null,
    native: 'HYPE', rpc: 'https://testnet-rpc.elysium.kinetiq.xyz', logsRpc: 'https://testnet-rpc.elysium.kinetiq.xyz', logStep: 25000, blockTime: 0.13,
    explorer: 'https://explorer-elysium-testnet.t.conduit.xyz',
    contracts: { manager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b', quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94', router: '0x06afba43fd06227fa663b0daecf536f6eaa6bf99', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: true },
    quote: { address: '0xcd57f65c2b0e5881cfc2e609f7cd53b746e1f234', symbol: 'WHYPE', decimals: 18, wrapNative: true },
    wrappedNative: '0xcd57f65c2b0e5881cfc2e609f7cd53b746e1f234', usdc: '0x7d29d8047b905000459c0e80c34a26ceedcb47b2',
    launchFee: '0.0002', launchFeeWei: '200000000000000', router: false, lab: false,
    data: { gecko: null, dex: null, alchemy: null, zeroEx: false }
  },
  {
    // Financial routes stay planned. Read-only chain99901 venue/generation observations are in
    // qx-elysium-registry.mjs; no single manager/wrapped asset is valid for every venue.
    // Exact dependencies, HYPE fees, fee recipient, native funding and recovery must pass before
    // this becomes selectable (including hidden mode). See lead/elysium/README.md for the gaps.
    id: null, hex: null, key: 'elysium', name: 'Elysium', short: 'Elysium', icon: 'elysium', status: 'planned', family: 'nitro',
    feeModel: 'nitro', feeAccounting: 'data-fee-in-estimate-gas', feeCapWei: '10000000000', gasFloorWei: null,
    native: 'HYPE', rpc: null, logsRpc: null, logStep: 25000, blockTime: 0.13, explorer: null,
    contracts: null, quote: { address: null, symbol: 'WHYPE', decimals: 18, wrapNative: true }, wrappedNative: null, usdc: null,
    launchFee: null, launchFeeWei: null, router: false, lab: false,
    data: { gecko: null, dex: null, alchemy: 'elysium-mainnet', zeroEx: false }
  },
  {
    // Uniswap's own OP-stack L2. Assessed, not built (Randall decides): CHAINS.md#unichain.
    id: '130', hex: '0x82', key: 'unichain', name: 'Unichain', short: 'Unichain', icon: null, status: 'planned', family: 'op-stack',
    feeModel: 'op-stack', feeAccounting: 'separate-data-and-operator-fees', feeCapWei: null, gasFloorWei: null,
    native: 'ETH', rpc: 'https://mainnet.unichain.org', logsRpc: 'https://mainnet.unichain.org', logStep: 10000, blockTime: 1,
    explorer: 'https://uniscan.xyz',
    contracts: { manager: '0x1f98400000000000000000000000000000000004', stateView: '0x86e8631a016f9068c3f085faf484ee3f5fdee8f2', quoter: '0xf885781cb68a0be66aa2ac7eda5fe72bde7da907', router: '0xef740bf23acae26f6492b10de645d6b98dc8eaf3', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: null, symbol: 'USDC', decimals: 6, wrapNative: false }, wrappedNative: '0x4200000000000000000000000000000000000006', usdc: null,
    launchFee: '0.0002', launchFeeWei: '200000000000000', router: false, lab: false,
    data: { gecko: 'unichain', dex: 'unichain', alchemy: 'unichain-mainnet', zeroEx: true }
  }
];

const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
export const CHAIN_REGISTRY = deepFreeze(rows);
/// Every chain that is built (live, hidden or testnet), in display order.
export const BUILT = Object.freeze(CHAIN_REGISTRY.filter(c => c.id && c.status !== 'planned'));
export const LIVE = Object.freeze(BUILT.filter(c => c.status === 'live'));
export const chainById = id => BUILT.find(c => c.id === String(id)) || null;
export const isArcFamily = id => chainById(id)?.family === 'arc';

/// Hidden-chain flag (browser only). ?chains=all turns it on and remembers it; ?chains=public turns it off.
export function hiddenChainsOn(loc = globalThis.location, store = (() => { try { return globalThis.localStorage; } catch { return null; } })()) {
  try {
    const v = new URLSearchParams(loc?.search || '').get('chains');
    if (v === 'all') store?.setItem('qhooks:chains', 'all');
    if (v === 'public') store?.removeItem('qhooks:chains');
    return v === 'all' || (v !== 'public' && store?.getItem('qhooks:chains') === 'all');
  } catch { return false; }
}
/// Chains a page lists: live ones, plus hidden/testnet ones when the flag is on (or `all` is passed).
export const visibleChains = (all = hiddenChainsOn()) => all ? BUILT : LIVE;
/// { id: pick(chain) } over a chain list, for the many `{ '8453': … }` maps.
export const chainMap = (pick, list = BUILT) => Object.freeze(Object.fromEntries(list.map(c => [c.id, pick(c)])));
/// Menu order used by quick launch and the terminal filter (Base, Ethereum, Arbitrum, BNB, Robinhood, then the rest).
const MENU = ['8453', '1', '42161', '56', '4663'];
export const menuChains = (all = hiddenChainsOn()) => visibleChains(all).slice().sort((a, b) => (MENU.indexOf(a.id) + 1 || 99) - (MENU.indexOf(b.id) + 1 || 99));
