#!/usr/bin/env python3
"""Actual Windows original probes; compatibility observations cannot satisfy this job."""
import argparse, hashlib, json, os, pathlib, platform, shutil, subprocess, sys, time, re, urllib.parse, urllib.request, zipfile
BASE=pathlib.Path(__file__).resolve().parents[1]
MAX_ARCHIVE=32*1024*1024
EXPECTED_REPOS={'fd':'sharkdp/fd','ripgrep':'BurntSushi/ripgrep','bat':'sharkdp/bat'}
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def acquire(tool,work):
 manifest=json.loads((BASE/'manifests'/f'{tool}-acquisition.json').read_text());url=manifest['download_url'];parsed=urllib.parse.urlsplit(url)
 if parsed.scheme!='https' or parsed.netloc!='github.com' or not parsed.path.startswith('/'+EXPECTED_REPOS[tool]+'/releases/download/'):raise ValueError('Untrusted acquisition URL')
 entries=manifest['executables']
 if len(entries)!=1:raise ValueError('Expected exactly one executable in acquisition manifest')
 entry=entries[0];target=work/tool/pathlib.Path(entry['path']).name;target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists() and sha(target)==entry['sha256']:return target,{**manifest,'acquisition_mode':'reused-hash-matched-executable'}
 archive=work/tool/'original.zip'
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'rea-engine-windows-benchmark'}),timeout=60) as response,archive.open('wb') as output:
  total=0
  while chunk:=response.read(65536):
   total+=len(chunk)
   if total>MAX_ARCHIVE:raise ValueError('Archive exceeds declared resource bound')
   output.write(chunk)
 if sha(archive)!=manifest['archive_sha256']:raise ValueError('Archive digest mismatch')
 with zipfile.ZipFile(archive) as zipped:
  candidates=[x for x in zipped.infolist() if pathlib.PurePosixPath(x.filename).name==target.name]
  if len(candidates)!=1 or candidates[0].file_size>MAX_ARCHIVE:raise ValueError('Executable member is ambiguous or oversized')
  target.write_bytes(zipped.read(candidates[0]))
 if sha(target)!=entry['sha256']:raise ValueError('Executable digest mismatch')
 return target,{**manifest,'acquisition_mode':'downloaded-verified-official-archive'}

def fixtures(work):
 tree=work/'text-fixture';tree.mkdir(parents=True,exist_ok=True)
 files={'alpha.txt':b'alpha needle\n','Beta.TXT':b'BETA NEEDLE\n','sub/gamma.txt':b'gamma needle\n','sub/other.rs':b'fn main() {}\n','.secret.txt':b'secret needle\n','empty.txt':b'','space name.txt':b'spaces\n','.gitignore':b'ignored.txt\n','ignored.txt':b'ignored needle\n','crlf.txt':b'first\r\nsecond\r\n','unicode.txt':'café 日本語 needle\n'.encode()}
 for name,data in files.items():p=tree/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 fd=work/'fd-fixture';fd.mkdir(parents=True,exist_ok=True)
 ff={'alpha.txt':'alpha\n','UPPER.TXT':'upper\n','data.bin':'binary\0\n','.hidden.txt':'hidden\n','.gitignore':'ignored.txt\nignored-dir/\n','ignored.txt':'ignored\n','sub/beta.txt':'beta\n','sub/deep/gamma.txt':'gamma\n','ignored-dir/secret.txt':'ignored directory\n','café.txt':'unicode\n'}
 for name,text in ff.items():p=fd/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(text.encode())
 (fd/'.git').mkdir(exist_ok=True);(fd/'empty').mkdir(exist_ok=True)
 try:(fd/'link.txt').symlink_to('alpha.txt');symlink='created'
 except OSError as failure:symlink='existing symlink' if (fd/'link.txt').is_symlink() else f'unavailable: winerror={getattr(failure,"winerror",None)}; errno={failure.errno}'
 return {'fd':fd,'ripgrep':tree,'bat':tree},symlink

