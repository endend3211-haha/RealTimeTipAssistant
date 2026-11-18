import {projectedTexture} from './deck-lod.mjs';
// Perspective is projected into the Scene framebuffer; glasses need no WebGL.
export const DISPLAY = Object.freeze({ width: 600, height: 350, deckWidth: 232, deckHeight: 280 });
export function offsetFrom(index, position, count) {
  return ((index - position + count / 2) % count + count) % count - count / 2;
}
// Position-driven pose inspired by Addy Osmani / Bramus' Cover Flow design:
// https://addyosmani.com/blog/coverflow/ . The phone uses this in both renderers,
// rather than depending on scroll-timeline support in the embedded WebView.
export function coverflowPose(offset, count = 7) {
  const distance = Math.abs(offset);
  const near = Math.min(distance, 1), blend = near * near * (3 - 2 * near);
  const outer = Math.max(0, distance - 1);
  const fadeStart = Math.min(2.1, count / 2 - .45), fadeEnd = Math.min(3.05, count / 2);
  const fade = count <= 1 ? 0 : Math.max(0, Math.min(1, (distance - fadeStart) / (fadeEnd - fadeStart)));
  return {
    offset,
    angle: Math.sign(offset) * blend * Math.PI / 4,
    centerX: Math.sign(offset) * (Math.min(distance, 1) * 191 + outer * 96),
    depth: -blend * 145 - outer * 55,
    scale: 1 - blend * .18,
    brightness: 1 - blend * .22 - Math.min(outer, 2) * .08,
    opacity: 1 - fade * fade * (3 - 2 * fade),
  };
}
export function projectDeck(offset, count = 7) {
  const pose = coverflowPose(offset, count);
  const { angle, centerX, depth, scale } = pose;
  const project = (x, y) => {
    const z = depth - x * Math.sin(angle) * scale;
    const perspective = 700 / (700 - z);
    return { x: 300 + (centerX + x * Math.cos(angle) * scale) * perspective, y: 144 + y * scale * perspective };
  };
  return {
    ...pose,
    corners: [[-116, -140], [116, -140], [116, 140], [-116, 140]].map(([x, y]) => project(x, y)),
  };
}

export class DeckMotion {
  constructor({positionTolerance=.001,velocityTolerance=.008,angularFrequency=14}={}) { this.positionTolerance=positionTolerance;this.velocityTolerance=velocityTolerance;this.angularFrequency=angularFrequency;this.position = this.target = this.from = 0; this.velocity = 0; this.elapsed = 0; }
  reset(index) { this.position = this.target = this.from = index; this.velocity = 0; this.elapsed = 0; }
  retarget(index, count, reduced = false) {
    const delta = offsetFrom(index, this.target, count);
    if (delta === 0 && !reduced) return;
    this.from = this.position; this.target += delta; this.elapsed = 0;
    if (reduced) this.reset(this.target);
  }
  get active() { return Math.abs(this.target - this.position) > this.positionTolerance || Math.abs(this.velocity) > this.velocityTolerance; }
  advance(milliseconds) {
    // Bound stalls while allowing the ACK clock to reduce slow-link poses.
    const step = Math.max(0, Math.min(240, milliseconds));
    this.elapsed += step;
    // Exact critically damped spring: velocity survives retargets, allowing a
    // quick second gesture or reversal to flow naturally from the visible pose.
    // This solution is stable across variable frame/ACK intervals.
    const dt = step / 1000, omega = this.angularFrequency, displacement = this.position - this.target;
    const momentum = this.velocity + omega * displacement, decay = Math.exp(-omega * dt);
    this.position = this.target + (displacement + momentum * dt) * decay;
    this.velocity = (this.velocity - omega * momentum * dt) * decay;
    // Settle only below a fifth of a projected pixel, with no visible final snap.
    if (!this.active) { this.position = this.target; this.velocity = 0; }
    return this.position;
  }
}

