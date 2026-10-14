#!/usr/bin/env python3
"""Deterministic summaries derived from retained comparisons and REA Evidence."""
from pathlib import Path
import argparse, hashlib, json, os, re, subprocess
from report_output import atomic_write
from run_binding import fixture_tree_sha256, run_ids_match, valid_run_id
from search_comparison import fd_search_equal_after_path_rendering
REPO=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);ROOT=p.parse_args().root.resolve();REPORTS=ROOT/'reports'
INPUTS={};ERRORS=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def digest(s):return isinstance(s,str) and re.fullmatch('[0-9a-f]{64}',s) is not None
def load(path,default=None):
 try:
  b=path.read_bytes()
  if len(b)>32*1024*1024:raise ValueError('receipt too large')
  INPUTS[str(path.relative_to(ROOT))]=sha(b);return json.loads(b)
 except FileNotFoundError:return default
 except (ValueError,OSError) as e:ERRORS.append({'path':str(path.relative_to(ROOT)),'reason':str(e)});return default
def write(name,text):
 path=REPORTS/name;atomic_write(path,text.rstrip()+'\n')
def emit(name,value):write(name,json.dumps(value,indent=2,ensure_ascii=False))
def textsha(s):
 if not isinstance(s,str):raise ValueError('diagnostic is not text')
 return sha(s.encode('utf8'))
def verify_attempt_record(record):
 if not isinstance(record,dict) or not valid_run_id(record.get('run_id')):return False
 expected=Path('logs/runtime/attempts')/record['run_id']/'record.json'
 if record.get('attempt_record_path')!=expected.as_posix():return False
 retained=load(ROOT/expected)
 return retained==record
def attempt_stream_path(relative,case_id,stream,run_id):
 path=Path(relative)
 if path.is_absolute() or '..' in path.parts:raise ValueError(f'{stream} stream path is unsafe')
 legacy=Path('logs/runtime')/f'fd-{case_id}.{stream}.bin'
 attempt=Path('logs/runtime/attempts')/run_id/f'{stream}.bin'
 if path not in (legacy,attempt):raise ValueError(f'{stream} stream path is not bound to its case/run')
 return path
def load_capture_bytes(relative):
 path=ROOT/relative
 if Path(relative).is_absolute() or '..' in Path(relative).parts or path.is_symlink() or not path.is_file():raise ValueError('original capture stream path is missing, linked, or unsafe')
 b=path.read_bytes()
 if len(b)>1024*1024:raise ValueError('original capture stream exceeds recorded output cap')
 INPUTS[str(path.relative_to(ROOT))]=sha(b)
 return b
def fd_original_streams(case_id,item,probe,probe_manifest):
 relocation=load(REPORTS/'fd/original-relocation.json',{})
 binding=relocation.get('cases',{}).get(case_id) if isinstance(relocation,dict) else None
 if not isinstance(binding,dict):raise ValueError('archived original relocation binding is missing')
 receipt_path=ROOT/binding.get('recordPath','')
 if receipt_path.is_symlink() or not receipt_path.is_file() or sha(receipt_path.read_bytes())!=binding.get('recordSha256'):raise ValueError('archived original record commitment mismatch')
 capture=load(receipt_path)
 if not isinstance(capture,dict) or capture.get('status')!='completed':raise ValueError('original raw capture is missing or incomplete')
 if not verify_attempt_record(capture) or capture.get('run_id')!=binding.get('runId') or capture.get('target_sha256')!=originals.get('fd') or capture.get('arguments')!=item['arguments'] or capture.get('exit_code')!=item['original']['exitCode']:raise ValueError('original target/arguments/exit binding mismatch')
 original_cwd=capture.get('cwd')
 current_cwd=probe_manifest.get('workingDirectory')
 if (not isinstance(original_cwd,str) or not Path(original_cwd).is_absolute() or Path(original_cwd).parts[-2:]!=('tests','fd-fixture-tree') or
     relocation.get('originalWorkingDirectory')!=original_cwd or relocation.get('replicaWorkingDirectory')!=current_cwd or
     capture.get('fixture_tree_sha256')!=binding.get('fixtureTreeSha256') or capture.get('fixture_tree_sha256')!=probe_manifest.get('fixtureTreeSha256') or
     relocation.get('fixtureTreeSha256')!=probe_manifest.get('fixtureTreeSha256')):raise ValueError('original and replica fixture relocation/hash binding mismatch')
 if probe_manifest.get('executableSha256')!=fd.get('replicaSha256') or probe_manifest.get('os')!='darwin' or probe_manifest.get('architecture')!='arm64':raise ValueError('replica executable/platform binding mismatch')
 streams={}
 for name in ('stdout','stderr'):
  meta=capture.get(name)
  if not isinstance(meta,dict) or not digest(meta.get('sha256')) or not isinstance(meta.get('bytes'),int):raise ValueError(f'original {name} stream commitment is invalid')
  relative=meta.get('path')
  if not isinstance(relative,str):raise ValueError(f'original {name} stream path is invalid')
  capture_path=attempt_stream_path(relative,case_id,name,capture.get('run_id','legacy')) if valid_run_id(capture.get('run_id')) else Path(relative)
  if not valid_run_id(capture.get('run_id')) and capture_path!=Path('logs/runtime')/f'fd-{case_id}.{name}.bin':raise ValueError(f'legacy original {name} stream path does not match case')
  raw=load_capture_bytes(str(capture_path))
  if len(raw)!=meta['bytes'] or sha(raw)!=meta['sha256'] or meta['sha256']!=item['original'][f'{name}Sha256']:raise ValueError(f'original {name} raw bytes disagree with receipt')
  decoded=raw.decode('utf8',errors='strict')
  if decoded!=meta.get('utf8'):raise ValueError(f'original {name} decoded text disagrees with raw bytes')
  streams[name]=raw
 if capture.get('runtime','').find('CrossOver')<0:raise ValueError('original compatibility runtime identity is missing')
 replica_streams={}
 for name in ('stdout','stderr'):
  replica=probe.get(name)
  if not isinstance(replica,dict) or not isinstance(replica.get('text'),str):raise ValueError(f'replica {name} text is missing')
  raw=replica['text'].encode('utf8')
  if replica.get('bytes')!=len(raw) or replica.get('observedBytes')!=len(raw):raise ValueError(f'replica {name} byte length disagrees with captured text')
  if item['replica'].get(f'{name}DiagnosticSha256')!=sha(raw):raise ValueError(f'replica {name} stream commitment mismatch')
  replica_streams[name]=raw
 if probe.get('exitCode')!=item['replica'].get('exitCode'):raise ValueError('replica exit status commitment mismatch')
 return streams,replica_streams,receipt_path
