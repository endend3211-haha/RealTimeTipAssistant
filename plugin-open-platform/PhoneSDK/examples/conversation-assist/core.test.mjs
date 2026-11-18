import test from 'node:test';
import assert from 'node:assert/strict';
import {packOpus,recentContext,appendEntry,cleanHistory,termCandidates,automaticTerm,createCaptionSegmenter,shouldRequestHelp,acceptHelp,mergeLiveTranscript,helpPopupFrame,sessionEntries,helpIsStale} from './core.mjs';
test('Opus transport retains frame boundaries and uses network byte order',()=>{const frames=Array.from({length:5},(_,i)=>new Uint8Array([i,255-i]));const out=packOpus(frames),v=new DataView(out.buffer);assert.equal(v.getUint32(0),5);assert.equal(v.getUint16(4),2);assert.deepEqual([...out.slice(6,8)],[0,255]);assert.throws(()=>packOpus([]));assert.throws(()=>packOpus(Array(5).fill(new Uint8Array(1300))));});
test('history remains bounded and context includes only recent text',()=>{let h=[];for(let i=0;i<505;i++)h=appendEntry(h,'발언 '+i,i);assert.equal(h.length,500);assert.equal(h[0].text,'발언 5');assert.ok(recentContext(h).startsWith('발언 495'));assert.ok(!recentContext(h).includes('발언 494'));assert.ok(recentContext(Array(10).fill({text:'가'.repeat(500)})).length<=1600);});
test('invalid persisted history is ignored without losing valid entries',()=>{assert.deepEqual(cleanHistory(null),[]);assert.equal(cleanHistory([{text:'내용',time:1},null,{text:5,time:2}]).length,1);});

test('term candidates keep whole acronyms and suppress recently explained terms',()=>{assert.deepEqual(termCandidates('HDR과 OIS 및 양자화를 검토하고 CMOS를 쓴다'),['HDR','OIS','양자화','CMOS']);assert.deepEqual(termCandidates('APIKEY API'),['API','APIKEY']);const seen=new Map([['HDR',1000000]]);assert.equal(automaticTerm(['HDR','OIS'],seen,1000001),'OIS');assert.equal(automaticTerm(['HDR'],seen,1600000),'HDR');});

// Gecko host creates a page-realm WebSocket on a dynamically allocated loopback port.
test('CSP allows native audio loopback while keeping internet sockets excluded',async()=>{const {readFile}=await import('node:fs/promises');const html=await readFile(new URL('./index.html',import.meta.url),'utf8');const connect=html.match(/connect-src ([^;]+)/)?.[1].split(/\s+/);assert.ok(connect.includes('http://127.0.0.1:18772'));assert.ok(connect.includes('ws://127.0.0.1:*'));assert.ok(!connect.includes('*'));assert.ok(!connect.includes('ws:'));assert.ok(!connect.includes('https:'));});

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

