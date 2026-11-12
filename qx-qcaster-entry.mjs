// The small "Ask" entry into QCaster on /create and /hooks: fills each [data-qc-entry] slot (value = the tab to open).
import {QCASTER} from '/qcaster-name.mjs';
const slots = document.querySelectorAll('[data-qc-entry]');
if (slots.length && !document.querySelector('link[href="/qx-a/pages/qcaster.css"]')) document.head.append(Object.assign(document.createElement('link'), {rel: 'stylesheet', href: '/qx-a/pages/qcaster.css'}));
for (const slot of slots) {
 const tab = ['ask', 'design', 'ideas'].includes(slot.dataset.qcEntry) ? slot.dataset.qcEntry : 'ask';
 const a = Object.assign(document.createElement('a'), {className: 'qc-entry', href: QCASTER.path + '#' + tab, textContent: 'Ask'});
 a.setAttribute('aria-label', 'Ask ' + QCASTER.name + ' (beta)'); a.title = 'Ask ' + QCASTER.name + ' · Beta';
 slot.replaceWith(a);
}