def fd_invalid_original_observation(case_id,item,probe,probe_manifest):
 """Validate the retained receipt without treating worker diagnostics as target output."""
 receipt_path=ROOT/'logs/runtime'/f'fd-{case_id}.json'
 capture=load(receipt_path)
 if not isinstance(capture,dict):raise ValueError('original raw capture is missing or malformed')
 if capture.get('status')!='runtime_failed' or capture.get('target_observation_valid') is not False:raise ValueError('invalid target observation marker is malformed')
 if capture.get('target_sha256')!=originals.get('fd') or capture.get('arguments')!=item['arguments'] or capture.get('exit_code') is not None or item['original'].get('exitCode') is not None:raise ValueError('invalid original target/arguments/exit binding mismatch')
 original_cwd=capture.get('cwd')
 if not isinstance(original_cwd,str) or not Path(original_cwd).is_absolute() or Path(original_cwd).parts[-2:]!=('tests','fd-fixture-tree') or probe_manifest.get('workingDirectory')!=original_cwd:raise ValueError('original and replica fixture working-directory binding mismatch')
 if probe_manifest.get('executableSha256')!=fd.get('replicaSha256') or probe_manifest.get('os')!='darwin' or probe_manifest.get('architecture')!='arm64':raise ValueError('replica executable/platform binding mismatch')
 if capture.get('runtime','').find('CrossOver')<0:raise ValueError('original compatibility runtime identity is missing')
 if probe.get('status')!='OBSERVED' or probe.get('arguments')!=item['arguments']:raise ValueError('replica execution/input binding mismatch')
 for name in ('stdout','stderr'):
  meta=capture.get(name)
  if not isinstance(meta,dict) or not digest(meta.get('sha256')) or not isinstance(meta.get('bytes'),int):raise ValueError(f'original {name} stream commitment is invalid')
  relative=meta.get('path')
  if not isinstance(relative,str):raise ValueError(f'original {name} stream path is invalid')
  capture_path=attempt_stream_path(relative,case_id,name,capture.get('run_id','legacy')) if valid_run_id(capture.get('run_id')) else Path(relative)
  if not valid_run_id(capture.get('run_id')) and capture_path!=Path('logs/runtime')/f'fd-{case_id}.{name}.bin':raise ValueError(f'legacy original {name} stream path does not match case')
  raw=load_capture_bytes(str(capture_path))
  if len(raw)!=meta['bytes'] or sha(raw)!=meta['sha256'] or meta['sha256']!=item['original'].get(f'{name}Sha256'):raise ValueError(f'original {name} raw bytes disagree with receipt')
  try:decoded=raw.decode('utf8',errors='strict')
  except UnicodeDecodeError as e:raise ValueError(f'original {name} stream is not valid UTF-8') from e
  if decoded!=meta.get('utf8'):raise ValueError(f'original {name} decoded text disagrees with raw bytes')
 if item.get('dimensions')!={'stdoutBytes':'UNVERIFIED','stderrBytes':'UNVERIFIED','exitStatus':'UNVERIFIED'} or item.get('rawStatus')!='UNVERIFIED' or item.get('normalizedSearch')!='NOT_APPLICABLE':raise ValueError('invalid-observation comparison status/dimensions mismatch')
 replica=probe.get('stdout')
 stderr=probe.get('stderr')
 if not isinstance(replica,dict) or not isinstance(replica.get('text'),str) or not isinstance(stderr,dict) or not isinstance(stderr.get('text'),str):raise ValueError('replica stream observation is malformed')
 for name,stream in (('stdout',replica),('stderr',stderr)):
  raw=stream['text'].encode('utf8')
  if stream.get('bytes')!=len(raw) or stream.get('observedBytes')!=len(raw):raise ValueError(f'replica {name} byte length disagrees with captured text')
  if item['replica'].get(f'{name}DiagnosticSha256')!=sha(raw):raise ValueError(f'replica {name} stream commitment mismatch')
 if probe.get('exitCode')!=item['replica'].get('exitCode'):raise ValueError('replica exit status commitment mismatch')
 return receipt_path
inventory=load(REPORTS/'binary-inventory.json')
if not isinstance(inventory,list) or not inventory:raise SystemExit('missing/malformed binary inventory')
targets={i['target']:i for i in inventory if isinstance(i,dict) and isinstance(i.get('target'),str)}
candidate_sources={'ripgrep':'rea-rg.cpp'}
originals={n:i.get('executables',[{}])[0].get('sha256') for n,i in targets.items()}
canonical={}
for path in sorted((ROOT/'analysis').rglob('*.json'))+sorted((REPORTS/'bat').glob('case-*.json'))+sorted((REPORTS/'ripgrep').glob('case-*.json')):
 if 'dossier' not in path.name and path.name not in ('overview.json','rea-pe-resources.json','pe-resources.json') and not path.name.startswith(('case-','startup-candidate-')):continue
 value=load(path)
 if isinstance(value,dict) and 'evidence_id' in value:canonical[str(path)]=value
