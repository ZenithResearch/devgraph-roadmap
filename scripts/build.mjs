import {mkdir,writeFile,cp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {loadExamples,root,digest} from './inputs.mjs';
import {loadJourneys} from './journeys.mjs';
import {validateDelivery} from '../src/delivery-model.js';
import {validateProjectionDescriptor} from '../src/journey-model.js';
const {config,snapshots,manifest}=await loadExamples();
const journeys=await loadJourneys(snapshots);
const dist=path.join(root,'dist');await rm(dist,{recursive:true,force:true});await mkdir(path.join(dist,'snapshots'),{recursive:true});
for(const name of ['index.html','styles.css','journey.html','journey.css','src','contracts'])await cp(path.join(root,name),path.join(dist,name),{recursive:true});
const catalog={schema:'roadmap.catalog/v1',default_example:config.default_example,examples:[]};
for(const {id,label,snapshot} of snapshots){const bytes=JSON.stringify(snapshot,null,2)+'\n',file='snapshots/'+id+'.json';validateProjectionDescriptor({file,sha256:digest(bytes)});await mkdir(path.dirname(path.join(dist,file)),{recursive:true});await writeFile(path.join(dist,file),bytes);catalog.examples.push({id,label,file,sha256:digest(bytes),live:config.examples.find(e=>e.id===id).adapter==='devgraph'});}
await writeFile(path.join(dist,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
await mkdir(path.join(dist,'journeys'),{recursive:true});
const journeyCatalog={schema:'roadmap.journey-catalog/v1',default_example:config.default_example,examples:[]};
for(const {entry,plan} of journeys){const bytes=JSON.stringify(entry,null,2)+'\n',file='journeys/'+entry.id+'.json';validateProjectionDescriptor({file,sha256:digest(bytes)});await mkdir(path.dirname(path.join(dist,file)),{recursive:true});await writeFile(path.join(dist,file),bytes);let planDescriptor=null;if(plan){const planBytes=JSON.stringify(plan,null,2)+'\n',planFile='journeys/'+entry.id+'-plan.json';validateProjectionDescriptor({file:planFile,sha256:digest(planBytes)});await mkdir(path.dirname(path.join(dist,planFile)),{recursive:true});await writeFile(path.join(dist,planFile),planBytes);planDescriptor={file:planFile,sha256:digest(planBytes)};}const s=catalog.examples.find(e=>e.id===entry.id);let deliveryDescriptor=null;
 try{const delivery=JSON.parse(await readFile(path.join(root,'examples/progress',entry.id+'.json'),'utf8'));validateDelivery(delivery,snapshots.find(x=>x.id===entry.id).snapshot);const deliveryBytes=JSON.stringify(delivery,null,2)+'\n',deliveryFile='journeys/'+entry.id+'-delivery.json';deliveryDescriptor={file:deliveryFile,sha256:digest(deliveryBytes)};validateProjectionDescriptor(deliveryDescriptor);await writeFile(path.join(dist,deliveryFile),deliveryBytes);}catch(error){if(error.code!=='ENOENT')throw error;}
 journeyCatalog.examples.push({id:s.id,label:s.label,snapshot:{file:s.file,sha256:s.sha256},journey:{file,sha256:digest(bytes)},plan:planDescriptor,delivery:deliveryDescriptor,live:config.examples.find(e=>e.id===s.id).adapter==='devgraph'});}
await writeFile(path.join(dist,'journeys.catalog.json'),JSON.stringify(journeyCatalog,null,2)+'\n');
await writeFile(path.join(dist,'build.json'),JSON.stringify({schema:'roadmap.build/v1',source_manifest_sha256:digest(await readFile(path.join(root,'examples/provenance.json'))),captured_at:manifest.captured_at,examples:snapshots.map(({id,rollup})=>({id,rollup}))},null,2)+'\n');
process.stdout.write(JSON.stringify({built:true,examples:snapshots.map(({id,rollup})=>({id,rollup}))},null,2)+'\n');
