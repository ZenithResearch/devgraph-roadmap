import {base, noTokens, provenance, portableReference} from './shared.mjs';
export function adaptZendo(config, data, tokens, manifest) {
  if (data.schema !== 'zendo.roadmap/v2' || tokens.schema !== 'zendo.token-rollups/v1') throw Error('Unsupported Zendo input version');
  const tokenMap = new Map(tokens.work_rollups.map(t => [t.work_object_id,t]));
  if(tokenMap.size !== tokens.work_rollups.length)throw Error('Duplicate Zendo token work');
  const artifactMap = new Map(data.artifacts.map(a => [a.id,a]));
  const taskIds = new Set(), claims = [], gates = [];
  const projects = data.initiative.projects.map(p => {
    gates.push({id:p.id+':gate',title:p.title+' exit evidence',status:p.gate_status,summary:p.gate,requires:[],source_id:'zendo-roadmap'});
    claims.push({text:p.gate,work_id:p.id,lane:'qualification',source_id:'zendo-roadmap'});
    const issues = p.issues.map(i => ({...base(i),depends_on:[],tasks:i.tasks.map(t => {
      taskIds.add(t.id);
      const mapped = {...base(t),acceptance:t.acceptance_criteria,blocker_ids:t.blocker_ids,estimate:{hours:t.estimate_hours ?? null,points:t.estimate_points ?? null,source_id:'zendo-roadmap'},tokens:noTokens()};
      const accounting = tokenMap.get(t.id);
      if (!accounting || accounting.work_object_kind !== 'Task' || accounting.task_count !== 1) throw Error(`Missing/invalid token attribution ${t.id}`);
      mapped.tokens={coverage:accounting.coverage,total:accounting.token_total_count,source_id:accounting.coverage === 'unobserved' ? null : 'zendo-tokens',as_of:accounting.coverage === 'unobserved' ? null : tokens.as_of};
      if(t.artifact_ids.length) mapped.evidence={state:'recorded',summary:`${t.artifact_ids.length} source Artifact references. Independently reverified evidence is not asserted by this observer.`,references:t.artifact_ids.map(id => {const a=artifactMap.get(id);if(!a)throw Error(`Unknown artifact ${id}`);return {label:a.title,source_id:'zendo-roadmap',path:a.paths.map(portableReference).join(' · ')};})};
      for(const text of mapped.acceptance)claims.push({text,work_id:t.id,lane:t.status === 'accepted' && t.artifact_ids.length ? 'evidence' : t.status === 'review' ? 'review' : 'queued',source_id:'zendo-roadmap'});
      return mapped;
    })}));
    return {...base(p),label:p.delivery_label,issues};
  });
  const aggregate = tokenMap.get(data.initiative.id), observed = [...taskIds].map(id => tokenMap.get(id)).filter(t => t.token_total_count !== null);
  if (aggregate.task_count !== taskIds.size || aggregate.token_total_count !== observed.reduce((n,t)=>n+t.token_total_count,0)) throw Error('Zendo source token aggregate disagreement');
  if([...tokenMap.values()].filter(t=>t.work_object_kind==='Task').some(t=>!taskIds.has(t.work_object_id)))throw Error('Orphan token work');
  return {schema:'roadmap.snapshot/v1',branding:config.branding,snapshot:provenance(manifest,config.source_ids,data.as_of,[
    'Frozen versioned repository projection of Devgraph; live canonical refetch was not performed.',
    'Legacy accepted and archived statuses do not establish workflow completion. Explicit workflow stage/progress is absent from this source.',
    `Measured token attribution as of ${tokens.as_of}; roadmap as of ${data.as_of}. Partial totals are observed subtotals, not forecasts.`,
    'Artifact references are recorded source claims, not fresh observer verification or tenant/provider qualification.'
  ]),initiative:{...base(data.initiative),projects},groups:config.groups,gates,claims,blockers:data.blockers.map(b=>({id:b.id,title:b.title,description:b.description,status:b.status})),qualification:{state:'unqualified',summary:`${gates.filter(g=>g.status==='passed').length} / ${gates.length} delivery gates passed in the source. Gate statuses do not independently qualify production behavior.`},tracking:{state:'unknown',summary:'Legacy Work statuses retained; explicit workflow completion unavailable.'}};
}
