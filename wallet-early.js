// Classic script loaded right after the wallet dialog markup, ahead of the wallet modules: a tap on Connect wallet
// opens the dialog at once even while the modules are still arriving. Once they are ready they handle every tap.
(function () {
  function open(e) {
    var id = e.currentTarget.id;
    if (window.__qhcReady && (id !== 'qxt-connect' || window.__qxtReady)) return;
    var d = document.getElementById('qhc-dialog');
    if (d && !d.open && d.showModal) d.showModal();
  }
  ['qhc-trigger', 'qxt-connect'].forEach(function (id) { var b = document.getElementById(id); if (b) b.addEventListener('click', open); });
})();
// Referral links (?ref=0x…): the first referrer a visitor arrives with is remembered and sent with their terminal
// trades, where the fee router fixes it for good on their first trade.
(function () {
  try {
    var m = /[?&]ref=(0x[0-9a-fA-F]{40})(?:&|$)/.exec(location.search);
    if (m && !localStorage.getItem('qhooks:ref')) localStorage.setItem('qhooks:ref', m[1].toLowerCase());
  } catch (e) {}
})();
// Installed app (Add to Home Screen): register the offline-page worker. Not inside Telegram, which has its own shell.
(function () {
  try {
    if ('serviceWorker' in navigator && location.protocol === 'https:' && document.documentElement.getAttribute('data-tg') !== '1') navigator.serviceWorker.register('/sw.js');
  } catch (e) {}
})();
