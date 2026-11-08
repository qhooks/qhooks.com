// A snapshot's size is not the current directory size. Filters must not change global coverage.
export function discoveryCoverage(board, directory = board) {
  const coverage = directory.coverage || board.coverage || {};
  const count = Number.isSafeInteger(directory.total) && directory.total >= 0 ? directory.total : coverage.hookCount;
  return {hooks: count, snapshotHooks: coverage.hookCount, chains: coverage.chainCount, pools: coverage.totalPools, swaps: coverage.totalSwaps,
    snapshotAt: directory.snapshotAt || board.snapshotAt || null, includesTape: Number.isSafeInteger(directory.total), newHooks: Math.max(0, (count || 0) - (coverage.hookCount || 0))};
}
