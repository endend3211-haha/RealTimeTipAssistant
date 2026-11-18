export function fraction(meters){return Number.isFinite(meters)?Math.max(0,Math.min(1,meters/500)):1;}
export function gray4(canvas){
 const pixels=canvas.getContext('2d').getImageData(0,0,560,272).data,out=new Uint8Array(76160);
 for(let i=0,j=0;i<pixels.length;i+=8,j++){
  const g=o=>Math.max(0,Math.min(15,Math.round((pixels[o]*.299+pixels[o+1]*.587+pixels[o+2]*.114)/17)));
  out[j]=(g(i)<<4)|g(i+4);
 }return out;
}
function wrap(c,text,maxWidth){
 let line='',lines=[];for(const char of text){if(c.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}
 if(line)lines.push(line);return lines.slice(0,2);
}
export function render(canvas,meters,direction,amount=fraction(meters)){
 const c=canvas.getContext('2d');c.clearRect(0,0,560,272);c.fillStyle='#02090c';c.fillRect(0,0,560,272);
 c.strokeStyle='#0e2828';c.lineWidth=1;
 for(let x=-150;x<=560;x+=58){c.beginPath();c.moveTo(132,17);c.lineTo(x,202);c.stroke();}
 for(const y of [62,86,114,147,183,202]){c.beginPath();c.moveTo(5,y);c.lineTo(555,y);c.stroke();}
 if(amount>0){
  const layer=document.createElement('canvas');layer.width=560;layer.height=272;
  const a=layer.getContext('2d');a.translate(132,102);
  if(direction!=='유턴')a.rotate((direction==='우회전'?-90:direction==='좌회전'?90:180)*Math.PI/180);
  let shape=new Path2D();
  if(direction==='유턴'){
   const points=[[44,-88],[44,14]];
   for(let i=1;i<=40;i++){const t=i/40,u=1-t;points.push([u*u*u*44+3*u*u*t*44+3*u*t*t*(-43)+t*t*t*(-43),u*u*u*14+3*u*u*t*66+3*u*t*t*66+t*t*t*14]);}
   points.push([-43,-20]);
   let sum=0;const lengths=points.map((p,i)=>i?(sum+=Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])):0);
   const cut=sum*(1-amount);let started=false;
   for(let i=1;i<points.length;i++){
    if(lengths[i]<cut)continue;
    const prev=points[i-1],point=points[i];
    if(!started){const t=Math.max(0,(cut-lengths[i-1])/(lengths[i]-lengths[i-1]));shape.moveTo(prev[0]+(point[0]-prev[0])*t,prev[1]+(point[1]-prev[1])*t);started=true;}
    shape.lineTo(...point);
   }
   a.globalAlpha=Math.min(1,amount/.15);a.lineWidth=28;a.lineJoin='round';a.strokeStyle='#57ff28';a.stroke(shape);
   shape=new Path2D();shape.moveTo(-79,-13);shape.lineTo(-7,-13);shape.lineTo(-43,-65);shape.closePath();
  }else{
   shape.moveTo(0,-98);shape.lineTo(-29,14);shape.lineTo(-79,14);shape.lineTo(0,100);shape.lineTo(79,14);shape.lineTo(29,14);shape.closePath();
  }
  a.shadowColor='#1d8b18';a.shadowBlur=8;a.fillStyle='#1d8b18';a.fill(shape);a.shadowBlur=0;
  a.save();a.translate(0,13);a.fillStyle='#0a4817';a.fill(shape);a.restore();
  a.save();a.translate(0,7);a.fillStyle='#17741d';a.fill(shape);a.restore();
  const gradient=a.createLinearGradient(0,-98,0,100);for(const [stop,color] of [[0,'#0b411d'],[.4,'#2bc819'],[.7,'#57ff28'],[1,'#4aff1d']])gradient.addColorStop(stop,color);
  a.fillStyle=gradient;a.fill(shape);a.strokeStyle='#a6ff70';a.lineWidth=2.5;a.stroke(shape);
  if(direction!=='유턴'&&amount<.999){
   const cut=-98+(1-amount)*198,mask=a.createLinearGradient(0,cut-8,0,cut+6);
   mask.addColorStop(0,'transparent');mask.addColorStop(1,'white');
   a.globalCompositeOperation='destination-in';a.fillStyle=mask;a.fillRect(-115,-120,230,252);
  }
  c.drawImage(layer,0,0);
 }
 c.fillStyle='#aadbB3';c.font='bold 21px sans-serif';c.fillText('테스트 · '+direction,278,43);
 let size=76;c.font='italic bold '+size+'px sans-serif';
 const distance=meters+'m';while(c.measureText(distance).width>265&&size>28)c.font='italic bold '+(--size)+'px sans-serif';
 c.fillStyle='#0d4314';c.fillText(distance,281,115);c.fillStyle='#57ff28';c.fillText(distance,278,110);
 c.font='16px sans-serif';c.fillStyle='#97aea0';c.fillText('남은 거리',281,139);
 c.fillStyle='#233d31';c.fillRect(12,206,536,2);
 c.fillStyle='#e1efe5';c.font='23px sans-serif';wrap(c,meters+'m 앞 '+direction,532).forEach((s,i)=>c.fillText(s,14,236+i*27));
}
