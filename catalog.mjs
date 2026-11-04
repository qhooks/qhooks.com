import {circuitRecoveryCopy} from './circuit-recovery-copy.mjs';
import {graduationCopy} from './graduation-copy.mjs';
import {dynamicFeeCopy} from './dynamic-fee-copy.mjs';
import {directionalFeeCopy} from './directional-fee-copy.mjs';
export const quantumCatalog = Object.freeze([
  {
    id: "qcreator-fee-pq-vault",
    name: "Creator Revenue / PQ Claim Vault",
    kind: "Quantum hook bundle prototype",
    category: "Creator revenue",
    status: "Local PQ tested",
    publisher: "QHooks laboratory",
    summary: "A real local bundle whose creator-fee claim withdrawals require wallet AND ML-DSA-65 authorization over the same complete action.",
    detail: "The public swap path does not perform PQ verification. The fixed local hook accrues PoolManager claims into a claim-only vault; withdrawing either supported plain-ERC20 claim currency requires both authorizations. Unsupported direct deposits can strand. This prototype has no public deployment and is not launch-ready.",
    protectedAction: "Creator-fee claim withdrawals from the fixed local PoolManager for either immutable plain-ERC20 claim currency, authorized by wallet AND ML-DSA-65 over the complete action.",
    unprotectedActions: Object.freeze([
      "Public swaps, consensus, token issuer controls, liquidity, pricing and market risk.",
      "The recipient wallet after payout and unsupported direct ERC20 or native deposits."
    ]),
    limitations: Object.freeze([
      "No public deployment; deployment remains pending security and cost review.",
      "Not launch-ready and not independently externally audited.",
      "No owner enrollment consent, key rotation, recovery or backup workflow.",
      "Helper source reproducibility and production security gates remain unresolved."
    ]),
    deploymentEnabled: false,
    tags: ["creator revenue", "claim vault", "wallet and ML-DSA-65", "withdrawal", "local PQ tested"],
    evidence: {
      normal: "33/33 isolated real local-EVM tests passed for the normal bundle.",
      fixtures: "Twenty independent native-provider ML-DSA-65 signature fixtures were verified in the EVM.",
      mutation: "The exact remove-PQ mutation was detected by the wallet-only rejection test.",
      review: "Agent and lead source review completed; this was not an independent external audit."
    },
    provenance: Object.freeze([
      Object.freeze({
        kind: "normal",
        path: "receipts/Q11-runs/48da37e8-7440-4124-9350-a2ec8875b46e.json",
        sha256: "231dd2f7cbf6f4439c7ed5deacaae9dd18f2cd1830d1e3da6acddbdeccb37b0a"
      }),
      Object.freeze({
        kind: "remove-pq-mutation",
        path: "receipts/Q12-runs/2fbda81c-4ebf-4290-b745-d14ca5007914.json",
        sha256: "a60acfdf979e6a58537280facc679dc6a9761066991d0b5e8c772747ccb5007a"
      })
    ])
  },
  {
    id: "qrevenue-split-pq-vaults",
    name: "Revenue Split / Independent PQ Vaults",
    kind: "Quantum hook bundle prototype",
    category: "Revenue sharing",
    status: "Local PQ tested",
    publisher: "QHooks laboratory",
    summary: "A real local two-owner bundle that splits executed creator fees 3333/6667 into two independent wallet-AND-ML-DSA-65 claim vaults.",
    detail: "The tested integration has exactly two beneficiaries with independent wallet owners, ML-DSA-65 keys and nonces. It splits actual executed fees 3333/6667 with an exact final-recipient remainder; each beneficiary can withdraw either supported plain-ERC20 PoolManager claim currency from its own vault only with both authorizations. The conventional split hook supports two through eight recipients, but that broader range has no PQ integration evidence. This is one bundle, not two counted vault products. Public swaps do not perform PQ verification. Unsupported direct deposits can strand.",
    protectedAction: "Either supported plain-ERC20 claim withdrawal from each beneficiary's own independent vault, authorized by that beneficiary's wallet AND ML-DSA-65 over the same complete action.",
    unprotectedActions: Object.freeze([
      "Public swaps, consensus, token issuer controls, liquidity, pricing and market risk.",
      "The two recipient wallets after payout and unsupported direct ERC20 or native deposits."
    ]),
    limitations: Object.freeze([
      "No public deployment; deployment remains pending security and cost review.",
      "Not launch-ready and not independently externally audited.",
      "No owner enrollment consent, key rotation, recovery or backup workflow.",
      "Manager and helper provenance, specialist review and chain costs remain unresolved.",
      "Each vault registers a separate key; no shared-registration or per-listing gas claim was established."
    ]),
    deploymentEnabled: false,
    tags: ["revenue sharing", "3333/6667", "independent vaults", "wallet and ML-DSA-65", "claim withdrawal", "local PQ tested"],
    evidence: {
      normal: "26/26 isolated real local-EVM tests passed for the two-beneficiary bundle; inherited Q11's 33 tests were not rerun or counted.",
      fixtures: "Twenty new Q14 native-provider ML-DSA-65 signatures were cross-verified in the EVM; the existing Q10 beneficiary fixtures were reused for the other beneficiary.",
      payouts: "Four owner-and-currency payout paths were exercised with wrong, crossed, replayed and field-mutated authorizations, independent nonces, failure rollback and reentrancy rollback.",
      accounting: "Real swaps covered both directions, exact input and exact output, partial fills, exact 3333/6667 allocation and final-recipient remainder conservation.",
      mutation: "Removing the sole PQ call from the shared vault type made both unchanged beneficiary wallet-only tests fail with their exact sentinels; candidate and launcher exited 1, the trusted host exited 0, and all 67 other inputs were unchanged.",
      review: "Agent and lead source review completed; this was not an independent external audit."
    },
    provenance: Object.freeze([
      Object.freeze({
        kind: "normal",
        path: "receipts/Q15-runs/abd49565-6350-470a-8ffc-cb10e27f071b.json",
        sha256: "498bcf97a238c2256b2e1e07e6747e291149d63273a9d91dac4ee90d2e9f5665"
      }),
      Object.freeze({
        kind: "remove-pq-mutation",
        path: "receipts/Q17-runs/dfb3a4a8-dbf7-4906-bf6c-fc4e544b8a90.json",
        sha256: "73d8a701b6bd9852e8beb3aea56b4cb3a424bc6a4e7512221b8bc1d44c7ff5a3"
      })
    ])
  },
  {
    id: "qprice-band-pq-governance",
    name: "Price Band / PQ-Authorized Governance",
    kind: "Quantum hook bundle prototype",
    category: "Price policy",
    status: "Local PQ tested",
    publisher: "QHooks laboratory",
    summary: "A real local governance bundle whose pool-bound sqrt-price band replacement requires wallet AND ML-DSA-65 authorization over one complete 19-word action.",
    detail: "The protected action replaces this pool's inclusive sqrt-price bounds. Both authorizations bind the chain, controller, module, manager, hook and full pool key; policy, auth epoch, nonce and half-open validity window; and the old version and bounds plus sequential new version and bounds. This is policy governance, not withdrawal custody. Public swaps use the active pool-local bounds without performing PQ verification, and LP exits remain available.",
    protectedAction: "Replacing this pool's inclusive sqrt-price bounds, authorized by wallet AND real ML-DSA-65 over the same complete 19-word action and its sequential old-to-new version transition.",
    unprotectedActions: Object.freeze([
      "Swaps themselves do not verify PQ; consensus, token issuer controls, market risk and destination wallets are not protected.",
      "Pool-local spot bounds are not an external oracle, stable-value guarantee, manipulation defense or LP-principal protection. LP exits remain available."
    ]),
    limitations: Object.freeze([
      "No public deployment; deployment remains pending security and cost review.",
      "Not launch-ready and not independently externally audited or specialist-reviewed.",
      "No owner enrollment consent, key rotation, recovery or backup workflow.",
      "Helper source reproducibility, canonical production manager selection and chain economics remain unresolved.",
      "The fixed callback graph and post-call guard state were checked; no active reentrancy trigger test is claimed.",
      "Measured construction gas is local prototype evidence, not a per-listing cost claim.",
      "No wallet connection, RPC, funding, payment, backend activation or external request is enabled."
    ]),
    deploymentEnabled: false,
    tags: ["price policy", "sqrt price", "inclusive bounds", "wallet and ML-DSA-65", "19-word action", "local PQ tested"],
    evidence: {
      normal: "28/28 isolated real local-EVM tests passed for the price-band governance bundle; inherited Q11 and Q19 suites were not rerun or counted.",
      fixtures: "Twenty-five independently generated native-provider ML-DSA-65 signatures were verified across the complete 19-word action, with controls covering all 19 fields.",
      authorization: "Both authorizations, wrong key and context, replay, half-open validity, sequential nonce/version, current-price inclusion, callback identity and full PoolKey boundaries were exercised.",
      integration: "Real replacements and rollback covered both swap directions and exact modes, lower and upper rejection followed by authorized widening, and LP exits.",
      mutation: "Mechanical removal of the sole PQ call made the unchanged wallet-only sentinel fail only after nonce 1, version 1 and the new bounds actually succeeded; candidate and launcher exited 1, the trusted host exited 0, all 71 other inputs were unchanged, and the VM stopped cleanly.",
      review: "Agent and lead source review completed; this was not an independent external audit."
    },
    provenance: Object.freeze([
      Object.freeze({
        kind: "normal",
        path: "receipts/Q22-runs/6bd75480-1bc5-49e9-99f7-c24e3884ca91.json",
        sha256: "1e956760a0a098fdbec8652a0723162fd75c5df6200d53560fb3cf950157a75f"
      }),
      Object.freeze({
        kind: "remove-pq-mutation",
        path: "receipts/Q23-runs/45921aa2-81de-4768-869d-3ae3e378bd93.json",
        sha256: "e688abe3bc8fb765a9845f0c0fdfbd3ad485b537c2349446c2ce37fb0d2c43c0"
      })
    ])
  },
  {
    id: "qvolume-epochs-pq-renewal",
    name: "Volume Epochs / PQ-Authorized Renewal",
    kind: "Quantum hook bundle prototype",
    category: "Volume policy",
    status: "Local PQ tested",
    publisher: "QHooks laboratory",
    summary: "A real local policy bundle whose next sequential volume-budget epoch requires wallet AND ML-DSA-65 authorization over one complete 23-word action.",
    detail: "The protected action opens this pool's next sequential epoch only after the prior epoch ends. Both authorizations bind the chain, controller, module, manager, hook and pool; policy, auth epoch, nonce and half-open validity; and the exact old epoch identity, window and caps plus the sequential new identity, window and caps. No early budget reset is permitted. The active half-open window meters actual executed input separately by direction in raw token units, including fees; partial fills count what executed, not the requested size. Closed epoch history persists, expired epochs never reset automatically, and signed future gaps or unavailable signers can pause trading while LP exits remain available. This is policy governance, not withdrawal custody. Swaps do not perform PQ verification.",
    protectedAction: "Opening this pool's next sequential volume-budget epoch after the prior epoch ends, authorized by wallet AND real ML-DSA-65 over the same complete 23-word old-to-new epoch action.",
    unprotectedActions: Object.freeze([
      "Swaps themselves do not verify PQ; consensus, token issuer controls, market risk and destination wallets are not protected.",
      "Raw-token pool-wide caps are not dollar limits, identity controls or anti-whale guarantees. Pool-wide budget exhaustion and griefing, boundary bursts and signer unavailability can pause trading; LP exits remain available."
    ]),
    limitations: Object.freeze([
      "No public deployment; deployment remains pending security and cost review.",
      "Not launch-ready and not independently externally audited or specialist-reviewed.",
      "No owner enrollment consent, key rotation, key recovery or backup workflow.",
      "Helper source reproducibility, canonical production manager selection and chain economics remain unresolved.",
      "No active reentrancy trigger, arbitrary-composition claim or unreachable occupied-history branch coverage is claimed.",
      "The fixture uses plain controlled ERC20 tokens; local gas is not a per-listing cost claim.",
      "No oracle, MEV, principal, consensus, issuer, destination-wallet or broader market-risk protection is provided.",
      "No wallet connection, RPC, funding, payment, backend activation or external request is enabled."
    ]),
    deploymentEnabled: false,
    tags: ["volume policy", "sequential epochs", "raw token units", "wallet and ML-DSA-65", "23-word action", "local PQ tested"],
    evidence: {
      normal: "33/33 isolated real local-EVM tests passed for the volume-epoch renewal bundle; inherited Q11 and Q25 suites were not rerun or counted.",
      fixtures: "Twenty-nine independently generated native-provider ML-DSA-65 signatures were verified in the EVM, with 23 PQ and 23 wallet field controls over the complete 23-word action.",
      authorization: "Both authorizations, wrong key and context, replay, half-open validity, nonce, sequential 0-to-1-to-2 history, old-cap mismatch and retry, no-early-renewal, locked-manager, direct-admin, callback, full-key and duplicate-initialization boundaries were exercised.",
      accounting: "Real funded swaps covered both directions, exact input, exact output, partial fills, actual input including fees, inclusive caps and half-open window boundaries, rollback and usable LP exits.",
      mutation: "Mechanical removal of the sole PQ call made the unchanged wallet-only test reach its exact sentinel only after success with empty returndata, nonce 1, current epoch 1, closed old epoch 0 and the exact new window, caps and zero usage; candidate and launcher exited 1, the trusted host exited 0, all 71 other inputs were unchanged, and the VM stopped cleanly.",
      review: "Agent and lead source review completed; this was not an independent external audit."
    },
    provenance: Object.freeze([
      Object.freeze({
        kind: "normal",
        path: "receipts/Q28-runs/674db01c-4e58-4f47-a01e-6f6fe00858ab.json",
        sha256: "7703c5b8c507aafda013eeec3cd5209efd7cfe0081e3e32d1c0e63be5946e933"
      }),
      Object.freeze({
        kind: "remove-pq-mutation",
        path: "receipts/Q29-runs/6379b303-c1f9-44a4-aa40-42155eab9c5b.json",
        sha256: "9429bc896d05410790df1af2bd2d3a4a49478e068faef8c9627e266fcaa8002f"
      })
    ])
  },
  Object.freeze({
    ...circuitRecoveryCopy,
    id:'qcircuit-recovery-pq-resume',
    name:'Circuit Recovery / PQ-Authorized Resume',
    kind:'Quantum hook bundle prototype',
    category:'Circuit recovery',
    status:'Local PQ tested',
    publisher:'QHooks laboratory',
    deploymentEnabled:false,
    tags:Object.freeze(['circuit','cooldown','resume','threshold replacement','wallet and ML-DSA-65','22-word action','local PQ tested']),
    evidence:Object.freeze({
      normal:'33/33 isolated real local-EVM tests passed for the Circuit Recovery integration.',
      fixtures:'27 native-provider ML-DSA-65 signatures cross-checked the complete 22-word recovery action.',
      integration:'Real swaps exercised both directions, exact modes, partial fills, latch/cooldown boundaries, two trips and recoveries, rollback, and LP exits while paused.',
      mutation:'Exact removal of the sole PQ call allowed actual recovery before the unchanged wallet-only rejection sentinel failed; the other 71 candidate files were unchanged.',
      review:'Lead and agent source review completed; not an independent external audit.'
    }),
    provenance:Object.freeze([
      Object.freeze({kind:'normal',path:'receipts/Q35-runs/d92d1920-1e14-4ad2-b4be-79a69dfa5fc2.json',sha256:'62674e9b82b2f39da48233c15bf61b6d9837bedad6faaafd1044bcc851bb6eca'}),
      Object.freeze({kind:'remove-pq-mutation',path:'receipts/Q36-runs/5f2bf7c8-ef5f-437f-9e50-a403a7643c1e.json',sha256:'754facabea7b0becaaa9dd41d463170f4a8a4f88dc6f275ef3a04eb505c117cf'})
    ])
  }),
  Object.freeze({
    ...graduationCopy,
    id:'qgraduation-pq-liquidity-migration',
    name:'QGraduation / PQ-Authorized Liquidity Migration',
    kind:'Quantum hook bundle prototype',
    category:'Liquidity migration',
    status:'Local PQ tested',
    publisher:'QHooks laboratory',
    deploymentEnabled:false,
    tags:Object.freeze(['graduation','liquidity','migration','threshold','manual','stay','net quote','wallet and SLH-DSA-SHA2-128s','local PQ tested']),
    evidence:Object.freeze({
      normal:'227 actual local transactions covered normal flows and the exact PQ-removal control: 50 successes and 177 expected mined reverts with complete rollback comparisons.',
      integration:'Actual threshold and manual LP migrations, noticed policy changes, pending migration freeze, cancellation, fee claims and destination exits.',
      mutation:'Removing only the PQ verification call allowed wallet-only execution of all seven protected action kinds; the other 67 Solidity sources stayed unchanged.',
      client:'Dedicated encrypted backup and restored-client approvals passed a separate 19-transaction local campaign with four native-verified client SLH signatures. Local launch setup and liquidity workspaces are integrated; actual browser-wallet signing remains untested.',
      review:'Lead source and integrity review completed; not an independent external audit.'
    }),
    provenance:Object.freeze([
      Object.freeze({kind:'normal-and-remove-pq-mutation',path:'receipts/Q47-graduation-2026-10-10T04-24-28-617Z.json',sha256:'5f313650c38e0d1a9087dcdbc168001a91e3d1f85c263c331ebe78b9209f7a33'}),
      Object.freeze({kind:'restored-client',path:'receipts/Q48-client-2026-10-10T04-50-28-042Z.json',sha256:'8bed597fad75740f4c7b88d1218baa481e047c8fa90591f1381356230d2ab20a'})
    ])
  }),
  Object.freeze({
    ...dynamicFeeCopy,
    id:'qdynamic-fee-pq-governance',
    name:'Dynamic Fees / PQ-Authorized Fee Governance',
    kind:'Quantum hook bundle prototype',
    category:'Fee governance',
    status:'Local PQ tested',
    publisher:'QHooks laboratory',
    deploymentEnabled:false,
    tags:Object.freeze(['dynamic fees','LP fee','fixed ceiling','wallet and ML-DSA-65','18-word action','local PQ tested']),
    evidence:Object.freeze({
      normal:'21/21 isolated real local-EVM tests passed; inherited tests were not rerun or counted.',
      fixtures:'25 independent native-provider ML-DSA-65 signatures cross-checked actions, all 18 fields, keys and contexts in the EVM.',
      integration:'Four authorized fee changes, 20 matched static-pool swap cells, four protocol-fee boundary cells and four slippage/funding rollback cells passed. LP exits and actual swap-funded fees remained usable.',
      mutation:'Removing only the sole PQ call allowed an actual wallet-only fee/core/version/nonce update before the unchanged rejection test raised its exact sentinel; 73 other candidate files were unchanged.',
      review:'Lead review and a focused Cline swap-helper advisory completed; not an independent external audit.'
    }),
    provenance:Object.freeze([
      Object.freeze({kind:'normal',path:'receipts/Q52-evm-2026-10-10T08-45-09-729Z.json',sha256:'590e61430156f149df1a3719f5a6086cbed491b0870b2702b51c25a1ee9bb55f'}),
      Object.freeze({kind:'remove-pq-mutation',path:'receipts/Q52-pq-removal-2026-10-10T08-47-50-843Z.json',sha256:'263b9ac25a2afac1e4418fa204609defdc127639ae9fb3c168fda95888c06f4f'})
    ])
  }),
  Object.freeze({
    ...directionalFeeCopy,
    id:'qdirectional-fees-pq-schedules',
    name:'Directional Fees / PQ-Authorized Schedules',
    kind:'Quantum hook bundle prototype',
    category:'Fee governance',
    status:'Local PQ tested',
    publisher:'QHooks laboratory',
    deploymentEnabled:false,
    tags:Object.freeze(['directional fees','scheduled fees','LP fee','wallet and ML-DSA-65','23-word action','local PQ tested']),
    evidence:Object.freeze({
      normal:'25/25 isolated real local-EVM tests passed; inherited tests were not rerun or counted.',
      fixtures:'30 native-provider ML-DSA-65 signatures checked actions, all 23 fields, keys and contexts in the EVM, alongside 23 wallet field mutations.',
      integration:'Timed queue and activation, pending overwrite rejection, 12 matched static-pool swap cells, four protocol-fee boundary cells, four slippage/funding rollback cells and four LP-exit phases passed.',
      mutation:'Removing only the sole PQ call allowed an actual wallet-only pending schedule and nonce update before the unchanged test raised its exact sentinel; 72 other candidate files were unchanged.',
      review:'Lead source, control and execution review completed; not an independent external audit.'
    }),
    provenance:Object.freeze([
      Object.freeze({kind:'normal',path:'receipts/Q54-evm-2026-10-10T10-13-18-217Z.json',sha256:'f415b2d2dddc69dcf604545750e6fe095665dbc5d610bc6928f2f978daf46398'}),
      Object.freeze({kind:'remove-pq-mutation',path:'receipts/Q54-pq-removal-2026-10-10T10-16-35-555Z.json',sha256:'b324c0b349a7995a83314635838c2cd80d7060d47be375dc39b97a77eb220163'})
    ])
  })
]);

