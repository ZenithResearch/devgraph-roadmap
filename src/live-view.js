import {validateDelivery,deliveryCounts} from './delivery-model.js';
import {drawSkillTree} from './skill-tree.js';
const el=(tag,cls='',text=null)=>{const n=document.createElement(tag);n.className=cls;if(text!==null)n.textContent=String(text);return n;};
const time=v=>v?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'Not yet checked';
const renderState=new WeakMap();
export function drawDelivery(data,snapshot,live=null){
 const target=document.querySelector('#delivery-content');if(!target)return;
 const checkText=live?`Live source check: ${time(live.checked_at)}. ${live.work_write_ready===true?'Tracker write grant active.':live.work_write_ready===false?'Tracker reads are live; writing canonical progress is pending an active grant.':'Tracker write grant not yet checked.'}`:'';
 const signature=JSON.stringify([data,snapshot.snapshot.as_of,live?.repositories,live?.work_write_ready]),previous=renderState.get(target);
 if(previous?.signature===signature){const note=target.querySelector('[data-live-check]');if(note)note.textContent=checkText;return;}
 const focused=target.contains(document.activeElement)?document.activeElement.dataset.milestone:null;previous?.dispose?.();target.replaceChildren();if(!data){renderState.delete(target);return;}
 const state={signature,selected:previous?.selected,dispose:null};renderState.set(target,state);
 validateDelivery(data,snapshot);const counts=deliveryCounts(data),section=el('section','delivery-section');
 section.append(el('p','eyebrow','CURRENT IMPLEMENTATION / DIRECT MAC RELEASE'),el('h2','',`${data.scope.targets.join(' → ')}`),el('p','delivery-intro',data.scope.summary));
 const metrics=el('div','delivery-metrics');for(const [label,value]of [['Validated local areas',counts.validated],['Partly implemented',counts.partial],['Remaining areas',counts.pending]]){const card=el('div');card.append(el('strong','',value),el('span','',label));metrics.append(card);}section.append(metrics);
 const removed=el('p','removed-requirements');removed.append(el('strong','','Removed from the release gate: '),document.createTextNode(data.removed_requirements.join(' · ')));section.append(removed);
 section.append(el('p','delivery-note','These are evidence-backed implementation areas, not a Task-completion percentage or a production approval. Retained tests are not rerun by refreshing this page.'));
 const skillTree=drawSkillTree(data,live,state.selected,id=>{state.selected=id;});state.dispose=skillTree.dispose;section.append(skillTree.element,el('h3','delivery-next-title','Next to get this running on your Mac'));
 const next=el('ol','delivery-next');for(const action of data.next_actions)next.append(el('li','',action));section.append(next);
 section.append(el('p','delivery-note',`Implementation review: ${time(data.reviewed_at)}. Canonical tracker capture: ${time(snapshot.snapshot.as_of)}.`));
 if(live){
  const check=el('p','delivery-note',checkText);check.dataset.liveCheck='';section.append(check);
  if(live.repositories.length){const details=el('details','delivery-bindings');details.append(el('summary','','Current repository versions'));const ul=el('ul');for(const r of live.repositories)ul.append(el('li','',`${r.label}: ${r.head?.slice(0,8)??'unavailable'} · ${r.binding==='matched'?'matches pinned commit':r.binding==='changed'?'changed since evidence':'unavailable'}${r.dirty?' · local changes present':''}`));details.append(ul);section.append(details);}
 }target.append(section);if(focused)for(const b of target.querySelectorAll('[data-milestone]'))if(b.dataset.milestone===focused)b.focus({preventScroll:true});
}
export function validateLive(v,id){
 if(!v||v.schema!=='roadmap.live/v1'||v.example_id!==id||typeof v.refreshing!=='boolean'||![null,true,false].includes(v.work_write_ready)||!Array.isArray(v.repositories)||!v.snapshot||!v.delivery||!Object.hasOwn(v,'plan'))throw Error('Invalid live envelope');
 for(const k of ['checked_at','last_success_at','last_attempt_at'])if(v[k]!==null&&!Number.isFinite(Date.parse(v[k])))throw Error('Invalid live timestamp');
 if(v.error!==null&&typeof v.error!=='string')throw Error('Invalid live error');
 for(const r of v.repositories)if(typeof r.id!=='string'||typeof r.label!=='string'||![null,true,false].includes(r.dirty)||!['matched','changed','unavailable'].includes(r.binding)||r.head!==null&&!/^[a-f0-9]{40}$/.test(r.head))throw Error('Invalid repository binding');
 if(/\/(?:Users|Volumes|private)\//.test(JSON.stringify(v)))throw Error('Private path in live projection');return v;
}
export function connectLive({getId,apply,getSupported=()=>true}){
 const status=document.querySelector('#live-status'),button=document.querySelector('#refresh-live');if(!status||!button)return;
 let busy=false,controller,enabled=true,retryAt=0;
 const refresh=async()=>{
  if(busy||document.hidden)return;if(!getSupported()){status.textContent='Frozen example · live source not configured';status.dataset.state='snapshot';button.disabled=true;const footer=document.querySelector('#source-mode');if(footer)footer.textContent='Frozen source · Read-only projection';return;}busy=true;button.disabled=true;const id=getId();controller=new AbortController();
  try{
   const r=await fetch('api/live/'+encodeURIComponent(id),{cache:'no-store',credentials:'omit',signal:controller.signal});
   if(!r.ok)throw Error('Live connection unavailable');const v=validateLive(await r.json(),id);if(id!==getId())return;
   await apply(v);
   status.textContent=v.error?`Last capture retained · ${v.error}`:v.checked_at?`Live · checked ${time(v.checked_at)}${v.refreshing?' · checking for updates…':''}`:v.refreshing?'Connecting · reading current tracker…':'Live capture pending';
   status.dataset.state=v.error?'stale':v.checked_at?'live':'loading';retryAt=0;
   const footer=document.querySelector('#source-mode');if(footer)footer.textContent=v.error?'Live source unavailable · last capture retained':v.checked_at?'Live read-only observer · refreshes every 15 seconds':'Read-only observer · current capture in progress';
  }catch{if(id===getId()){status.textContent='Live feed unavailable · showing the dated snapshot';status.dataset.state='stale';}retryAt=Date.now()+60000;}
  finally{busy=false;button.disabled=false;if(id!==getId())queueMicrotask(refresh);}
 };
 button.addEventListener('click',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 setInterval(()=>{if(enabled&&Date.now()>=retryAt)void refresh();},15000);void refresh();
 return {refresh,stop:()=>{enabled=false;controller?.abort();}};
}
