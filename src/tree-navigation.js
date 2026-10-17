import {clampScale,fitScale,zoomPosition} from './tree-camera.js';
const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
export function treeNavigation(viewport,stage,canvas,controls,saved=null){
 let scale=saved?.scale??1,mode=saved?.mode??'fit',disposed=false,space=false,drag=null,pinch=null,suppressClick=false;
 const pointers=new Map(),group=el('div','');group.className='tree-zoom-controls';group.setAttribute('role','group');group.setAttribute('aria-label','Tree zoom');
 const button=(text,label,action)=>{const b=el('button',text);b.type='button';b.setAttribute('aria-label',label);b.addEventListener('click',action);group.append(b);return b;};
 const out=button('−','Zoom out',()=>zoom(scale/1.25)),output=el('output','100%');output.setAttribute('aria-label','Current tree zoom');group.append(output);
 const inside=button('+','Zoom in',()=>zoom(scale*1.25));button('Fit all','Fit all gates and milestones',fit);button('100%','Actual size',()=>zoom(1));controls.append(group);
 viewport.setAttribute('aria-label','Zoomable skill tree. Drag the background to pan. Plus and minus zoom; zero fits all.');
 const offset=()=>({x:stage.offsetLeft,y:stage.offsetTop});
 function sync(){canvas.style.transform=`scale(${scale})`;stage.style.width=canvas.offsetWidth*scale+'px';stage.style.height=canvas.offsetHeight*scale+'px';output.value=Math.round(scale*100)+'%';out.disabled=scale<=.02001;inside.disabled=scale>=2.49999;viewport.dataset.zoom=String(scale);viewport.dataset.cameraMode=mode;}
 function zoom(next,x=viewport.clientWidth/2,y=viewport.clientHeight/2){
  const before=offset(),old=scale,left=viewport.scrollLeft,top=viewport.scrollTop;mode='manual';scale=clampScale(next);sync();const after=offset();viewport.scrollLeft=zoomPosition(left,x,before.x,after.x,old,scale);viewport.scrollTop=zoomPosition(top,y,before.y,after.y,old,scale);
 }
 function fit(){mode='fit';scale=fitScale(viewport.clientWidth,viewport.clientHeight,canvas.offsetWidth,canvas.offsetHeight);sync();viewport.scrollLeft=0;viewport.scrollTop=0;}
 function reveal(element){if(scale<.65)zoom(1);const a=element.getBoundingClientRect(),b=viewport.getBoundingClientRect();viewport.scrollLeft+=(a.left+a.width/2)-(b.left+viewport.clientWidth/2);viewport.scrollTop+=(a.top+a.height/2)-(b.top+viewport.clientHeight/2);viewport.focus({preventScroll:true});}
 function wheel(e){if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();const b=viewport.getBoundingClientRect();zoom(scale*Math.exp(-e.deltaY*.008),e.clientX-b.left,e.clientY-b.top);}
 function keydown(e){if(e.target!==viewport)return;if(e.code==='Space'){space=true;e.preventDefault();viewport.classList.add('space-pan');}else if(['+','=','-','0','1'].includes(e.key)){e.preventDefault();if(e.key==='0')fit();else zoom(e.key==='1'?1:e.key==='-'?scale/1.25:scale*1.25);}}
 function keyup(e){if(e.code==='Space'){space=false;viewport.classList.remove('space-pan');}}
 const interactive=target=>target.closest('button,a,input,select,summary');
 const point=e=>({x:e.clientX,y:e.clientY});
 function pointerdown(e){
  if(e.pointerType==='touch')pointers.set(e.pointerId,point(e));
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),scale};drag=null;suppressClick=true;for(const id of pointers.keys())viewport.setPointerCapture(id);return;}
  if(e.button!==0&&e.button!==1)return;if(e.pointerType!=='touch'&&!space&&e.button!==1&&interactive(e.target))return;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};if(e.button===1)e.preventDefault();
 }
 function pointermove(e){
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,point(e));
  if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()],bounds=viewport.getBoundingClientRect(),distance=Math.hypot(a.x-b.x,a.y-b.y);e.preventDefault();zoom(pinch.scale*distance/Math.max(1,pinch.distance),(a.x+b.x)/2-bounds.left,(a.y+b.y)/2-bounds.top);return;}
  if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<5)return;
  if(!drag.moved){drag.moved=true;suppressClick=true;viewport.setPointerCapture(e.pointerId);viewport.classList.add('is-panning');viewport.focus({preventScroll:true});}e.preventDefault();viewport.scrollLeft=drag.left-dx;viewport.scrollTop=drag.top-dy;
 }
 function pointerup(e){pointers.delete(e.pointerId);pinch=null;if(drag?.id===e.pointerId)drag=null;if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);viewport.classList.remove('is-panning');setTimeout(()=>{suppressClick=false;},0);}
 function click(e){if(suppressClick){e.preventDefault();e.stopImmediatePropagation();}}
 function blur(){space=false;drag=null;pinch=null;pointers.clear();viewport.classList.remove('space-pan','is-panning');}
 viewport.addEventListener('wheel',wheel,{passive:false});viewport.addEventListener('keydown',keydown);viewport.addEventListener('pointerdown',pointerdown);viewport.addEventListener('pointermove',pointermove);viewport.addEventListener('pointerup',pointerup);viewport.addEventListener('pointercancel',pointerup);viewport.addEventListener('click',click,true);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
 const observer=new ResizeObserver(()=>{if(disposed)return;if(mode==='fit')fit();else sync();});observer.observe(viewport);observer.observe(canvas);
 const frame=requestAnimationFrame(()=>{if(disposed)return;if(mode==='fit')fit();else{sync();viewport.scrollLeft=saved?.left??0;viewport.scrollTop=saved?.top??0;}});
 return {reveal,getState:()=>({left:viewport.scrollLeft,top:viewport.scrollTop,scale,mode}),dispose:()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);}};
}
