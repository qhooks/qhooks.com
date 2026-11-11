import {normalizeTokenProfile} from './qx-token-profile-core.mjs';
export function tokenProfilePresentation(body){const profile=normalizeTokenProfile(body.profile||{});return {profile,banner:profile.banner||body.launchBanner||''};}
export function needsCreatorArtwork(profile,creator,connected){return !!creator&&!!connected&&creator.toLowerCase()===connected.toLowerCase()&&!(profile?.image&&profile?.banner);}
