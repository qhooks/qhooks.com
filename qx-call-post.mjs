// Post a scored call in place, with the wallet the page already has (2026-11-26, postcall).
// Used by the app's "Make a call" sheet (/new, served at /). Until now that sheet opened board.html in a new tab,
// and in wallet in-app browsers (Phantom, MetaMask, Telegram) the new tab has no wallet: "Connect wallet to continue".
// Nothing here is new protocol. It is the board's own flow:
//  - qx-board-session.mjs createBoardSession: the free seven-day EIP-191 community session (signIn / authHeaders);
//  - qx-community-intent.mjs publishCommunityCall: entry quote check, the call message, the call signature, publish;
//  - qx-board-errors.mjs: the board's own error wording (call_open, no_price, ...).
// hub is the app's wallet (window.QHWallet): current() -> {family, address, provider} | null, ensure(family) opens the
// connect dialog in this tab and resolves with the connection or null. This module never opens a window or a tab.
import {createBoardSession} from '/qx-board-session.mjs';
import {publishCommunityCall,callLinks,communityTarget} from '/qx-community-intent.mjs';
import {boardErrorText,boardErrorMessage} from '/qx-board-errors.mjs';

export const SESSION_KEY = 'qhooks:board-session:v1';
export const SIGN_IN_STATUS = 'Sign the message in your wallet. It’s free and sends nothing on chain.';
export const CONNECT_STATUS = 'Connect a wallet to post your call. Your note stays here.';
export const CANCELLED = 'Cancelled in your wallet. Your note is still here.';
export {boardErrorMessage};

/** The board a sheet token belongs to: QHooks launches post on their launch board, every other token on its token board. */
export function boardForToken(t) {
  const chainId = String(t?.chainId || '');
  if (t?.kind === 'qhooks' && t.controller) return {...communityTarget({kind: 'launch', chainId, controller: t.controller}), token: String(t.address || '').toLowerCase()};
  return communityTarget({kind: 'token', chainId, address: t?.address});
}

/** A getConnection() for qx-board-session over the hub's current EVM wallet, or null when there is none. */
export async function walletConnection(hub) {
  const c = hub?.current?.();
  if (!c || c.family !== 'evm' || !c.provider?.request || !/^0x[0-9a-fA-F]{40}$/.test(c.address || '')) return null;
  const provider = c.provider, chainId = BigInt(await provider.request({method: 'eth_chainId'})).toString();
  return () => { const n = hub.current?.(); return n && n.provider === provider ? {owner: String(n.address).toLowerCase(), chainId, entry: {provider}} : null; };
}

export function createCallPoster({hub, fetcher = (...a) => globalThis.fetch(...a), storage = () => globalThis.localStorage, now = Date.now} = {}) {
  const forget = () => { try { storage().removeItem(SESSION_KEY); } catch {} };
  /**
   * Post one call. Resolves {state:'posted', post, links} or {state:'no_wallet'} (the connect dialog was closed).
   * Throws the board's own error (err.code = the API's code, err.message = the board's wording).
   * isCurrent: the sheet is still open with the same token and note; checked before every signature, as on the board.
   */
  async function post({board, thesis, status = () => {}, isCurrent = () => true}) {
    let getConnection = await walletConnection(hub);
    if (!getConnection) {
      status(CONNECT_STATUS);
      const c = await hub.ensure('evm');
      if (!c) return {state: 'no_wallet'};
      getConnection = await walletConnection(hub);
      if (!getConnection) return {state: 'no_wallet'};
    }
    const session = createBoardSession({getConnection, fetcher, storage, now});
    const connection = session.capture();
    async function api(path, {method = 'GET', body, auth = false} = {}) {
      const headers = {accept: 'application/json'};
      if (body) headers['content-type'] = 'application/json';
      if (auth || method === 'GET') Object.assign(headers, session.authHeaders());
      const r = await fetcher('/api/community' + path, {method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store'});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { if (j.error === 'sign_in') forget(); const e = new Error(boardErrorText(j.error, board.kind)); e.code = j.error; e.retryAfter = j.retryAfter; throw e; }
      return j;
    }
    const signIn = async () => { status(SIGN_IN_STATUS); await session.signIn(connection); };
    const publish = () => {
      const wallet = session.boardSession()?.wallet;
      return publishCommunityCall({board, thesis, wallet, api, fetcher, status,
        signMessage: text => connection.sign(text),
        current: () => { try { connection.assertCurrent(); return isCurrent() && session.boardSession()?.wallet === wallet; } catch { return false; } }});
    };
    if (!session.boardSession()) await signIn();
    let p;
    // A session the server has ended (sign_in) gets one fresh sign-in, then the call is signed once.
    try { p = await publish(); } catch (e) { if (e.code !== 'sign_in') throw e; await signIn(); p = await publish(); }
    return {state: 'posted', post: p, links: callLinks(board, p)};
  }
  return Object.freeze({post});
}
