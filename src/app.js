import {validateSnapshot, rollup, tasksFor} from './model.js';
import {connectLive,drawDelivery} from './live-view.js';
const root = document.querySelector('#roadmap-app');
let liveAsOf=null,liveSession;
const q = sel => root.querySelector(sel);
const el = (tag, cls = '', text = null) => {const e=document.createElement(tag);e.className=cls;if(text!==null)e.textContent=String(text);return e;};
const fmt = v => new Intl.NumberFormat('en-CA',{maximumFractionDigits:1}).format(v);
const metric = (label, value) => {const n=el('div');n.append(el('dt','',label),el('dd','',value));return n;};
const list = values => {const n=el('ul');for(const v of values)n.append(el('li','',v));return n;};
let catalog, schema, current, scope='all', includeArchive=false, loadSequence=0, loadAbort;
const openIds=new Set();
const stateLabel = w => {
 const c=w.canonical;
 return c.archived ? 'Archived · completion separate' : c.progress ? `${c.stage || 'stage unavailable'} / ${c.progress}` : `${c.legacy_status || 'status unavailable'} · workflow unavailable`;
};
function disclosure(id, kind, title, note, cls='', label=kind) {
 const d=el('details',cls);d.dataset.workId=id;d.open=openIds.has(id);
 d.addEventListener('toggle',()=>{if(d.open)openIds.add(id);else openIds.delete(id);});
 const s=el('summary');const titleWrap=el('div','identity');titleWrap.append(el('span','eyebrow',label),el(kind==='Project'?'h3':kind==='Issue'?'h4':'span','work-title',title));s.append(titleWrap,el('span','state-note',note));d.append(s);return d;
}
function evidenceBody(w) {
 const body=el('div','work-body');body.append(el('p','description',w.description));
 const facts=el('dl','facts');const c=w.canonical;
 facts.append(metric('Canonical record',`${w.kind}/${w.id} · version ${c.version ?? 'not recorded'}`),metric('Legacy status',c.legacy_status ?? 'Not recorded'),metric('Workflow',c.workflow_id ? `${c.workflow_id} · ${c.stage ?? 'stage absent'} / ${c.progress ?? 'progress absent'}` : 'Not recorded'),metric('Completion',c.done===null?'Unknown: no explicit workflow progress':c.done?'Explicit workflow done':'Not done'),metric('Archive',c.archived?'Archived, excluded from active rollup':'Active'),metric('Evidence',`${w.evidence.state} · ${w.evidence.summary}`));
 body.append(facts);
 if(w.evidence.references.length){const refs=el('details','references');refs.append(el('summary','',`${w.evidence.references.length} evidence references`));const ul=el('ul');for(const r of w.evidence.references){const li=el('li');li.append(el('strong','',r.label),el('p','path',`${r.source_id} · ${r.path ?? 'Source snapshot'}`));ul.append(li);}refs.append(ul);body.append(refs);}
 return body;
}
function taskView(t) {
 const d=disclosure(t.id,'Task',t.title,stateLabel(t),'task-row'),b=evidenceBody(t);
 if(t.acceptance.length)b.append(el('h5','','Observable acceptance'),list(t.acceptance));
 const e=t.estimate, tok=t.tokens, facts=el('dl','facts');
 facts.append(metric('Three-point effort',e.hours?`${fmt(e.hours.optimistic)} / ${fmt(e.hours.likely)} / ${fmt(e.hours.pessimistic)} engineering hours (optimistic / likely / pessimistic) · ${e.source_id}`:'Not recorded'),metric('Fibonacci effort',e.points===null?'Not recorded':`${e.points} pts · ${e.source_id}`),metric('Measured tokens',tok.total===null?'Unobserved':`${fmt(tok.total)} · ${tok.coverage} coverage · ${tok.as_of} · ${tok.source_id}`));
 if(t.blocker_ids.length)facts.append(metric('Blockers',t.blocker_ids.join(' · ')));
 b.append(facts);d.append(b);return d;
}
function projectView(p) {
 const count=rollup([p]);const d=disclosure(p.id,'Project',p.title,`${count.tasks} active Tasks · ${stateLabel(p)}`,'project-row','Project · '+p.label),body=evidenceBody(p);
 for(const i of p.issues.filter(i=>includeArchive||!i.canonical.archived)) {
  const item=disclosure(i.id,'Issue',i.title,`${i.tasks.length} Tasks · ${stateLabel(i)}`,'issue-row'),ib=evidenceBody(i);
  if(i.depends_on.length)ib.append(el('p','dependency','Canonical prerequisites: '+i.depends_on.join(' · ')));
  for(const t of i.tasks.filter(t=>includeArchive||!t.canonical.archived))ib.append(taskView(t));
  item.append(ib);body.append(item);
 }
 d.append(body);return d;
}
function renderProjects() {
 const projects=current.initiative.projects.filter(p=>(includeArchive||!p.canonical.archived)&&(scope==='all'||current.groups.find(g=>g.id===scope)?.project_ids.includes(p.id)));
 const container=q('#projects');container.replaceChildren(...projects.map(projectView));
 q('#scope-result').textContent=`${projects.length} Projects shown. Active summary above always covers the full core scope.`;
}
function section(title, eyebrow) {const s=el('section'),h=el('div','section-heading');h.append(el('p','eyebrow',eyebrow),el('h2','',title));s.append(h);return s;}
function render(s) {
 current=s;q('#quest-link').href='journey.html?example='+encodeURIComponent(q('#example-control').value);document.title=s.branding.label+' roadmap';q('#brand-mark').textContent=s.branding.mark;q('#brand-label').textContent=s.branding.label;
 const content=q('#content');content.replaceChildren();const all=s.initiative.projects,r=rollup(all);
 const overview=section(s.initiative.title,'Initiative / '+s.branding.subtitle);overview.classList.add('overview');const title=overview.querySelector('h2');const heading=el('h1','',title.textContent);title.replaceWith(heading);
 overview.append(el('p','overview-copy',s.initiative.description));
 const facts=el('dl','snapshot-meta');facts.append(metric('Snapshot',s.snapshot.as_of),metric('Authority',s.snapshot.authority),metric('Workflow tracking',s.tracking.state),metric('Scope',`${r.projects} Projects · ${r.issues} Issues · ${r.tasks} Tasks`));overview.append(facts);
 const grid=el('dl','summary-grid');grid.append(
  metric('Canonical completion',r.unknownCompletion===r.tasks?`Unavailable · ${r.tasks} unknown`:`${r.done} / ${r.tasks} explicitly done${r.unknownCompletion ? ' · '+r.unknownCompletion+' unknown' : ''}`),
  metric('Recorded implementation',`${r.recordedEvidence} / ${r.tasks} Tasks`),metric('Independent verification',`${r.verifiedEvidence} Tasks asserted by source`),metric('Production qualification',s.qualification.state),
  metric('Delivery gates',`${s.gates.filter(g=>g.status==='passed').length} / ${s.gates.length} passed`),metric('Likely effort',r.hours===null?'Not recorded':`${fmt(r.hours.likely)}h · ${r.estimateCoverage}/${r.tasks} covered`),metric('Fibonacci scope',r.points===null?'Not recorded':`${fmt(r.points)} pts · ${r.pointCoverage}/${r.tasks} covered`),metric('Measured tokens',r.tokens===null?'Unobserved':`${fmt(r.tokens)} · ${r.tokenCoverage}/${r.tasks} observed or partial`));overview.append(grid);
 overview.append(el('p','accounting-note',`${s.tracking.summary} ${s.qualification.summary}`),el('p','accounting-note',`Legacy accepted: ${r.legacyAccepted} Tasks (not counted as done). Missing estimates and token observations are unknown, not zero. Measured token subtotals do not predict elapsed time or readiness.`));
 const provenance=el('details','provenance');provenance.append(el('summary','','Snapshot provenance and limitations'));provenance.append(list(s.snapshot.limitations));
 for(const src of s.snapshot.sources){const p=el('p','path');p.append(el('strong','',src.id+' · '+src.role),el('br'),el('span','',src.path),el('br'),el('code','',src.sha256));provenance.append(p);}provenance.append(el('p','accounting-note','Frozen capture: '+s.snapshot.captured_at));overview.append(provenance);content.append(overview);
 const horizon=section('Claims against the codebase','Claims / Evidence horizon'),lanes=el('div','claim-lanes');
 const definitions=[['evidence','Evidence recorded','Source claims with artifact or implementation references. Scope and qualification stay attached.'],['review','Under review','Claims still under source review.'],['queued','Queued','Observable conditions retained for future work.'],['qualification','The far shore','Delivery conditions still requiring qualification.']];
 const works=new Map(s.initiative.projects.flatMap(p=>[p,...p.issues.flatMap(i=>[i,...i.tasks])]).map(w=>[w.id,w]));
 for(const [lane,title,description] of definitions){const claims=s.claims.filter(c=>c.lane===lane),d=disclosure('lane:'+lane,'Claims',title,claims.length+' conditions','claim-lane');const b=el('div','work-body');b.append(el('p','description',description));const ul=el('ul');for(const c of claims){const li=el('li');li.append(el('strong','claim-source',works.get(c.work_id)?.title ?? c.work_id),el('p','',c.text),el('span','source-note',c.source_id));ul.append(li);}b.append(ul);d.append(b);lanes.append(d);}horizon.append(lanes);content.append(horizon);
 const delivery=section('Delivery projects','Contains / Project → Issue → Task');const controls=el('div','controls');const label=el('label','','Scope'),select=el('select');select.id='scope-filter';label.htmlFor='scope-filter';select.append(new Option('All projects','all'));for(const g of s.groups)select.append(new Option(g.label,g.id));select.value=scope;select.addEventListener('change',()=>{scope=select.value;renderProjects();});
 const archiveLabel=el('label','check-label'),checkbox=el('input');checkbox.type='checkbox';checkbox.id='archive-control';checkbox.checked=includeArchive;checkbox.addEventListener('change',()=>{includeArchive=checkbox.checked;renderProjects();});archiveLabel.append(checkbox,el('span','','Include archived history'));controls.append(label,select,archiveLabel);delivery.append(controls);const result=el('p','accounting-note');result.id='scope-result';result.setAttribute('role','status');delivery.append(result);const projects=el('div','project-list');projects.id='projects';delivery.append(projects);content.append(delivery);renderProjects();
 const gates=section('Independent delivery gates','Qualification / Separate from effort');
 for(const g of s.gates){const d=disclosure('gate:'+g.id,'Gate',g.title,g.status,'gate-row'),b=el('div','work-body');b.append(el('p','',g.summary));if(g.requires.length)b.append(el('p','dependency','Requires: '+g.requires.join(' · ')));b.append(el('p','source-note','Source: '+g.source_id));d.append(b);gates.append(d);}content.append(gates);
 const blockers=section('Decision and access blockers','Blocks / Active constraints');for(const b of s.blockers){const d=disclosure('blocker:'+b.id,'Blocker',b.title,b.status,'blocker-row');d.append(el('p','work-body',b.description));blockers.append(d);}content.append(blockers);
}
async function json(path) {const res=await fetch(path,{cache:'no-store',credentials:'omit'});if(!res.ok)throw Error(`Snapshot unavailable (${res.status})`);return res.json();}
async function load(id) {
 const sequence=++loadSequence;loadAbort?.abort();const controller=new AbortController();loadAbort=controller;
 try {
  const entry=catalog.examples.find(e=>e.id===id);if(!entry)throw Error('Unknown configured example');
  q('#load-status').textContent='Validating frozen snapshot…';q('#load-error').hidden=true;
  const response=await fetch(entry.file,{cache:'no-store',credentials:'omit',signal:controller.signal});if(!response.ok)throw Error('Snapshot fetch failed');const bytes=await response.arrayBuffer();
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(sequence!==loadSequence)return;
  if(digest!==entry.sha256)throw Error('Snapshot digest mismatch');
  const s=validateSnapshot(JSON.parse(new TextDecoder().decode(bytes)),schema);scope='all';includeArchive=false;openIds.clear();liveAsOf=null;render(s);drawDelivery(null,s);q('#load-status').textContent='Validated · Frozen snapshot';
  history.replaceState(null,'','?example='+encodeURIComponent(id));liveSession?.refresh();
 } catch(err) {if(sequence===loadSequence)error(err);}
}
function error(err){q('#content').replaceChildren();q('#load-status').textContent='Load failed';q('#load-error').textContent=err instanceof Error?err.message:'Snapshot load failed';q('#load-error').hidden=false;}
try {
 [catalog,schema]=await Promise.all([json('catalog.json'),json('contracts/roadmap.snapshot.v1.schema.json')]);
 const control=q('#example-control');for(const e of catalog.examples)control.append(new Option(e.label,e.id));const requested=new URL(location.href).searchParams.get('example');const id=catalog.examples.some(e=>e.id===requested)?requested:catalog.default_example;control.value=id;control.addEventListener('change',()=>load(control.value).catch(error));await load(id);liveSession=connectLive({getId:()=>control.value,getSupported:()=>catalog.examples.find(e=>e.id===control.value)?.live===true,apply:v=>{validateSnapshot(v.snapshot,schema);if(liveAsOf!==v.snapshot.snapshot.as_of){render(v.snapshot);liveAsOf=v.snapshot.snapshot.as_of;}drawDelivery(v.delivery,v.snapshot,v);q('#load-status').textContent=v.last_success_at?'Validated · Live tracker capture':'Validated · Last retained capture';}});
} catch(err){error(err);}
