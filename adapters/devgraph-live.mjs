import {isDeepStrictEqual as equal} from 'node:util';
import {createHash} from 'node:crypto';

const fields=['id','kind','title','description','status','version','artifact_ids'];
const key=i=>`${i.kind}/${i.id}`;
const check=(ok,message)=>{if(!ok)throw Error(message);};
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
const version=v=>(typeof v==='number'||typeof v==='string'&&/^[0-9]+$/.test(v))&&Number.isSafeInteger(Number(v))&&Number(v)>0;
const boardFields=['key','kind','id','title','priority','version','progress','progress_label','archived','workflow_id','stage','parent'];
async function scopeRead(read,root,standalone){
 const filters=[{archived:'include',scope:root,descendants:'true',limit:'100'},{archived:'include',kind:root.split('/')[0],q:root.split('/')[1],limit:'1'},{archived:'include',kind:standalone.split('/')[0],q:standalone.split('/')[1],limit:'1'}];
 const workflows={};let globalRevision;
 for(const [index,filter]of filters.entries()){
  const r=await read(['query','board-v2','--filter',new URLSearchParams(filter).toString()]);
  check(r.schema==='devgraph.kanban.v2'&&/^[a-f0-9]{64}$/.test(r.revision)&&Array.isArray(r.columns)&&r.columns.every(c=>c.next_cursor===null&&c.count===c.items.length),'Incomplete scoped board');
  const rows=r.columns.flatMap(c=>c.items);check(rows.length===r.total&&(index===0?rows.length===98:rows.length===1&&rows[0].key===[root,standalone][index-1]),'Incomplete scoped workflow');
  for(const item of rows){check(boardFields.every(f=>Object.hasOwn(item,f))&&item.key===key(item)&&version(item.version)&&[null,'not_started','in_progress','done'].includes(item.progress)&&typeof item.archived==='boolean'&&!Object.hasOwn(workflows,item.key),'Malformed scoped workflow');workflows[item.key]={...pick(item,boardFields),classification_required:item.progress===null};}
  globalRevision=r.revision;
 }
 const sorted=Object.fromEntries(Object.entries(workflows).sort(([a],[b])=>a.localeCompare(b)));
 return {workflows:sorted,global_revision:globalRevision,fingerprint:createHash('sha256').update(JSON.stringify(sorted)).digest('hex')};
}

