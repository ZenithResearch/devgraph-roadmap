import {gateSkillTree} from './journey-model.js';
import {treeNavigation} from './tree-navigation.js';
const ns='http://www.w3.org/2000/svg';
const el=(tag,cls='',text=null)=>{const n=document.createElement(tag);n.className=cls;if(text!==null)n.textContent=String(text);return n;};
const labels={earned:'Chest earned',waiting:'Waiting for prerequisites',available:'Open gate',unknown:'Gate status unknown'};
export function drawGateSkillTree(snapshot,journey,{selected,onSelect,icon,scrollPosition=null}){
 const graph=gateSkillTree(snapshot,journey),buttons=new Map(),clusters=new Map(),paths=[];
 const section=el('section','gate-skill-section');section.id='milestone-skill-tree';section.setAttribute('aria-label','Gates and milestones skill tree');
 const heading=el('div','gate-tree-intro');heading.append(el('p','eyebrow','THE COMPLETE SKILL TREE'),el('h2','','Every gate. Every milestone.'),el('p','',`${graph.groups.length} gate chests · ${graph.nodes.filter(n=>n.kind==='milestone').length} project milestones. Project branches join at each gate; gate prerequisites connect the next branches.`));section.append(heading);
 const controls=el('div','gate-tree-controls'),label=el('label','','Jump to gate'),select=el('select');select.id='tree-gate-control';label.htmlFor=select.id;
 for(const g of graph.groups){const option=el('option','',`${g.number} · ${g.title}`);option.value=g.gate_id;option.selected=g.gate_id===selected;select.append(option);}controls.append(label,select,el('span','tree-pan-hint','Drag background to pan · pinch or ⌘/Ctrl + scroll to zoom'));section.append(controls);
 const viewport=el('div','gate-tree-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','Scrollable skill tree. Use arrow keys to explore.');
 const stage=el('div','gate-tree-stage'),canvas=el('div','gate-tree-canvas'),svg=document.createElementNS(ns,'svg');svg.classList.add('gate-tree-edges');svg.setAttribute('aria-hidden','true');canvas.style.minWidth=Math.max(800,Math.max(...graph.tiers.map(t=>t.length))*324+48)+'px';canvas.append(svg);stage.append(canvas);viewport.append(stage);section.append(viewport);
 const navigation=treeNavigation(viewport,stage,canvas,controls,scrollPosition);
 const activate=(gateId,milestoneId=null,focus=false)=>{update(gateId,milestoneId);onSelect(gateId,milestoneId);if(focus)buttons.get(milestoneId??'gate/'+gateId)?.focus({preventScroll:true});};
 for(const [rank,groups]of graph.tiers.entries()){
  const tier=el('div','gate-tree-tier');tier.append(el('p','gate-tree-tier-label',rank===0?'Starting branches':`After prerequisite gates · tier ${rank+1}`));const branches=el('div','gate-tree-branches');tier.append(branches);canvas.append(tier);
  for(const g of groups){
   const cluster=el('article','gate-tree-cluster '+g.theme);cluster.dataset.treeGate=g.gate_id;clusters.set(g.id,cluster);
   cluster.append(el('p','gate-branch-label',`GATE ${g.number} · ${g.milestones.length} PROJECT ${g.milestones.length===1?'MILESTONE':'MILESTONES'}`));
   const milestones=el('div','gate-tree-milestones');
   for(const m of g.milestones){
    const b=el('button','gate-tree-milestone '+(m.complete===true?'project-done':m.complete===null?'project-unknown':'project-open'));b.type='button';b.dataset.treeNode=m.id;b.setAttribute('aria-controls','gate-panel');b.setAttribute('aria-label',`Gate ${g.number} milestone ${m.index}: ${m.project.label||m.project.title}. ${m.objective}`);
    b.append(el('span','project-skill-medal',m.complete===true?'✓':m.index),el('span','project-skill-name',m.project.label||m.project.title),el('span','project-skill-state',m.complete===true?'Project done':m.complete===null?'Project state unknown':`${m.counts.done}/${m.counts.tasks} Tasks done`));b.addEventListener('click',()=>activate(g.gate_id,m.id));buttons.set(m.id,b);milestones.append(b);
   }cluster.append(milestones);
   const gate=el('button','gate-tree-chest '+g.state);gate.type='button';gate.dataset.treeNode=g.id;gate.setAttribute('aria-controls','gate-panel');gate.setAttribute('aria-label',`Gate ${g.number}: ${g.title}. ${labels[g.state]}`);const medal=el('span','gate-chest-medal');medal.append(icon('chest',true));gate.append(medal,el('span','gate-chest-name',`${g.number} · ${g.title}`),el('span','gate-chest-state',labels[g.state]));gate.addEventListener('click',()=>activate(g.gate_id));buttons.set(g.id,gate);cluster.append(gate);
   const requires=el('p','gate-tree-requires',g.gate.requires.length?`Requires ${g.gate.requires.map(id=>'Gate '+graph.groups.find(p=>p.gate_id===id).number).join(' + ')}`:'No gate prerequisites');cluster.append(requires);const selection=el('div','gate-tree-selection');selection.hidden=true;cluster.append(selection);branches.append(cluster);
  }
 }
 for(const edge of graph.edges){const path=document.createElementNS(ns,'path');path.classList.add(edge.kind);svg.append(path);paths.push({...edge,path});}
 function update(gateId,milestoneId=null){
  select.value=gateId;const ancestors=new Set(),walk=id=>{for(const parent of graph.groups.find(g=>g.gate_id===id).gate.requires)if(!ancestors.has(parent)){ancestors.add(parent);walk(parent);}};walk(gateId);
  for(const [id,b]of buttons){const active=id===(milestoneId??'gate/'+gateId);b.setAttribute('aria-pressed',String(active));}
  for(const [id,cluster]of clusters){const active=id==='gate/'+gateId;cluster.classList.toggle('active-branch',active);const info=cluster.querySelector('.gate-tree-selection');info.hidden=!active;if(active){const group=graph.groups.find(g=>g.gate_id===gateId),milestone=group.milestones.find(m=>m.id===milestoneId),link=el('a','',milestone?'Inspect Issues and Tasks ↓':'Inspect gate requirements ↓');link.href='#gate-panel';info.replaceChildren(el('p','',milestone?milestone.objective:group.gate.title),link);}}
  for(const edge of paths){const from=buttons.get(edge.from),to=buttons.get(edge.to);edge.path.classList.toggle('selected-route',edge.kind==='contribution'?edge.to==='gate/'+gateId:ancestors.has(from.closest('[data-tree-gate]').dataset.treeGate)&&(to.closest('[data-tree-gate]').dataset.treeGate===gateId||ancestors.has(to.closest('[data-tree-gate]').dataset.treeGate)));}
 }
 select.addEventListener('change',()=>{activate(select.value);navigation.reveal(clusters.get('gate/'+select.value));});
 const draw=()=>{const root=canvas.getBoundingClientRect(),width=canvas.offsetWidth,height=canvas.offsetHeight,scale=root.width/width;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);for(const edge of paths){
  const a=buttons.get(edge.from).getBoundingClientRect(),b=(edge.kind==='prerequisite'?clusters.get(edge.to):buttons.get(edge.to)).getBoundingClientRect();const x=(a.left+a.width/2-root.left)/scale,y=(a.bottom-root.top)/scale,xx=(b.left+b.width/2-root.left)/scale,yy=(b.top-root.top)/scale,mid=(y+yy)/2;const fromGroup=graph.groups.find(g=>g.id===edge.from),toGroup=graph.groups.find(g=>g.id===edge.to);if(edge.kind==='prerequisite'&&toGroup.rank-fromGroup.rank>1){const rail=x>width/2?width-12:12;edge.path.setAttribute('d',`M ${x} ${y} L ${x} ${y+24} L ${rail} ${y+24} L ${rail} ${yy-24} L ${xx} ${yy-24} L ${xx} ${yy}`);}else edge.path.setAttribute('d',`M ${x} ${y} C ${x} ${mid}, ${xx} ${mid}, ${xx} ${yy}`);
 }};
 const observer=new ResizeObserver(draw);observer.observe(canvas);const drawFrame=requestAnimationFrame(draw);update(selected);
 section.append(el('p','gate-tree-note','Small circles are project milestones; chests are gates. Project and Task progress do not award a chest. Gate links follow recorded prerequisites; project Issue dependencies remain available in the inspector.'));
 return {element:section,getScroll:()=>navigation.getState(),dispose:()=>{cancelAnimationFrame(drawFrame);observer.disconnect();navigation.dispose();},update,focus:id=>buttons.get(id)?.focus({preventScroll:true})};
}