test('automatic help yields to audio backlog and avoids unchanged or repeated help',()=>{
 const state={enabled:true,listening:true,busy:false,pending:0,context:'역광 촬영에서 HDR 처리 방식에 관해 이야기하고 있습니다.',lastContext:'',lastAt:0,now:1000000};
 assert.ok(shouldRequestHelp(state));assert.equal(shouldRequestHelp({...state,pending:1}),false);assert.equal(shouldRequestHelp({...state,busy:true}),false);assert.equal(shouldRequestHelp({...state,lastContext:state.context}),false);assert.equal(shouldRequestHelp({...state,lastAt:995000}),false);
 const seen=new Map();assert.equal(acceptHelp({kind:'none',topic:'',text:''},seen,1000000),false);assert.ok(acceptHelp({kind:'term',topic:'HDR',text:'밝고 어두운 부분을 함께 표현합니다.'},seen,1000000));assert.equal(acceptHelp({kind:'term',topic:'hdr',text:'다시 설명'},seen,1000010),false);
});
test('all phone controls exist and no term or question selection is required',async()=>{
 const {readFile}=await import('node:fs/promises'),html=await readFile(new URL('./index.html',import.meta.url),'utf8'),script=await readFile(new URL('./plugin.js',import.meta.url),'utf8');
 for(const match of script.matchAll(/\$\('([^']+)'\)/g))assert.ok(html.includes('id="'+match[1]+'"'),match[1]);
 assert.ok(!html.includes('id="term"'));assert.ok(!html.includes('id="reply-help"'));assert.ok(script.includes("mode:'assist'"));
});

test('interim text updates in place while final sentences are recorded only once',()=>{
 let state={entries:[],partial:'',revision:-1};state=mergeLiveTranscript(state,{finals:[],partial:'한국어',revision:1});assert.equal(state.entries.length,0);assert.equal(state.partial,'한국어');
 state=mergeLiveTranscript(state,{finals:[],partial:'한국어 실시간 자막',revision:2});assert.equal(state.entries.length,0);
 const final={id:'session:0',text:'한국어 실시간 자막입니다.'};state=mergeLiveTranscript(state,{finals:[final],partial:'다음 문장',revision:3});assert.equal(state.entries.length,1);
 state=mergeLiveTranscript(state,{finals:[final],partial:'옛날 결과',revision:1});assert.equal(state.entries.length,1);assert.equal(state.partial,'다음 문장');
 state=mergeLiveTranscript(state,{finals:[final,{id:'session:1',text:'같은 말을 반복해도 기록합니다.'}],partial:'',revision:4});assert.equal(state.entries.length,2);
});
test('transport packets may be small without ending the recognition session',()=>{const out=[],seg=createCaptionSegmenter(b=>out.push(b),10);for(let i=0;i<23;i++)seg.push({data:new Uint8Array([i]),frameLengths:[1]});seg.flush();assert.deepEqual(out.map(b=>new DataView(b.buffer).getUint32(0)),[10,10,3]);});

test('help card slides in, stays fully visible five seconds, then disappears',()=>{assert.equal(helpPopupFrame(1000,1000).alpha,0);assert.ok(helpPopupFrame(1000,1120).y>166);assert.equal(helpPopupFrame(1000,1240).y,166);assert.equal(helpPopupFrame(1000,6239).alpha,1);assert.ok(helpPopupFrame(1000,6360).alpha<1);assert.equal(helpPopupFrame(1000,6480).visible,false);});

test('help dedup survives long meetings, aliases and persisted state',()=>{const seen=new Map();assert.ok(acceptHelp({kind:'term',topic:'HDR',text:'밝고 어두운 부분을 함께 표현합니다.'},seen,1));const restored=new Map(JSON.parse(JSON.stringify([...seen])));assert.equal(acceptHelp({kind:'reply',topic:'High Dynamic Range',text:'다른 표현'},restored,7200000),false);assert.equal(acceptHelp({kind:'term',topic:'영상 밝기',text:'밝고 어두운 부분을 함께 표현합니다.'},restored,7200000),false);assert.ok(acceptHelp({kind:'term',topic:'GPU',text:'그래픽 연산을 처리하는 장치입니다.'},restored,7200000));});
test('new display sessions hide prior captions without erasing archive cache',()=>{const entries=[{id:'old:0',text:'이전 회의'},{id:'new:0',text:'새 회의'}];assert.deepEqual(sessionEntries(entries,''),[]);assert.deepEqual(sessionEntries(entries,'new').map(e=>e.text),['새 회의']);assert.equal(entries.length,2);});

test('help remains at nine new finals and expires at ten despite equal timestamps',()=>{const baseline=new Set(['session:0']);const entries=Array.from({length:11},(_,i)=>({id:'session:'+i,time:123,text:'발언'}));assert.equal(helpIsStale(entries.slice(0,10),baseline),false);assert.equal(helpIsStale(entries,baseline),true);assert.equal(helpIsStale([{id:'session:0',text:'수정된 같은 발언'},...Array(12).fill({text:'직접 입력'})],baseline),false);});
test('short questions are eligible for automatic help',()=>{const s={enabled:true,listening:true,busy:false,pending:0,context:'왜?',lastContext:'',lastAt:0,now:100000};assert.ok(shouldRequestHelp(s));assert.equal(shouldRequestHelp({...s,context:' '}),false);});
