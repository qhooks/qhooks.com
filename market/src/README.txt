QHooks module template (MIT)

QModuleBase.sol   the base every marketplace module inherits, unchanged (review checks its SHA-256 against SHA256SUMS.txt)
QStakeModule.sol  reference module: holder staking, payouts streamed over a day
QRafflePot.sol    reference module: a raffle pot

Build settings the review uses: solc 0.8.26, via_ir, optimizer 200 runs, evm cancun, bytecode_hash none.
Constructor: (address token, address quote, address builder, uint16 builderBps), builderBps <= 1000 (10%).
Deployment: deterministic deployer 0x4e59b44847b379578588920ca78fbf26c0b4956c,
salt keccak256("qhooks.module.v1"), init = creationCode ++ abi.encode(token, quote, builder, builderBps).

Guide:     https://qhooks.com/builders.html#guide
Checklist: https://qhooks.com/market/review-checklist.md
Submit:    https://qhooks.com/market-submit.html
