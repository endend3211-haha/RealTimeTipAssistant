from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/core.test.mjs');s=p.read_text(encoding='utf-8').replace('createCaptionSegmenter}', 'createCaptionSegmenter,shouldRequestHelp,acceptHelp}')
s+='''
test('automatic help yields to audio backlog and avoids unchanged or repeated help',()=>{
 const state={enabled:true,listening:true,busy:false,pending:0,context:'역광 촬영에서 HDR 처리 방식에 관해 이야기하고 있습니다.',lastContext:'',lastAt:0,now:1000000};
 assert.ok(shouldRequestHelp(state));assert.equal(shouldRequestHelp({...state,pending:1}),false);assert.equal(shouldRequestHelp({...state,busy:true}),false);assert.equal(shouldRequestHelp({...state,lastContext:state.context}),false);assert.equal(shouldRequestHelp({...state,lastAt:995000}),false);
 const seen=new Map();assert.equal(acceptHelp({kind:'none',topic:'',text:''},seen,1000000),false);assert.ok(acceptHelp({kind:'term',topic:'HDR',text:'밝고 어두운 부분을 함께 표현합니다.'},seen,1000000));assert.equal(acceptHelp({kind:'term',topic:'hdr',text:'다시 설명'},seen,1000010),false);
});
test('all phone controls exist and no term or question selection is required',async()=>{
 const {readFile}=await import('node:fs/promises'),html=await readFile(new URL('./index.html',import.meta.url),'utf8'),script=await readFile(new URL('./plugin.js',import.meta.url),'utf8');
 for(const match of script.matchAll(/\\$\\('([^']+)'\\)/g))assert.ok(html.includes('id="'+match[1]+'"'),match[1]);
 assert.ok(!html.includes('id="term"'));assert.ok(!html.includes('id="reply-help"'));assert.ok(script.includes("mode:'assist'"));
});
''';p.write_text(s,encoding='utf-8')
