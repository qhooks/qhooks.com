#!/usr/bin/env python3
"""Candidate tracked-source guard. Reports file/rule only; never matching values."""
from pathlib import Path
import argparse,re,subprocess,json
RULES={'private-key':rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----','github-token':rb'(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})','live-secret':rb'sk_live_[A-Za-z0-9]{16,}','telegram-bot-token':rb'bot[0-9]{8,}:[A-Za-z0-9_-]{30,}','alchemy-key-url':rb'alchemy\.com/v2/[A-Za-z0-9_-]{16,}'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root',type=Path);a=p.parse_args();root=a.root.resolve();names=subprocess.check_output(['git','-C',str(root),'ls-files','-z']).decode().split('\0');hits=[];count=0
 for n in names:
  if not n:continue
  f=root/n
  if f.is_symlink():hits.append({'path':n,'rule':'symlink-review'});continue
  if not f.is_file():continue
  if f.name.startswith('.env') or f.suffix in ['.key','.pem','.p12','.pfx']:hits.append({'path':n,'rule':'sensitive-path'});continue
  count+=1;matched=set();tail=b''
  with f.open('rb') as stream:
   for chunk in iter(lambda:stream.read(1048576),b''):
    data=tail+chunk
    for label,pattern in RULES.items():
     if re.search(pattern,data):matched.add(label)
    tail=data[-4096:]
  hits.extend({'path':n,'rule':label} for label in sorted(matched))
 print(json.dumps({'trackedFiles':count,'hits':hits,'valuesPrinted':False,'scope':'working-tree tracked files; not Git history or external secret stores'}));raise SystemExit(bool(hits))
