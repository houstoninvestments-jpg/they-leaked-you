#!/usr/bin/env python3
"""Scan staged blobs, working source and optional entire history; never print matched values."""
import pathlib,re,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[1]
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
patterns=[
 ('email',r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'),
 ('private key',r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 ('provider token',r'(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|GOCSPX-[A-Za-z0-9_-]{20,}|1//[A-Za-z0-9_-]{30,})'),
 ('JWT',r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'),
 ('credential assignment',r'''(?i)(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|cloudflare[_-]?(?:api[_-]?)?token|cf_api_token)\s*["']?\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']'''),
]
forbidden=re.compile(r'(?i)(?:^|/)(?:\.env[^/]*|credentials\.json|client_secret[^/]*\.json|(?:auth|tokens?|secrets)\.json|cookies\.txt|[^/]+\.(?:pem|key|p12))$')
failed=set();count=0
def inspect(name,data,label,allow_attribution_email=False):
 global count
 count+=1
 if forbidden.search(name):failed.add((label+':'+name,'credential file'))
 try:text=data.decode('utf-8')
 except UnicodeDecodeError:return
 for kind,pat in patterns:
  if kind=='email' and allow_attribution_email:continue
  if re.search(pat,text):failed.add((label+':'+name,kind))
# Index is authoritative: a staged secret cannot hide behind a cleaned working copy.
for name in git('ls-files','--cached','-z').decode().split('\0'):
 if name:inspect(name,git('show',':'+name),'index')
for name in git('ls-files','--cached','--others','--exclude-standard','-z').decode().split('\0'):
 if name and (root/name).is_file():inspect(name,(root/name).read_bytes(),'working')
if '--history' in sys.argv:
 for commit in git('rev-list','--all').decode().split():
  # Owner permits normal GitHub attribution only, not addresses in files or messages.
  inspect('attribution',git('show','-s','--format=%ae%n%ce',commit),commit,allow_attribution_email=True)
  inspect('author-names',git('show','-s','--format=%an%n%cn',commit),commit)
  inspect('commit-message',git('show','-s','--format=%B',commit),commit)
  for name in git('ls-tree','-r','--name-only','-z',commit).decode().split('\0'):
   if name:inspect(name,git('show',commit+':'+name),commit)
for name,kind in sorted(failed):print(f'FAIL {kind}: {name}')
print(f'Scanned {count} blobs/paths; {len(failed)} findings')
sys.exit(bool(failed))
