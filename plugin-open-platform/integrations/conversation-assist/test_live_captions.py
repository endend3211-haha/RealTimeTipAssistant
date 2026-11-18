from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/core.test.mjs');s=p.read_text(encoding='utf-8').replace('automaticTerm}', 'automaticTerm,createCaptionSegmenter}')
s+='''
test('live captions preserve every frame across arbitrary host chunks and flush tail',()=>{
 const output=[],segmenter=createCaptionSegmenter(b=>output.push(b));
 const frames=Array.from({length:237},(_,i)=>new Uint8Array([i%256,Math.floor(i/256),7]));
 for(let start=0;start<frames.length;start+=37){const batch=frames.slice(start,start+37),data=new Uint8Array(batch.length*3);batch.forEach((f,i)=>data.set(f,i*3));segmenter.push({data,frameLengths:batch.map(f=>f.length)});}
 segmenter.flush();assert.equal(segmenter.receivedFrames,237);
 assert.deepEqual(output.map(b=>new DataView(b.buffer).getUint32(0)),[100,100,37]);
 const recovered=[];for(const b of output){const view=new DataView(b.buffer);let offset=4;for(let i=0;i<view.getUint32(0);i++){const n=view.getUint16(offset);offset+=2;recovered.push([...b.slice(offset,offset+n)]);offset+=n;}}
 assert.deepEqual(recovered,frames.map(f=>[...f]));
});
test('live captions reject discontinuities and discard a suspended tail',()=>{
 const out=[],segmenter=createCaptionSegmenter(b=>out.push(b));
 assert.throws(()=>segmenter.push({data:new Uint8Array([1]),frameLengths:[2]}));
 assert.throws(()=>segmenter.push({discontinuity:true,data:new Uint8Array([1]),frameLengths:[1]}));
 assert.equal(segmenter.receivedFrames,0);
 segmenter.push({data:new Uint8Array(20),frameLengths:Array(20).fill(1)});segmenter.clear();segmenter.flush();assert.equal(out.length,0);
});
''';p.write_text(s,encoding='utf-8')
