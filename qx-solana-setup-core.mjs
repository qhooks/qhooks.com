// One-time Solana x402 setup taps (treasury only). Pure builders, testable in Node.
export const SETUP_TREASURY='Coqq8o1uYxrAFggNtLCcUcGZWDUF3aUPkaFEMezCMwHh';
export const SETUP_FEE_PAYER='36XE4PU5xA8EnVjjiLvt9WZR9J2C2mrTdqo3MGSQ7JwN';
export const SETUP_USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SETUP_FUND_LAMPORTS=50000000n; // 0.05 SOL
export const SETUP_MIN_FEE_PAYER_LAMPORTS=10000000n; // 0.01 SOL, the server's readiness floor
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111';
export const sol=v=>{const n=BigInt(v);return (n/1000000000n)+'.'+(n%1000000000n).toString().padStart(9,'0').replace(/0+$/,'').padEnd(2,'0');};
export function requireTreasury(owner){if(owner!==SETUP_TREASURY)throw Error('Connect the treasury wallet '+SETUP_TREASURY+'. Other wallets cannot use this page.');}
export function usdcAccount(PublicKey,owner=SETUP_TREASURY){return PublicKey.findProgramAddressSync([new PublicKey(owner).toBytes(),new PublicKey(TOKEN).toBytes(),new PublicKey(SETUP_USDC).toBytes()],new PublicKey(ATA))[0].toBase58();}
// createAssociatedTokenAccountIdempotent: payer=owner=treasury, mint USDC, classic token program.
export function buildCreateUsdcAccount(r,owner){
 requireTreasury(owner);
 const P=k=>new r.PublicKey(k),tx=new r.Transaction();
 tx.add({programId:P(ATA),keys:[{pubkey:P(owner),isSigner:true,isWritable:true},{pubkey:P(usdcAccount(r.PublicKey,owner)),isSigner:false,isWritable:true},{pubkey:P(owner),isSigner:false,isWritable:false},{pubkey:P(SETUP_USDC),isSigner:false,isWritable:false},{pubkey:P(SYSTEM),isSigner:false,isWritable:false},{pubkey:P(TOKEN),isSigner:false,isWritable:false}],data:Uint8Array.of(1)});
 return tx;
}
export function buildFundFeePayer(r,owner){
 requireTreasury(owner);
 const tx=new r.Transaction();
 tx.add(r.SystemProgram.transfer({fromPubkey:new r.PublicKey(owner),toPubkey:new r.PublicKey(SETUP_FEE_PAYER),lamports:Number(SETUP_FUND_LAMPORTS)}));
 return tx;
}
