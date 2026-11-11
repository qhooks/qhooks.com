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
    simpleLaunchMulti: { address: '0x3fcf7693f799da31134970787f9f35578d0f60cc', from: 55793671, abi: 'pq', quotes: [[1, 'WETH', '0x4200000000000000000000000000000000000006', 18, 'weth']] },
    // Clean-token launch contract (full ERC-20 per launch, no clone; GoPlus all-clear on Base 2026-11-09). New launches use it
    // only once it has code on this chain (qx-quick-launch-core primeCleanFactory); `from` is the deploy block or a block before it.
    simpleLaunchClean: { address: '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', from: 55351284, abi: 'pq' },
    // Sale-first launches (QSaleLaunch, the same address on every chain; nothing there until Randall's /chain-setup?set=sale tap).
    // from 0: the indexer starts at the chain head on its first scan; set the deploy block once it is on chain.
    saleLaunch: { address: '0x707d79c32bea8f9773a81569fbacc64ab0502044', from: 0 },
    feeModel: 'op-stack', feeAccounting: 'separate-data-and-operator-fees', feeCapWei: null, gasFloorWei: null,
    native: 'ETH', rpc: 'https://mainnet.base.org', logsRpc: 'https://base-rpc.publicnode.com', logStep: 4000, blockTime: 2,
    explorer: 'https://basescan.org',
    contracts: { manager: '0x498581ff718922c3f8e6a244956af099b2652b2b', stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71', quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d', router: '0x6ff5693b99212da76ad316178a184ab56d299b43', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6, wrapNative: false },
    wrappedNative: '0x4200000000000000000000000000000000000006', usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    launchFee: '0.0002', launchFeeWei: '200000000000000', router: true, lab: true,
    // Next-generation QSimpleLaunch (start cap + optional post-quantum creator key; pays Base's own fee Safe 0x20ed…87Cb).
    // Deployed 2026-11-09 via /chain-setup, block 55185578. abi 'pq': launch() takes pqKey + lockRoles (selector 0x00cadb72).
    simpleLaunchNext: { address: '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', from: 55185578, abi: 'pq' },
    // Arb recapture v3 (3% plain side-pool cap), deployed block 55185754, trusts only the factory above.
    arbRecapture: { executor: '0x89f4e0c905737de81c6691ec5254ee429132c788', simpleLaunch: '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', fromBlock: 55185754,
      maxSideFee: 30000, gasReserveWei: '100000000000000',
      bridges: [{ currency0: '0x4200000000000000000000000000000000000006', currency1: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', fee: 3000, tickSpacing: 60, hooks: '0x0000000000000000000000000000000000000000' },
        { currency0: '0x4200000000000000000000000000000000000006', currency1: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000' }] },
    data: { gecko: 'base', dex: 'base', alchemy: 'base-mainnet', zeroEx: true }
  },
  {
    simpleLaunch: '0x023623568f41c032ec2f4bba368dbafc123160cc', simpleLaunchFrom: 108170556,
    // Next-generation QSimpleLaunch on Robinhood (start cap + optional PQ creator key), Randall 2026-11-09 "upgrade robinhood";
    // deployed via /chain-setup at block 110156527. Same RH settings as the factory above (fee wallet QFlywheel 0xb85e…,
    // 0.0002 ETH, same start): chain() identical. New one-tap launches go here; launches on 0x0236… stay listed and tradable.
    simpleLaunchNext: { address: '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', from: 110156527, abi: 'pq' },
    id: '4663', hex: '0x1237', key: 'robinhood', name: 'Robinhood Chain', short: 'Robinhood', icon: 'robinhood', status: 'live', family: 'nitro',
    // Clean-token launch contract (full ERC-20 per launch, no clone; GoPlus all-clear on Base 2026-11-09). New launches use it
    // only once it has code on this chain (qx-quick-launch-core primeCleanFactory); `from` is the deploy block or a block before it.
    simpleLaunchClean: { address: '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', from: 110390517, abi: 'pq' },
    // Sale-first launches (QSaleLaunch, the same address on every chain; nothing there until Randall's /chain-setup?set=sale tap).
    // from 0: the indexer starts at the chain head on its first scan; set the deploy block once it is on chain.
    saleLaunch: { address: '0x707d79c32bea8f9773a81569fbacc64ab0502044', from: 0 },
    // Pairs launch contract (QSimpleLaunch v3: the clean contract plus launchPaired(params, quoteIndex)). /create offers the
    // pairs below only once it has code here (Randall's one tap: /chain-setup?set=pairs&chain=4663&go=4663&factory=4663).
    // quotes: [index, symbol, address, decimals, issuer risk, USDG pool id for its USD price]; the index is fixed in the
    // contract (pairQuote). USDG + the 5 stocks with the deepest USDG pools on 2026-11-10.
    simpleLaunchPairs: { address: '0xefe39a5632212911fe8e3ddcb07f08e5e220e0cc', from: 110831000, abi: 'pq', quotes: [
      [1, 'USDG', '0x5fc5360d0400a0fd4f2af552add042d716f1d168', 6, 'stable'],
      [2, 'SPY', '0x117cc2133c37b721f49de2a7a74833232b3b4c0c', 18, 'stock', '0xfe2a80bb5618fd14984b92ca6d45bf5ba67443ddb1435e28b2e48df2fc1526cd'],
      [3, 'META', '0xc0d6457c16cc70d6790dd43521c899c87ce02f35', 18, 'stock', '0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36'],
      [4, 'PLTR', '0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a', 18, 'stock', '0xee430ee1003e1985e1828a01b9a20dad67ad4302994fe2abb4a173de4ac54623'],
      [5, 'AAPL', '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', 18, 'stock', '0xc748f4671a867db48b552f6b7650bf3255e05f80f00e3f7aad1b17ccb7898fdb'],
      [6, 'TSLA', '0x322f0929c4625ed5bad873c95208d54e1c003b2d', 18, 'stock', '0x8517f8071ae5b831b738052f12125e8e3d6c158b78728aa44ce3b25e5104d32e']] },
    simpleLaunchMulti: { address: '0x3fcf7693f799da31134970787f9f35578d0f60cc', from: 111223856, abi: 'pq', quotes: [
      [1, 'USDG', '0x5fc5360d0400a0fd4f2af552add042d716f1d168', 6, 'stable'],
      [2, 'SPY', '0x117cc2133c37b721f49de2a7a74833232b3b4c0c', 18, 'stock', '0xfe2a80bb5618fd14984b92ca6d45bf5ba67443ddb1435e28b2e48df2fc1526cd'],
      [3, 'META', '0xc0d6457c16cc70d6790dd43521c899c87ce02f35', 18, 'stock', '0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36'],
      [4, 'PLTR', '0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a', 18, 'stock', '0xee430ee1003e1985e1828a01b9a20dad67ad4302994fe2abb4a173de4ac54623'],
      [5, 'AAPL', '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', 18, 'stock', '0xc748f4671a867db48b552f6b7650bf3255e05f80f00e3f7aad1b17ccb7898fdb'],
      [6, 'TSLA', '0x322f0929c4625ed5bad873c95208d54e1c003b2d', 18, 'stock', '0x8517f8071ae5b831b738052f12125e8e3d6c158b78728aa44ce3b25e5104d32e']] },
    feeModel: 'nitro', feeAccounting: 'data-fee-in-estimate-gas', feeCapWei: '10000000000', gasFloorWei: null,
    native: 'ETH', rpc: 'https://rpc.mainnet.chain.robinhood.com', logsRpc: 'https://rpc.mainnet.chain.robinhood.com', logStep: 25000, blockTime: 0.1,
    explorer: 'https://robinhoodchain.blockscout.com',
    contracts: { manager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b', quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94', router: '0x06afba43fd06227fa663b0daecf536f6eaa6bf99', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: true },
    quote: { address: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', symbol: 'WETH', decimals: 18, wrapNative: true },
    wrappedNative: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', usdc: null,
    launchFee: '0.0002', launchFeeWei: '200000000000000', router: true, lab: true,
    // Arb recapture executor (QArbRecapture, CREATE2 via 0x4e59…). Ship this row only after the deploy tx has landed: the
    // keeper skips an address with no code, but the Create line and card follow this config. Gas reserve keeps about a day of
    // buybacks in the shared keeper wallet.
    // Two executors (2026-11-09): v3 (3% plain side-pool cap) for the next-gen one-tap factory new launches go to, and the
    // first v2 executor for launches made on the first factory and for Studio launches (QCAT is proven in its constructor).
    arbRecapture: { executor: '0x622011a2be0727c0840c0b1089771ed480d53320', simpleLaunch: '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', fromBlock: 110156527,
      maxSideFee: 30000, bridges: [], gasReserveWei: '500000000000000' },
    arbRecaptureMore: [{ executor: '0x256870174d3322c4c7f9bd2ed227c07b84e035da', simpleLaunch: '0x023623568f41c032ec2f4bba368dbafc123160cc', fromBlock: 109631000, bridges: [], gasReserveWei: '500000000000000', studio: true }],
    ownIndex: { confirmations: 128, statelessHistory: true, rpcOnly: true, ownHistory: true, ownTransfers: true, nativeSample: true, onlySource: true },
    data: { gecko: 'robinhood', dex: 'robinhood', alchemy: 'robinhood-mainnet', zeroEx: true }
  },
  {
    id: '1', hex: '0x1', key: 'ethereum', name: 'Ethereum', short: 'Ethereum', icon: 'ethereum', status: 'live', family: 'ethereum',
    simpleLaunchMulti: { address: '0x3fcf7693f799da31134970787f9f35578d0f60cc', from: 26387450, abi: 'pq', quotes: [[1, 'WETH', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 18, 'weth']] },
    // Clean-token launch contract (full ERC-20 per launch, no clone; GoPlus all-clear on Base 2026-11-09). New launches use it
    // only once it has code on this chain (qx-quick-launch-core primeCleanFactory); `from` is the deploy block or a block before it.
    simpleLaunchClean: { address: '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', from: 26380174, abi: 'pq' },
    // Sale-first launches (QSaleLaunch, the same address on every chain; nothing there until Randall's /chain-setup?set=sale tap).
    // from 0: the indexer starts at the chain head on its first scan; set the deploy block once it is on chain.
    saleLaunch: { address: '0x707d79c32bea8f9773a81569fbacc64ab0502044', from: 0 },
    feeModel: 'ethereum', feeAccounting: 'execution-only', feeCapWei: '1000000000000', gasFloorWei: null,
    native: 'ETH', rpc: 'https://ethereum-rpc.publicnode.com', logsRpc: 'https://ethereum-rpc.publicnode.com', logStep: 2000, blockTime: 12,
    explorer: 'https://etherscan.io',
    contracts: { manager: '0x000000000004444c5dc75cb358380d2e3de08a90', stateView: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227', quoter: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203', router: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', decimals: 6, wrapNative: false },
    wrappedNative: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    launchFee: '0.0002', launchFeeWei: '200000000000000', router: true, lab: true,
    arbRecapture: null,
    data: { gecko: 'eth', dex: 'ethereum', alchemy: 'eth-mainnet', zeroEx: true }
  },
  {
    id: '42161', hex: '0xa4b1', key: 'arbitrum', name: 'Arbitrum One', short: 'Arbitrum', icon: 'arbitrum', status: 'live', family: 'nitro',
    simpleLaunchMulti: { address: '0x3fcf7693f799da31134970787f9f35578d0f60cc', from: 523106870, abi: 'pq', quotes: [[1, 'WETH', '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', 18, 'weth']] },
    // Clean-token launch contract (full ERC-20 per launch, no clone; GoPlus all-clear on Base 2026-11-09). New launches use it
    // only once it has code on this chain (qx-quick-launch-core primeCleanFactory); `from` is the deploy block or a block before it.
    simpleLaunchClean: { address: '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', from: 522799540, abi: 'pq' },
    // Sale-first launches (QSaleLaunch, the same address on every chain; nothing there until Randall's /chain-setup?set=sale tap).
    // from 0: the indexer starts at the chain head on its first scan; set the deploy block once it is on chain.
    saleLaunch: { address: '0x707d79c32bea8f9773a81569fbacc64ab0502044', from: 0 },
    feeModel: 'nitro', feeAccounting: 'data-fee-in-estimate-gas', feeCapWei: '10000000000', gasFloorWei: null,
    native: 'ETH', rpc: 'https://arb1.arbitrum.io/rpc', logsRpc: 'https://arb1.arbitrum.io/rpc', logStep: 25000, blockTime: 0.25,
    explorer: 'https://arbiscan.io',
    contracts: { manager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32', stateView: '0x76fd297e2d437cd7f76d50f01afe6160f86e9990', quoter: '0x3972c00f7ed4885e145823eb7c655375d275a1c5', router: '0x96b2fd2f80e9428daa65d859653117d453981ab4', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', decimals: 6, wrapNative: false },
    wrappedNative: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    launchFee: '0.0002', launchFeeWei: '200000000000000', router: true, lab: true,
    // Next-generation QSimpleLaunch (start cap + optional PQ creator key; pays Arbitrum's own fee Safe 0x27c3…94b2), block 522677810.
    simpleLaunchNext: { address: '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', from: 522677810, abi: 'pq' },
    // Arb recapture v3 (3% plain side-pool cap), block 522677843; gas valued through WETH/USDC 0.05%.
    arbRecapture: { executor: '0x188066c795e0da43d0a06b9a48aeaceb579c51ea', simpleLaunch: '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', fromBlock: 522677843,
      maxSideFee: 30000, gasReserveWei: '100000000000000',
      bridges: [{ currency0: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', currency1: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000' }] },
    data: { gecko: 'arbitrum', dex: 'arbitrum', alchemy: 'arb-mainnet', zeroEx: true }
  },
  {
    id: '56', hex: '0x38', key: 'bnb', name: 'BNB Chain', short: 'BNB', icon: 'bnb', status: 'live', family: 'bsc',
    simpleLaunchMulti: { address: '0x3fcf7693f799da31134970787f9f35578d0f60cc', from: 132855010, abi: 'pq', quotes: [[1, 'USDT', '0x55d398326f99059ff775485246999027b3197955', 18, 'stable']] },
    // Clean-token launch contract (full ERC-20 per launch, no clone; GoPlus all-clear on Base 2026-11-09). New launches use it
    // only once it has code on this chain (qx-quick-launch-core primeCleanFactory); `from` is the deploy block or a block before it.
    simpleLaunchClean: { address: '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', from: 132660352, abi: 'pq' },
    // Sale-first launches (QSaleLaunch, the same address on every chain; nothing there until Randall's /chain-setup?set=sale tap).
    // from 0: the indexer starts at the chain head on its first scan; set the deploy block once it is on chain.
    saleLaunch: { address: '0x707d79c32bea8f9773a81569fbacc64ab0502044', from: 0 },
    minPriorityFeeWei: '50000000', feeModel: 'bsc', feeAccounting: 'bsc-execution', feeCapWei: '10000000000', gasFloorWei: null,
    native: 'BNB', rpc: 'https://bsc-dataseed.bnbchain.org', logsRpc: 'https://bsc-rpc.publicnode.com', logStep: 5000, blockTime: 0.45,
    explorer: 'https://bscscan.com',
    contracts: { manager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df', stateView: '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4', quoter: '0x9f75dd27d6664c475b90e105573e550ff69437b0', router: '0x91bf3bfaef8d771a74e1a8fe460b3ee646b2e588', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', symbol: 'WBNB', decimals: 18, wrapNative: true },
    wrappedNative: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', usdc: null,
    launchFee: '0.0007', launchFeeWei: '700000000000000', router: true, lab: true,
    // Next-generation QSimpleLaunch (start cap + optional PQ creator key; pays BNB's own fee Safe 0xB6C1…C3bB), block 132585433.
    simpleLaunchNext: { address: '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', from: 132585433, abi: 'pq' },
    // Arb recapture v3, block 132585454. Launches are WBNB-quoted (the wrapped native), so gas needs no bridge.
    arbRecapture: { executor: '0x47be6b8b6345f22b56b44008020ef0543fcbb90d', simpleLaunch: '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', fromBlock: 132585454,
      maxSideFee: 30000, gasReserveWei: '1000000000000000', bridges: [] },
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
    arbRecapture: null,
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
    arbRecapture: null,
    data: { gecko: null, dex: null, alchemy: null, zeroEx: false }
  },
  {
    // Elysium mainnet (launch expected Mon 2026-11-09). Staged 2026-11-08 from work/qhooks-elysium-mainnet-20261108/RUNBOOK.md §2.
    // Stays 'planned' (excluded from BUILT, so nothing on the site or worker sees it) until launch day. To switch it to
    // hidden: fill rpc, logsRpc, explorer, contracts (Uniswap's 99901 deployments), quote.address / wrappedNative (WHYPE,
    // official), launchFee / launchFeeWei (Randall: proposal 0.006 HYPE), simpleLaunch / simpleLaunchFrom and
    // extras.feeRouter (the Elysium builds Randall deploys), then set status: 'hidden', and router: true once the
    // Elysium QFeeRouter has code. data.alchemy: 'elysium-mainnet' once enabled on the QHooks app.
    // Elysium mainnet (Kinetiq, Arbitrum Orbit on HyperEVM), live 2026-11-09. Hidden: ?chains=all until Randall's go-public.
    // Sources: elysium.kinetiq.xyz/docs/connecting-to-elysium (chain, RPC), /docs/contract-addresses (Permit2, deployer, Safe),
    // Uniswap/contracts PR #179 deployments/json/99901.json (v4), Uniswap/universal-router PR #534 (weth9 = WHYPE).
    id: '99901', hex: '0x1863d', key: 'elysium', name: 'Elysium', short: 'Elysium', icon: 'elysium', status: 'live', family: 'nitro',
    simpleLaunchMulti: { address: '0x9a9d37bca2e9874a1da1a1bab51f242a9d1ca0cc', from: 4331176, abi: 'pq', quotes: [] },
    // Clean-token launch contract (full ERC-20 per launch, no clone; GoPlus all-clear on Base 2026-11-09). New launches use it
    // only once it has code on this chain (qx-quick-launch-core primeCleanFactory); `from` is the deploy block or a block before it.
    simpleLaunchClean: { address: '0xc7faaf2e1b01e5e2cae4f967a020b49b290ca0cc', from: 3539046, abi: 'pq' },
    // Sale-first launches (QSaleLaunch, the same address on every chain; nothing there until Randall's /chain-setup?set=sale tap).
    // from 0: the indexer starts at the chain head on its first scan; set the deploy block once it is on chain.
    saleLaunch: { address: '0x707d79c32bea8f9773a81569fbacc64ab0502044', from: 0 },
    feeModel: 'nitro', feeAccounting: 'data-fee-in-estimate-gas', feeCapWei: '10000000000', gasFloorWei: null,
    native: 'HYPE', rpc: 'https://rpc.elysium.kinetiq.xyz', logsRpc: 'https://rpc.elysium.kinetiq.xyz', logStep: 2000, blockTime: 0.13, explorer: 'https://elysium.kinetiq.xyz',
    contracts: { manager: '0xe2e105d3f7209a9da11f83ccf3e7398a753823f1', stateView: '0x27ed73ae0652fdcf71d6793412a7525f32be9dfe', quoter: '0x379f556c5a748bd7cc9baf0f7a344094ac1814f5', router: '0xa13f7611115752deb2b13813bdde16a5073e4b45', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: '0xba876237b0f021a6c6d852d6c26e107997cc5e81', symbol: 'WHYPE', decimals: 18, wrapNative: true }, wrappedNative: '0xba876237b0f021a6c6d852d6c26e107997cc5e81', usdc: null,
    launchFee: '0.006', launchFeeWei: '6000000000000000', router: true, lab: false,
    simpleLaunch: null, simpleLaunchFrom: null,
    // Next-generation QSimpleLaunch, Elysium's own build (start cap + optional PQ creator key; pays Elysium's own fee Safe
    // 0x2d45…8037; fee 0.006 HYPE). Official facts: Kinetiq docs + Uniswap/contracts PR #179 (2026-11-09). Deployed 2026-11-09 via /chain-setup: factory block 3239822, fee router 3239918, fee Safe 3238882.
    simpleLaunchNext: { address: '0x8223f9ce8998fb436fc32bdf541cc34d668420cc', from: 3239822, abi: 'pq' },
    // Elysium QFeeRouter build (terminal 1% fee; cashback/referral split as elsewhere; pays the Elysium Safe).
    extras: { feeRouter: '0xff208831ed6f0c4e3e3224effa45fae7906dc6c2' },
    // QHooks arb executor v3 for the Elysium launch contract (deployed 2026-11-09 via /chain-setup, block 3532414). WHYPE quote, so gas is valued directly.
    arbRecapture: { executor: '0x4ecf92ee8985f734c613a91d37b2a0bf00420119', simpleLaunch: '0x8223f9ce8998fb436fc32bdf541cc34d668420cc', fromBlock: 3532414,
      maxSideFee: 30000, gasReserveWei: '5000000000000000', bridges: [] },
    // Own-pool index (charts, tape, holders): GeckoTerminal/DexScreener don't list Elysium, so like Robinhood it is the only source.
    ownIndex: { confirmations: 128, statelessHistory: true, ownHistory: true, ownTransfers: true, nativeSample: true, onlySource: true },
    data: { gecko: null, dex: null, alchemy: 'elysium-mainnet', zeroEx: false }
  },
  {
    // The Monad v4 build is offered by one-tap only after its code probe succeeds.
    id: '143', hex: '0x8f', key: 'monad', name: 'Monad', short: 'Monad', icon: 'monad', status: 'live', family: 'monad',
    wallet: true, bridge: true, homeAssets: ['MON'],
    simpleLaunchMulti: { address: '0x0f73962ed759b0abdb92cbecbc3ef2bf462a20cc', from: 121245205, abi: 'pq', quotes: [[1, 'USDC', '0x754704bc059f8c67012fed69bc8a327a5aafb603', 6, 'stable']] },
    feeModel: 'ethereum', feeAccounting: 'execution-only', feeCapWei: null, gasFloorWei: null,
    native: 'MON', rpc: 'https://rpc.monad.xyz', logsRpc: 'https://rpc.monad.xyz', logStep: 1000, blockTime: 0.4,
    explorer: 'https://monadvision.com',
    contracts: { manager: '0x188d586ddcf52439676ca21a244753fa19f9ea8e', stateView: '0x77395f3b2e73ae90843717371294fa97cc419d64', quoter: '0xa222dd357a9076d1091ed6aa2e16c9742dd26891', positionManager: '0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016', router: '0xa6ce4f10d83dbddac17e68e1837ca9ce6a1b596e', permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', extended: false },
    quote: { address: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', symbol: 'WMON', decimals: 18, wrapNative: true },
    wrappedNative: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', usdc: '0x754704bc059f8c67012fed69bc8a327a5aafb603',
    router: false, lab: false,
    data: { gecko: 'monad', dex: 'monad', alchemy: 'monad-mainnet', zeroEx: false }
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
    arbRecapture: null,
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