NODE_WORKER = r"""
import { writeSync, openSync, closeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
let text='';for await (const chunk of process.stdin) text+=chunk;
const request=JSON.parse(text);
if(process.platform!=='win32')throw Error('Actual Windows required');
const {requireWindowsNativeAuthority}=await import(pathToFileURL(request.loader));
const native=requireWindowsNativeAuthority();
const limit=request.output_limit;
const handles={stdout:openSync(request.stdout,'w'),stderr:openSync(request.stderr,'w')};
const lengths={stdout:0,stderr:0};
let child, state, status='completed', cleanup='unverified';
const start=Date.now();
try {
 child=native.call('process_spawn',[request.executable,request.command_line,request.cwd,request.environment,false,536870912]);
 if(!child.jobAssigned||!child.killOnOwnerClose||child.jobMemoryLimitBytes!==536870912)throw Error('Owned job assignment or memory limit not established');
 for(;;){
  state=native.call('process_poll',[child.handle]);
  for(const stream of ['stdout','stderr']){
   const chunk=state[stream];const remaining=limit-lengths[stream];
   if(chunk.length>remaining)status='output_limit';
   const bounded=chunk.subarray(0,Math.max(0,remaining));
   if(bounded.length)writeSync(handles[stream],bounded);
   lengths[stream]+=bounded.length;
  }
  if(state.memoryLimitReached)status='memory_limit';
  if(Date.now()-start>request.timeout_ms)status='timeout';
  if(status!=='completed'||(state.exitCode!==null&&state.activeProcesses===0&&state.stdoutEnded&&state.stderrEnded))break;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
} finally {
 if(child){
  native.call('process_terminate',[child.handle]);
  const deadline=Date.now()+5000;
  while(native.call('process_alive',[child.handle])!==0&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  cleanup=native.call('process_alive',[child.handle])===0?'cleaned':'unverified';
  native.call('process_close',[child.handle]);
 }
 for(const handle of Object.values(handles))closeSync(handle);
}
process.stdout.write(JSON.stringify({status,exit_code:status==='completed'?state.exitCode:null,cleanup,output_lengths:lengths,capture_method:'rea-windows-native-owned-job',output_limit_bytes:limit,job_memory_limit_bytes:child.jobMemoryLimitBytes,output_complete:status==='completed'&&state.stdoutEnded&&state.stderrEnded}));
"""

def minimal_environment(private_root):
 environment={}
 for key in ('SystemRoot','WINDIR','SystemDrive'):
  value=os.environ.get(key)
  if value:environment[key]=value
 environment.update(TEMP=str(private_root),TMP=str(private_root),USERPROFILE=str(private_root),HOME=str(private_root),NO_COLOR='1')
 return environment

