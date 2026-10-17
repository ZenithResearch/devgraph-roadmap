const exact=(v,keys)=>{if(!v||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))throw Error('Unknown delivery fields');};
const strings=v=>Array.isArray(v)&&v.every(s=>typeof s==='string'&&s.length>0);
export const deliveryStateText={validated:'Validated locally',partial:'Partly implemented',available:'Ready to start',locked:'Needs prerequisites'};
export const deliveryStatus=node=>node.status_label??deliveryStateText[node.availability];
export function validateDelivery(d,snapshot){
 exact(d,['schema','example_id','reviewed_at','scope','removed_requirements','milestones','next_actions']);
 if(d.schema!=='roadmap.delivery-progress/v1'||typeof d.example_id!=='string'||!Number.isFinite(Date.parse(d.reviewed_at)))throw Error('Invalid delivery version/date');
 exact(d.scope,['platform','targets','summary']);if(typeof d.scope.platform!=='string'||!strings(d.scope.targets)||typeof d.scope.summary!=='string')throw Error('Invalid delivery scope');
 if(!strings(d.removed_requirements)||!strings(d.next_actions)||!Array.isArray(d.milestones)||!d.milestones.length)throw Error('Missing delivery content');
 const projects=new Set(snapshot.initiative.projects.map(p=>p.id)),ids=new Set();
 for(const m of d.milestones){exact(m,['id','title','state','summary','project_ids','evidence','repository_ids',...(Object.hasOwn(m,'requires')?['requires']:[]),...(Object.hasOwn(m,'short_title')?['short_title']:[]),...(Object.hasOwn(m,'status_label')?['status_label']:[])]);if((m.status_label!==undefined&&(typeof m.status_label!=='string'||!m.status_label.trim()||m.status_label.length>40))||(m.short_title!==undefined&&(typeof m.short_title!=='string'||!m.short_title.trim()))||typeof m.id!=='string'||ids.has(m.id)||!['validated','partial','pending'].includes(m.state)||typeof m.title!=='string'||typeof m.summary!=='string'||!strings(m.project_ids)||m.project_ids.some(id=>!projects.has(id))||!Array.isArray(m.evidence)||m.evidence.some(x=>typeof x!=='string')||!strings(m.repository_ids))throw Error('Invalid delivery milestone');ids.add(m.id);if(m.state==='validated'&&!m.evidence.length)throw Error('Validated milestone needs evidence');}
 deliveryTree(d);
 if(/\/(?:Users|Volumes|private)\//.test(JSON.stringify(d)))throw Error('Private paths cannot ship in delivery data');return d;
}
export function deliveryCounts(d){return {validated:d.milestones.filter(m=>m.state==='validated').length,partial:d.milestones.filter(m=>m.state==='partial').length,pending:d.milestones.filter(m=>m.state==='pending').length,total:d.milestones.length};}
// Planned implementation prerequisites; never canonical workflow transitions.
export function deliveryTree(d){
 const byId=new Map(d.milestones.map(m=>[m.id,m])),depths=new Map(),visiting=new Set();
 for(const m of d.milestones)if(m.requires!==undefined&&(!strings(m.requires)||new Set(m.requires).size!==m.requires.length||m.requires.some(id=>!byId.has(id))))throw Error('Invalid milestone prerequisites');
 const depth=id=>{if(depths.has(id))return depths.get(id);if(visiting.has(id))throw Error('Cyclic milestone prerequisites');visiting.add(id);const value=Math.max(-1,...(byId.get(id).requires??[]).map(depth))+1;visiting.delete(id);depths.set(id,value);return value;};
 const nodes=d.milestones.map(m=>({...m,depth:depth(m.id),availability:m.state==='validated'?'validated':m.state==='partial'?'partial':(m.requires??[]).every(id=>byId.get(id).state==='validated')?'available':'locked'}));
 return {nodes,levels:Array.from({length:Math.max(...nodes.map(n=>n.depth))+1},(_,i)=>nodes.filter(n=>n.depth===i)),edges:nodes.flatMap(n=>(n.requires??[]).map(from=>({from,to:n.id})))};
}
