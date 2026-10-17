import {deliveryTree,deliveryStateText,deliveryStatus} from './delivery-model.js';
const el=(tag,cls='',text=null)=>{const n=document.createElement(tag);n.className=cls;if(text!==null)n.textContent=text;return n;};
const stateText=deliveryStateText;
const ns='http://www.w3.org/2000/svg';
export function drawSkillTree(data,live,selectedId,onSelect){
 const tree=deliveryTree(data),byId=new Map(tree.nodes.map(n=>[n.id,n])),buttons=new Map(),paths=[];
 const section=el('section','skill-section');section.id='implementation-skill-tree';section.setAttribute('aria-label','Milestone skill tree');
 section.append(el('h3','skill-heading','Local implementation evidence'),el('p','skill-caption','Follow the branches toward the first Mac, then a second operator’s. Nodes on the same tier can progress in parallel. Select a skill to see its evidence and prerequisites.'));
 const legend=el('div','skill-legend');for(const [state,label]of Object.entries(stateText))legend.append(el('span',state,label));section.append(legend);
 const canvas=el('div','skill-canvas'),svg=document.createElementNS(ns,'svg');svg.classList.add('skill-edges');svg.setAttribute('aria-hidden','true');canvas.append(svg);
 const tiers=['Foundations','Connect the stack','Prepare real use','Your Mac pilot','Second operator’s Mac'];
 for(const [i,level]of tree.levels.entries()){
  const row=el('div','skill-tier'),heading=el('p','skill-tier-label',tiers[i]??`Tier ${i+1}`),nodes=el('div','skill-nodes');
  row.append(heading,nodes);
  for(const n of level){
   const button=el('button','skill-node '+n.availability);button.type='button';button.dataset.milestone=n.id;button.setAttribute('aria-controls','skill-inspector');button.setAttribute('aria-label',`${n.title} — ${deliveryStatus(n)}`);
   const symbol=el('span','skill-medal',n.availability==='validated'?'✓':n.availability==='partial'?'◐':n.availability==='available'?'＋':'');symbol.setAttribute('aria-hidden','true');
   if(n.availability==='locked'){const icon=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');icon.setAttribute('viewBox','0 0 24 24');path.setAttribute('d','M7 10V7a5 5 0 0 1 10 0v3M6 10h12v11H6zM12 14v3');icon.append(path);symbol.append(icon);}
   button.append(symbol,el('span','skill-name',n.short_title??n.title),el('span','skill-status',deliveryStatus(n)));nodes.append(button);buttons.set(n.id,button);
   button.addEventListener('click',()=>select(n.id));
  }canvas.append(row);
 }
 for(const edge of tree.edges){const p=document.createElementNS(ns,'path');svg.append(p);paths.push({...edge,path:p});}
 section.append(canvas);const inspector=el('article','skill-inspector');inspector.id='skill-inspector';section.append(inspector);
 section.append(el('p','delivery-note','These lines show implementation sequencing. Formal gates and their project milestones are in the Quest map; local validation does not earn a gate chest.'));
 function select(id){
  const n=byId.get(id);onSelect(id);const ancestors=new Set();const walk=key=>{for(const parent of byId.get(key).requires??[])if(!ancestors.has(parent)){ancestors.add(parent);walk(parent);}};walk(id);
  for(const [key,b]of buttons){b.setAttribute('aria-pressed',String(key===id));b.classList.toggle('skill-ancestor',ancestors.has(key));}
  for(const edge of paths){edge.path.classList.toggle('skill-route',ancestors.has(edge.from)&&(edge.to===id||ancestors.has(edge.to)));edge.path.classList.toggle('skill-edge-done',byId.get(edge.from).state==='validated');}
  inspector.replaceChildren();const changed=live?.repositories?.some(r=>n.repository_ids.includes(r.id)&&r.binding!=='matched');
  inspector.append(el('p','eyebrow',`${deliveryStatus(n)}${changed?' · Source binding needs review':''}`),el('h3','',n.title),el('p','',n.summary));
  const prereqs=el('div','skill-prerequisites');prereqs.append(el('strong','','Requires: '));
  if(!n.requires?.length)prereqs.append(document.createTextNode('No milestone prerequisites.'));
  for(const id of n.requires??[]){const p=byId.get(id),b=el('button','',`${p.state==='validated'?'✓ ':''}${p.title}`);b.type='button';b.addEventListener('click',()=>{select(id);buttons.get(id).focus({preventScroll:true});});prereqs.append(b);}inspector.append(prereqs);
  if(n.evidence.length){inspector.append(el('h4','','Retained evidence'));const ul=el('ul');for(const evidence of n.evidence)ul.append(el('li','',evidence));inspector.append(ul);}else inspector.append(el('p','skill-no-evidence','No completion evidence recorded for this milestone.'));
 }
 select(byId.has(selectedId)?selectedId:tree.nodes.find(n=>n.state==='partial')?.id??tree.nodes[0].id);
 const draw=()=>{
  const bounds=canvas.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
  for(const edge of paths){const a=buttons.get(edge.from).getBoundingClientRect(),b=buttons.get(edge.to).getBoundingClientRect(),x=a.left+a.width/2-bounds.left,y=a.bottom-bounds.top+4,xx=b.left+b.width/2-bounds.left,yy=b.top-bounds.top-6,mid=(y+yy)/2;edge.path.setAttribute('d',`M ${x} ${y} C ${x} ${mid}, ${xx} ${mid}, ${xx} ${yy}`);}
 };
 const observer=new ResizeObserver(draw);observer.observe(canvas);requestAnimationFrame(draw);
 return {element:section,dispose:()=>observer.disconnect()};
}
