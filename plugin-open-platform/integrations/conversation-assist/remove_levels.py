from pathlib import Path
r=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
p=r/'LiteAi.java';s=p.read_text(encoding='utf-8').replace('String context,String term,String level','String context,String term').replace('instruction+"\\n"+ExplanationPolicy.instruction(level)+"\\n<참고 대화>','instruction+"\\n<참고 대화>').replace('null,192,new ThinkingConfig','null,160,new ThinkingConfig');p.write_text(s,encoding='utf-8')
p=r/'AssistService.java';s=p.read_text(encoding='utf-8').replace(',level=data.optString("level","medium")','').replace('    try{ExplanationPolicy.instruction(level);}catch(IllegalArgumentException e){respond(s,400,obj("error",e.getMessage()));return;}\n','').replace('ai.explain(context,term,level)','ai.explain(context,term)');p.write_text(s,encoding='utf-8')
p=r/'ExplanationPolicy.java'
if p.exists():p.unlink()
