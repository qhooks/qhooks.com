// Community page: the changelog card appears once the trust layer's /changelog.html is live.
const card = document.getElementById('cx-changelog');
if (card) fetch('/changelog.html', { method: 'HEAD', cache: 'no-store' }).then(r => { if (r.ok) card.hidden = false; }).catch(() => {});
