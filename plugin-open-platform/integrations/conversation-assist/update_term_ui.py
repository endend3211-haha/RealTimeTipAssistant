from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8').replace('recentContext,appendEntry,packOpus,cleanHistory','recentContext,appendEntry,packOpus,cleanHistory,termCandidates,automaticTerm,KNOWN_TERMS')
s=s.replace('answerAt=0;',"answerAt=0,candidates=[],candidateIndex=0,answerTerm='';\nconst explainedTerms=new Map();")
s=s.replace("pageIndex=0;history();draw();await save();", "pageIndex=0;refreshTerms();history();draw();await save();")
a=s.index('async function automaticHelp(){');b=s.index('function lines(',a)
s=s[:a]+'''function refreshTerms(){
 const old=candidates[candidateIndex];candidates=termCandidates(entries.slice(-2).map(e=>e.text).join(' '));candidateIndex=Math.max(0,candidates.indexOf(old));
 $('terms').replaceChildren();for(const term of candidates){const b=document.createElement('button');b.className='secondary';b.type='button';b.textContent=term;b.onclick=()=>{$('term').value=term;candidateIndex=candidates.indexOf(term);draw();};$('terms').append(b);}
}
async function automaticHelp(){
 if(!$('auto').checked||!capture||explaining||suspended||queue.length)return;
 const term=automaticTerm(candidates,explainedTerms);if(!term)return;
 if(!KNOWN_TERMS.includes(term)&&Date.now()-lastExplainAt<45000)return;
 try{await explain(true,term);}catch(e){$('answer').textContent='단어 설명 대기: '+e.message;}
}
async function explain(automatic=false,chosen=''){
 if(explaining)return;
 const term=(chosen||$('term').value.trim()||candidates[candidateIndex]||'').slice(0,48);
 if(!term)throw Error('설명할 단어를 선택하거나 입력하세요');
 const context=recentContext(entries).slice(-500)||term;
 explaining=true;if(!KNOWN_TERMS.includes(term))lastExplainAt=Date.now();lastExplainText=context;const generation=++explainGeneration,sourceTime=entries.at(-1)?.time||Date.now();
 $('answer').textContent=term+' · 뜻을 확인하는 중…';draw();
 try{
  const data=await request('/explain',{context,term});
  if(generation!==explainGeneration||suspended||closing)return;
  const newer=entries.filter(e=>e.time>sourceTime).length;
  if(automatic&&newer>5){$('answer').textContent='대화가 진행되어 이전 설명을 생략했습니다.';return;}
  answer=data.text;answerTerm=term;answerAt=sourceTime;explainedTerms.set(term,Date.now());if(explainedTerms.size>100)explainedTerms.delete(explainedTerms.keys().next().value);
  $('answer').textContent=data.source+' · '+answer;
  if(!automatic){screen='explanation';pageIndex=0;}draw();
 }finally{explaining=false;draw();}
}
''' +s[b:]
s=s.replace("ctx.fillText('AI 도움 · '+new Date(answerAt)","ctx.fillText(answerTerm+' · '+new Date(answerAt)")
s=s.replace("ctx.fillText('한 번: 페이지  ·  두 번: 설명/자막  ·  길게: 듣기/정지',20,306);", "ctx.fillText(screen==='caption'&&candidates.length?'선택 '+candidates[candidateIndex]+' · 한 번: 단어 · 두 번: 뜻 · 길게: 듣기/정지':'한 번: 페이지 · 두 번: 자막 복귀 · 길게: 듣기/정지',20,306);")
s=s.replace("if(e.action==='single'){const n=draw();pageIndex=(pageIndex+1)%n;draw();}","if(e.action==='single'){if(screen==='caption'&&candidates.length){candidateIndex=(candidateIndex+1)%candidates.length;$('term').value=candidates[candidateIndex];draw();}else{const n=draw();pageIndex=(pageIndex+1)%n;draw();}}")
s=s.replace("else if(answer){screen='explanation';pageIndex=0;draw();}else await explain();", "else if(answer&&answerTerm===($('term').value.trim()||candidates[candidateIndex])){screen='explanation';pageIndex=0;draw();}else await explain();")
s=s.replace("ready=true;history();", "ready=true;refreshTerms();history();")
s=s.replace("entries=[];answer='';", "entries=[];answer='';answerTerm='';explainedTerms.clear();refreshTerms();")
p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/core.test.mjs');s=p.read_text(encoding='utf-8').replace('cleanHistory}', 'cleanHistory,termCandidates,automaticTerm}')
s+='''\ntest('term candidates keep whole acronyms and suppress recently explained terms',()=>{assert.deepEqual(termCandidates('HDR과 OIS 및 양자화를 검토하고 CMOS를 쓴다'),['HDR','OIS','양자화','CMOS']);assert.deepEqual(termCandidates('APIKEY API'),['API','APIKEY']);const seen=new Map([['HDR',1000000]]);assert.equal(automaticTerm(['HDR','OIS'],seen,1000001),'OIS');assert.equal(automaticTerm(['HDR'],seen,1600000),'HDR');});\n''';p.write_text(s,encoding='utf-8')
