import {normalizeTokenProfile, profileImage, PROFILE_LIMITS} from './qx-token-profile-core.mjs';

const KEY = 'qhooks:token-profile-draft:v1:';
const empty = () => ({description:'',image:'',banner:'',links:{}});
const clone = value => JSON.parse(JSON.stringify(value));

// Draft links may be unfinished while someone is typing. Publication and export
// use the stricter public-profile validator; drafts only retain known fields.
function editable(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('The profile draft could not be read.');
  const result = empty();
  if (typeof value.description === 'string') result.description = value.description;
  if (result.description.length > PROFILE_LIMITS.description) throw Error('Keep the description to 1,000 characters.');
  for (const kind of ['image','banner']) result[kind] = profileImage(value[kind],kind);
  for (const kind of ['website','x','discord','telegram']) {
    const text = value.links?.[kind];
    if (text != null && (typeof text !== 'string' || text.length > 500)) throw Error('The community link is too long.');
    result.links[kind] = text || '';
  }
  return result;
}

export function createProfileDraftStore({storage = () => localStorage, onChange = () => {}} = {}) {
  const values = new Map(), versions = new Map(), persistence = new Map();
  function get(chain) {
    chain = String(chain);
    if (!values.has(chain)) {
      let value = empty();
      try {
        const text = storage().getItem(KEY+chain);
        if (text) {
          if (text.length > PROFILE_LIMITS.body) throw Error('oversize');
          value = editable(JSON.parse(text));
        }
        persistence.set(chain,true);
      } catch { persistence.set(chain,false); }
      values.set(chain,value);
    }
    return clone(values.get(chain));
  }
  function replace(chain,value) {
    chain = String(chain);
    const next = editable(value), text = JSON.stringify(next);
    values.set(chain,next);
    versions.set(chain,(versions.get(chain)||0)+1);
    let saved = false;
    try { const target=storage(); target.setItem(KEY+chain,text); saved=target.getItem(KEY+chain)===text; } catch {}
    persistence.set(chain,saved);
    onChange({chain,saved});
    return saved;
  }
  return {
    get, replace,
    update(chain,patch) { return replace(chain,{...get(chain),...patch}); },
    version(chain) { return versions.get(String(chain))||0; },
    saved(chain) { get(chain); return persistence.get(String(chain))===true; }
  };
}

export function profileBackup(value,{chain,name='',symbol=''} = {}) {
  if (!/^\d{1,10}$/.test(String(chain))) throw Error('Choose a launch chain first.');
  return JSON.stringify({format:'qhooks-token-profile',version:1,chain:String(chain),token:{name:String(name).slice(0,100),symbol:String(symbol).slice(0,30)},profile:normalizeTokenProfile(value)},null,2);
}

export function readProfileBackup(text,chain) {
  if (typeof text !== 'string' || text.length > PROFILE_LIMITS.body+2048) throw Error('Choose a QHooks profile backup under 700 KB.');
  let value;
  try { value=JSON.parse(text); } catch { throw Error('This file is not a valid profile backup.'); }
  if (value?.format!=='qhooks-token-profile' || value.version!==1) throw Error('Choose a QHooks artwork and socials backup.');
  if (String(value.chain)!==String(chain)) throw Error('This backup belongs to chain '+String(value.chain).slice(0,12)+'. Switch to that chain before restoring it.');
  return normalizeTokenProfile(value.profile);
}
