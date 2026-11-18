from pathlib import Path
r=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
p=r/'Glossary.java';s=p.read_text(encoding='utf-8').replace(' private Glossary(){}',' public static String exact(String term){for(String[] item:TERMS)if(item[0].equalsIgnoreCase(term.trim()))return item[1];return null;}\n private Glossary(){}');p.write_text(s,encoding='utf-8')
p=r/'LiteAi.java';s=p.read_text(encoding='utf-8').replace('최근 문맥에서 용어나 마지막 발언의 뜻을 쉬운 한국어 2~3문장으로 설명하세요.','선택한 단어의 뜻만 최근 문맥에 맞춰 쉬운 한국어 1~2문장, 100자 안팎으로 설명하세요. 대화 전체를 요약하거나 풀어 쓰지 마세요.').replace('null,160,new ThinkingConfig','null,96,new ThinkingConfig');p.write_text(s,encoding='utf-8')
p=r/'AssistService.java';s=p.read_text(encoding='utf-8');s=s.replace('context.length()>1800||term.length()>120','context.length()>1800||term.isEmpty()||term.length()>48').replace('최근 대화는 1800자, 용어는 120자 이내입니다','최근 대화는 1800자, 선택 용어는 48자 이내입니다')
s=s.replace('    File model=new File(getFilesDir(),"model.litertlm");', '''    String definition=Glossary.exact(term);
    if(definition!=null){respond(s,200,new JSONObject().put("text",term+" · "+definition).put("source","로컬 용어 사전").put("term",term).put("timing",new JSONObject().put("cold",false).put("loadMs",0).put("generateMs",0)));return;}
    File model=new File(getFilesDir(),"model.litertlm");''')
p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/core.mjs');s=p.read_text(encoding='utf-8');s+='''
export const KNOWN_TERMS=['HDR','OIS','EIS','MTF','SNR','ISP','API','SDK','LLM','NPU','GPU','EBITDA','양자화'];
export function termCandidates(text){
 const upper=String(text).toUpperCase(),found=[];
 for(const term of KNOWN_TERMS){const hit=/^[A-Z]+$/.test(term)?new RegExp('(?<![A-Z0-9])'+term+'(?![A-Z0-9])').test(upper):upper.includes(term);if(hit)found.push(term);}
 for(const hit of String(text).matchAll(/(?<![A-Za-z0-9])[A-Z][A-Z0-9]{1,9}(?![A-Za-z0-9])/g))if(!found.includes(hit[0]))found.push(hit[0]);
 return found.slice(0,6);
}
export function automaticTerm(candidates,seen,now=Date.now()){return candidates.find(t=>now-(seen.get(t)||0)>=600000)||null;}
''';p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/index.html');s=p.read_text(encoding='utf-8').replace('maxlength="120" placeholder="비워 두면 최근 발언을 쉽게 설명"','maxlength="48" placeholder="설명할 단어를 선택하거나 입력"').replace('<button id="explain">최근 대화로 설명하기</button>','<div id="terms"></div><button id="explain">선택한 단어 설명</button>').replace('새 대화가 있을 때 최소 45초 간격으로 설명합니다. 자동 설명은 필요 없으면 생략합니다.','등록 용어·영문 약어를 후보로 표시합니다. 사전 용어는 빠르게, 그 외 용어는 최소 45초 간격으로 AI가 설명합니다. 같은 단어는 10분 동안 자동 재설명하지 않습니다.');p.write_text(s,encoding='utf-8')