def run_owned(target,arguments,cwd,output,name,worker):
 existing=[output/f'{name}.{suffix}' for suffix in ('json','stdout.bin','stderr.bin')]
 if any(path.exists() for path in existing):
  retained=output/'attempts'/str(time.time_ns());retained.mkdir(parents=True)
  for path in existing:
   if path.exists():shutil.copy2(path,retained/path.name)
 for stream in ('stdout','stderr'):(output/f'{name}.{stream}.bin').write_bytes(b'')
 node=shutil.which('node')
 if not node:raise RuntimeError('Pinned Node runtime is required for REA Windows ownership')
 helper=worker/'owned-original-worker.mjs';helper.write_text(NODE_WORKER,encoding='utf8')
 private=worker/'private-environment';private.mkdir(exist_ok=True)
 environment=minimal_environment(private)
 request={'loader':str(BASE.parents[1]/'dist/windows/WindowsNativeLoader.js'),'executable':str(target),'command_line':subprocess.list2cmdline([str(target),*arguments]),'cwd':str(cwd),'environment':[f'{key}={value}' for key,value in environment.items()],'stdout':str(output/f'{name}.stdout.bin'),'stderr':str(output/f'{name}.stderr.bin'),'timeout_ms':15000,'output_limit':1048576}
 # Only this trusted helper reaches these small control pipes; target output is drained by the existing native backend into capped files.
 try:
  completed=subprocess.run([node,str(helper)],input=json.dumps(request).encode(),cwd=BASE,env=environment,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=25)
 except subprocess.TimeoutExpired:
  return {'status':'worker_timeout','exit_code':None,'cleanup':'unverified','reason':'Helper deadline exceeded; native Job Object owner-close policy applies, settlement not observed'}
 if completed.returncode:
  return {'status':'runtime_failed','exit_code':None,'cleanup':'unverified','reason':completed.stderr[:8192].decode('utf8','replace')}
 result=json.loads(completed.stdout)
 if result['cleanup']!='cleaned':result['status']='cleanup_incomplete'
 return result

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=pathlib.Path,default=BASE/'logs/runtime/windows-originals');args=parser.parse_args()
 if sys.platform!='win32':raise SystemExit('This verifier requires actual Windows. Wine/macOS cannot satisfy this profile.')
 output=args.output.resolve();output.mkdir(parents=True,exist_ok=True)
 if shutil.disk_usage(output).free<1024**3:raise SystemExit('Require at least 1 GiB free disk')
 work=output/'worker';work.mkdir(exist_ok=True);trees,symlink=fixtures(work)
 report={'runtime_kind':'native-windows','host':{'system':platform.system(),'release':platform.release(),'version':platform.version(),'architecture':platform.machine()},'capture_method':'rea-windows-native-owned-job','rea_native_windows_pty':'unsupported; no canonical REA PTY claim','symlink_fixture':symlink,'acquisitions':[],'cases':[],'limitations':['Prelaunch executable hash does not establish atomic OS image identity.','Job settlement is observed per case; timeout/overflow/failure never counts as completed original observation.','No replica comparison or universal equivalence claim.']}
 for tool in EXPECTED_REPOS:
  target,manifest=acquire(tool,work);cases=json.loads((BASE/'tests/runtime-fixtures'/f'{tool}-probes.json').read_text())
  report['acquisitions'].append({'tool':tool,'mode':manifest['acquisition_mode'],'download_url':manifest['download_url'],'archive_sha256_expected':manifest['archive_sha256'],'executable_sha256_observed':sha(target)})
  if not isinstance(cases,list) or not cases: raise ValueError('Expected a nonempty declared probe suite')
  for case in cases:
   if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',case['id']): raise ValueError('Invalid probe identity')
   if not isinstance(case['arguments'],list) or len(case['arguments'])>64 or any(not isinstance(value,str) or len(value)>4096 or '\0' in value for value in case['arguments']): raise ValueError('Invalid bounded probe arguments')
   name=f"{tool}-{case['id']}";start=time.monotonic();record={'id':name,'arguments':case['arguments'],'original_sha256':sha(target),'original_version':manifest['version'],'cwd':str(trees[tool]),'timeout_seconds':15}
   record.update(run_owned(target,case['arguments'],trees[tool],output,name,work))
   streams={stream:(output/f'{name}.{stream}.bin').read_bytes() if (output/f'{name}.{stream}.bin').exists() else b'' for stream in ('stdout','stderr')}
   record['elapsed_seconds']=time.monotonic()-start
   for stream,data in streams.items():
    if len(data)>1024*1024:raise ValueError('Output exceeds 1 MiB evidence bound')
    path=output/f'{name}.{stream}.bin';path.write_bytes(data);record[stream]={'path':path.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
   (output/f'{name}.json').write_text(json.dumps(record,indent=2)+'\n');report['cases'].append(record);print(name,record['status'],record['exit_code'],flush=True)
 report['status']='OBSERVED' if all(x['status']=='completed' for x in report['cases']) else 'INCOMPLETE';report['observations_completed']=sum(x['status']=='completed' for x in report['cases']);report['comparison_scope']='Original Windows execution only; nonzero invalid-input exits are observed behavior.'
 (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
 if report['status']!='OBSERVED':raise SystemExit(1)
if __name__=='__main__':main()
