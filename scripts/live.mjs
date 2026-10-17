import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {collectCurrent,readRevision} from '../adapters/devgraph-live.mjs';
import {adaptDevgraph} from '../adapters/devgraph.mjs';
import {portableReference} from '../adapters/shared.mjs';
import {validateSnapshot} from '../src/model.js';
import {validateGatePlan} from '../src/journey-model.js';
import {validateDelivery} from '../src/delivery-model.js';
import {root,json,loadExamples} from './inputs.mjs';
const run=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const now=()=>new Date().toISOString();

export async function createLive(configPath){
 const config=JSON.parse(await readFile(configPath,'utf8'));
 if(config.schema!=='roadmap.local-live-config/v1'||!path.isAbsolute(config.cli)||!path.isAbsolute(config.cache_dir)||!Array.isArray(config.repositories))throw Error('Invalid local live configuration');
 const {snapshots,config:examples,manifest}=await loadExamples(),entry=examples.examples.find(e=>e.id===config.example_id&&e.adapter==='devgraph');if(!entry)throw Error('Unknown live source');
 const baseline=await json(entry.roadmap),snapshotSchema=await json('contracts/roadmap.snapshot.v1.schema.json'),planSchema=await json('contracts/roadmap.gate-plan.v1.schema.json');
 let last=snapshots.find(s=>s.id===entry.id).snapshot,revision=null,lastSuccess=null,lastAttempt=null,checked=null,busy=false,error=null,repos=[],grant=null,lastStart=0;
 const read=async args=>{
  const result=await run(config.cli,args,{timeout:10000,maxBuffer:8*1024*1024,env:{...process.env,NO_COLOR:'1'}});
  if(result.stderr.trim())throw Error('CLI read unavailable');return JSON.parse(result.stdout);
 };
 await mkdir(config.cache_dir,{recursive:true,mode:0o700});
 const refresh=async()=>{
  if(busy||Date.now()-lastStart<60000)return;busy=true;lastStart=Date.now();lastAttempt=now();
  try{
   const health=await read(['local','status']);if(!health.healthy||health.api?.api?.protected_status!==401||health.api.api.live_status!==200||health.api.api.ready_status!==200)throw Error('Devgraph unavailable');
   const current=await readRevision(read,`Initiative/${baseline.items.find(i=>i.kind==='Initiative').id}`,`Task/${baseline.items.find(i=>i.kind==='Task'&&baseline.workflows['Task/'+i.id].parent===null).id}`);
   if(current!==revision){
    const {data,packet}=await collectCurrent(read,baseline);const evidence=await json(entry.evidence),bytes=JSON.stringify(data),id='process-live-canonical';
    const liveManifest=structuredClone(manifest);liveManifest.captured_at=data.as_of;liveManifest.files.push({id,frozen_path:'live/process-canonical.json',frozen_sha256:sha(bytes),role:'Current supported CLI read capture'});
    const liveEntry={...entry,source_ids:[id,...entry.source_ids.filter(id=>id==='process-evidence')]};
    const normalized=adaptDevgraph(liveEntry,data,evidence,liveManifest);
    for(const p of [normalized.initiative,...normalized.initiative.projects.flatMap(p=>[p,...p.issues.flatMap(i=>[i,...i.tasks])])])p.description=portableReference(p.description);
    normalized.snapshot.limitations=normalized.snapshot.limitations.filter(x=>!x.startsWith('Frozen successful')&&!x.startsWith('Browser source references'));
    normalized.snapshot.limitations.unshift('Live read-only CLI observer. A failed or changing refresh retains the previous good capture. No tracker mutations or completion inferred.');
    normalized.tracking.summary=`Current canonical Task progress: ${Object.entries(data.summary.task_progress_counts).map(([k,v])=>`${v} ${k}`).join(' · ')}. Local implementation milestones are separate from formal workflow completion.`;
    validateSnapshot(normalized,snapshotSchema);
    const stamp=data.as_of.replace(/[^0-9TZ]/g,'-');
    await writeFile(path.join(config.cache_dir,`${stamp}.json`),JSON.stringify({data,packet},null,2)+'\n',{flag:'wx',mode:0o600});
    last=normalized;revision=data.scope_revision;lastSuccess=data.as_of;
   }
   repos=await Promise.all(config.repositories.map(async r=>{try{const a=await run('git',['-C',r.path,'rev-parse','HEAD'],{timeout:5000});const b=await run('git',['-C',r.path,'status','--porcelain'],{timeout:5000});const head=a.stdout.trim();return {id:r.id,label:r.label,head,binding:head===r.expected_head?'matched':'changed',dirty:Boolean(b.stdout.trim())};}catch{return {id:r.id,label:r.label,head:null,binding:'unavailable',dirty:null};}}));
   try{const result=await run(config.cli,['auth','work','status'],{timeout:10000,maxBuffer:1024*1024});grant=JSON.parse(result.stdout).ready===true;}catch(e){try{grant=JSON.parse(e.stdout).ready===true;}catch{grant=null;}}
   checked=now();error=null;
  }catch(e){error='Tracker refresh unavailable or changed during capture. Last good snapshot retained.';try{await writeFile(path.join(config.cache_dir,`failure-${Date.now()}.json`),JSON.stringify({at:now(),reason:e instanceof Error?e.message:'Unavailable read',last_good_revision:revision})+'\n',{flag:'wx',mode:0o600});}catch{}}
  finally{busy=false;}
 };
 const response=async id=>{
  if(id!==entry.id)return null;
  // Start one bounded refresh; HTTP remains responsive while the capture runs.
  void refresh();
  const plan=await json('examples/plans/native-service-authority.json'),delivery=await json('examples/progress/process.json');
  validateGatePlan(plan,planSchema,last);validateDelivery(delivery,last);
  return {schema:'roadmap.live/v1',example_id:id,checked_at:checked,last_success_at:lastSuccess,last_attempt_at:lastAttempt,refreshing:busy,error,work_write_ready:grant,repositories:repos,snapshot:last,plan,delivery};
 };
 void refresh();return {response,isBusy:()=>busy};
}
