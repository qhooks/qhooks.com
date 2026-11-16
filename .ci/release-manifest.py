#!/usr/bin/env python3
"""Offline public-asset checksums. No copy, Git mutation, network, publish or deploy."""
from pathlib import Path,PurePosixPath
import argparse,hashlib,json,os
EXCLUDED={'.git','.github','.ci','charting_library','datafeeds','download'}
META={'README.md','.well-known/qhooks-release.json'}
def excluded(n):return n in META or any(p in EXCLUDED or p.startswith('charting_library') for p in PurePosixPath(n).parts)
def paths(root):
 for base,dirs,files in os.walk(root,followlinks=False):
  for d in dirs:
   n=(Path(base)/d).relative_to(root).as_posix()
   if not excluded(n) and (Path(base)/d).is_symlink():raise ValueError('Symlink refused: '+n)
  dirs[:]=sorted(d for d in dirs if not excluded((Path(base)/d).relative_to(root).as_posix()))
  for f in sorted(files):
   n=(Path(base)/f).relative_to(root).as_posix()
   if not excluded(n):yield n

def checked(root,n):
 p=PurePosixPath(n)
 if p.is_absolute() or '..' in p.parts or not n or excluded(n):raise ValueError('Invalid/excluded manifest path: '+n)
 target=root.resolve()
 for part in p.parts:
  target=target/part
  if target.is_symlink():raise ValueError('Symlink refused: '+n)
 if not target.is_file():raise ValueError('Missing file: '+n)
 return target

def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def build(root,version,selected=None):
 names=sorted(set(selected if selected is not None else paths(root)));files={}
 for n in names:
  p=checked(root,n);files[n]={'sha256':sha(p),'bytes':p.stat().st_size}
 payload={'version':1,'releaseId':version,'scope':'subset' if selected is not None else 'full-static-public-assets','algorithm':'sha256','excludedDirectories':sorted(EXCLUDED),'excludedMetadata':sorted(META),'files':files}
 payload['contentDigest']=hashlib.sha256(json.dumps(files,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 return payload

def verify(root,manifest,require_full=True):
 if manifest.get('version')!=1 or manifest.get('algorithm')!='sha256' or manifest.get('scope') not in ['subset','full-static-public-assets']:raise ValueError('Unsupported manifest schema')
 if require_full and manifest['scope']!='full-static-public-assets':raise ValueError('A subset manifest cannot satisfy the release gate')
 if manifest.get('excludedDirectories')!=sorted(EXCLUDED) or manifest.get('excludedMetadata')!=sorted(META):raise ValueError('Exclusion policy differs')
 observed=build(root,manifest['releaseId'],list(manifest['files']))
 if observed['files']!=manifest['files'] or observed['contentDigest']!=manifest['contentDigest']:raise ValueError('Public asset bytes differ from source manifest')
 if manifest['scope']=='full-static-public-assets' and set(paths(root))!=set(manifest['files']):raise ValueError('Added/removed files differ from full manifest')
 return {'pass':True,'scope':manifest['scope'],'files':len(manifest['files']),'releaseId':manifest['releaseId'],'contentDigest':manifest['contentDigest']}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['build','verify']);p.add_argument('--root',required=True,type=Path);p.add_argument('--manifest',required=True,type=Path);p.add_argument('--release');p.add_argument('--paths',type=Path);p.add_argument('--allow-subset',action='store_true');a=p.parse_args();root=a.root.resolve()
 try:
  if a.mode=='build':
   if not a.release:raise ValueError('--release required')
   m=build(root,a.release,json.loads(a.paths.read_text()) if a.paths else None);a.manifest.write_text(json.dumps(m,indent=2)+'\n');print(json.dumps({'scope':m['scope'],'files':len(m['files']),'digest':m['contentDigest']}))
  else:
   m=json.loads(a.manifest.read_text())
   if a.release and m['releaseId']!=a.release:raise ValueError('Wrong release ID')
   print(json.dumps(verify(root,m,not a.allow_subset)))
 except (ValueError,OSError,KeyError) as e:raise SystemExit(str(e))
