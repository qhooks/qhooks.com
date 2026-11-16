const COIN=/^[A-Za-z0-9][A-Za-z0-9.-]{0,23}$/;
export function perpsCopyTarget(entry){const coin=entry?.perp;if(typeof coin!=='string'||!COIN.test(coin))return null;return '/perps?'+new URLSearchParams({market:coin,from:'competition'});}
// Selection only. Size, direction, leverage, reviews, wallet setup and order signing stay in the perps ticket.
export function readPerpsMarketIntent(search){const q=new URLSearchParams(search),values=q.getAll('market');return values.length===1&&COIN.test(values[0])?values[0]:null;}
