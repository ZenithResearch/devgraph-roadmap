import test from 'node:test';import assert from 'node:assert/strict';
import {loadExamples} from '../scripts/inputs.mjs';import {validateSnapshot,rollup,tasksFor} from '../src/model.js';
const {snapshots,schema}=await loadExamples(),original=snapshots.find(e=>e.id==='process').snapshot;
function challenge(change,pattern){const value=structuredClone(original);change(value);assert.throws(()=>validateSnapshot(value,schema),pattern);}
test('frozen source scopes and completion are independent from implementation',()=>{
 const p=snapshots.find(e=>e.id==='process').rollup,z=snapshots.find(e=>e.id==='zendo').rollup;
 assert.deepEqual([p.projects,p.issues,p.tasks,p.done,p.recordedEvidence,p.unknownCompletion],[4,22,67,0,67,0]);
 assert.deepEqual([z.projects,z.issues,z.tasks,z.done,z.unknownCompletion,z.legacyAccepted],[10,34,77,0,77,39]);
 // Synthetic ledger: 41 fully observed tasks ×100 plus 10 partial tasks ×50.
 assert.equal(p.hours,null);assert.equal(p.tokens,null);assert.equal(z.tokens,4600);assert.equal(z.tokenCoverage,51);assert.equal(z.tokenComplete,41);
 assert.equal(original.qualification.state,'unqualified');
});
test('legacy accepted and archive never manufacture done',()=>{
 const s=structuredClone(original),p=s.initiative.projects.find(p=>!p.canonical.archived),t=p.issues[0].tasks[0];t.canonical.legacy_status='accepted';assert.equal(rollup([p]).done,0);t.canonical.archived=true;const r=rollup([p]);assert.equal(r.done,0);assert.equal(r.tasks,tasksFor([p]).length);assert.equal(r.legacyAccepted,0);
});
test('unknown metrics remain null; genuine measured zero remains observed',()=>{
 const p=structuredClone(original.initiative.projects.find(p=>!p.canonical.archived)),tasks=tasksFor([p]);
 assert.equal(rollup([p]).hours,null);assert.equal(rollup([p]).points,null);assert.equal(rollup([p]).tokens,null);
 tasks[0].tokens={coverage:'observed',total:0,source_id:'process-evidence',as_of:original.snapshot.as_of};
 tasks[0].estimate={hours:{optimistic:0,likely:0,pessimistic:0},points:1,source_id:'process-evidence'};
 const r=rollup([p]);assert.equal(r.tokens,0);assert.equal(r.tokenCoverage,1);assert.deepEqual(r.hours,{optimistic:0,likely:0,pessimistic:0});assert.equal(r.estimateCoverage,1);assert.equal(r.pointCoverage,1);
});
test('rollup is deterministic regardless of project/Issue/Task iteration order',()=>{
 const reordered=structuredClone(original.initiative.projects).reverse();for(const p of reordered){p.issues.reverse();for(const i of p.issues)i.tasks.reverse();}assert.deepEqual(rollup(reordered),rollup(original.initiative.projects));
});
test('unknown versions and unexpected fields fail closed',()=>{
 challenge(s=>s.schema='roadmap.snapshot/v2',/unsupported/);challenge(s=>s.credential='injected',/unknown field/);
});
test('duplicate identities and missing provenance are rejected',()=>{
 challenge(s=>s.initiative.projects[0].id=s.initiative.id,/Duplicate work/);challenge(s=>s.snapshot.sources.pop(),/Unknown source/);
});
test('completion contradictions and unbound done are rejected',()=>{
 challenge(s=>tasksFor(s.initiative.projects)[0].canonical.done=true,/Contradictory/);
 challenge(s=>{const c=tasksFor(s.initiative.projects)[0].canonical;c.done=true;c.progress='done';c.workflow_id=null;},/lacks workflow/);
});
test('invalid estimates and unsupported Fibonacci points are rejected',()=>{
 challenge(s=>tasksFor(s.initiative.projects)[0].estimate.hours={optimistic:5,likely:1,pessimistic:2},/Estimate order/);
 challenge(s=>tasksFor(s.initiative.projects)[0].estimate.points=4,/unsupported value/);
});
test('partial accounting needs a measured total, source and timestamp',()=>{
 challenge(s=>tasksFor(s.initiative.projects)[0].tokens.coverage='partial',/Token coverage/);
 challenge(s=>{tasksFor(s.initiative.projects)[0].tokens={coverage:'partial',total:5,source_id:'process-evidence',as_of:null};},/Token date/);
 challenge(s=>tasksFor(s.initiative.projects)[0].tokens.total=0,/Token coverage/);
});
test('unsafe or overflowing token values cannot yield plausible totals',()=>{
 challenge(s=>{const t=tasksFor(s.initiative.projects)[0];t.tokens={coverage:'observed',total:9007199254740992,source_id:'process-evidence',as_of:s.snapshot.as_of};},/wrong type/);
 const p=structuredClone(original.initiative.projects.find(p=>!p.canonical.archived)),ts=tasksFor([p]);ts[0].tokens.total=Number.MAX_SAFE_INTEGER;ts[0].tokens.coverage='partial';ts[1].tokens.total=1;ts[1].tokens.coverage='partial';assert.throws(()=>rollup([p]),/overflow/);
});
test('unresolved Issue dependencies and cycles are rejected',()=>{
 challenge(s=>s.initiative.projects.find(p=>!p.canonical.archived).issues[0].depends_on=['missing'],/Unknown dependency/);
 challenge(s=>{const i=s.initiative.projects.find(p=>!p.canonical.archived).issues[0];i.depends_on=[i.id];},/Dependency cycle/);
});
test('gate dependencies, blocker references and grouping are validated',()=>{
 challenge(s=>s.gates[0].requires=['missing'],/Unknown gate/);challenge(s=>s.gates[0].requires=[s.gates[0].id],/Gate cycle/);
 challenge(s=>tasksFor(s.initiative.projects)[0].blocker_ids=['missing'],/Unknown blocker/);challenge(s=>s.groups=[{id:'x',label:'X',project_ids:['missing']}],/Invalid project/);
});
test('fractional estimates produce the same compensated total under every permutation',()=>{
 const projects=structuredClone(original.initiative.projects),ts=tasksFor(projects),values=[0.1,0.2,0.3];
 for(const t of ts)t.estimate={hours:null,points:null,source_id:null};
 const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
 let baseline;
 for(const order of permutations){
  for(let i=0;i<3;i++)ts[i].estimate={hours:{optimistic:values[order[i]],likely:values[order[i]],pessimistic:values[order[i]]},points:null,source_id:'process-evidence'};
  const result=rollup(projects);
  assert.deepEqual(result.hours,{optimistic:0.6,likely:0.6,pessimistic:0.6});
  if(baseline)assert.deepEqual(result,baseline);else baseline=result;
 }
});
test('identity and SHA strings cannot contain a trailing newline',()=>{
 challenge(s=>s.initiative.id+='\n',/invalid string/);
 challenge(s=>s.snapshot.sources[0].sha256+='\n',/invalid string/);
});
