export const minScale=.02,maxScale=2.5;
export const clampScale=value=>Math.max(minScale,Math.min(maxScale,value));
export function fitScale(width,height,contentWidth,contentHeight,padding=16){return clampScale(Math.min(1,Math.max(1,width-padding*2)/Math.max(1,contentWidth),Math.max(1,height-padding*2)/Math.max(1,contentHeight)));}
// Preserve the content point beneath the cursor, including a centered small map.
export function zoomPosition(scroll,anchor,oldOffset,newOffset,oldScale,newScale){return newOffset+(scroll+anchor-oldOffset)/oldScale*newScale-anchor;}