export function createDeckTextures(document, decks, artworks) {
  return decks.map((deck, index) => {
    const canvas = document.createElement('canvas'); canvas.width = 232; canvas.height = 280;
    const c = canvas.getContext('2d');
    const shell = c.createLinearGradient(0, 0, 232, 280);
    shell.addColorStop(0, '#fff7de'); shell.addColorStop(.5, '#c9c8b9'); shell.addColorStop(1, '#92998a');
    c.fillStyle = shell; c.fillRect(0, 0, 232, 280);
    c.fillStyle = '#080a08'; c.fillRect(3, 3, 226, 274);
    c.imageSmoothingEnabled = false; c.drawImage(artworks[index], 7, 57, 218, 191);
    c.fillStyle = '#fff7df'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center';
    const words = deck.title.split(' '), split = Math.ceil(words.length / 2);
    c.fillText(words.slice(0, split).join(' '), 116, 27, 212);
    c.fillText(words.slice(split).join(' '), 116, 51, 212);
    c.font = 'bold 14px monospace'; c.textAlign = 'left'; c.fillText(`0${index + 1}`, 10, 269);
    c.textAlign = 'right'; c.fillText('POCKET / 16 BIT', 222, 269);
    return canvas;
  });
}

const projectionLayers=new WeakMap();
function paintProjected(c, texture, geometry, columnStep=1, leftEdge=0, rightEdge=600) {
  const [tl,tr,br,bl]=geometry.corners;
  const left=Math.max(leftEdge,Math.floor(tl.x));
  const right=Math.min(rightEdge,Math.ceil(tr.x));
  if(left>=right)return;
  const top=Math.max(0,Math.floor(Math.min(tl.y,tr.y)));
  const bottom=Math.min(350,Math.ceil(Math.max(bl.y,br.y)));
  const width=right-left,height=bottom-top;
  let layer=projectionLayers.get(c);
  if(!layer&&c.canvas?.ownerDocument){const canvas=c.canvas.ownerDocument.createElement('canvas');canvas.width=600;canvas.height=350;layer={canvas,ctx:canvas.getContext('2d')};projectionLayers.set(c,layer);}
  const draw=layer?.ctx||c;
  if(layer)draw.clearRect(left,top,width,height);
  draw.save();draw.globalAlpha=layer?1:geometry.opacity;
  draw.beginPath();draw.moveTo(tl.x,tl.y);draw.lineTo(tr.x,tr.y);draw.lineTo(br.x,br.y);draw.lineTo(bl.x,bl.y);draw.closePath();draw.clip();
  draw.imageSmoothingEnabled=true;draw.imageSmoothingQuality='high';
  const leftScale=(bl.y-tl.y)/280,rightScale=(br.y-tr.y)/280;
  const screenWidth=tr.x-tl.x;
  // Sample whole destination columns: integer x/width avoids the translucent
  // gaps and overlapping bright seams of variable-width source strips.
  const sourceAt=t=>{t=Math.max(0,Math.min(1,t));return t*leftScale/(rightScale*(1-t)+t*leftScale);};
  const textureWidth=texture.width||232,textureHeight=texture.height||280;
  if(geometry.offset===0){
    draw.drawImage(texture,tl.x,tl.y,screenWidth,bl.y-tl.y);
  }else{
    const firstColumn=Math.floor(tl.x);
    const visibleColumn=firstColumn+Math.floor((left-firstColumn)/columnStep)*columnStep;
    for(let x=visibleColumn;x<right;x+=columnStep){
      const stripWidth=Math.min(columnStep,Math.ceil(tr.x)-x);
      const a=Math.max(0,Math.min(1,(x+stripWidth/2-tl.x)/screenWidth));
      const u=sourceAt((x-tl.x)/screenWidth),v=sourceAt((x+stripWidth-tl.x)/screenWidth);
      if(v<=u)continue;
      const py=tl.y+(tr.y-tl.y)*a,lower=bl.y+(br.y-bl.y)*a;
      draw.drawImage(texture,u*textureWidth,0,(v-u)*textureWidth,textureHeight,x,py,stripWidth,lower-py);
    }
  }
  if(geometry.brightness<1){draw.fillStyle=`rgba(0,0,0,${1-geometry.brightness})`;draw.fillRect(left,top,width,height);}
  draw.restore();
  if(layer){c.save();c.globalAlpha=geometry.opacity;c.drawImage(layer.canvas,left,top,width,height,left,top,width,height);c.restore();}
  c.save();c.globalAlpha=geometry.opacity;
  // Continuous light emphasis avoids a sudden outline change near the center.
  c.strokeStyle = '#fff9e8'; c.lineWidth = 1 + Math.max(0, 1 - Math.abs(geometry.offset));
  c.beginPath(); c.moveTo(tl.x, tl.y); c.lineTo(tr.x, tr.y); c.lineTo(br.x, br.y); c.lineTo(bl.x, bl.y); c.closePath(); c.stroke();
  // Lit upper edge and dark side wall establish the shell's physical depth.
  c.strokeStyle = '#f7efda'; c.beginPath(); c.moveTo(tl.x, tl.y); c.lineTo(tr.x, tr.y); c.stroke();
  c.restore();
}

