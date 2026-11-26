// Board error wording, shared by board.html (qx-board.mjs) and the in-place call sheet (qx-call-post.mjs).
// Moved verbatim out of qx-board.mjs (2026-11-26, postcall) so both say exactly the same thing.
export const BOARD_ERRORS = Object.freeze({
  sign_in: 'Sign in again to post: your board session ended.', gate: 'This board asks posters to hold a minimum of the token.', blocked: 'This wallet can’t post on QHooks boards.',
  empty: 'Write something first.', too_long: 'That’s over 1000 characters.', too_many_lines: 'That’s over 20 lines.', too_many_links: 'Two links per post at most.',
  links_only: 'Add a few words to go with the link.', duplicate: 'You posted the same words recently.', slow_down: 'Slow down a little', board_busy: 'This board is busy. Try again in a minute.',
  creator_only: 'Only the launch’s creator can do that.', reply_depth: 'Reply to the first post in the thread.', no_such_post: 'That post is gone.', pin_limit: 'Three pinned posts at most. Unpin one first.',
  invalid_min: 'Enter a positive amount, like 1000 or 0.5.', chain_unavailable: 'Couldn’t read balances from the chain just now. Try again shortly.', own_post: 'You can’t report your own post.',
  platform_hidden: 'QHooks moderation hid this post; it can’t be restored here.', not_listed: 'This launch isn’t listed on QHooks.', rate_limited: 'Too many sign-ins from here. Try again later.',
  invalid_signature: 'The signature didn’t match this wallet.', not_the_wallet: 'Sign with the wallet that is signed in here.', message_expired: 'That signing request expired. Try again.', nonce_used: 'That sign-in was already used. Try again.',
  wallet_address: 'Use only this launch’s token, controller or your own wallet address.', contact_bait: 'Keep contact requests and phone numbers off the board.',
  scam_bait: 'Wallet-secret requests and claim offers aren’t allowed.', slur: 'Those words aren’t allowed on the board.', chain: 'Couldn’t read your holding just now. You can read the board; try posting again shortly.',
  call_open: 'You already have a call on this launch from the past 7 days.', no_price: 'This launch needs a recent trade before you can call it.',
  unknown_token: 'No token data was found for that address.', invalid_address:'Check the full token contract and selected chain.',use_launch_board: 'This token has a QHooks launch board. Open its launch board to post.',
  thesis_mismatch: 'The thesis changed after signing. Sign the call again.', hash_mismatch: 'The thesis changed after signing. Sign the call again.', call_limit: 'Five calls per wallet per day. Try again tomorrow.'
});
// Token boards (kind 'token') word three errors for a token instead of a launch.
export const TOKEN_BOARD_ERRORS = Object.freeze({ wallet_address: 'Use only this token’s address or your own wallet address.', call_open: 'You already have a call on this token from the past 7 days.', no_price: 'A current price is needed before you can call this token.' });
export const BOARD_ERROR_FALLBACK = 'Something went wrong. Try again.';
export function boardErrorText(code, kind) { return (kind === 'token' ? TOKEN_BOARD_ERRORS[code] : null) || BOARD_ERRORS[code] || BOARD_ERROR_FALLBACK; }
// The status line text for a failed board request (qx-board.mjs errText).
export function boardErrorMessage(e) { return e?.code === 'slow_down' && e.retryAfter ? BOARD_ERRORS.slow_down + ': try again in ' + Math.ceil(e.retryAfter) + ' s.' : e?.message || String(e); }
