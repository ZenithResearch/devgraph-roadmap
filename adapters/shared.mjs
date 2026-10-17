// Browser references are portable; exact operator paths stay in the local manifest.
export const portableReference = value => value
  .replace(/\/(?:Volumes\/home|Users)\/[^/]+\/repos\//g,'repo:')
  .replace(/\/(?:Volumes\/home|Users)\/[^/]+\//g,'operator-home:')
  .replace(/\/(?:private\/)?tmp\//g,'operator-evidence:');
export const noEvidence = () => ({state:'none',summary:'No implementation evidence recorded in this snapshot.',references:[]});
export const canonical = (item, workflow = null) => ({legacy_status:item.status ?? null,stage:workflow?.stage ?? null,progress:workflow?.progress ?? null,archived:workflow?.archived ?? item.status === 'archived',version:item.version == null ? null : Number(item.version),workflow_id:workflow?.workflow_id ?? null,done:workflow?.progress == null ? null : workflow.progress === 'done'});
export const base = (item, workflow = null) => ({id:item.id,kind:item.kind,title:item.title,description:(item.description || '').split('\n\n[')[0].trim(),canonical:canonical(item,workflow),evidence:noEvidence()});
export const noTokens = () => ({coverage:'unobserved',total:null,source_id:null,as_of:null});
export const provenance = (manifest, ids, asOf, limitations) => ({as_of:asOf,captured_at:manifest.captured_at,authority:'Devgraph',sources:ids.map(id => {
 const s=manifest.files.find(f => f.id === id);if(!s)throw Error(`Unknown manifest source ${id}`);
 return {id,path:s.frozen_path,sha256:s.frozen_sha256,role:s.role};
}),limitations:[...limitations,'Browser source references identify reviewed frozen files by their own digests; exact operator paths and upstream-to-frozen transformations remain in the local audit manifest.']});