export const labCatalog = Object.freeze([
  {
    id: "qvault-native",
    name: "QVault Native Prototype",
    kind: "Supporting component",
    category: "Protected vault",
    status: "Prototype",
    publisher: "QHooks laboratory",
    summary: "A native-asset vault prototype for studying withdrawal gates and two-authority approvals.",
    detail: "Prototype work in progress until independently verified. This local listing is illustrative only; it is not a deployment or an offer to transact.",
    tags: ["withdrawal", "authorization", "prototype"],
    evidence: {
      provenance: "Publisher self-description: QHooks laboratory (illustrative listing).",
      tests: "Verified native-ETH prototype tests passed in a local VM (31/31). This is a development signal, not an audit or security guarantee.",
      enforcement: "The prototype's local-VM enforcement uses a mocked PQ verifier, not ML-DSA. It is not deployed or connected to this webpage.",
      review: "A separate fresh-context source review was completed for this prototype; it was not an external audit."
    }
  },
  {
    id: "qcreator-fee-hook",
    name: "QCreatorFeeHook / Creator Revenue",
    kind: "Conventional hook prototype",
    category: "Revenue hook",
    status: "Prototype · VM tested",
    publisher: "QHooks laboratory",
    summary: "Accrues a fixed creator fee from executed swaps.",
    detail: "The original P05 local-core prototype mints ERC-6909 claims to a fixed destination and remains separate conventional lab evidence. The newly admitted Q11/Q12 bundle integrates this component with a PQ claim vault, but this lab item is not separately counted as quantum, deployed or connected to this webpage.",
    tags: ["creator", "revenue", "fees", "erc-6909", "prototype", "vm tested"],
    evidence: {
      provenance: "Publisher self-description: QHooks laboratory (illustrative listing).",
      tests: "The shared P05 isolated local-VM campaign passed 33/33: 15 creator-hook tests for this hook and 18 tests shared by the two policy hooks.",
      enforcement: "The P05 source targets a fixed ERC-6909 claim destination in its original local-core fixture. The later Q11/Q12 bundle supplies the separately tested PQ claim-vault integration; this conventional swap callback itself does not perform PQ verification.",
      review: "Fresh-context source review accepted the self-vault test repair; this was not an external audit."
    }
  },
  {
    id: "qtrading-window-hook",
    name: "QTradingWindowHook / Trading Window",
    kind: "Conventional hook prototype",
    category: "Trading policy",
    status: "Prototype · VM tested",
    publisher: "QHooks laboratory",
    summary: "Sets an immutable, disclosed trading window.",
    detail: "The intended swap interval is half-open: it includes its opening time and excludes its closing time. Liquidity-provider exits remain unaffected. This hook is not deployed and does not perform PQ verification.",
    tags: ["trading", "window", "immutable", "half-open", "liquidity exits", "prototype", "vm tested"],
    evidence: {
      provenance: "Publisher self-description: QHooks laboratory (illustrative listing).",
      tests: "The shared P05 isolated local-VM campaign passed 33/33: 18 policy tests shared across QTradingWindowHook and QTradeSizeHook, plus 15 creator-hook tests. This is not 18 tests per policy hook.",
      enforcement: "The source targets an immutable half-open interval [opensAt, closesAt) for swaps; it does not block LP exits and does not perform PQ verification.",
      review: "Fresh-context source review accepted the shared policy test repair; this was not an external audit."
    }
  },
  {
    id: "qtrade-size-hook",
    name: "QTradeSizeHook / Trade Size",
    kind: "Conventional hook prototype",
    category: "Trade limits",
    status: "Prototype · VM tested",
    publisher: "QHooks laboratory",
    summary: "Caps each trade’s requested token amount in raw units.",
    detail: "The intended cap applies to each requested specified-currency amount in raw token units. It is not a dollar limit or anti-whale guarantee, and users can split activity across trades. This hook is not deployed and does not perform PQ verification.",
    tags: ["trade size", "raw units", "specified currency", "cap", "split trades", "prototype", "vm tested"],
    evidence: {
      provenance: "Publisher self-description: QHooks laboratory (illustrative listing).",
      tests: "The shared P05 isolated local-VM campaign passed 33/33: 18 policy tests shared across QTradingWindowHook and QTradeSizeHook, plus 15 creator-hook tests. This is not 18 tests per policy hook.",
      enforcement: "The source targets each requested specified-currency raw amount; it is not dollar-denominated, does not prevent split trades, and does not perform PQ verification.",
      review: "Fresh-context source review accepted the partial-fill control repair; this was not an external audit."
    }
  },
  {
    id: "qrevenue-split-hook",
    name: "QRevenueSplitHook / Revenue Split",
    kind: "Conventional hook prototype",
    category: "Revenue hook",
    status: "Prototype · VM tested",
    publisher: "QHooks laboratory",
    summary: "Splits swap fees among fixed collaborators.",
    detail: "The local-core prototype mints ERC-6909 claims to two through eight fixed, unique recipients without calling them. The final ordered recipient receives the exact remainder and can receive at most recipientCount - 1 extra raw units above its own proportional floor—at most seven here. Recipient custody is not established PQ custody. This hook is not deployed or wallet-connected.",
    tags: ["revenue", "split", "collaborators", "erc-6909", "remainder", "prototype", "vm tested"],
    evidence: {
      provenance: "Publisher self-description: QHooks laboratory (illustrative listing).",
      tests: "The separate P06 isolated local-VM campaign passed 41/41: 21 Revenue Split tests for this hook, 10 Price Band tests, and 10 Volume Budget tests against the pinned local core.",
      enforcement: "The source conserves the actual executed unspecified-currency fee across fixed recipient claims with no residual hook-held claim or recipient external call. It does not perform PQ verification.",
      review: "Agent source review accepted the bounded remainder and edge-case evidence; this was not an external audit."
    }
  },
  {
    id: "qprice-band-hook",
    name: "QPriceBandHook / Price Band",
    kind: "Conventional hook prototype",
    category: "Trading policy",
    status: "Prototype · VM tested",
    publisher: "QHooks laboratory",
    summary: "Sets disclosed price bounds within a pool.",
    detail: "The local-core prototype checks the actual initialization price and final pool slot0 sqrt price against inclusive bounds. It is not a USD oracle, stable-value promise, manipulation defense, or LP-principal protection. LP exits remain unaffected. This hook is not deployed or wallet-connected.",
    tags: ["price band", "sqrt price", "slot0", "inclusive", "liquidity exits", "prototype", "vm tested"],
    evidence: {
      provenance: "Publisher self-description: QHooks laboratory (illustrative listing).",
      tests: "The separate P06 isolated local-VM campaign passed 41/41: 10 Price Band tests for this hook, 21 Revenue Split tests, and 10 Volume Budget tests against the pinned local core.",
      enforcement: "The source reads real pool slot0 after swaps and enforces inclusive pool-local bounds. It does not use an external oracle. It does not perform PQ verification.",
      review: "Agent source review accepted the full pool-binding and boundary evidence; this was not an external audit."
    }
  },
  {
    id: "qvolume-budget-hook",
    name: "QVolumeBudgetHook / Volume Budget",
    kind: "Conventional hook prototype",
    category: "Volume policy",
    status: "Prototype · VM tested",
    publisher: "QHooks laboratory",
    summary: "Limits executed trading volume across a pool.",
    detail: "The local-core prototype counts both actual executed core raw-currency amounts in fixed Unix-aligned periods with no carryover. It is not a per-user quota: the pool-wide budget can be exhausted deliberately, boundary bursts remain possible, and stored counters refresh lazily on a successful swap. LP exits remain available. This hook is not deployed or wallet-connected.",
    tags: ["volume", "budget", "raw units", "pool-wide", "unix periods", "no carryover", "prototype", "vm tested"],
    evidence: {
      provenance: "Publisher self-description: QHooks laboratory (illustrative listing).",
      tests: "The separate P06 isolated local-VM campaign passed 41/41: 10 Volume Budget tests for this hook, 21 Revenue Split tests, and 10 Price Band tests against the pinned local core.",
      enforcement: "The source meters both actual executed core currency deltas in raw units and refreshes stored period counters lazily on successful swaps. It does not perform PQ verification.",
      review: "Agent source review accepted the quota-exhaustion, rollback, and period-boundary evidence; this was not an external audit."
    }
  },
  {
    id: "qrelease-registry",
    name: "QRelease Registry",
    kind: "Supporting component",
    category: "Release tooling",
    status: "Planned",
    publisher: "QHooks laboratory",
    summary: "A planned registry concept for release provenance and review checkpoints.",
    detail: "Planned concept, not a registry service. Any release history or verification shown in this preview is illustrative.",
    tags: ["provenance", "releases", "planned"],
    evidence: {
      provenance: "Publisher self-description: QHooks laboratory (illustrative listing).",
      tests: "No published automated-test evidence for this planned item.",
      enforcement: "No onchain enforcement is represented or available.",
      review: "Independent review: not started."
    }
  }
]);