# REA owns canonical schema and semantic Evidence identity validation.
js="""import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';const {parseEvidence}=await import(pathToFileURL(process.argv[1]).href);let s='';for await(const c of process.stdin)s+=c;const out={};for(const p of JSON.parse(s)){try{parseEvidence(JSON.parse(await readFile(p,'utf8')));out[p]=true;}catch(e){out[p]=false;}}console.log(JSON.stringify(out));"""
try:
 result=subprocess.run(['node','--input-type=module','-e',js,str(REPO/'dist/domain/evidence.js')],input=json.dumps(list(canonical)),capture_output=True,text=True,timeout=30,check=True);valid=json.loads(result.stdout)
except (subprocess.SubprocessError,OSError,ValueError) as e:valid={};ERRORS.append({'path':'canonical-validator','reason':str(e)})
for path in canonical:
 if not valid.get(path):ERRORS.append({'path':str(Path(path).relative_to(ROOT)),'reason':'invalid canonical schema/semantic identity'})
cases=[];fd=load(REPORTS/'fd/comparison.json',{});probes=load(REPORTS/'fd/replica-probes.json',{});probe_cases={i.get('id'):i for i in probes.get('results',[]) if isinstance(i,dict)}
source=ROOT/'reconstructed/fd/fdmac.cpp';source_matches=source.exists() and digest(fd.get('sourceSha256')) and sha(source.read_bytes())==fd['sourceSha256']
envelope=fd.get('schema')=='rea.fd-candidate-comparison.v1' and source_matches and digest(fd.get('replicaSha256')) and fd['replicaSha256']==probes.get('executableSha256');seen=set()
for item in fd.get('results',[]):
 case={'target':'fd','case':item.get('id'),'status':'UNVERIFIED','receipt':'fd/comparison.json'}
 try:
  if not envelope or not isinstance(case['case'],str) or case['case'] in seen:raise ValueError('envelope/source identity/duplicate selector invalid')
  seen.add(case['case']);o,r=item['original'],item['replica'];probe=probe_cases[case['case']]
  relocation=load(REPORTS/'fd/original-relocation.json',{})
  binding=relocation.get('cases',{}).get(case['case'],{}) if isinstance(relocation,dict) else {}
  original_record_path=ROOT/binding.get('recordPath','') if isinstance(binding,dict) else ROOT/'missing-original-record'
  capture=load(original_record_path)
  if isinstance(capture,dict) and capture.get('status')=='runtime_failed' and capture.get('target_observation_valid') is False:
   fd_invalid_original_observation(case['case'],item,probe,probes)
   case.update(reason='Original target output was not observed: the compatibility worker failed before a valid target observation.',dimensions={'stdoutBytes':'UNVERIFIED','stderrBytes':'UNVERIFIED','exitStatus':'UNVERIFIED'},normalizedSearch='NOT_APPLICABLE',candidateSha256=fd['replicaSha256'])
   cases.append(case)
   continue
  if o['targetSha256']!=originals.get('fd') or probe['status']!='OBSERVED' or probe['arguments']!=item['arguments']:raise ValueError('target/execution/input mismatch')
  if not all(digest(o[k]) for k in ['stdoutSha256','stderrSha256']):raise ValueError('invalid original digest')
  if r['stdoutDiagnosticSha256']!=textsha(probe['stdout']['text']) or r['stderrDiagnosticSha256']!=textsha(probe['stderr']['text']):raise ValueError('replica stream commitment mismatch')
  dims={'stdoutBytes':o['stdoutSha256']==r['stdoutDiagnosticSha256'],'stderrBytes':o['stderrSha256']==r['stderrDiagnosticSha256'],'exitStatus':o['exitCode']==r['exitCode']==probe['exitCode'] and probe.get('signal') is None};expected={k:'PASS' if v else 'FAIL' for k,v in dims.items()}
  if expected!=item['dimensions']:raise ValueError('dimensions disagree with digests/outcomes')
  original_streams,replica_streams,capture_path=fd_original_streams(case['case'],item,probe,probes)
  norm=item.get('normalizedSearch')
  if norm not in ['PASS','FAIL','UNVERIFIED','NOT_APPLICABLE']:raise ValueError('invalid normalized result')
  normalized_evidence=None
  if norm in ['PASS','FAIL']:
   computed='PASS' if fd_search_equal_after_path_rendering(original_streams['stdout'],replica_streams['stdout'].decode('utf8')) else 'FAIL'
   if norm!=computed:raise ValueError('normalizedSearch does not match raw original and replica output bytes')
   capture_relative=str(capture_path.relative_to(ROOT))
   normalized_evidence={'originalCapture':capture_relative,'originalCaptureSha256':INPUTS[capture_relative],'replicaProbeSha256':INPUTS['reports/fd/replica-probes.json'],'originalStdoutSha256':sha(original_streams['stdout']),'replicaStdoutSha256':sha(replica_streams['stdout']),'normalization':'leading ./ prefix and Windows path separators only; record order and line endings preserved'}
  historical_status='PASS' if all(dims.values()) else 'FAIL'
  original_capture=load(original_record_path,{})
  replica_run=probe.get('runId')
  original_run=original_capture.get('run_id') if isinstance(original_capture,dict) else None
  fixture_current=(isinstance(original_capture,dict) and original_capture.get('fixture_tree_sha256')==probes.get('fixtureTreeSha256')==relocation.get('fixtureTreeSha256') and
    original_capture.get('cwd')==relocation.get('originalWorkingDirectory') and probes.get('workingDirectory')==relocation.get('replicaWorkingDirectory') and
    binding.get('runId')==original_run and binding.get('recordSha256')==sha(original_record_path.read_bytes()))
  run_bound=(run_ids_match(original_run,replica_run,item.get('comparisonRunId'),item.get('originalRunId'),item.get('replicaRunId')) and
    verify_attempt_record(original_capture) and fixture_current and
    probe.get('fixtureTreeSha256')==original_capture.get('fixture_tree_sha256'))
  final_status=historical_status if run_bound else 'UNVERIFIED'
  normalized_status=norm if run_bound else ('UNVERIFIED' if norm in ['PASS','FAIL'] else norm)
  case.update(status=final_status,historicalMeasuredStatus=historical_status,historicalNormalizedSearch=norm,dimensions=expected,normalizedSearch=normalized_status,candidateSha256=fd['replicaSha256'],originalRunId=original_run,replicaRunId=replica_run,comparisonRunId=item.get('comparisonRunId'),validationScope='Raw streams, target/input/candidate hashes, original attempt record, and original/replica/comparison run IDs are checked. Original runs predate the checkout rename; their recorded fixture-tree hash matches the current fixture tree, and declared probes use relative roots. Path-normalized results remain separate from raw bytes.',**({'normalizedEvidence':normalized_evidence} if normalized_evidence else {}))
  if not run_bound:case['reason']='Historical comparison has no validated original/replica/comparison run-ID join.'
  if item.get('platformReason'):case['platformReason']=item['platformReason']
 except (ValueError,TypeError,KeyError) as e:case['reason']=str(e);ERRORS.append({'path':'fd:'+str(case['case']),'reason':str(e)})
 cases.append(case)
