from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8')
s=s.replace("saveChain=Promise.resolve();", "saveChain=Promise.resolve(),lastExplainAt=0,lastExplainText='',explainGeneration=0,answerAt=0;")
s=s.replace("screen='caption';pageIndex=0;history();draw();await save();", "pageIndex=0;history();draw();await save();if(kind==='speech')void automaticHelp();")
s=s.replace("||consumer||explaining||suspended", "||consumer||suspended")
a=s.index('async function explain(){');b=s.index('function lines(',a)
s=s[:a]+'''async function automaticHelp(){
 if(!$('auto').checked||!capture||explaining||suspended||queue.length||entries.length<2)return;
 const context=recentContext(entries);
 if(context.length<35||Date.now()-lastExplainAt<45000||context===lastExplainText)return;
 try{await explain(true);}catch(e){$('answer').textContent='자동 설명 대기: '+e.message;}
}
async function explain(automatic=false){
 if(explaining)return;
 const context=recentContext(entries);if(!context)throw Error('먼저 대화를 듣거나 테스트 문장을 입력하세요');
 explaining=true;lastExplainAt=Date.now();lastExplainText=context;const generation=++explainGeneration,sourceTime=entries.at(-1)?.time;
 $('answer').textContent='최근 대화에 맞는 설명을 생성하는 중…';draw();
 try{
  const data=await request('/explain',{context,term:automatic?'대화 이해에 필요한 전문 용어나 표현 하나를 골라 쉽게 설명하세요. 설명이 필요하지 않으면 NONE만 출력하세요.':$('term').value.trim()||'마지막 발언을 쉽게 풀어 설명'});
  if(generation!==explainGeneration||suspended||closing)return;
  const newer=entries.filter(e=>e.time>sourceTime).length;
  if(automatic&&newer>5){$('answer').textContent='대화가 진행되어 이전 설명을 생략했습니다.';return;}
  if(automatic&&data.text.trim()==='NONE'){$('answer').textContent='현재 대화에 추가 설명이 필요하지 않습니다.';return;}
  answer=data.text;answerAt=sourceTime;$('answer').textContent=answer;
  if(!automatic){screen='explanation';pageIndex=0;}draw();
 }finally{explaining=false;draw();}
}
''' +s[b:]
a=s.index('function draw(){');b=s.index('function send(){',a)
s=s[:a]+'''function draw(){
 ctx.fillStyle='#000';ctx.fillRect(0,0,560,320);ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif';ctx.fillText('MEMO / '+(screen==='explanation'?'대화 도움':'대화 자막'),20,31);
 ctx.font='12px sans-serif';ctx.fillText(status.slice(0,43)+(explaining?' · AI 처리 중':''),20,54);ctx.fillStyle='#777';ctx.fillRect(20,66,520,1);ctx.fillStyle='#fff';
 const split=screen==='caption'&&Boolean(answer),perPage=split?3:6;
 const content=screen==='explanation'?answer:entries.slice(-3).map(e=>e.text).join('\\n')||'듣기 시작을 누르면\\n대화 자막이 여기에 나타납니다.';
 const wrapped=lines(content,510,'22px sans-serif'),count=Math.max(1,Math.ceil(wrapped.length/perPage));pageIndex=Math.min(pageIndex,count-1);
 ctx.font='22px sans-serif';wrapped.slice(pageIndex*perPage,pageIndex*perPage+perPage).forEach((l,i)=>ctx.fillText(l,23,99+i*28));
 if(split){ctx.fillStyle='#777';ctx.fillRect(20,178,520,1);ctx.font='12px sans-serif';ctx.fillText('AI 도움 · '+new Date(answerAt).toLocaleTimeString('ko-KR')+' 발언 기준',22,198);ctx.fillStyle='#fff';ctx.font='17px sans-serif';const help=lines(answer,510,'17px sans-serif');help.slice(0,3).forEach((l,i)=>ctx.fillText(l,22,220+i*20));}
 ctx.fillStyle='#999';ctx.font='12px sans-serif';ctx.fillText(`${pageIndex+1}/${count} · ${screen==='explanation'?'AI 설명 · 듣기 상태는 상단 확인':'최근 발언 · 두 번 눌러 도움 보기'}`,20,283);
 ctx.fillText('한 번: 페이지  ·  두 번: 설명/자막  ·  길게: 듣기/정지',20,306);version++;if(ready&&!suspended)send();return count;
}
''' +s[b:]
s=s.replace("if(screen==='explanation'){screen='caption';pageIndex=0;draw();}else await explain();", "if(screen==='explanation'){screen='caption';pageIndex=0;draw();}else if(answer){screen='explanation';pageIndex=0;draw();}else await explain();")
s=s.replace("if(suspended){displayPage=false;void stop(false);}","if(suspended){displayPage=false;explainGeneration++;void request('/cancel',{},3000).catch(()=>{});void stop(false);}")
s=s.replace("$('connect').onclick", "$('auto').onchange=()=>void safe(()=>gm.storage.set('conversation.auto.v1',$('auto').checked));\n$('connect').onclick")
s=s.replace("ready=true;history();", "const pref=await gm.storage.get('conversation.auto.v1');if(typeof(pref?.value??pref)==='boolean')$('auto').checked=pref?.value??pref;ready=true;history();")
p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/index.html');s=p.read_text(encoding='utf-8');s=s.replace('<p>설명 중에는 듣기를 일시정지합니다. 설명 후 ‘듣기 시작’으로 재개하세요.</p>','<label><input id="auto" type="checkbox" checked> 대화 중 자동 설명</label><p>듣기는 유지하며, 새 대화가 있을 때 최소 45초 간격으로 설명합니다. 자동 설명은 필요 없으면 생략합니다.</p>');p.write_text(s,encoding='utf-8')
