import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {loadExamples,json,digest,safePath} from '../scripts/inputs.mjs';import {adaptZendo} from '../adapters/zendo.mjs';import {adaptDevgraph} from '../adapters/devgraph.mjs';
const {config,manifest,snapshots}=await loadExamples();
const zc=config.examples.find(e=>e.adapter==='zendo'),pc=config.examples.find(e=>e.adapter==='devgraph');
const zd=await json(zc.roadmap),zt=await json(zc.tokens),pd=await json(pc.roadmap),pe=await json(pc.evidence);
test('every frozen input reproduces its retained digest',async()=>{for(const s of manifest.files)assert.equal(digest(await readFile(safePath(s.frozen_path))),s.frozen_sha256);});
test('all canonical hierarchy titles, legacy statuses, versions and archive facts survive adaptation',()=>{
 const snapshot=snapshots.find(s=>s.id==='process').snapshot,items=new Map(pd.items.map(i=>[i.id,i]));const works=[snapshot.initiative,...snapshot.initiative.projects.flatMap(p=>[p,...p.issues.flatMap(i=>[i,...i.tasks])])];
 assert.equal(works.length,99);for(const w of works){const item=items.get(w.id),wf=pd.workflows[w.kind+'/'+w.id];assert.equal(w.title,item.title);assert.equal(w.canonical.legacy_status,item.status);assert.equal(w.canonical.version,item.version);assert.equal(w.canonical.archived,wf.archived);assert.equal(w.canonical.progress,wf.progress);}
 assert.equal(works.filter(w=>w.canonical.archived).length,5);assert.equal(snapshot.initiative.projects.flatMap(p=>p.issues).reduce((n,i)=>n+i.depends_on.length,0),33);
});
test('evidence references remain recorded and dated, never upgraded to reviewed production',()=>{
 for(const {snapshot} of snapshots){assert.equal(snapshot.qualification.state,'unqualified');assert.equal(snapshot.gates.filter(g=>g.status==='passed').length,0);for(const p of snapshot.initiative.projects)for(const i of p.issues)for(const t of i.tasks)assert.notEqual(t.evidence.state,'verified');}
 assert.match(snapshots.find(s=>s.id==='zendo').snapshot.snapshot.limitations.join(' '),/2026-09-02/);
});
test('foreign versions, dangling Artifact references and missing token attribution reject adaptation',()=>{
 const a=structuredClone(zd);a.schema='zendo.roadmap/v9';assert.throws(()=>adaptZendo(zc,a,zt,manifest),/Unsupported/);
 const b=structuredClone(zd);b.initiative.projects[0].issues[0].tasks[0].artifact_ids.push('missing');assert.throws(()=>adaptZendo(zc,b,zt,manifest),/Unknown artifact/);
 const c=structuredClone(zt);c.work_rollups=c.work_rollups.filter(t=>t.work_object_id!==zd.initiative.projects[0].issues[0].tasks[0].id);assert.throws(()=>adaptZendo(zc,zd,c,manifest),/attribution/);
});
test('source token aggregate disagreements reject adaptation',()=>{const t=structuredClone(zt);t.work_rollups.find(t=>t.work_object_id===zd.initiative.id).token_total_count++;assert.throws(()=>adaptZendo(zc,zd,t,manifest),/aggregate disagreement/);});
test('canonical readback mismatch and lost dependency edges fail closed',()=>{
 const d=structuredClone(pd);d.items[0].version++;assert.throws(()=>adaptDevgraph(pc,d,pe,manifest),/record\/workflow mismatch/);
 const e=structuredClone(pd);e.dependencies['demo-issue-011']=[];assert.throws(()=>adaptDevgraph(pc,e,pe,manifest),/dependency count disagreement/);
});
test('local evidence cannot silently change canonical titles',()=>{const e=structuredClone(pe);e.projects[0].issues[0].tasks[0].title='Changed';assert.throws(()=>adaptDevgraph(pc,pd,e,manifest),/title mismatch/);});
test('build input paths exclude remote URLs, parent traversal and absolute credential paths',()=>{for(const input of ['https://example.test/file','../file','/tmp/key','a/../../key','a\\key'])assert.throws(()=>safePath(input));});

test('refreshed canonical progress derives its summary and rejects inconsistent counts',()=>{
 const d=structuredClone(pd),e=structuredClone(pe);const key=Object.keys(d.workflows).find(k=>k.startsWith('Task/')&&d.workflows[k].parent?.startsWith('Issue/'));
 d.workflows[key].progress='done';d.workflows[key].stage='completion';d.summary.task_progress_counts={not_started:66,done:1};e.workflow_tracking_stale=false;
 const s=adaptDevgraph(pc,d,e,manifest);assert.match(s.tracking.summary,/1 done/);assert.match(s.tracking.summary,/66 not_started/);assert.equal(s.tracking.state,'unknown');assert.doesNotMatch(s.tracking.summary,/All 67/);
 d.summary.task_progress_counts={not_started:67};assert.throws(()=>adaptDevgraph(pc,d,e,manifest),/progress count disagreement/);
});
test('plan-only process version cannot silently upgrade qualification or gate completion',()=>{
 for(const target of ['evidence','canonical']){const d=structuredClone(pd),e=structuredClone(pe);if(target==='evidence')e.production_ready=true;else d.summary.production_ready=true;assert.throws(()=>adaptDevgraph(pc,d,e,manifest),/qualification facts/);}
 const e=structuredClone(pe);e.completion_plan.gates[0].status='passed';assert.throws(()=>adaptDevgraph(pc,pd,e,manifest),/gate completion facts/);
});
test('Zendo gate summary follows source statuses without implying production qualification',()=>{
 const d=structuredClone(zd);d.initiative.projects[0].gate_status='passed';const s=adaptZendo(zc,d,zt,manifest);assert.equal(s.gates.filter(g=>g.status==='passed').length,1);assert.match(s.qualification.summary,/1 \/ 10/);assert.equal(s.qualification.state,'unqualified');assert.doesNotMatch(s.qualification.summary,/All ten/);
});

test('browser provenance binds frozen files while exact operator locations stay outside bundles',()=>{
 for(const {snapshot} of snapshots){for(const src of snapshot.snapshot.sources){const f=manifest.files.find(f=>f.id===src.id);assert.equal(src.path,f.frozen_path);assert.equal(src.sha256,f.frozen_sha256);}
 assert.doesNotMatch(JSON.stringify(snapshot),/\/(?:Users|Volumes|private)\//);}
 assert(manifest.files.some(f=>f.upstream_path.startsWith('/')));
});
