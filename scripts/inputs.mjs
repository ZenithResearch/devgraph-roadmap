import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {adaptZendo} from '../adapters/zendo.mjs';
import {adaptDevgraph} from '../adapters/devgraph.mjs';
import {assertSchema,validateSnapshot,rollup} from '../src/model.js';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function json(relative){return JSON.parse(await readFile(safePath(relative),'utf8'));}
export function safePath(relative){
 if(path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(s=>s==='..'||s==='.'||s==='')||relative.includes(':'))throw Error('Input paths must be local relative files');
 const resolved=path.resolve(root,relative);if(!resolved.startsWith(root+path.sep))throw Error('Path escapes repository');return resolved;
}
export async function loadExamples(){
 const [config,manifest,schema,configSchema]=await Promise.all([json('examples/config.json'),json('examples/provenance.json'),json('contracts/roadmap.snapshot.v1.schema.json'),json('contracts/roadmap.configuration.v1.schema.json')]);
 assertSchema(config,configSchema);
 const configured=new Set(config.examples.map(e=>e.id));if(configured.size!==config.examples.length||!configured.has(config.default_example))throw Error('Invalid example IDs/default');
 for(const source of manifest.files){if(digest(await readFile(safePath(source.frozen_path)))!==source.frozen_sha256)throw Error('Frozen source digest mismatch: '+source.id);}
 const snapshots=[];
 for(const entry of config.examples){
  if(entry.adapter==='zendo'&&!entry.tokens||entry.adapter==='devgraph'&&!entry.evidence)throw Error('Missing adapter input');
  const data=await json(entry.roadmap);
  const snapshot=entry.adapter==='zendo'?adaptZendo(entry,data,await json(entry.tokens),manifest):adaptDevgraph(entry,data,await json(entry.evidence),manifest);
  validateSnapshot(snapshot,schema);snapshots.push({id:entry.id,label:entry.label,snapshot,rollup:rollup(snapshot.initiative.projects)});
 }
 return {config,manifest,schema,snapshots};
}
