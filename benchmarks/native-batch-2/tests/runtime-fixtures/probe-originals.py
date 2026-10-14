#!/usr/bin/env python3
"""Bounded original PE observations on CrossOver; never claim Windows OS coverage."""
import pathlib, subprocess, time, json, hashlib, argparse, os, resource, shutil, re
def cap_output():
 resource.setrlimit(resource.RLIMIT_FSIZE,(1048576,1048576))

BASE=pathlib.Path(__file__).resolve().parents[2]
WINE='/Users/haseeb-mir/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine'
TREE=BASE/'tests/runtime-fixtures/tree'
WORKER_ROOT=BASE/'.runtime-workers'
TOOLS={'fd':BASE/'originals/fd/extracted/fd-v10.5.0-x86_64-pc-windows-msvc/fd.exe','ripgrep':BASE/'originals/ripgrep/extracted/ripgrep-15.2.0-x86_64-pc-windows-msvc/rg.exe','bat':BASE/'originals/bat/extracted/bat-v0.26.1-x86_64-pc-windows-msvc/bat.exe'}
PROBES={'fd':[('version',['--version']),('all',['--color','never']),('extension',['--color','never','-e','txt']),('hidden',['--color','never','--hidden']),('literal',['--color','never','--fixed-strings','alpha']),('case',['--color','never','--case-sensitive','Beta']),('exclude',['--color','never','--exclude','sub'])], 'ripgrep':[('version',['--version']),('search',['--color','never','needle','.']),('ignorecase',['--color','never','-i','needle','.']),('hidden',['--color','never','--hidden','needle','.']),('noignore',['--color','never','--no-ignore','needle','.'])], 'bat':[('version',['--version']),('plain',['--color','never','--paging','never','--style','plain','alpha.txt']),('number',['--color','never','--paging','never','--style','numbers','alpha.txt']),('empty',['--color','never','--paging','never','--style','plain','empty.txt'])]}
def main():
 if shutil.disk_usage(BASE).free < 1073741824:
  raise SystemExit('Runtime probes blocked: require at least 1 GiB free disk space')
 if not (WORKER_ROOT/'rea-native-x64/cxbottle.conf').is_file(): raise SystemExit('Declared isolated worker is unavailable; no fallback to user bottles')
 (BASE/'logs/runtime').mkdir(parents=True,exist_ok=True)
 ap=argparse.ArgumentParser();ap.add_argument('tools',nargs='+',choices=list(TOOLS));ap.add_argument('--probe');ap.add_argument('--fixture');ap.add_argument('--cases');ap.add_argument('--prefix',default='');a=ap.parse_args()
 for tool in a.tools:
  target=TOOLS[tool]; digest=hashlib.sha256(target.read_bytes()).hexdigest()
  acquisition=json.loads((BASE/'manifests'/f'{tool}-acquisition.json').read_text())
  matches=[entry for entry in acquisition.get('executables',[]) if entry.get('path')==str(target.relative_to(BASE))]
  if len(matches)!=1 or digest != matches[0].get('sha256'): raise SystemExit(f'Target identity missing or changed for {tool}')
  probes=[(x['id'],x['arguments']) for x in json.loads((BASE/'tests/runtime-fixtures'/f'{tool}-probes.json').read_text())] if (BASE/'tests/runtime-fixtures'/f'{tool}-probes.json').exists() else PROBES[tool]
  if a.cases: probes=[(x['id'],x['arguments']) for x in json.loads(pathlib.Path(a.cases).read_text())]
  tree=pathlib.Path(a.fixture).resolve() if a.fixture else BASE/'tests/fd-fixture-tree' if tool=='fd' else TREE
  for name,args in probes:
   if a.probe and name != a.probe: continue
   name=a.prefix+name
   if not re.fullmatch(r'[A-Za-z0-9_-]+',name): raise SystemExit('Invalid evidence case identity')
   previous=[BASE/'logs/runtime'/f'{tool}-{name}.{suffix}' for suffix in ['json','stdout.bin','stderr.bin']]
   if any(path.exists() for path in previous):
    retained=BASE/'logs/runtime/attempts'/str(time.time_ns());retained.mkdir(parents=True)
    for path in previous:
     if path.exists(): shutil.copy2(path,retained/path.name)
   cmd=[WINE,'--bottle','rea-native-x64','--no-update','--no-gui',str(target),*args];env=dict(os.environ,LC_ALL='C',WINEDEBUG='-all',CX_BOTTLE_PATH=str(BASE/'.runtime-workers'));start=time.time()
   record={'target':str(target),'target_sha256':digest,'arguments':args,'cwd':str(tree),'runtime':'CrossOver compatibility layer on macOS arm64; actual Windows OS unverified','capture':'Python subprocess; supplemental observation outside canonical REA capture','timeout_seconds':15,'output_file_cap_bytes':1048576,'worker_root':str(WORKER_ROOT),'worker_bottle':'rea-native-x64'}
   try:
    with (BASE/'logs/runtime'/f'{tool}-{name}.stdout.bin').open('wb') as outFile, (BASE/'logs/runtime'/f'{tool}-{name}.stderr.bin').open('wb') as errFile:
     r=subprocess.run(cmd,cwd=tree,env=env,stdout=outFile,stderr=errFile,timeout=15,preexec_fn=cap_output)
    out=(BASE/'logs/runtime'/f'{tool}-{name}.stdout.bin').read_bytes();err=(BASE/'logs/runtime'/f'{tool}-{name}.stderr.bin').read_bytes();record.update(status='completed',exit_code=r.returncode)
   except subprocess.TimeoutExpired as e:
    out=(BASE/'logs/runtime'/f'{tool}-{name}.stdout.bin').read_bytes();err=(BASE/'logs/runtime'/f'{tool}-{name}.stderr.bin').read_bytes();record.update(status='timeout',exit_code=None,limitation='subprocess.run terminates only its selected direct child; CrossOver descendants and service cleanup unverified')
   record['wrapper_exit_code']=record['exit_code']
   record['target_observation_valid']=record['status']=='completed'
   if any(marker in err for marker in [b'wineserver crashed',b'wine: could not load kernel32.dll',b'wine:error:']):
    record.update(status='runtime_failed',exit_code=None,target_observation_valid=False,reason='Compatibility worker failed before valid target observation')
   record['elapsed_seconds']=time.time()-start
   for stream,data in [('stdout',out),('stderr',err)]:
    p=BASE/'logs/runtime'/f'{tool}-{name}.{stream}.bin';p.write_bytes(data);record[stream]={'path':str(p.relative_to(BASE)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'utf8':data.decode('utf8','replace')}
   (BASE/'logs/runtime'/f'{tool}-{name}.json').write_text(json.dumps(record,indent=2)+'\n');print(tool,name,record['status'],record['exit_code'],len(out),len(err),flush=True)
if __name__=='__main__':main()
