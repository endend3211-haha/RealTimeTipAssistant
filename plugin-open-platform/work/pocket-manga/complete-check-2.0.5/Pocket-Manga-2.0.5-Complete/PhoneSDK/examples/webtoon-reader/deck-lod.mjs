// Full cover is never modified. Small grayscale backgrounds are prepared once
// when a cover arrives, rather than resampled/quantized on every animation frame.
export function coverTier(offset){const distance=Math.abs(offset);return distance<=.5?'full':distance<.9?'approach':distance<1.7?'near':'far';}
export function buildDeckLod(document,full){
 const make=(width,height,levels)=>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const c=canvas.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(full,0,0,width,height);
  const image=c.getImageData(0,0,width,height),step=255/(levels-1);
  for(let i=0;i<image.data.length;i+=4){const g=Math.round((image.data[i]*.299+image.data[i+1]*.587+image.data[i+2]*.114)/step)*step;image.data[i]=image.data[i+1]=image.data[i+2]=g;}
  c.putImageData(image,0,0);return canvas;
 };
 return {full,approach:make(116,140,8),near:make(58,70,8),far:make(29,35,4)};
}
export function projectedTexture(texture,offset){if(!texture?.full)return {texture,columns:1,tier:'full'};const tier=coverTier(offset);return {texture:texture[tier],columns:tier==='full'?1:tier==='approach'?2:tier==='near'?3:4,tier};}
