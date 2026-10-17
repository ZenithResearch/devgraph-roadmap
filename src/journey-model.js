import {assertSchema,allWork,rollup} from './model.js';
const portable=value=>{if(/\/(?:Users|Volumes|private)\//.test(JSON.stringify(value)))throw Error('Operator paths cannot ship in a projection');};
const unique=(values,label)=>{if(new Set(values).size!==values.length)throw Error(`Duplicate ${label}`);};
export function validateJourneys(config,schema,snapshots){
 assertSchema(config,schema);unique(config.examples.map(e=>e.id),'journey example');
 for(const example of config.examples){const snapshot=snapshots.find(s=>s.id===example.id)?.snapshot;if(!snapshot)throw Error('Unknown journey example');validateJourney(example,snapshot);}
 return config;
}
export function validateJourney(example,snapshot){
 portable(example);
 const gates=new Map(snapshot.gates.map(g=>[g.id,g]));const projects=new Map(snapshot.initiative.projects.filter(p=>!p.canonical.archived).map(p=>[p.id,p]));
 unique(example.levels.map(l=>l.gate_id),'journey gate');
 if(example.levels.length!==gates.size)throw Error('Journey must preserve every gate');
 for(const l of example.levels){if(!gates.has(l.gate_id))throw Error('Unknown journey gate');unique(l.milestones.map(m=>m.project_id),'milestone project');
  for(const m of l.milestones){const p=projects.get(m.project_id);if(!p)throw Error('Unknown or archived milestone project');unique(m.issue_ids,'milestone issue');for(const id of m.issue_ids)if(!p.issues.some(i=>i.id===id&&!i.canonical.archived))throw Error('Milestone issue outside Project');}
 }
 for(const g of gates.values())if(g.status==='passed'&&g.requires.some(id=>gates.get(id)?.status!=='passed'))throw Error('Passed gate has unmet prerequisites');
 return example;
}
export function validateGatePlan(plan,schema,snapshot){
 assertSchema(plan,schema);if(!snapshot.gates.some(g=>g.id===plan.gate_id))throw Error('Unknown plan gate');
 const work=new Map(allWork(snapshot).map(w=>[w.id,w]));const owners=new Map(snapshot.initiative.projects.filter(p=>!p.canonical.archived).flatMap(p=>p.issues.filter(i=>!i.canonical.archived).flatMap(i=>i.tasks.filter(t=>!t.canonical.archived).map(t=>[t.id,p.id]))));const phases=new Map(plan.phases.map(p=>[p.id,p]));unique(plan.phases.map(p=>p.id),'plan phase');if(!phases.size)throw Error('Plan needs phases');
 const visit=(id,stack=new Set())=>{if(!phases.has(id))throw Error('Unknown plan prerequisite');if(stack.has(id))throw Error('Plan phase cycle');const next=new Set(stack).add(id);for(const dep of phases.get(id).depends_on)visit(dep,next);};
 for(const p of plan.phases){visit(p.id);if(!p.exit_evidence.length)throw Error('Phase needs exit evidence');unique(p.depends_on,'phase prerequisite');unique(p.task_ids,'phase Task');unique(p.project_ids,'phase Project');for(const id of p.task_ids)if(work.get(id)?.kind!=='Task'||work.get(id).canonical.archived)throw Error('Unknown plan Task');for(const id of p.task_ids)if(!p.project_ids.includes(owners.get(id)))throw Error('Plan Task outside active owner Projects');for(const id of p.project_ids)if(work.get(id)?.kind!=='Project'||work.get(id).canonical.archived)throw Error('Unknown plan Project');}
 unique(plan.decisions.map(d=>d.id),'plan decision');if(!plan.exit_evidence.length||!plan.reviewers.length)throw Error('Plan needs exit evidence and reviewers');
 portable(plan);return plan;
}
export function levelStates(snapshot,example){
 validateJourney(example,snapshot);const gates=new Map(snapshot.gates.map(g=>[g.id,g]));const projects=new Map(snapshot.initiative.projects.map(p=>[p.id,p]));
 return example.levels.map((l,index)=>{const gate=gates.get(l.gate_id),unmet=gate.requires.filter(id=>gates.get(id)?.status!=='passed');return {...l,number:index+1,gate,state:gate.status==='passed'?'earned':gate.status==='unknown'?'unknown':unmet.length?'waiting':'available',unmet,milestones:l.milestones.map(m=>{const project=projects.get(m.project_id);const issues=project.issues.filter(i=>m.issue_ids.includes(i.id));return {...m,project,issues,counts:rollup([{...project,issues}]),complete:project.canonical.done};})};});
}

export function validateProjectionDescriptor(d){
 if(!d||typeof d.file!=='string'||! /^(?:snapshots|journeys)\/[A-Za-z0-9._:/-]+\.json(?![\s\S])/.test(d.file)||d.file.split('/').some(s=>s==='.'||s==='..'||s==='')||typeof d.sha256!=='string'||! /^[a-f0-9]{64}(?![\s\S])/.test(d.sha256))throw Error('Invalid projection descriptor');
 return d;
}

// A milestone is scoped to its gate and Project, even when a Project contributes
// to several gates. Contribution edges never imply a recorded gate pass.
export function gateSkillTree(snapshot,example){
 const levels=levelStates(snapshot,example),byGate=new Map(levels.map(l=>[l.gate_id,l])),ranks=new Map(),visiting=new Set();
 const rank=id=>{if(ranks.has(id))return ranks.get(id);if(visiting.has(id))throw Error('Gate dependency cycle');if(!byGate.has(id))throw Error('Unknown prerequisite gate');visiting.add(id);const value=Math.max(-1,...byGate.get(id).gate.requires.map(rank))+1;visiting.delete(id);ranks.set(id,value);return value;};
 const groups=levels.map(l=>({...l,id:'gate/'+l.gate_id,rank:rank(l.gate_id),milestones:l.milestones.map((m,index)=>({...m,id:'milestone/'+l.gate_id+'/'+m.project_id,index:index+1}))}));
 const nodes=groups.flatMap(g=>[{id:g.id,kind:'gate',gate_id:g.gate_id,state:g.state},...g.milestones.map(m=>({id:m.id,kind:'milestone',gate_id:g.gate_id,project_id:m.project_id,complete:m.complete}))]);
 const edges=groups.flatMap(g=>[...g.gate.requires.map(id=>({from:'gate/'+id,to:g.id,kind:'prerequisite'})),...g.milestones.map(m=>({from:m.id,to:g.id,kind:'contribution'}))]);
 return {groups,nodes,edges,tiers:Array.from({length:Math.max(...groups.map(g=>g.rank))+1},(_,i)=>groups.filter(g=>g.rank===i))};
}
