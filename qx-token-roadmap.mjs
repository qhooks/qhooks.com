import '/qx-holder-min.mjs'; // holder cashback threshold from chain
import '/qx-ca.mjs';
import '/qx-buybacks.mjs';
// Roadmap (DRAFT): crosshair + tooltip on the unlock chart. The schedule is also in the table under the chart.
const tip = document.querySelector('.rm-tip');
for (const svg of document.querySelectorAll('.rm-chart')) if (tip) {
  const names = svg.dataset.series.split(','), slots = svg.dataset.slots.split(',');
  const pts = Object.fromEntries(svg.dataset.points.split(';').map(r => { const [m, v] = r.split(':'); return [m, v.split(',').map(Number)]; }));
  const cross = svg.querySelector('.rm-cross'), wrap = svg.parentElement;
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, '') + 'M' : n.toLocaleString();
  const show = rect => {
    const m = rect.dataset.m, v = pts[m], cx = +rect.getAttribute('x') + rect.getAttribute('width') / 2;
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    const row = (k, n, val) => { const d = document.createElement('div'); const a = document.createElement('span'), b = document.createElement('span'); const i = document.createElement('i'); i.className = 'rm-sw rm-s' + k; a.append(i, n); b.textContent = fmt(val); d.append(a, b); return d; };
    const head = document.createElement('b'); head.textContent = m === '0' ? 'At launch' : 'Month ' + m + ' after launch';
    const tot = row('', 'Unlocked, at most', v.reduce((s, x) => s + x, 0)); tot.className = 'rm-tot'; tot.querySelector('i').remove();
    tip.replaceChildren(head, ...v.map((val, i) => row(slots[i], names[i], val)).reverse(), tot);
    tip.hidden = false;
    const box = svg.getBoundingClientRect(), scale = box.width / svg.viewBox.baseVal.width, px = cx * scale;
    const w = tip.offsetWidth, left = px + 14 + w > box.width ? px - 14 - w : px + 14;
    tip.style.left = Math.max(0, left) + 'px';
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
  svg.querySelectorAll('.rm-hit').forEach(r => { r.addEventListener('pointerenter', () => show(r)); r.addEventListener('click', () => show(r)); });
  svg.addEventListener('pointerleave', hide);
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
}
