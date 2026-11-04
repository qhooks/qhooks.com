// Telegram Mini App launch. Telegram opens the terminal with its launch data in the URL hash (#tgWebAppData=…), which
// would clash with the terminal's own #m=<chain>:<launch>. Before the terminal's modules read the hash: mark the page
// as running in Telegram, keep the launch info for qx-telegram.mjs, take a referral or launch from the start parameter
// (ref_0x… / m_<chain>_0x…), and put back only the #m= part.
(function () {
  try {
    var q = new URLSearchParams(location.search), raw = location.hash.slice(1);
    var hp = /tgWebApp/.test(raw) ? new URLSearchParams(raw) : null;
    if (!(q.get('tg') === '1' || hp || window.TelegramWebviewProxy)) return;
    document.documentElement.setAttribute('data-tg', '1');
    var data = new URLSearchParams((hp && hp.get('tgWebAppData')) || '');
    var start = (hp && hp.get('tgWebAppStartParam')) || q.get('tgWebAppStartParam') || data.get('start_param') || '';
    try { sessionStorage.setItem('qhooks:tg', JSON.stringify({ platform: (hp && hp.get('tgWebAppPlatform')) || '', start: start })); } catch (e) {}
    var ref = /^ref_(0x[0-9a-fA-F]{40})$/.exec(start);
    if (ref) try { if (!localStorage.getItem('qhooks:ref')) localStorage.setItem('qhooks:ref', ref[1].toLowerCase()); } catch (e) {}
    var launch = /^m_(\d+)_(0x[0-9a-fA-F]{40})$/.exec(start);
    if (hp || launch) {
      var keep = hp ? hp.get('m') : null;
      var hash = launch ? '#m=' + launch[1] + ':' + launch[2].toLowerCase() : keep ? '#m=' + keep : '';
      history.replaceState(history.state, '', location.pathname + location.search + hash);
    }
  } catch (e) {}
})();
