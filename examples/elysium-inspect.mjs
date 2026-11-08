// Run in a browser module or Node18+: public reads only, no wallet or API key.
import {createElysiumClient} from '../sdk/elysium.mjs';
export async function inspectElysium(venueId,{signal}={}){
 const qhooks=createElysiumClient();
 const [network,venues]=await Promise.all([qhooks.network({signal}),qhooks.venues({signal})]);
 const venue=venues.venues.find(item=>item.id===venueId);if(!venue)throw Error('Choose a venue returned by qhooks.venues().');
 const pools=await qhooks.pools(venue.id,{signal});
 return {network,venue,pools:pools.pools,window:pools.window,coverage:pools.coverage};
}
// Live execution, read availability and parent settlement are separate states.
// Inspect returned source/time/coverage. Never infer launch origin from a shared manager.
