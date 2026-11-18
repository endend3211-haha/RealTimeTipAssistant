from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/core.test.mjs');s=p.read_text(encoding='utf-8').replace('shouldRequestHelp,acceptHelp}', 'shouldRequestHelp,acceptHelp,mergeLiveTranscript}')
s+='''
test('interim text updates in place while final sentences are recorded only once',()=>{
 let state={entries:[],partial:'',revision:-1};state=mergeLiveTranscript(state,{finals:[],partial:'한국어',revision:1});assert.equal(state.entries.length,0);assert.equal(state.partial,'한국어');
 state=mergeLiveTranscript(state,{finals:[],partial:'한국어 실시간 자막',revision:2});assert.equal(state.entries.length,0);
 const final={id:'session:0',text:'한국어 실시간 자막입니다.'};state=mergeLiveTranscript(state,{finals:[final],partial:'다음 문장',revision:3});assert.equal(state.entries.length,1);
 state=mergeLiveTranscript(state,{finals:[final],partial:'옛날 결과',revision:1});assert.equal(state.entries.length,1);assert.equal(state.partial,'다음 문장');
 state=mergeLiveTranscript(state,{finals:[final,{id:'session:1',text:'같은 말을 반복해도 기록합니다.'}],partial:'',revision:4});assert.equal(state.entries.length,2);
});
test('transport packets may be small without ending the recognition session',()=>{const out=[],seg=createCaptionSegmenter(b=>out.push(b),10);for(let i=0;i<23;i++)seg.push({data:new Uint8Array([i]),frameLengths:[1]});seg.flush();assert.deepEqual(out.map(b=>new DataView(b.buffer).getUint32(0)),[10,10,3]);});
''';p.write_text(s,encoding='utf-8')