bat=load(REPORTS/'bat/differential.json',{});seen=set()
for item in bat.get('results',[]):
 case={'target':'bat','case':item.get('case'),'status':'UNVERIFIED'}
 try:
  file=item['file']
  if not isinstance(file,str) or Path(file).name!=file or file in seen:raise ValueError('invalid/duplicate receipt path')
  seen.add(file);path=str(REPORTS/'bat'/file);e=canonical[path]
  if not valid.get(path) or e['evidence_id']!=item['evidenceId']:raise ValueError('invalid canonical identity')
  if e['subject']['digest']['sha256']!=originals.get('bat') or bat.get('originalSha256')!=originals.get('bat'):raise ValueError('original identity mismatch')
  params,result=e['parameters'],e['normalized_result'];o,r=result['original'],result['replica']
  if params['case']!=case['case'] or params['candidate_sha256']!=bat.get('candidateSha256') or not digest(params['candidate_sha256']) or not digest(params['original_record_sha256']):raise ValueError('case/candidate/original record commitment mismatch')
  if r['stdoutSha256']!=textsha(r['stdout']) or r['stderrSha256']!=textsha(r['stderr']) or not all(digest(o[k]) for k in ['stdoutSha256','stderrSha256']):raise ValueError('stream digest mismatch')
  dims={'stdoutBytes':o['stdoutSha256']==r['stdoutSha256'],'stderrBytes':o['stderrSha256']==r['stderrSha256'],'exitCode':o['exitCode']==r['exitCode']};historical_status='PASS' if all(dims.values()) else 'FAIL'
  if dims!=result['dimensions'] or dims!=item['dimensions']:raise ValueError('dimensions disagree with measured commitments')
  original_record=load(ROOT/'logs/runtime'/f"bat-{case['case']}.json",{})
  source=ROOT/'reconstructed/bat/batmac.cpp'
  original_record_path=ROOT/'logs/runtime'/f"bat-{case['case']}.json"
  original_record_bytes=original_record_path.read_bytes() if original_record_path.is_file() and not original_record_path.is_symlink() else b''
  original_record_bound=(isinstance(original_record,dict) and bool(original_record_bytes) and
    sha(original_record_bytes)==params.get('original_record_sha256') and
    original_record.get('target_sha256')==originals.get('bat') and
    original_record.get('arguments')==params.get('arguments'))
  if original_record_bound:
   for stream in ('stdout','stderr'):
    meta=original_record.get(stream,{})
    try:raw=load_capture_bytes(meta.get('path',''))
    except (ValueError,OSError):raw=b''
    if not raw and meta.get('bytes')!=0:original_record_bound=False
    if sha(raw)!=meta.get('sha256') or meta.get('sha256')!=result['original'].get(stream+'Sha256'):original_record_bound=False
  fixture_current=False
  if original_record_bound:
   try:
    current_fixture=ROOT/'tests/runtime-fixtures/tree'
    fixture_current=(Path(original_record['cwd']).parts[-3:]==('tests','runtime-fixtures','tree') and current_fixture.is_dir() and
      fixture_tree_sha256(current_fixture)==params.get('fixture_tree_sha256')==original_record.get('fixture_tree_sha256'))
   except (OSError,ValueError):fixture_current=False
  run_bound=(original_record_bound and fixture_current and verify_attempt_record(original_record) and
    run_ids_match(original_record.get('run_id'),params.get('replica_run_id'),params.get('comparison_run_id'),item.get('originalRunId'),item.get('replicaRunId')) and
    params.get('original_run_id')==original_record.get('run_id') and params.get('comparison_run_id')==item.get('comparisonRunId') and params.get('fixture_bound') is True and
    params.get('working_directory')==original_record.get('cwd') and
    digest(params.get('candidate_source_sha256')) and source.exists() and sha(source.read_bytes())==params.get('candidate_source_sha256'))
  status=historical_status if run_bound else 'UNVERIFIED'
  if result['status']!=status or item['status']!=status:raise ValueError('status is not supported by the validated run binding')
  case.update(status=status,historicalMeasuredStatus=historical_status,dimensions=dims,evidenceId=e['evidence_id'],receipt='bat/'+file,candidateSha256=params['candidate_sha256'],originalRunId=original_record.get('run_id') if isinstance(original_record,dict) else None,replicaRunId=params.get('replica_run_id'),comparisonRunId=params.get('comparison_run_id'),validationScope='REA canonical schema/identity and retained stream commitments. PASS also requires run-ID joins and source/fixture binding.')
  if not run_bound:case['reason']='Historical comparison lacks validated original/replica/comparison run IDs or source/fixture binding.'
 except (ValueError,TypeError,KeyError) as e:case['reason']=str(e);ERRORS.append({'path':'bat:'+str(case['case']),'reason':str(e)})
 cases.append(case)
