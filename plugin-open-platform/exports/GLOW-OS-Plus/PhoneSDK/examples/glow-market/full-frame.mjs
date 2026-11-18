// Cover the entire physical display, including the black margin around content.
export function fullFrameTiles(ctx,fullSize=false){
 const surface=document.createElement('canvas');surface.width=600;surface.height=350;
 const target=surface.getContext('2d',{alpha:false});
 target.fillStyle='#000';target.fillRect(0,0,600,350);
 target.drawImage(ctx.canvas,fullSize?0:20,fullSize?0:15);
 const pixels=target.getImageData(0,0,600,350).data;
 return Array.from({length:7},(_,tile)=>{
  const raw=new Uint8Array(15000);
  for(let i=0;i<raw.length;i++){
   const offset=(tile*600*50+i*2)*4;
   raw[i]=(Math.round(pixels[offset]/17)<<4)|Math.round(pixels[offset+4]/17);
  }
  return raw;
 });
}
