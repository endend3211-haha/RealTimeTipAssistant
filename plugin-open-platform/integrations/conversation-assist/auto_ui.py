from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8')
s=s.replace('termCandidates,automaticTerm,KNOWN_TERMS,createCaptionSegmenter','createCaptionSegmenter,shouldRequestHelp,acceptHelp')
s=s.replace("health.version!=='0.2.1'","health.version!=='0.3.0'").replace('APK를 0.2.1','APK를 0.3.0')
s=s.replace("pageIndex=0;refreshTerms();history();draw();await save();", "if(screen==='caption')pageIndex=0;history();draw();await save();")
s=s.replace("if(kind==='speech')void automaticHelp();", "void automaticHelp();")
a=s.index('function refreshTerms(){');b=s.index('function lines(',a)
s=s[:a]+'''async function automaticHelp(){
 const context=recentContext(entries).slice(-500),now=Date.now();
 if(!shouldRequestHelp({enabled:$('auto').checked,listening:Boolean(capture),busy:explaining,pending:queue.length,context,lastContext:lastExplainText,lastAt:lastExplainAt,now}))return;
 explaining=true;lastExplainAt=now;lastExplainText=context;const generation=++explainGeneration,sourceTime=entries.at(-1)?.time||now;
 $('help-state').textContent='AI가 도움 필요 여부를 확인하는 중';draw();
 try{
  const data=await request('/explain',{context,term:'자동 대화 도움',mode:'assist'});
  if(generation!==explainGeneration||suspended||closing)return;
  if(entries.filter(e=>e.time>sourceTime).length>5){$('help-state').textContent='대화가 진행되어 이전 도움을 생략했습니다';return;}
  if(!acceptHelp(data,explainedTerms)){$('help-state').textContent='듣는 중 · 필요한 순간에만 도움을 표시합니다';return;}
  answer=data.text;answerTerm=(data.kind==='reply'?'답변 힌트 · ':'용어 · ')+data.topic;answerAt=sourceTime;
  $('answer').textContent=answerTerm+'\\n'+answer;$('help-state').textContent=data.source;draw();
 }catch(e){$('help-state').textContent='자동 도움 대기: '+e.message;}
 finally{explaining=false;draw();}
}
''' +s[b:]
s=s.replace("ctx.fillText(screen==='caption'?'선택 '+captionActions()[candidateIndex]+' · 한 번: 이동 · 두 번: 실행 · 길게: 듣기/정지':'한 번: 페이지 · 두 번: 자막 복귀 · 길게: 듣기/정지',20,306);", "ctx.fillText('한 번: 페이지 · 두 번: 자막/도움 · 길게: 듣기/정지',20,306);")
s=s.replace("$('explain').onclick=()=>void safe(explain);$('reply-help').onclick=()=>void safe(()=>explain(false,'',true));", '')
s=s.replace("explainedTerms.clear();refreshTerms();", "explainedTerms.clear();")
a=s.index('gm.device.onButton(');b=s.index('\ngm.device.onConnection',a)
s=s[:a]+'''gm.device.onButton(e=>void safe(async()=>{
 if(e.action==='single'){const n=draw();pageIndex=(pageIndex+1)%n;draw();}
 else if(e.action==='double'){if(screen==='explanation'){screen='caption';pageIndex=0;draw();}else if(answer){screen='explanation';pageIndex=0;draw();}}
 else if(['long','very_long'].includes(e.action)){if(capture)await stop();else await start();}
}));
''' +s[b:]
s=s.replace("ready=true;refreshTerms();history();", "ready=true;history();")
s=s.replace("clearInterval(audioWatch);void capture", "clearInterval(audioWatch);clearInterval(helpTimer);void capture")
s=s.replace("draw();(async()=>", "const helpTimer=setInterval(()=>void automaticHelp(),2000);\ndraw();(async()=>")
s=s.replace("clearInterval(audioWatch);queue=[]", "clearInterval(audioWatch);clearInterval(helpTimer);queue=[]")
p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/index.html');s=p.read_text(encoding='utf-8');a=s.index('<section><h2>이해를 돕는 설명');b=s.index('<section><h2>대화 기록',a)
s=s[:a]+'''<section><h2>AI 대화 도움</h2><label><input id="auto" type="checkbox" checked> 자동 도움 켜기</label><p>대화에 집중하세요. AI가 전문 용어나 답변에 도움이 필요한 순간을 판단해 짧게 알려줍니다. 필요하지 않으면 표시하지 않습니다.</p><p id="help-state">대화를 기다리는 중</p><p id="answer"></p></section>
''' +s[b:]
s=s.replace('한 번: 페이지 이동 · 두 번: 설명/자막 전환','한 번: 페이지 이동 · 두 번: 도움/자막 전환');p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/manifest.json');import json;m=json.loads(p.read_text(encoding='utf-8'));m['version']='0.3.0';m['name']='Memo 자동 대화 도움 0.3.0';p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