rg=load(REPORTS/'ripgrep/differential.json',{});rg_source=ROOT/'reconstructed/ripgrep/rea-rg.cpp';rg_binary=ROOT/'reconstructed/ripgrep/build/rea-rg';rg_seen=set()
for item in rg.get('results',[]):
 case={'target':'ripgrep','case':item.get('case'),'status':'UNVERIFIED'}
 try:
  file=item['file']
  if not isinstance(file,str) or Path(file).name!=file or file in rg_seen:raise ValueError('invalid/duplicate ripgrep receipt path')
  rg_seen.add(file);path=str(REPORTS/'ripgrep'/file);e=canonical[path]
  if not valid.get(path) or e['evidence_id']!=item['evidenceId']:raise ValueError('invalid ripgrep canonical evidence identity')
  params,result=e['parameters'],e['normalized_result'];o,r=result['original'],result['replica'];case_id=case['case']
  if e['subject']['digest']['sha256']!=originals.get('ripgrep') or params.get('case')!=case_id:raise ValueError('ripgrep target/case identity mismatch')
  record_path=ROOT/'logs/runtime'/f'ripgrep-{case_id}.json';record=load(record_path,{})
  if not isinstance(record,dict) or record.get('status')!='completed' or record.get('target_sha256')!=originals.get('ripgrep') or record.get('arguments')!=params.get('arguments'):raise ValueError('ripgrep original observation identity mismatch')
  if sha(record_path.read_bytes())!=params.get('original_record_sha256') or not verify_attempt_record(record):raise ValueError('ripgrep original attempt record is not bound')
  raw_streams={}
  for stream in ('stdout','stderr'):
   meta=record.get(stream,{})
   capture_path=attempt_stream_path(meta.get('path',''),case_id,stream,record.get('run_id',''))
   raw=load_capture_bytes(str(capture_path))
   if sha(raw)!=meta.get('sha256') or len(raw)!=meta.get('bytes') or sha(raw)!=o.get(stream+'Sha256'):raise ValueError(f'ripgrep original {stream} stream commitment mismatch')
   raw_streams[stream]=raw
  current_fixture=ROOT/'tests/runtime-fixtures/tree'
  fixture_current=(Path(record['cwd']).parts[-3:]==('tests','runtime-fixtures','tree') and current_fixture.is_dir() and
    params.get('replica_working_directory')==str(current_fixture) and
    fixture_tree_sha256(current_fixture)==params.get('fixture_tree_sha256')==record.get('fixture_tree_sha256'))
  source_hash=sha(rg_source.read_bytes()) if rg_source.is_file() else None
  binary_hash=sha(rg_binary.read_bytes()) if rg_binary.is_file() else None
  if params.get('candidate_source_sha256')!=source_hash or params.get('candidate_sha256')!=binary_hash or rg.get('candidateSha256')!=binary_hash:raise ValueError('ripgrep candidate/source identity mismatch')
  replica_streams={k:r[k].encode('utf8') for k in ('stdout','stderr')}
  for stream,raw in replica_streams.items():
   if sha(raw)!=r.get(stream+'Sha256'):raise ValueError(f'ripgrep replica {stream} stream commitment mismatch')
  dims={'stdoutBytes':raw_streams['stdout']==replica_streams['stdout'],'stderrBytes':raw_streams['stderr']==replica_streams['stderr'],'exitCode':o.get('exitCode')==r.get('exitCode')}
  # The evidence comparator normalizes only a leading .\\ path prefix.
  normalize=lambda b:re.sub(rb'(?m)^\.[\\]([^:\r\n]*):',lambda m:b'./'+m.group(1).replace(b'\\',b'/')+b':',b)
  dims['stdoutAfterRelativePathSeparatorNormalization']=normalize(raw_streams['stdout'])==normalize(replica_streams['stdout'])
  historical='PASS' if (dims['stdoutBytes'] or dims['stdoutAfterRelativePathSeparatorNormalization']) and dims['stderrBytes'] and dims['exitCode'] else 'FAIL'
  if result.get('dimensions')!=dims or result.get('status')!=historical or item.get('status')!=historical:raise ValueError('ripgrep comparison dimensions/status disagree with evidence')
  run_bound=(params.get('fixture_bound') is True and fixture_current and params.get('working_directory')==record.get('cwd') and
    params.get('original_run_id')==record.get('run_id') and valid_run_id(params.get('replica_run_id')) and valid_run_id(params.get('comparison_run_id')))
  status=historical if run_bound else 'UNVERIFIED'
  case.update(status=status,historicalMeasuredStatus=historical,dimensions=dims,receipt='ripgrep/'+file,evidenceId=e['evidence_id'],candidateSha256=binary_hash,originalRunId=record.get('run_id'),replicaRunId=params.get('replica_run_id'),comparisonRunId=params.get('comparison_run_id'),validationScope='REA canonical Evidence, retained original streams and run identity, replica/source/binary identity, and unchanged fixture tree. Path-normalized stdout remains distinct from raw-byte equality.')
  if not run_bound:case['reason']='Run/fixture binding is incomplete.'
 except (ValueError,TypeError,KeyError,OSError) as e:case['reason']=str(e);ERRORS.append({'path':'ripgrep:'+str(case['case']),'reason':str(e)})
 cases.append(case)
static={n:{'functionsDiscovered':None,'functionsInvestigated':0,'evidence':[]} for n in targets};addresses={n:set() for n in targets}
for path,e in canonical.items():
 if not valid.get(path) or '/analysis/' not in path:continue
 n=next((n for n,h in originals.items() if e.get('subject',{}).get('digest',{}).get('sha256')==h),None)
 if n is None:continue
 result=e.get('normalized_result',{})
 if isinstance(result,dict):
  count=result.get('procedure_count')
  if isinstance(count,int) and count>=0:static[n]['functionsDiscovered']=max(count,static[n]['functionsDiscovered'] or 0)
  address=result.get('procedure',{}).get('address')
  if address:addresses[n].add(address)
 static[n]['evidence'].append({'path':str(Path(path).relative_to(ROOT)),'evidenceId':e['evidence_id']})
