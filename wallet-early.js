// Classic script loaded right after the wallet dialog markup, ahead of the wallet modules: a tap on Connect wallet
// opens the dialog at once even while the modules are still arriving. Once they are ready they handle every tap.
(function () {
  function open(e) {
    var id = e.currentTarget.id;
    if (window.__qhcReady && (id !== 'qxt-connect' || window.__qxtReady)) return;
    var d = document.getElementById('qhc-dialog');
    if (d && !d.open && d.showModal) { d.dataset.qxOverlayOpener = id; d.showModal(); }
  }
  ['qhc-trigger', 'qxt-connect'].forEach(function (id) { var b = document.getElementById(id); if (b) b.addEventListener('click', open); });
})();
// Resolve registered partner links through the server-owned registry. Existing
// first-arrival wallet storage is preserved; this never changes an on-chain binding.
(function () {
  try {
    var refs = new URLSearchParams(location.search).getAll('ref');
    if (refs.length !== 1) return;
    var saved = null; try {saved=localStorage.getItem('qhooks:ref');}catch(e){}
    if(/^0x[0-9a-f]{40}$/.test(saved||'')&&!/^0x0{40}$/.test(saved))return;
    var ref = refs[0].toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(ref) && !/^0x0{40}$/.test(ref)) {window.__qhooksPartnerReferral={status:'ready',referrer:ref};try{localStorage.setItem('qhooks:ref',ref);}catch(e){}return;}
    if (ref.length > 32 || !/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(ref)) return;
    var state = window.__qhooksPartnerReferral = {slug:ref,status:'pending'};
    window.__qhooksPartnerReferralReady = fetch('/api/partner-referral?ref=' + encodeURIComponent(ref), {credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)})
      .then(async function(response) {
        if (response.status === 404) {state.status='unregistered';return;}
        if (!response.ok) throw Error();
        var data = await response.json();
        if(data.partner !== ref || !/^0x[0-9a-f]{40}$/.test(data.referrer) || /^0x0{40}$/.test(data.referrer) || !Number.isSafeInteger(data.revision) || data.revision < 1) throw Error();
        state.referrer=data.referrer;
        try{var old=localStorage.getItem('qhooks:ref');if(!/^0x[0-9a-f]{40}$/.test(old||'')||/^0x0{40}$/.test(old))localStorage.setItem('qhooks:ref',data.referrer);}catch(e){}
        state.status='ready';
      }).catch(function(){state.status='unavailable';});
  } catch (e) {}
})();
// Installed app (Add to Home Screen): register the offline-page worker. Not inside Telegram, which has its own shell.
(function () {
  try {
    if ('serviceWorker' in navigator && location.protocol === 'https:' && document.documentElement.getAttribute('data-tg') !== '1') navigator.serviceWorker.register('/sw.js');
  } catch (e) {}
})();
