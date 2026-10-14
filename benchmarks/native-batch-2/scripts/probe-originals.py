#!/usr/bin/env python3
"""Bounded original PE observations on CrossOver; never claim Windows OS coverage."""
import pathlib, subprocess, time, json, hashlib, argparse, os, shutil, uuid, tempfile, datetime

def sha(data): return hashlib.sha256(data).hexdigest()

def tree_sha256(root):
 """Commit the exact fixture tree presented to an original process."""
 h=hashlib.sha256()
 for path in sorted(root.rglob('*'),key=lambda p:p.relative_to(root).as_posix()):
  rel=path.relative_to(root).as_posix().encode('utf8')
  if path.is_symlink(): kind=b'L'; payload=os.readlink(path).encode('utf8')
  elif path.is_file(): kind=b'F'; payload=path.read_bytes()
  elif path.is_dir(): kind=b'D'; payload=b''
  else: raise ValueError(f'Unsupported fixture entry: {path}')
  h.update(len(rel).to_bytes(4,'big'));h.update(rel);h.update(kind);h.update(len(payload).to_bytes(8,'big'));h.update(payload)
 return h.hexdigest()

def atomic_json(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 fd,tmp=tempfile.mkstemp(prefix=f'.{path.name}.',suffix='.tmp',dir=path.parent)
 try:
  with os.fdopen(fd,'w',encoding='utf8',newline='\n') as stream:
   json.dump(value,stream,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
  os.replace(tmp,path)
 finally:
  if os.path.exists(tmp): os.unlink(tmp)

def capture_command(cmd,cwd,env,timeout=15,stream_limit=1048576):
 try:
  result=subprocess.run(cmd,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
 except subprocess.TimeoutExpired as e:
  return ('timeout',None,e.stdout or b'',e.stderr or b'','subprocess.run terminates only its selected direct child; CrossOver descendants and service cleanup unverified')
 except OSError as e:
  return ('spawn_error',None,b'',str(e).encode('utf8','replace'),'Original runner could not start the compatibility process')
 out=result.stdout or b'';err=result.stderr or b''
 if len(out)>stream_limit or len(err)>stream_limit:
  return ('output_limit_exceeded',result.returncode,out[:stream_limit],err[:stream_limit],f'captured stream exceeded the {stream_limit} byte per-stream limit')
 if b'wineserver crashed' in err.lower():
  return ('runtime_failed',result.returncode,out,err,'CrossOver reported a wineserver crash; target behavior is not accepted')
 return ('completed',result.returncode,out,err,None)

BASE=pathlib.Path(__file__).resolve().parents[1]
WINE='/Users/haseeb-mir/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine'
BOTTLE_ROOT=pathlib.Path(os.environ.get('REA_CROSSOVER_BOTTLE_ROOT',BASE/'.runtime-workers')).expanduser().resolve()
BOTTLE_NAME='rea-native-x64'
TREE=BASE/'tests/runtime-fixtures/tree'
TOOLS={'fd':BASE/'originals/fd/extracted/fd-v10.5.0-x86_64-pc-windows-msvc/fd.exe','ripgrep':BASE/'originals/ripgrep/extracted/ripgrep-15.2.0-x86_64-pc-windows-msvc/rg.exe','bat':BASE/'originals/bat/extracted/bat-v0.26.1-x86_64-pc-windows-msvc/bat.exe'}
PROBES={'fd':[('version',['--version']),('all',['--color','never']),('extension',['--color','never','-e','txt']),('hidden',['--color','never','--hidden']),('literal',['--color','never','--fixed-strings','alpha']),('case',['--color','never','--case-sensitive','Beta']),('exclude',['--color','never','--exclude','sub'])], 'ripgrep':[('version',['--version']),('search',['--color','never','needle','.']),('ignorecase',['--color','never','-i','needle','.']),('hidden',['--color','never','--hidden','needle','.']),('noignore',['--color','never','--no-ignore','needle','.'])], 'bat':[('version',['--version']),('plain',['--color','never','--paging','never','--style','plain','alpha.txt']),('number',['--color','never','--paging','never','--style','numbers','alpha.txt']),('empty',['--color','never','--paging','never','--style','plain','empty.txt'])]}
def main():
 if shutil.disk_usage(BASE).free < 536870912:
  raise SystemExit('Runtime probes blocked: require at least 512 MiB free disk space')
 if not (BOTTLE_ROOT/BOTTLE_NAME/'cxbottle.conf').is_file():
  raise SystemExit(f'CrossOver bottle not found: {BOTTLE_ROOT/BOTTLE_NAME}')
 ap=argparse.ArgumentParser();ap.add_argument('tools',nargs='+',choices=list(TOOLS));ap.add_argument('--probe');a=ap.parse_args()
 (BASE/'logs/runtime').mkdir(parents=True,exist_ok=True)
 for tool in a.tools:
  target=TOOLS[tool]; digest=hashlib.sha256(target.read_bytes()).hexdigest()
  probes=[(x['id'],x['arguments']) for x in json.loads((BASE/'tests/runtime-probes.json').read_text())[tool]]
  tree=BASE/'tests/fd-fixture-tree' if tool=='fd' else TREE
  for name,args in probes:
   if a.probe and name != a.probe: continue
   run_id='rea-original-'+uuid.uuid4().hex
   attempt_dir=BASE/'logs/runtime/attempts'/run_id
   attempt_dir.mkdir(parents=True,exist_ok=False)
   stdout_path=attempt_dir/'stdout.bin';stderr_path=attempt_dir/'stderr.bin'
   cmd=[WINE,'--bottle',BOTTLE_NAME,'--no-update','--no-gui',str(target),*args];env=dict(os.environ,LC_ALL='C',WINEDEBUG='-all',CX_BOTTLE_PATH=str(BOTTLE_ROOT));start=time.time()
   started_at=datetime.datetime.now(datetime.timezone.utc).isoformat()
   record={'schema':'rea.native-original-attempt.v1','run_id':run_id,'target':str(target),'target_sha256':digest,'arguments':args,'cwd':str(tree),'fixture_tree_sha256':tree_sha256(tree),'runner_sha256':sha(pathlib.Path(__file__).read_bytes()),'started_at':started_at,'runtime':'CrossOver compatibility layer on macOS arm64; actual Windows OS unverified','capture':'Python subprocess; supplemental observation outside canonical REA capture','timeout_seconds':15,'output_file_cap_bytes':1048576}
   status,exit_code,out,err,limitation=capture_command(cmd,tree,env)
   record.update(status=status,exit_code=exit_code)
   if limitation is not None: record['limitation']=limitation
   stdout_path.write_bytes(out);stderr_path.write_bytes(err)
   record['elapsed_seconds']=time.time()-start
   for stream,data in [('stdout',out),('stderr',err)]:
    p=attempt_dir/f'{stream}.bin';p.write_bytes(data);record[stream]={'path':str(p.relative_to(BASE)),'bytes':len(data),'sha256':sha(data),'utf8':data.decode('utf8','replace')}
   record['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
   record['attempt_record_path']=str((attempt_dir/'record.json').relative_to(BASE))
   atomic_json(attempt_dir/'record.json',record)
   atomic_json(BASE/'logs/runtime'/f'{tool}-{name}.json',record)
   print(tool,name,record['status'],record['exit_code'],len(out),len(err),run_id,flush=True)
if __name__=='__main__':main()