for n in static:static[n]['functionsInvestigated']=len(addresses[n])
runtime=[]
for path in sorted((ROOT/'logs/runtime').glob('*.json')):
 value=load(path)
 if isinstance(value,dict) and 'target_sha256' in value and 'status' in value:runtime.append({'path':str(path.relative_to(ROOT)),'status':value['status'],'targetObservationValid':value.get('target_observation_valid'),'wrapperExitCode':value.get('wrapper_exit_code',value.get('exit_code'))})
faults=[r for r in runtime if r['status']=='runtime_failed' or r['targetObservationValid'] is False]
attempt_history=[]
for attempt_path in sorted((ROOT/'logs/runtime/attempts').glob('*/record.json')):
 summary={'path':str(attempt_path.relative_to(ROOT)),'status':'UNVERIFIED','integrity':'UNVERIFIED'}
 try:
  record=load(attempt_path)
  run_id=record.get('run_id') if isinstance(record,dict) else None
  if not isinstance(record,dict) or record.get('schema')!='rea.native-original-attempt.v1' or not valid_run_id(run_id) or attempt_path.parent.name!=run_id or record.get('attempt_record_path')!=str(attempt_path.relative_to(ROOT)):raise ValueError('attempt identity/path binding is invalid')
  if not all(digest(record.get(key)) for key in ('target_sha256','fixture_tree_sha256','runner_sha256')) or not isinstance(record.get('arguments'),list):raise ValueError('attempt target, fixture, runner or arguments commitment is invalid')
  stream_hashes={};stream_bytes={}
  for stream in ('stdout','stderr'):
   meta=record.get(stream)
   expected_path=f'logs/runtime/attempts/{run_id}/{stream}.bin'
   if not isinstance(meta,dict) or meta.get('path')!=expected_path or not digest(meta.get('sha256')) or not isinstance(meta.get('bytes'),int):raise ValueError(f'{stream} attempt stream commitment is invalid')
   raw=load_capture_bytes(expected_path)
   if len(raw)!=meta['bytes'] or sha(raw)!=meta['sha256'] or raw.decode('utf8','replace')!=meta.get('utf8'):raise ValueError(f'{stream} attempt stream does not match its commitment')
   stream_hashes[stream]=meta['sha256'];stream_bytes[stream]=raw
  status=record.get('status') if record.get('status') in ('completed','timeout','runtime_failed') else 'UNVERIFIED'
  target_observation_valid=status=='completed' and b'wineserver crashed' not in stream_bytes['stderr'].lower()
  if status=='completed' and not target_observation_valid:status='runtime_failed'
  summary.update(runId=run_id,status=status,targetObservationValid=target_observation_valid,integrity='PASS',targetSha256=record['target_sha256'],arguments=record['arguments'],fixtureTreeSha256=record['fixture_tree_sha256'],runnerSha256=record['runner_sha256'],startedAt=record.get('started_at'),finishedAt=record.get('finished_at'),recordSha256=INPUTS[str(attempt_path.relative_to(ROOT))],streamSha256=stream_hashes)
 except (ValueError,TypeError,KeyError,OSError) as e:
  summary['reason']=str(e);ERRORS.append({'path':summary['path'],'reason':str(e)})
 attempt_history.append(summary)