export function drawCoverflow(c, textures, decks, list, position, focused, selected, animating = false) {
  c.fillStyle = '#000'; c.fillRect(0, 0, 600, 350);
  if (!list.length) { c.fillStyle = '#fff7df'; c.font = '20px sans-serif'; c.textAlign = 'center'; c.fillText('Add favorites in your phone library', 300, 175); return; }
  const geometry = list.map((id, index) => ({ id, ...projectDeck(offsetFrom(index, position, list.length), list.length) }))
    .filter(item => item.opacity > .001).sort((a, b) => a.depth - b.depth);
  // Bound the moving region to 560x282 pixels: its dirty image fits into one
  // Scene tile. Only the outer fading slivers are cropped; center stays 232x280.
  c.save(); c.beginPath(); c.moveTo(20, 0); c.lineTo(580, 0); c.lineTo(580, 286); c.lineTo(20, 286); c.closePath(); c.clip();
  for (const item of geometry) paintProjected(c, textures[item.id], item);
  c.restore();
  c.textAlign = 'center'; c.fillStyle = '#fff7df'; c.font = 'bold 22px sans-serif';
  c.fillText(selected ? `SELECTED · ${decks[focused].title}` : decks[focused].title, 300, 311, 580);
  c.fillStyle = '#dbdece'; c.font = '14px sans-serif';
  c.fillText(selected ? 'Turn to browse another deck' : '← HEAD MOTION →    /    PRESS TO SELECT', 300, 333);
  const current = list.indexOf(focused);
  list.forEach((_, index) => { c.fillStyle = index === current ? '#fff8e1' : '#73796e'; c.fillRect(300 - list.length * 8 + index * 16, 344, index === current ? 11 : 5, 3); });
}

// The same coverflow camera/spring now presents comic covers, not game shells.
export function drawComicScene(c,textures,books,position,focused,animating=false){
 c.fillStyle='#000';c.fillRect(0,0,600,350);if(!books.length)return;
 const geometry=books.map((book,index)=>({index,...projectDeck(offsetFrom(index,position,books.length),books.length)})).filter(item=>item.opacity>.001).sort((a,b)=>a.depth-b.depth);
 c.save();c.beginPath();c.moveTo(24,0);c.lineTo(576,0);c.lineTo(576,286);c.lineTo(24,286);c.closePath();c.clip();
 for(const item of geometry){const lod=projectedTexture(textures[item.index],item.offset);paintProjected(c,lod.texture,item,lod.columns,24,576);}c.restore();
 c.fillStyle='#fff';c.textAlign='center';c.font='bold 21px sans-serif';c.fillText(books[focused]?.title||'',300,310,575);
 c.font='14px sans-serif';c.fillText(`상하 이동 · 한 번 열기 · 두 번 이전  ${focused+1}/${books.length}`,300,333);
 c.textAlign='left';
}
