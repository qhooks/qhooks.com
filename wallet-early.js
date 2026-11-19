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
// Resolve named links through the registry; only the public slug travels between
// documents. The saved wallet remains first-arrival and is never inferred from a slug.
(function () {
  try {
    var walletKey='qhooks:ref', partnerKey='qhooks:partner-ref', lineageKey='qhooks:partner-ref-wallet';
    function address(v) {return typeof v==='string' && /^0x[0-9a-f]{40}$/i.test(v) && !/^0x0{40}$/i.test(v) ? v.toLowerCase() : null;}
    function slug(v) {return typeof v==='string' && v.length<=32 && /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/i.test(v) ? v.toLowerCase() : null;}
    function read(k) {try{return {ok:true,value:localStorage.getItem(k)};}catch(e){return {ok:false,value:null};}}
    function save(k,v) {try{localStorage.setItem(k,v);return true;}catch(e){return false;}}
    function remove(k) {try{localStorage.removeItem(k);}catch(e){}}
    function clearLineage(ref) {
      if (ref && slug(read(partnerKey).value)!==ref) return;
      remove(partnerKey);remove(lineageKey);
    }
    function ready(wallet) {window.__qhooksPartnerReferral={status:'ready',referrer:wallet};}
    var refs=new URLSearchParams(location.search).getAll('ref'), raw=refs.length===1?refs[0]:null;
    var saved=address(read(walletKey).value), pending=slug(read(partnerKey).value);
    var direct=address(raw);
    if (direct) {
      ready(saved||direct);if(!saved)save(walletKey,direct);
      clearLineage();return;
    }
    var requested=slug(raw);
    if (saved && !pending && !requested) {ready(saved);return;}
    // Older clients saved only the wallet. Revalidate a named link even without
    // a companion: the current registry decides whether that wallet matches.
    var ref=saved&&pending?pending:requested||pending;
    if (!ref) return;
    var state=window.__qhooksPartnerReferral={slug:ref,status:'pending'};
    // Synchronous: a fast click may leave this document before fetch settles.
    var markerSaved=save(partnerKey,ref);
    if (!saved) remove(lineageKey);
    function markerCurrent() {
      var marker=read(partnerKey);
      return window.__qhooksPartnerReferral===state && (!marker.ok || slug(marker.value)===ref || (!markerSaved && !slug(marker.value)));
    }
    // Carry only the slug on normal internal links if browser storage is blocked.
    // Native link navigation, modifiers, targets and explicit refs remain intact.
    function carry(event) {
      if (!['pending','ready','unavailable'].includes(state.status) || !state.slug || window.__qhooksPartnerReferral!==state) return;
      if (event.type==='auxclick' && event.button!==1) return;
      var target=event.target, anchor=target && (target.closest?target:target.parentElement);
      anchor=anchor && anchor.closest && anchor.closest('a[href]');
      if (!anchor || anchor.hasAttribute('download')) return;
      var href=anchor.getAttribute('href');
      if (!href || href.charAt(0)==='#') return;
      try {
        var current=new URL(location.href), next=new URL(href,current);
        if (!/^https?:$/.test(next.protocol) || next.origin!==current.origin || next.username || next.password || next.searchParams.has('ref')) return;
        if (/^\/api(?:\/|$)/.test(next.pathname) || /\.[a-z0-9]{1,8}$/i.test(next.pathname)) return;
        if (next.pathname===current.pathname && next.search===current.search && next.hash) return;
        next.searchParams.set('ref',ref);
        anchor.setAttribute('href',next.pathname+next.search+next.hash);
      } catch(e) {}
    }
    if (document.addEventListener) {document.addEventListener('click',carry,true);document.addEventListener('auxclick',carry,true);}
    window.__qhooksPartnerReferralReady=fetch('/api/partner-referral?ref='+encodeURIComponent(ref),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)})
      .then(async function(response) {
        if (response.status===404) {state.status='unregistered';clearLineage(ref);return;}
        if (!response.ok) throw Error();
        var data=await response.json(), wallet=address(data.referrer);
        if(data.partner!==ref || !wallet || !Number.isSafeInteger(data.revision) || data.revision<1)throw Error();
        var old=address(read(walletKey).value);
        if (old && old!==wallet) {
          // Another document or an explicit link won while this lookup waited.
          clearLineage(ref);state.referrer=old;delete state.slug;state.status='ready';return;
        }
        if (!markerCurrent()) throw Error();
        if (!old) save(walletKey,wallet);
        state.referrer=old||wallet;
        // Revalidate this pair next document; it cannot replace first-arrival storage.
        if (slug(read(partnerKey).value)===ref) save(lineageKey,state.referrer);
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
