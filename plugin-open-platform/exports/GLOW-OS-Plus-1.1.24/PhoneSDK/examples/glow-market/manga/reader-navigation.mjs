// Compare against receiver-confirmed progress, never the requested frame.
export function forwardPosition(current,confirmed,height,pageCount){
 const start=confirmed&&(confirmed.page>current.page||confirmed.page===current.page&&confirmed.y>current.y)?confirmed:current;
 if(start.page!==current.page)return {...start,resume:true};
 const bottom=Math.max(0,height-350);
 if(start.y<bottom)return {page:start.page,y:Math.min(bottom,start.y+300)};
 if(start.page+1<pageCount)return {page:start.page+1,y:0};
 return null;
}
