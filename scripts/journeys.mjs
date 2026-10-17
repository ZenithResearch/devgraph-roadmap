import {json} from './inputs.mjs';
import {validateJourneys,validateGatePlan} from '../src/journey-model.js';
export async function loadJourneys(snapshots){
 const [config,schema,planSchema]=await Promise.all([json('examples/journeys.json'),json('contracts/roadmap.journeys.v1.schema.json'),json('contracts/roadmap.gate-plan.v1.schema.json')]);
 validateJourneys(config,schema,snapshots);
 if(config.examples.length!==snapshots.length)throw Error('Journey examples must preserve configured snapshots');
 const examples=[];for(const entry of config.examples){const snapshot=snapshots.find(s=>s.id===entry.id).snapshot;const plan=entry.plan_file?validateGatePlan(await json(entry.plan_file),planSchema,snapshot):null;examples.push({entry,plan});}
 return examples;
}
