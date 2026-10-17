import {base, noTokens, provenance, portableReference} from './shared.mjs';
export function adaptDevgraph(config, data, evidence, manifest) {
 if(data.schema !== 'devgraph.work-export/v1' || evidence.schema !== 'process-execution.roadmap-snapshot.v1')throw Error('Unsupported Devgraph input version');
 if(typeof evidence.workflow_tracking_stale!=='boolean' || evidence.production_ready!==false || data.summary.production_ready!==false)throw Error('Unsupported process qualification facts');
 for(const g of evidence.completion_plan.gates)if('status' in g || 'proof' in g)throw Error('Unsupported process gate completion facts');
 const workflows=data.workflows, byKey=new Map(data.items.map(i=>[i.kind+'/'+i.id,i]));
 if(byKey.size !== data.items.length || byKey.size !== Object.keys(workflows).length)throw Error('Canonical work export disagreement');
 for(const [key,item] of byKey){const w=workflows[key];if(!w || w.kind!==item.kind || w.id!==item.id || w.title!==item.title || Number(w.version)!==item.version)throw Error('Canonical record/workflow mismatch');}
 const original=data.items.filter(i=>i.kind==='Initiative');if(original.length!==1)throw Error('One Initiative required');const initiative=original[0];
 const child=(kind,parent)=>data.items.filter(i=>i.kind===kind && workflows[kind+'/'+i.id].parent===parent);
 const evidenceTasks=new Map(evidence.projects.flatMap(p=>p.issues.flatMap(i=>i.tasks)).map(t=>[t.id,t]));
 const claims=[];
 const projects=child('Project','Initiative/'+initiative.id).map(p=>({...base(p,workflows['Project/'+p.id]),label:evidence.projects.find(x=>x.id===p.id)?.label || 'Retained history',issues:child('Issue','Project/'+p.id).map(i=>({...base(i,workflows['Issue/'+i.id]),depends_on:data.dependencies[i.id] || [],tasks:child('Task','Issue/'+i.id).map(t=>{
  const mapped={...base(t,workflows['Task/'+t.id]),acceptance:[],blocker_ids:[],estimate:{hours:null,points:null,source_id:null},tokens:noTokens()};const local=evidenceTasks.get(t.id);
  if(local){if(local.title!==t.title)throw Error('Evidence title mismatch');mapped.acceptance=[local.acceptance];mapped.evidence={state:'recorded',summary:local.qualification,references:local.files.map(path=>({source_id:'process-evidence',label:'Historical source/test evidence path',path:portableReference(path)}))};claims.push({text:local.acceptance,work_id:t.id,lane:'evidence',source_id:'process-evidence'});}
  return mapped;
 })}))}));
 const activeProjects=projects.filter(p=>!p.canonical.archived), activeIssues=activeProjects.flatMap(p=>p.issues.filter(i=>!i.canonical.archived)), tasks=activeIssues.flatMap(i=>i.tasks);
 if(activeIssues.length!==data.summary.issues_with_review_plan || tasks.length!==data.summary.core_tasks || tasks.length!==evidence.core_task_count)throw Error('Canonical scope disagreement');
 if(activeIssues.reduce((n,i)=>n+i.depends_on.length,0)!==data.summary.issue_dependencies)throw Error('Canonical dependency count disagreement');
 const progressCounts={};for(const t of tasks){const key=t.canonical.progress??'unknown';progressCounts[key]=(progressCounts[key]??0)+1;}
 const orderedCounts=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
 if(!data.summary.task_progress_counts || orderedCounts(progressCounts)!==orderedCounts(data.summary.task_progress_counts))throw Error('Canonical progress count disagreement');
 const progressSummary=Object.entries(progressCounts).sort(([a],[b])=>a.localeCompare(b)).map(([status,count])=>`${count} ${status}`).join(' · ');
 const trackingLag=evidence.workflow_tracking_stale?'The dated evidence source reports workflow tracking lag.':'The dated evidence source does not report workflow tracking lag; this is not a live refresh.';
 // The unparented standalone Task is disclosed but excluded from the core hierarchy.
 const coreIds=new Set([initiative.id,...projects.flatMap(p=>[p.id,...p.issues.flatMap(i=>[i.id,...i.tasks.map(t=>t.id)])])]);
 const omitted=data.items.filter(i=>!coreIds.has(i.id));if(omitted.length!==data.summary.standalone_followup_tasks || omitted.some(i=>i.kind!=='Task'))throw Error('Unexpected unparented canonical Work');
 return {schema:'roadmap.snapshot/v1',branding:config.branding,snapshot:provenance(manifest,config.source_ids,data.as_of,[
  'Frozen successful canonical query/workflow readback; no live tracker access or mutation occurs in this observer.',
  `${tasks.length} core Tasks and ${data.summary.issue_dependencies} Issue dependencies; archived records remain inspectable and are excluded from active rollups.`,
  `${omitted.length} standalone follow-up Task is outside the ${tasks.length}-Task scope: ${omitted.map(i=>'Task/'+i.id).join(', ')}.`,
  `Local evidence projection dated ${evidence.observed_at}; source/test paths are historical claims with pending acceptance, not current production proof.`,
  `${trackingLag} No workflow transition or production admission is inferred.`
 ]),initiative:{...base(initiative,workflows['Initiative/'+initiative.id]),projects},groups:config.groups,gates:evidence.completion_plan.gates.map(g=>({id:g.id,title:g.id.replaceAll('-',' '),status:'open',summary:g.action+' Required evidence: '+g.evidence,requires:g.requires,source_id:'process-evidence'})),claims,blockers:[{id:'workflow-qualification',title:'Canonical workflow qualification is not supplied by this source',description:'This frozen input contains pending qualification plans rather than completion receipts. Local implementation evidence cannot advance canonical acceptance.',status:'open'}],qualification:{state:'unqualified',summary:'Production disabled. Native authority, providers, installed release qualification and cutover gates remain independent.'},tracking:{state:evidence.workflow_tracking_stale?'stale':'unknown',summary:`Canonical active Task progress: ${progressSummary}. ${trackingLag} Local implementation evidence is a separate projection.`}};
}
