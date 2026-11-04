# QHooks module review checklist

Every module submitted to the builder marketplace goes through this list before the QHooks Safe lists it on chain
(`QModuleRegistry.list`). A module that fails any **must** item is sent back with the item named.

Reviewer: record the submission id, the reviewed commit, the creation-code hash and each item's result in the
submission's review note (`POST /api/market/modules/review/<id>`), then add the entry to
`qhooks-blocks-20261102/market-modules.json` and run `build-market.py` to prepare the Safe transaction.

## 1. Code matches the submission (must)
- [ ] The source at the submitted commit compiles with solc 0.8.26, `via_ir`, optimizer 200 runs, `cancun`, `bytecode_hash = none`.
- [ ] Its creation code is byte-for-byte the submitted creation code; its keccak256 is the submission's creation hash.
- [ ] The creation code is at most 49,152 bytes and the runtime at most 24,576 bytes.

## 2. Built on the template (must)
- [ ] The contract inherits `QModuleBase` unchanged (same file, same hash as the published one).
- [ ] Constructor is exactly `(address token, address quote, address builder, uint16 builderBps)` and passes all four to `QModuleBase`.
- [ ] `kind()` returns a short lowercase id; a new kind comes with a panel renderer or uses the generic panel.
- [ ] No owner, admin, upgrade, `selfdestruct`, `delegatecall` or arbitrary external call. No functions that move funds to any address chosen by a caller other than the caller's own entitlement.

## 3. Builder earnings are only what the template allows (must)
- [ ] Every state-changing function brings income up to date (`_intake` / `_syncAll`) before it moves or pulls funds.
- [ ] `_reserved(i)` counts every user deposit and everything already booked and unpaid in currency `i`. A deposit that is
      not reserved would be counted as income and part of it would be paid to the builder: test this explicitly.
- [ ] The module never writes `builderOwed`, `income` or `builderPaid`, and never pays the builder except through `claimBuilder`.
- [ ] `builderBps` is at most 1,000 (10%). The listing's builder and share equal the constructor arguments the site will use.

## 4. Users' funds (must)
- [ ] Deposits can always be withdrawn by their owner (after a stated, bounded wait at most).
- [ ] Sum of everything paid out ≤ everything received, in both currencies, in every path (fuzz test required).
- [ ] Reentrancy: every external entry point that moves funds is `guarded`, or the reviewer documents why not.
- [ ] Fee-on-transfer and rebasing tokens: the module uses `_pull` (counts what arrived) and states what happens if a
      balance shrinks.
- [ ] Rounding never lets a user take more than their share; dust stays in the module.

## 5. Fairness and manipulation (must)
- [ ] Payouts cannot be captured by depositing around a launch's `release()` in one transaction (stream, time weight,
      or round cut-off).
- [ ] Any randomness, price or time dependence is written down with who could influence it and by how much.
- [ ] Unbounded loops: none over user-controlled lists in functions others must call.

## 6. Tests (must)
- [ ] Foundry tests in the submission run green: unit tests for each function, at least one fuzz test of the payout
      invariant, and one test with a real `QLaunchBlocks` launch paying the module (`test/Market.t.sol` `launchPaying`).
- [ ] Reviewer reruns them, plus the marketplace suite, at `--fuzz-runs 2000`.

## 7. Copy and listing (must)
- [ ] Name, summary and detail say plainly what holders get, what they risk and any wait; no promises of returns.
- [ ] No third-party trademarks or impersonation; builder name is the builder's own.
- [ ] Builder address is a wallet or Safe the builder controls (signed message or a transaction from it).

## 8. After listing
- [ ] Fork journey through the real pages: launch with the module, trade, pay out, module panel, builder paid.
- [ ] `RELEASE.md` entry and the audit `SCOPE.md` list updated.
- [ ] If a problem is found later: the Safe pauses the entry (`setStatus(id, Paused)`). Existing launches keep paying the
      module (it has no owner); the module's panel shows the pause and the site warns new holders.
