// Only our own actionable sentences may reach launch-page status boxes.
const safe=new Set([
 'Waiting for the new QHooks treasury wallet.','Solana launches open shortly.','Connect your Solana wallet.','Connect a Solana wallet first.','Connect the QHooks treasury wallet.','Connect this coin’s creator wallet.','Connect the wallet for this transaction.',
 'The wallet changed. Review again.','Wallet changed. Review again.','Use Solana mainnet.',
 'Review this transaction again before signing.','This wallet cannot sign this transaction. Use another Solana wallet.',
 'Use a name of 1–32 UTF-8 bytes, without angle brackets.','Use 1–10 letters or digits for the ticker.','Add a token image.','Enter SOL with up to 9 decimal places.',
 'Keep the description to 1,000 characters.','Choose a smaller profile picture.','Choose a PNG, JPEG or WebP image.','The image could not be read.','The image format does not match its file.','The token profile could not be read.',
 'Use your X profile link or @handle.','Use a t.me Telegram link.','Use a discord.gg or discord.com invite.',
 'Simulation failed. Nothing was sent. Check your SOL balance and retry.','Network cost unavailable. Refresh review.','Rent estimate unavailable. Refresh review.',
 'This curve has not reached 85 SOL or has already graduated.',
 'Transaction failed on chain. Open the transaction to inspect it.',
 'The transaction expired without confirmation. Keep its signature and check before starting again.',
 'Confirmation is pending. Keep the transaction link and check again.',
]);
for(const kind of ['website','x','telegram','discord'])for(const text of ['Enter a valid '+kind+' link.','Use a public HTTPS '+kind+' link.','Enter the full '+kind+' profile or invite link.'])safe.add(text);
export function solLaunchError(error,fallback='Could not prepare your launch. Please try again.'){
 const message=typeof error?.message==='string'?error.message:'';
 if(safe.has(message))return message;
 if(error?.code===4001||/user (?:rejected|denied)|request rejected/i.test(message))return 'Wallet approval cancelled.';
 if(/Expected an object|StructError|failed to fetch|fetch failed|network|429|503|timed? out/i.test(message)||error?.name==='StructError')return 'Could not read Solana data. Please try again.';
 if(/Pool config not found|Quote mint not found|config_mismatch|config_unavailable/.test(message))return 'Launch setup is unavailable. Please try again shortly.';
 if(message==='confirmation_pending')return 'Your launch is still confirming. Check again shortly.';
 if(message==='config_already_set')return 'The launch config is already set. Solana launches are open.';
 if(message==='sol_price_unavailable')return 'SOL price is unavailable. Please try again shortly.';
 if(message==='treasury_not_ready')return 'Waiting for the new QHooks treasury wallet.';
 if(message==='launches_open_shortly')return 'Waiting for the new QHooks treasury wallet.','Solana launches open shortly.';
 if(message==='metadata_already_set'||message==='mint_already_exists')return 'This coin address is already in use. Start a new launch.';
 return fallback;
}