export const catalog = quantumCatalog;

export const releaseTarget = Object.freeze({
  prelaunchStretchQuantumHooks: 100,
  qualifyingQuantumHooks: 8,
  launchReady: 0,
  conventionalLabHooks: 6
});

export const releaseRoadmap = Object.freeze([
  Object.freeze({ milestone: "Canonical complete-action codec", status: "Local withdrawal scope tested", detail: "The fixed creator-fee claim-withdrawal action is contract-reconstructed across its fourteen fields; this is not a generic codec for every future action." }),
  Object.freeze({ milestone: "Standard-profile onchain ML-DSA-65 verifier feasibility", status: "Local feasibility tested", detail: "Frozen public-vector and integration campaigns exercised the artifact-pinned ML-DSA-65 verifier locally; helper provenance and production selection remain open." }),
  Object.freeze({ milestone: "Dual-authorized creator-fee vault bundle", status: "Local PQ tested", detail: "Creator-fee claim withdrawals require wallet and independent ML-DSA-65 authorization over the same complete action; swaps do not run PQ verification." }),
  Object.freeze({ milestone: "Distinct quantum application bundles", status: "8 local PQ tested", detail: "Eight distinct local bundles now qualify, including Circuit Recovery, QGraduation, Dynamic Fees and Directional Fees after normal integration and exact PQ-removal controls. The 24-candidate expansion remains a backlog, not 24 built hooks; each future release still needs distinct protected-action evidence." })
]);

export const categories = Object.freeze(["All", ...new Set(labCatalog.map((item) => item.category))]);
export const statuses = Object.freeze(["All", ...new Set(labCatalog.map((item) => item.status))]);

export function filterCatalog(items = catalog, { query = "", category = "All", status = "All" } = {}) {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    const searchable = [item.name, item.category, item.status, item.summary, ...item.tags].join(" ").toLowerCase();
    return (!needle || searchable.includes(needle))
      && (category === "All" || item.category === category)
      && (status === "All" || item.status === status);
  });
}

export function simulateWithdrawal({ walletApproval = false, coAuthorization = false } = {}) {
  if (!walletApproval && !coAuthorization) return { outcome: "rejected", reason: "Simulated withdrawal rejected: both the wallet authorization and independent co-authorization are missing." };
  if (walletApproval && !coAuthorization) return { outcome: "rejected", reason: "Wallet-only attempt rejected: the independent co-authorization is required." };
  if (!walletApproval && coAuthorization) return { outcome: "rejected", reason: "Co-authorization-only attempt rejected: the wallet authorization is required." };
  return { outcome: "eligible", reason: "Both illustrative authorizations are present. This UI does not create or submit a transaction." };
}