heldout=load(REPORTS/'fd/heldout-comparison.json',{});repair=load(REPORTS/'fd/repair-loop.json',{});repair_bound=source_matches and repair.get('afterSource',{}).get('sha256')==fd.get('sourceSha256');repairs=[i['id'] for i in repair.get('cases',[]) if repair_bound and i.get('before',{}).get('rawPass') is False and i.get('after',{}).get('rawPass') is True]
metrics=[];statuses={}
for n,item in targets.items():
 selected=[c for c in cases if c['target']==n];done=[c for c in selected if c['status'] in ['PASS','FAIL']];statuses[n]='PARTIAL' if done else 'UNVERIFIED';b=item.get('executables',[{}])[0]
 h=fd.get('replicaSha256') if n=='fd' else rg.get('candidateSha256') if n=='ripgrep' else bat.get('candidateSha256') if n=='bat' else None
 binary_names={'fd':'fdmac','ripgrep':'rea-rg','bat':'batmac'}
 binary=ROOT/'reconstructed'/n/'build'/binary_names[n] if n in binary_names else ROOT/'missing-reconstruction'
 matches=digest(h) and binary.exists() and sha(binary.read_bytes())==h
 src=ROOT/'reconstructed'/n/candidate_sources.get(n,n+'mac.cpp')
 historical=[c.get('historicalMeasuredStatus',c['status']) for c in cases]
 m={'target':n,'originalBytes':b.get('bytes'),'originalSha256':b.get('sha256'),'architecture':b.get('architecture'),**static[n],'originalComparisonsCompleted':len(done),'comparisonUnverified':sum(c['status']=='UNVERIFIED' for c in selected),'comparisonPasses':sum(c['status']=='PASS' for c in selected),'comparisonFailures':sum(c['status']=='FAIL' for c in selected),'historicalMeasuredPasses':sum(c.get('historicalMeasuredStatus')=='PASS' for c in selected),'historicalMeasuredFailures':sum(c.get('historicalMeasuredStatus')=='FAIL' for c in selected),'normalizedSearchPasses':sum(c.get('normalizedSearch')=='PASS' for c in selected),'historicalNormalizedSearchPasses':sum(c.get('historicalNormalizedSearch')=='PASS' for c in selected),'normalizedSearchCases':sum(c.get('normalizedSearch') in ['PASS','FAIL','UNVERIFIED'] for c in selected),'candidateSource':str(src.relative_to(ROOT)) if src.exists() else None,'candidateSourceSha256':sha(src.read_bytes()) if src.exists() else None,'candidateSha256':h,'localCandidateMatchesReceipt':bool(matches),'replicaBytes':binary.stat().st_size if matches else None,'repairCorrectionsRawPass':repairs if n=='fd' else [],'unverifiedWholeApplication':True};metrics.append(m)
 write(n+'/target-report.md',f"# {n} — Batch 2\n\nApplication: **{statuses[n]}**. Acquisition: **{item.get('status','UNVERIFIED')}**.\n\nOriginal SHA-256: `{b.get('sha256','unknown')}`. Run-bound comparisons: **{len(done)} completed; {m['comparisonPasses']} passing; {m['comparisonFailures']} differing; {m['comparisonUnverified']} unverified**. Retained measured outcomes: **{m['historicalMeasuredPasses']} equal; {m['historicalMeasuredFailures']} different**. Discovered functions: {m['functionsDiscovered']}; unique retained dossiers: {m['functionsInvestigated']}.\n\nRead [cases](../functional-tests.json), [static evidence](../static-analysis.md), [runtime/current faults](../runtime-analysis.md) and [licensing](../license-audit.md). Finite cases do not establish complete equivalence.")
 if n=='fd':
  relocation=load(REPORTS/'fd/original-relocation.json',{})
  if isinstance(relocation,dict) and relocation.get('cases'):
   write(n+'/target-report.md',(REPORTS/n/'target-report.md').read_text()+
     f"\n\nOriginal probes were captured through CrossOver before the checkout was renamed. The archived records bind the original PE hash, per-case arguments and run IDs, plus fixture-tree SHA-256 `{relocation.get('fixtureTreeSha256')}`. That hash matches the current fixture tree. The original and replica working-directory strings differ because of the rename; output path and separator differences remain measured separately. A post-rename CrossOver retry was attempted but failed at wineserver startup, so it is retained as a failed worker attempt and not treated as target output.")
 if n in ('openlierox','supertux','powder-toy'):
  evidence_path=ROOT/'analysis'/n/'rea-pe-resources.json'
  if not evidence_path.is_file():evidence_path=ROOT/'analysis'/n/'pe-resources.json'
  evidence=load(evidence_path,{})
  result=evidence.get('normalized_result',{}) if isinstance(evidence,dict) else {}
  coverage=result.get('coverage',{}) if isinstance(result,dict) else {}
  resources=result.get('resources',[]) if isinstance(result,dict) else []
  exe=targets[n].get('executables',[{}])[0]
  manifest_path=f"../manifests/{n}-acquisition.json"
  evidence_rel=os.path.relpath(evidence_path,REPORTS/n).replace('\\','/')
  resource_types=sorted({str(x.get('type',{}).get('id',x.get('type',{}).get('kind','unknown'))) for x in resources if isinstance(x,dict)})
  game_report=(
   f"# {n} — Batch 2 game investigation\n\n"
   f"**Status: UNVERIFIED for gameplay and reconstruction.** The checked-in evidence proves acquisition identity and a bounded static PE resource-table observation only. No reconstructed macOS game, runtime gameplay test, original-versus-replica comparison, or target screenshot is recorded.\n\n"
   f"## Original binary and provenance\n\n"
   f"- Release: `{targets[n].get('version','unknown')}`; architecture: `{exe.get('architecture','unknown')}`; format: `{exe.get('format','unknown')}`.\n"
   f"- Executable SHA-256: `{exe.get('sha256','unknown')}` ({exe.get('bytes','unknown')} bytes).\n"
   f"- Acquisition details: [release manifest]({manifest_path}); downloaded Windows binary is a local-only input and is not redistributed.\n"
   f"- PE entry RVA: `{exe.get('entry_rva','not recorded')}`; imported DLL count: {len(exe.get('imports',[]))}. These are header/import metadata, not recovered gameplay behavior.\n\n"
   f"## Static evidence produced\n\n"
   f"REA's `inspect_pe_resources` operation examined {coverage.get('examined_entries','unknown')} resource directory entries and recorded {coverage.get('resources',len(resources))} resources (coverage: `{coverage.get('status','unknown')}`). Resource type identifiers observed: {', '.join(resource_types) if resource_types else 'not classified in the retained summary'}. See the [hash-bound Evidence record]({evidence_rel}) and shared [binary inventory](../binary-inventory.json).\n\n"
   f"The PE resource parser does not recover functions, control-flow graphs, game-loop logic, physics, AI, input handling, or renderer behavior. No Ghidra function inventory was retained for this target.\n\n"
   f"## Runtime and reconstruction status\n\n"
   f"- Original native-Windows gameplay executions: **0**.\n"
   f"- Reconstructed macOS game executable: **none**.\n"
   f"- Differential gameplay cases: **0**.\n"
   f"- Genuine original/replica game screenshots: **0**.\n"
   f"- License and asset caveats: [Batch 2 license audit](../license-audit.md).\n\n"
   f"## What would establish progress\n\n"
   f"Add a binary-hash-bound function inventory and runtime run identity; implement one named local gameplay feature independently; then retain paired original/replica inputs, outputs or state observations, regression cases, and genuine screenshots. Keep any unsupported game modes and assets explicitly unresolved. A finite feature pass would still not prove whole-game equivalence."
  )
  write(n+'/target-report.md',game_report)
 if n=='ripgrep':
  with (REPORTS/'ripgrep/target-report.md').open('a') as f:f.write('\n\nThese cases ran through CrossOver on macOS, not Windows. The version case is raw-byte exact; six search cases pass only after normalizing the leading relative-path separator (`.\\` to `./`), with raw byte mismatches retained. The declared unclosed-character-class diagnostic now matches the original stderr bytes exactly. This is a finite CLI subset, not full application equivalence.\n')
