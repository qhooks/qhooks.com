#!/usr/bin/env python3
"""Recognize only hash-pinned Apache Lightweight Charts bundle attribution."""
import hashlib,json,re,sys
from pathlib import Path
def allowed(root,name):
 root=Path(root).resolve();raw=root/name
 if raw.is_symlink():return False
 file=raw.resolve();relative=file.relative_to(root).as_posix()
 # Root-approved own integration source: two brand mentions are comments, not bundled opaque code.
 # This one exact artifact is separate from the Apache bundle pin policy; path bans remain unconditional.
 if relative=='qx-terminal.mjs':
  return file.stat().st_size==142771 and hashlib.sha256(file.read_bytes()).hexdigest()=='44917480c2f0ac8192d47bd7f6be6306e80fa5be89763ec9bd0c3f46849b92db'
 if not relative.startswith('b/'):return False
 policy=json.loads((root/'.ci/lwc-bundle-allowlist.json').read_text())
 expected=policy['bundles'].get(relative)
 if not expected:return False
 license=root/policy['license']['path']
 if hashlib.sha256(license.read_bytes()).hexdigest()!=policy['license']['sha256']:return False
 text=file.read_text();matches=list(re.finditer('tradingview',text,re.I))
 if len(matches)!=2:return False
 for m in matches:
  url=text[max(0,m.start()-12):m.start()].endswith('https://www.') and text[m.end():].startswith('.com/?utm_medium=lwc-link&utm_campaign=lwc-chart')
  title=text[max(0,m.start()-12):m.start()]=='Charting by '
  if not (url or title):return False
 return hashlib.sha256(file.read_bytes()).hexdigest()==expected
if __name__=='__main__':
 try:ok=allowed(sys.argv[1],sys.argv[2])
 except (OSError,ValueError,KeyError,IndexError):ok=False
 raise SystemExit(0 if ok else 1)
