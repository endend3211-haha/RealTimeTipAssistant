import {createCanvas,loadImage} from '@napi-rs/canvas';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {buildDeckLod} from '../../../PhoneSDK/examples/webtoon-reader/deck-lod.mjs';
import {drawComicScene,DeckMotion} from '../../../PhoneSDK/examples/webtoon-reader/coverflow.mjs';
import {packLumaGray4,changedTiles} from '../../../PhoneSDK/examples/webtoon-reader/frame-pipeline.mjs';
import {compressLz4} from '../../../PhoneSDK/examples/webtoon-reader/lz4.mjs';
const directory=new URL('.',import.meta.url),proxy='https://proxy.cors.dev/';
const document={createElement(){const canvas=createCanvas(600,350);canvas.ownerDocument=document;return canvas;}};
await mkdir(new URL('covers/',directory),{recursive:true});
let catalog;try{catalog=JSON.parse(await readFile(new URL('covers/catalog.json',directory),'utf8'));}catch{const r=await fetch(proxy+'https://api.mangadex.org/manga?limit=7&includes[]=cover_art&availableTranslatedLanguage[]=ko&order[followedCount]=desc');if(!r.ok)throw Error('catalog '+r.status);catalog=await r.json();await writeFile(new URL('covers/catalog.json',directory),JSON.stringify(catalog));}
const books=catalog.data.map(row=>({id:row.id,title:row.attributes.title.ko||row.attributes.title.en||'작품',file:row.relationships.find(r=>r.type==='cover_art').attributes.fileName}));
const full=[];
for(let i=0;i<books.length;i++){const book=books[i],file=new URL(`covers/${i}.jpg`,directory);let bytes;try{bytes=await readFile(file);}catch{const url=`https://uploads.mangadex.org/covers/${book.id}/${book.file}.256.jpg`;let r=await fetch(url,{headers:{'User-Agent':'PocketManga/2.0 (local render benchmark)'}});if(!r.ok)r=await fetch(proxy+url);if(!r.ok)throw Error('cover '+r.status);bytes=Buffer.from(await r.arrayBuffer());await writeFile(file,bytes);}
 const image=await loadImage(bytes),t=document.createElement('canvas');t.width=232;t.height=280;const c=t.getContext('2d'),s=Math.max(232/image.width,280/image.height);c.drawImage(image,(232-image.width*s)/2,(280-image.height*s)/2,image.width*s,image.height*s);c.fillStyle='rgba(0,0,0,.85)';c.fillRect(0,230,232,50);c.fillStyle='#fff5df';c.font='bold 18px sans-serif';c.textAlign='center';c.fillText(book.title,116,260,218);full.push(t);}
const reduced=full.map(t=>buildDeckLod(document,t));
function measure(textures,save=false){const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');let previous,bytes=0,drawMs=0,count=0;const samples=[];for(let i=0;i<=20;i++){const position=i/20,start=performance.now();drawComicScene(ctx,textures,books,position,0,i<20);drawMs+=performance.now()-start;const pixels=packLumaGray4(ctx.getImageData(0,0,600,350),.8);if(i>0){const tiles=changedTiles(pixels,previous);const size=tiles.reduce((n,t)=>n+compressLz4(t.bytes).length,0);bytes+=size;samples.push(size);count++;}previous=pixels;
 if(save&&(i===0||i===10))writeFile(new URL(`preview-${i}.png`,directory),canvas.toBuffer('image/png'));}
 return {meanCompressedBytes:Math.round(bytes/count),totalCompressedBytes:bytes,meanDrawMs:Number((drawMs/21).toFixed(2)),maxCompressedBytes:Math.max(...samples)};}
measure(full);measure(reduced);const before=measure(full),after=measure(reduced,true);
function frameCount(tolerance,step){const m=new DeckMotion(tolerance);m.retarget(1,7);let frames=0;while(m.active&&frames<100){m.advance(frames===0?16:step);frames++;}return frames;}
function centerPixels(textures){const c=document.createElement('canvas').getContext('2d');drawComicScene(c,textures,books,0,0,false);return c.getImageData(188,8,224,272).data;}
const centerBefore=centerPixels(full),centerAfter=centerPixels(reduced);let centerDifferences=0;for(let i=0;i<centerBefore.length;i++)if(centerBefore[i]!==centerAfter[i])centerDifferences++;if(centerDifferences)throw Error('Front cover changed: '+centerDifferences);
function transitionBytes(textures,options,step){const m=new DeckMotion(options),canvas=document.createElement('canvas'),c=canvas.getContext('2d');drawComicScene(c,textures,books,0,0,false);let previous=packLumaGray4(c.getImageData(0,0,600,350),.8),bytes=0,frames=0;m.retarget(1,7);while(m.active&&frames<100){m.advance(frames===0?16:step);drawComicScene(c,textures,books,m.position,m.active?0:1,m.active);const pixels=packLumaGray4(c.getImageData(0,0,600,350),.8);bytes+=changedTiles(pixels,previous).reduce((n,t)=>n+compressLz4(t.bytes).length,0);previous=pixels;frames++;}return {frames,compressedBytes:bytes};}
const transitionBefore=transitionBytes(full,{},50),transitionAfter=transitionBytes(reduced,{positionTolerance:.004,velocityTolerance:.05},64);
const result={oneStepTransition:{before:transitionBefore,after:transitionAfter,reductionPercent:Number((100*(1-transitionAfter.compressedBytes/transitionBefore.compressedBytes)).toFixed(1))},centerPixelDifferences:centerDifferences,fixture:'7 real Korean MangaDex covers; identical 21 poses; 600x350 GRAY_4; LZ4 changed rectangles; excludes network and glasses',before,after,compressedReductionPercent:Number((100*(1-after.totalCompressedBytes/before.totalCompressedBytes)).toFixed(1)),lateAckTransitionFrames:{before:frameCount({},50),after:frameCount({positionTolerance:.004,velocityTolerance:.05},64)}};
await writeFile(new URL('results.json',directory),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