fingerprint=sha(json.dumps(INPUTS,sort_keys=True,separators=(',',':')).encode());meta={'inputFingerprintSha256':fingerprint,'generation':'Deterministic receipt projection; wall-clock generation time omitted.'};completed=[c for c in cases if c['status'] in ['PASS','FAIL']];counts={'comparisonsCompleted':len(completed),'passed':sum(c['status']=='PASS' for c in cases),'failed':sum(c['status']=='FAIL' for c in cases),'unverified':sum(c['status']=='UNVERIFIED' for c in cases),'historicalComparisons':len(cases),'historicalMeasuredPasses':sum(x=='PASS' for x in historical),'historicalMeasuredFailures':sum(x=='FAIL' for x in historical)}
emit('functional-tests.json',{**meta,**counts,'scope':'Retained historical and run-bound measured cases, not full feature or application certification. Normalization is a separate dimension.','cases':cases,'unverifiedWholeApplications':list(targets),'heldoutStatus':heldout.get('status','UNVERIFIED'),'validationFailures':ERRORS,'universalEquivalence':False})
emit('performance-results.json',{**meta,'targets':metrics,'measurementScope':'Retained comparison, source/build and canonical static receipts; unmeasured values are null, not invented.'})
emit('batch-state.json',{**meta,'applicationStatus':statuses,'acquiredTargets':[n for n,i in targets.items() if i.get('status')=='PASS'],'originalComparisons':len(completed),'historicalRawPasses':counts['historicalMeasuredPasses'],'currentWorkerStatus':'FAULT_OBSERVED' if faults else 'UNVERIFIED','currentRuntimeFaults':faults,'attemptHistory':attempt_history,'windowsWorker':'UNVERIFIED: inspect actual CI artifacts separately','heldoutStatus':heldout.get('status','UNVERIFIED'),'nextPhase':'restore-healthy-worker-and-expand-coverage','controllerCheckpoint':'fd/controller-checkpoint.json','limitation':'Historical receipts survive current faults; this summary is not a controller checkpoint.'})
table='| Target | Acquisition | Whole application | Case pass / differ / unverified | Functions / dossiers |\n|---|---|---|---|---|\n'
for m in metrics:
 n=m['target'];table+=f"| {n} | {targets[n].get('status','UNVERIFIED')} | {statuses[n]} | {m['comparisonPasses']} / {m['comparisonFailures']} / {m['comparisonUnverified']} | {m['functionsDiscovered']} / {m['functionsInvestigated']} |\n"
write('batch-2-overview.md','# Native Binary Reconstruction — Benchmark Batch 2\n\n'+table+f"\nRun-bound original/native comparisons: **{counts['comparisonsCompleted']} complete; {counts['passed']} passing; {counts['failed']} differing; {counts['unverified']} unverified**. Across those retained cases: **{counts['historicalComparisons']} total; {counts['historicalMeasuredPasses']} measured equal; {counts['historicalMeasuredFailures']} measured different**. The separate ten-case fd held-out suite remains UNVERIFIED. Normalized fd and ripgrep search results are separate dimensions from raw byte equality. Full applications remain PARTIAL or UNVERIFIED.\n\nEarlier held-out worker failures do not erase fresh valid receipts. Windows OS coverage, complete games, graphics and universal equivalence remain unverified. Connected host-agent engineering is not unattended algorithm recovery.\n\nRead [cases](functional-tests.json), [metrics](performance-results.json), [static](static-analysis.md), [runtime](runtime-analysis.md), [licenses](license-audit.md), [builds](macos-build-results.md) and [limitations](known-limitations.md).\n\nInput fingerprint: `{fingerprint}`.")
write('static-analysis.md','# Static analysis\n\n'+'\n'.join(f"- **{n}**: {s['functionsDiscovered']} discovered functions; {s['functionsInvestigated']} unique observed dossiers. Canonical Evidence schema/semantic IDs validated by REA." for n,s in static.items())+'\n\nSuccessful fd lightweight profiles coexist with earlier default-profile timeouts. Dossiers establish analyzed bodies and references, not complete algorithm or runtime equivalence. Exact receipts are indexed in performance-results.json. Other unresolved analysis remains in per-target directories and static-games.md.')
write('function-recovery.md','# Function recovery\n\n'+'\n'.join(f"- **{n}**: {s['functionsInvestigated']} unique observed analyzed bodies; application semantics remain separately unverified." for n,s in static.items())+'\n\nfd entry/CRT/Rust startup/wrapper/callback roles are supported by retained call/data relationships. Inferred roles are not verified symbol names or recovered complete search algorithms. gconv is a separate target and is not counted in Batch 2.')
write('reconstruction-results.md','# Reconstruction results\n\n'+'\n'.join(f"- **{m['target']}**: source `{m['candidateSource']}`; raw cases {m['comparisonPasses']} passing / {m['comparisonFailures']} differing / {m['comparisonUnverified']} unverified; complete application {statuses[m['target']]}." for m in metrics)+f"\n\nReceipt-backed fd candidate corrections: {', '.join(repairs) or 'none established'}. Pre-correction source is explicitly reconstructed from own changes, not upstream code. bat cases do not establish highlighting, paging or tty behavior. No complete game replica, state/rendering suite or formal proof is established.")
write('macos-build-results.md','# macOS build results\n\n'+'\n'.join(f"- **{m['target']}**: source `{m['candidateSource']}`; candidate SHA-256 `{m['candidateSha256']}`; local binary matches receipt **{m['localCandidateMatchesReceipt']}**; observed bytes {m['replicaBytes']}." for m in metrics)+'\n\nMissing local binaries prevent a current build assertion but do not erase historical receipts. Build recipes remain beside reconstructed sources. Native Mac and original Windows executable identities differ.')
write('known-limitations.md','# Known limitations\n\n1. Full applications and games remain unverified beyond explicit measured cases.\n2. Earlier fd held-out attempts failed in the compatibility worker before target output; those ten cases remain UNVERIFIED and do not invalidate the fresh run-bound declared probes.\n3. fd path/order normalization is a separate dimension; file-list and symlink mapping differences remain visible.\n4. bat covers a narrow redirected plain-output subset.\n5. Actual Windows CI execution, application screenshots, full game states/graphics/audio and universal proof require separate evidence.\n6. Private original inputs and asset/dependency rights remain subject to license-audit.md.\n7. Host-agent corrections are separate from controller-driven unattended repair.\n8. Invalid canonical IDs, source/target identities or stream commitments become UNVERIFIED. Infrastructure fixtures do not certify target fidelity.\n\nRuntime and license reports owned by other investigators are preserved unchanged.')
print(json.dumps({**counts,'validationFailures':len(ERRORS),'inputFingerprintSha256':fingerprint}))
