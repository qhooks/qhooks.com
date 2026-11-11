import {normalizeTokenProfile} from './qx-token-profile-core.mjs';
// Studio's pool package carries no artwork. This required, resumable final step
// must resolve before the runner writes status=done or opens the success screen.
export async function publishRequiredLaunchProfile({chainId,controller,profile,getConnection,fetcher=globalThis.fetch,loadSession=()=>import('./qx-board-session.mjs')}){
 const value=normalizeTokenProfile(profile);
 if(!value.image)throw Error('Add an image for your token.');
 if(!value.banner)throw Error('Add a banner for your token.');
 const sessions=await loadSession(),auth=sessions.createBoardSession({getConnection,fetcher}),connection=auth.capture();
 await connection.check();if(!auth.boardSession())await auth.signIn(connection);
 await connection.check();const headers=auth.authHeaders();
 if(!headers.authorization)throw Error('Sign in with your creator wallet to finish your token.');
 connection.assertCurrent();
 const r=await fetcher('/api/token-profiles/'+chainId+'/'+controller.toLowerCase(),{method:'PUT',headers:{'content-type':'application/json',...headers},body:JSON.stringify(value)});
 if(!r.ok)throw Error('Finish your token: add its icon and banner. Your launch is saved; resume to retry.');
 const saved=await r.json();if(!saved.profile?.image||!saved.profile?.banner)throw Error('Your token artwork did not save. Resume to retry.');
 return {published:true};
}