// Only supported CLI reads. Scope comes from the previously reviewed export,
// never from an HTTP request. A changing/partial read never returns an export.
export async function collectCurrent(read,baseline,{now=()=>new Date().toISOString(),maxMilliseconds=240000}={}){
 const started=Date.now(),scope=new Map(baseline.items.map(i=>[key(i),i])),reads=[];
 check(scope.size===100&&scope.size===Object.keys(baseline.workflows).length,'Unsupported live scope');
 const root=[...scope.values()].find(i=>i.kind==='Initiative');
 const standalone=[...scope.values()].find(i=>i.kind==='Task'&&baseline.workflows[key(i)].parent===null);
 check(root&&standalone,'Missing scoped roots');
 const call=async args=>{
  check(reads.length<350&&Date.now()-started<maxMilliseconds,'Read budget exhausted');
  check(args.join(' ')==='local status'||args[0]==='query'&&['board-v2','work','children','dependencies'].includes(args[1]),'Non-read command');
  const value=await read(args);check(value&&typeof value==='object'&&!value.error,'Unavailable read');
  const retained=args[0]==='local'?{healthy:value.healthy,api:value.api?.api&&pick(value.api.api,['live_status','ready_status','protected_status','readiness'])}:args[1]==='board-v2'?pick(value,['schema','revision','columns','total']):value;
  reads.push({args,observed_at:now(),result:retained});return value;
 };
 const health=await call(['local','status']),api=health.api?.api;
 check(health.healthy===true&&api?.live_status===200&&api.ready_status===200&&api.protected_status===401&&api.readiness?.reason==='clean','Devgraph unavailable');
 const first=await scopeRead(call,key(root),key(standalone)),workflows=first.workflows;
 check(Object.keys(workflows).length===scope.size&&[...scope.keys()].every(k=>Object.hasOwn(workflows,k)),'Incomplete scoped workflow');
 const items=new Map(),parents=new Map();
 const observe=item=>{
  const resource=key(item),w=workflows[resource];
  check(scope.has(resource)&&fields.every(f=>Object.hasOwn(item,f))&&Number.isSafeInteger(item.version)&&item.version===Number(w.version)&&item.title===w.title&&typeof item.description==='string'&&Array.isArray(item.artifact_ids),'Work/workflow disagreement');
  const clean=pick(item,fields);check(!items.has(resource)||equal(items.get(resource),clean),'Work changed during capture');items.set(resource,clean);return resource;
 };
 const relations=async(relation,kind,id)=>{
  const rows=[],seen=new Set();let after;
  for(let page=0;page<3;page++){
   const args=['query',relation,kind,id,'--limit','100'];if(after)args.push('--after-resource',after);
   const result=await call(args);check(Object.keys(result).length===1&&Array.isArray(result.items)&&result.items.length<=100,'Malformed relationships');
   for(const item of result.items){const resource=key(item);check(scope.has(resource)&&!seen.has(resource)&&(!after||resource>after),'Out-of-scope or duplicate relationship');seen.add(resource);rows.push(item);}
   if(result.items.length<100)return rows;after=key(result.items.at(-1));
  }
  throw Error('Relationship budget exhausted');
 };
 const rootValue=await call(['query','work',root.kind,root.id]);check(rootValue.item&&observe(rootValue.item)===key(root),'Wrong Initiative');
 const queue=[rootValue.item];
 for(const parent of queue){if(parent.kind==='Task')continue;for(const child of await relations('children',parent.kind,parent.id)){const resource=observe(child);check(!parents.has(resource)&&resource!==key(root),'Cyclic/duplicate containment');parents.set(resource,key(parent));queue.push(child);}}
 const followup=await call(['query','work',standalone.kind,standalone.id]);check(followup.item&&observe(followup.item)===key(standalone),'Wrong standalone Task');
 check(queue.length===99&&items.size===scope.size,'Incomplete canonical scope');
 for(const resource of scope.keys())check(workflows[resource].parent===(parents.get(resource)??null)&&workflows[resource].parent===baseline.workflows[resource].parent,'Containment changed; scope review required');
 const issues=[...items.values()].filter(i=>i.kind==='Issue').map(i=>i.id).sort();
 const dependencies=async()=>{
  const result={};for(const id of issues){const rows=await relations('dependencies','Issue',id);for(const item of rows){observe(item);check(item.kind==='Issue','Non-Issue dependency');}result[id]=rows.map(i=>i.id).sort();}return result;
 };
 const deps=await dependencies();check(equal(deps,await dependencies()),'Dependencies changed during capture');
 const active=new Set(issues.filter(id=>!workflows[`Issue/${id}`].archived)),done=new Set(),stack=new Set();
 const visit=id=>{check(!stack.has(id),'Dependency cycle');if(done.has(id))return;check(active.has(id),'Active dependency outside scope');stack.add(id);for(const dep of deps[id])visit(dep);stack.delete(id);done.add(id);};
 for(const id of active)visit(id);
 const covered=new Set();const cover=id=>{if(covered.has(id))return;covered.add(id);for(const dep of deps[id])cover(dep);};cover('demo-issue-012');check(covered.size===active.size,'Cutover dependency coverage changed');
 const end=await scopeRead(call,key(root),key(standalone));check(end.fingerprint===first.fingerprint&&equal(end.workflows,workflows),'Scoped workflows changed; keep previous snapshot');
 const progress={};let coreTasks=0;for(const [resource,w]of Object.entries(workflows))if(w.kind==='Task'&&resource!==key(standalone)&&!w.archived){coreTasks++;const p=w.progress??'unknown';progress[p]=(progress[p]??0)+1;}
 check(coreTasks===67&&active.size===22,'Active scope changed; review required');
 const completed=now();
 const summary={issues_with_review_plan:active.size,core_tasks:coreTasks,standalone_followup_tasks:1,issue_dependencies:[...active].reduce((n,id)=>n+deps[id].length,0),cutover_issue_coverage:22,acyclic:true,records_read_back:items.size,task_progress_counts:progress,workflow_mutations:0,authority_changes:0,production_ready:false,description_patches_verified:0};
 const data={schema:'devgraph.work-export/v1',as_of:completed,revision:end.global_revision,scope_revision:end.fingerprint,items:[...items.values()].sort((a,b)=>key(a).localeCompare(key(b))),workflows,dependencies:deps,summary};
 return {data,packet:{schema:'roadmap.live-read-packet/v1',completed_at:completed,revision:end.global_revision,scope_revision:end.fingerprint,read_count:reads.length,reads,coherence:'Identical complete 100-record scoped workflow/version vectors before and after Work/hierarchy reads and two dependency passes. Unrelated global revisions may change; no cross-scope data is projected. Bounded read, not a server transaction.',mutations:0}};
}

export async function readRevision(read,resource,standalone){
 return (await scopeRead(read,resource,standalone)).fingerprint;
}
