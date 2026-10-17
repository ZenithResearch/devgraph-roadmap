import test from 'node:test';
import assert from 'node:assert/strict';
import {collectCurrent} from '../adapters/devgraph-live.mjs';
import {validateDelivery,deliveryCounts,deliveryTree,deliveryStatus} from '../src/delivery-model.js';
import {validateLive} from '../src/live-view.js';
import {loadExamples,json} from '../scripts/inputs.mjs';
const {config,snapshots}=await loadExamples(),c=config.examples.find(e=>e.id==='process'),baseline=await json(c.roadmap),snapshot=snapshots.find(s=>s.id==='process').snapshot,delivery=await json('examples/progress/process.json');
const copy=x=>structuredClone(x),revision='a'.repeat(64);
function reader(data,change=()=>{}){
 const items=new Map(data.items.map(i=>[i.kind+'/'+i.id,i]));let calls=0;
 return async args=>{
  calls++;change(args,calls,data);
  if(args.join(' ')==='local status')return {healthy:true,api:{api:{live_status:200,ready_status:200,protected_status:401,readiness:{reason:'clean'}}}};
  assert.equal(args[0],'query');let result;
  if(args[1]==='board-v2'){
   const filter=new URLSearchParams(args[3]),k=filter.get('kind')+'/'+filter.get('q');
   const rows=filter.has('scope')?Object.values(data.workflows).filter(w=>w.key!==filter.get('scope')&&w.parent!==null).map(copy):[copy(data.workflows[k])];
   result={schema:'devgraph.kanban.v2',revision,total:rows.length,columns:[{id:'backlog',count:rows.length,items:rows,next_cursor:null}]};
  }else if(args[1]==='work')result={item:copy(items.get(args[2]+'/'+args[3]))};
  else if(args[1]==='children')result={items:[...items.values()].filter(i=>data.workflows[i.kind+'/'+i.id].parent===args[2]+'/'+args[3]).map(copy)};
  else if(args[1]==='dependencies')result={items:data.dependencies[args[3]].map(id=>copy(items.get('Issue/'+id)))};
  else throw Error('Mutation or unsupported query');
  return result;
 };
}
test('live collector preserves full scope and a coherent scoped version vector',async()=>{const result=await collectCurrent(reader(copy(baseline)),baseline);assert.equal(result.data.items.length,100);assert.equal(result.packet.read_count,93);assert.equal(result.data.summary.issue_dependencies,33);assert.equal(result.packet.mutations,0);});
test('live collector accepts genuine new workflow progress with current version',async()=>{const d=copy(baseline),item=d.items.find(i=>i.kind==='Task'&&d.workflows['Task/'+i.id].parent);item.version++;const w=d.workflows['Task/'+item.id];w.version=String(item.version);w.progress='in_progress';const result=await collectCurrent(reader(d),baseline);assert.equal(result.data.summary.task_progress_counts.in_progress,1);assert.equal(result.data.summary.task_progress_counts.not_started,66);});
test('changed scoped version cannot publish a partial current capture',async()=>{let count=0;const read=reader(copy(baseline));await assert.rejects(collectCurrent(async args=>{const r=await read(args);if(args[1]==='board-v2'&&++count===4)r.columns[0].items[0].version=String(Number(r.columns[0].items[0].version)+1);return r;},baseline),/Scoped workflows changed/);});
test('unrelated global revisions do not invalidate an unchanged scoped vector',async()=>{let count=0;const read=reader(copy(baseline));const result=await collectCurrent(async args=>{const r=await read(args);if(args[1]==='board-v2')r.revision=String(++count).padStart(64,'0');return r;},baseline);assert.equal(result.data.items.length,100);assert.equal(result.data.scope_revision.length,64);});
test('Work and workflow version disagreement rejects capture',async()=>{const d=copy(baseline);d.items.find(i=>i.kind==='Task').version++;await assert.rejects(collectCurrent(reader(d),baseline),/disagreement/);});
test('failed CLI read cannot yield a current export',async()=>{const read=reader(copy(baseline));await assert.rejects(collectCurrent(async args=>{if(args[1]==='children')throw Error('offline');return read(args);},baseline),/offline/);});
test('missing or ambiguous scoped workflow rejects capture',async()=>{const read=reader(copy(baseline));await assert.rejects(collectCurrent(async args=>{const r=await read(args);if(args[1]==='board-v2')r.total++;return r;},baseline),/Incomplete/);});
test('changed dependency pass rejects capture before publication',async()=>{let count=0;const read=reader(copy(baseline));await assert.rejects(collectCurrent(async args=>{const r=await read(args);if(args[1]==='dependencies'&&++count>26&&r.items.length)r.items=[];return r;},baseline),/changed during capture/);});
test('live observer checks protected boundary before collecting Work',async()=>{await assert.rejects(collectCurrent(async()=>({healthy:true,api:{api:{live_status:200,ready_status:200,protected_status:200}}}),baseline),/Devgraph unavailable/);});
test('delivery milestones preserve Project ownership and evidence is required',()=>{validateDelivery(delivery,snapshot);assert.deepEqual(deliveryCounts(delivery),{validated:7,partial:2,pending:3,total:12});const d=copy(delivery);d.milestones[0].evidence=[];assert.throws(()=>validateDelivery(d,snapshot),/needs evidence/);const bad=copy(delivery);bad.milestones[0].project_ids=['invented'];assert.throws(()=>validateDelivery(bad,snapshot),/Invalid delivery/);});
test('delivery cannot introduce gate/Task completion or private paths',()=>{for(const value of [{...delivery,done:true},{...delivery,scope:{...delivery.scope,summary:'/Users/example/key'}}])assert.throws(()=>validateDelivery(value,snapshot));const d=copy(delivery);d.milestones[0].state='passed';assert.throws(()=>validateDelivery(d,snapshot));});
test('live envelope refuses cross-example publication and unsafe metadata',()=>{const v={schema:'roadmap.live/v1',example_id:'process',refreshing:false,work_write_ready:false,repositories:[],snapshot,delivery,plan:null,checked_at:null,last_success_at:null,last_attempt_at:null,error:null};validateLive(v,'process');assert.throws(()=>validateLive(v,'zendo'));assert.throws(()=>validateLive({...v,checked_at:'invalid'},'process'));assert.throws(()=>validateLive({...v,error:'/Users/example/private'},'process'));});

 test('skill tree keeps old milestones compatible as independent roots',()=>{const d=copy(delivery);for(const m of d.milestones){delete m.requires;delete m.short_title;}validateDelivery(d,snapshot);const tree=deliveryTree(d);assert.equal(tree.levels.length,1);assert.equal(tree.edges.length,0);assert.equal(tree.nodes.find(n=>n.id==='mac-install').availability,'validated');});
 test('skill tree rejects dangling, duplicate and cyclic prerequisites',()=>{for(const requirements of [['missing'],['runtime-core','runtime-core'],['native-issuer']]){const d=copy(delivery);d.milestones.find(n=>n.id==='native-issuer').requires=requirements;assert.throws(()=>validateDelivery(d,snapshot),/prerequisites/);}const d=copy(delivery);d.milestones[0].requires=['your-pilot'];assert.throws(()=>validateDelivery(d,snapshot),/Cyclic/);});
 test('skill tree exposes parallel branches and never upgrades unfinished evidence',()=>{const tree=deliveryTree(delivery),find=id=>tree.nodes.find(n=>n.id===id);assert.equal(tree.levels.length,5);assert.equal(find('mac-install').depth,find('live-provider').depth);assert.equal(find('mac-install').availability,'validated');assert.equal(find('live-provider').availability,'locked');assert.equal(find('native-integration').availability,'partial');assert.equal(find('your-pilot').availability,'locked');assert.equal(find('jess-install').depth,4);assert.equal(tree.edges.length,17);assert.deepEqual(deliveryCounts(delivery),{validated:7,partial:2,pending:3,total:12});});
test('compact milestone labels remain optional and reject invalid values',()=>{for(const value of ['',4,null]){const d=copy(delivery);d.milestones[0].short_title=value;assert.throws(()=>validateDelivery(d,snapshot));}});

test('optional status labels preserve legacy reads and unfinished milestone state',()=>{const d=copy(delivery);for(const m of d.milestones)delete m.status_label;validateDelivery(d,snapshot);const old=deliveryTree(d).nodes.find(n=>n.id==='native-issuer');assert.equal(deliveryStatus(old),'Partly implemented');const current=deliveryTree(delivery).nodes;assert.equal(deliveryStatus(current.find(n=>n.id==='mac-install')),'Demo: installed');for(const id of ['native-issuer','native-integration'])assert.equal(current.find(n=>n.id===id).availability,'partial');assert.equal(deliveryStatus(current.find(n=>n.id==='native-issuer')),'Demo: source checked');assert.equal(deliveryStatus(current.find(n=>n.id==='native-integration')),'Demo: integration pending');for(const value of ['',null,4,'x'.repeat(41)]){const bad=copy(delivery);bad.milestones[0].status_label=value;assert.throws(()=>validateDelivery(bad,snapshot));}});
