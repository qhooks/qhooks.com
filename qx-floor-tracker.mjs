// QHOOKS floor tracker (public, read from chain on load): WETH added from the flywheel (feeder.totalFed) and from
// contributors (floor.totalToBid - totalFed), bid depth now, floor vs price, QHOOKS burned by the floor.
// Mount: <section id="qft-root" hidden></section> + this module. Stays hidden until the QHOOKS floor exists.
import {chainById} from '/chains.mjs';
const root = document.getElementById('qft-root');
const S = {floorTick: '0x38570026', liquidity: '0x1a686502', idleQuote: '0x484dd0e1', totalToBid: '0xce2dd8c5', totalTokenBurned: '0x2221466c', priceTick: '0x4a9f2960', totalFed: '0xdde9e1d9', balanceOf: '0x70a08231'};
const word = h => BigInt(h && h !== '0x' ? h : '0x0'), sword = h => BigInt.asIntN(256, word(h));
const fmt = (v, d = 18, m = 4) => { const s = BigInt(v), b = 10n ** BigInt(d), w = s / b, f = s % b; const fs = f && m ? ('.' + f.toString().padStart(d, '0').slice(0, m)).replace(/\.?0+$/, '') : ''; return w.toLocaleString('en-US') + fs; };
async function main() {
  if (!root) return;
  const art = await fetch('/full-launch/floor-qhooks-v1.json', {cache: 'no-store'}).then(r => r.json());
  const rpc = async (method, params) => { const r = await fetch(chainById(art.chainId).rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})}); const j = await r.json(); if (j.error) throw Error(j.error.message); return j.result; };
  const call = (to, data) => rpc('eth_call', [{to, data}, 'latest']);
  const fl = art.floor.address;
  if ((await rpc('eth_getCode', [fl, 'latest'])) === '0x') return;
const LQ = {wethToFloor: '0x0855abfe', feeWethToFloor: '0xfdcf8c49', qhooksPaired: '0x2c392139', wethPaired: '0x7490d1d2', polLiquidity: '0x1a686502'};
  const codes = await Promise.all(art.feeders.map(f => rpc('eth_getCode', [f.address, 'latest'])));
  const lqLive = art.liquidity && (await rpc('eth_getCode', [art.liquidity.address, 'latest'])) !== '0x';
  const lqv = lqLive ? await Promise.all(['wethToFloor', 'feeWethToFloor', 'qhooksPaired', 'wethPaired', 'polLiquidity'].map(k => call(art.liquidity.address, LQ[k]).then(word))) : [0n, 0n, 0n, 0n, 0n];
  const feeder = art.feeders.find((f, i) => codes[i] !== '0x');
  const [ft, lq, idle, toBid, burned, pt, bal, fed] = await Promise.all([call(fl, S.floorTick), call(fl, S.liquidity), call(fl, S.idleQuote), call(fl, S.totalToBid), call(fl, S.totalTokenBurned),
    call(fl, S.priceTick), call(art.weth, S.balanceOf + fl.slice(2).toLowerCase().padStart(64, '0')), feeder ? call(feeder.address, S.totalFed) : '0x0']);
  const fromFly = word(fed) + lqv[0] + lqv[1], added = word(toBid) + (word(bal) > word(idle) ? word(bal) - word(idle) : 0n);   // + sent but not yet poked
  const contrib = added > fromFly ? added - fromFly : 0n;
  const t = Number(sword(ft)), placed = t !== -8388608, L = Number(word(lq));
  // WETH is currency0 of the QHOOKS pool: the bid's range is [-t, -t + 2000] in pool ticks, wholly WETH while under the price.
  const sa = Math.sqrt(1.0001 ** -t), sb = Math.sqrt(1.0001 ** (-t + 2000)), inRange = placed && L ? L * (sb - sa) / (sa * sb) : 0;
  const depth = BigInt(Math.floor(inRange)) + word(bal);
  const ptick = -Number(sword(pt)), sp = Math.sqrt(1.0001 ** ptick), PL = Number(lqv[4]);
  const polW = PL ? PL * (1 / sp - 1 / Math.sqrt(1.0001 ** 887200)) : 0, polQ = PL ? PL * (sp - Math.sqrt(1.0001 ** -887200)) : 0;
  const cap = tick => { const v = 1.0001 ** tick * 1e9; return (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toPrecision(3)) + ' WETH'; };
  const row = (a, b) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = a; dd.textContent = b; return [dt, dd]; };
  const h = document.createElement('h2'); h.textContent = 'QHOOKS floor';
  const dl = document.createElement('dl'); dl.className = 'qft-facts';
  dl.append(...row('WETH added from the flywheel', fmt(fromFly)), ...row('WETH added by contributors', fmt(contrib)), ...row('Bid depth now', fmt(depth) + ' WETH'),
    ...row('Floor', placed ? cap(t) + ' market cap' : 'Starts after 6 hourly price checks'), ...row('Price now', cap(Number(sword(pt))) + ' market cap'), ...row('QHOOKS burned by the floor', fmt(word(burned), 18, 0)),
    ...(lqLive ? [...row('QHOOKS from buybacks paired into liquidity', fmt(lqv[2], 18, 0)), ...row('Permanent liquidity now', fmt(BigInt(Math.floor(polW)), 18) + ' WETH + ' + fmt(BigInt(Math.floor(polQ)), 18, 0) + ' QHOOKS')] : []));
  const p = document.createElement('p'); p.className = 'qft-note';
  p.append('Floor contract ', Object.assign(document.createElement('a'), {href: (chainById(art.chainId)?.explorer || '') + '/address/' + fl, target: '_blank', rel: 'noopener', textContent: fl.slice(0, 6) + '…' + fl.slice(-4)}));
  root.replaceChildren(h, dl, p); root.hidden = false;
}
main().catch(() => {});
