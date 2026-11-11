export function sellPortion(balance, percent) {
  if (typeof balance !== 'bigint' || balance < 0n || (!Number.isInteger(percent) || percent < 1 || percent > 100)) throw Error('invalid_sell_portion');
  return balance * BigInt(percent) / 100n;
}
export function positionChart(position, bars, tf, multiplier = 1) {
  const times = new Set(bars.map(b=>b.time));
  return {
    markers:(position?.markers||[]).map(t=>({time:Math.floor(t.at/1000/tf)*tf, position:t.side==='buy'?'belowBar':'aboveBar',
      color:t.side==='buy'?'#38b87c':'#ef625e', shape:t.side==='buy'?'arrowUp':'arrowDown', text:t.side==='buy'?'Buy':'Sell'})).filter(m=>times.has(m.time)),
    entry:position?.quantity>0 && position.averageEntryUsd>0 ? position.averageEntryUsd*multiplier : null,
  };
}
