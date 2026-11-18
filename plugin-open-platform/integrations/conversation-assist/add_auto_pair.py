from pathlib import Path
r=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
(r/'PairingGate.java').write_text('''package com.mcnex.conversation;
final class PairingGate {
 private long until;private boolean used;
 synchronized void open(long now){until=now+60000;used=false;}
 synchronized boolean claim(String origin,String plugin,long now){if(used||now>until||!"com.mcnex.conversation.phone".equals(plugin)||origin==null||!origin.matches("http://127\\\\.0\\\\.0\\\\.1:[0-9]{1,5}"))return false;try{int port=Integer.parseInt(origin.substring(origin.lastIndexOf(':')+1));if(port<1||port>65535)return false;}catch(Exception e){return false;}used=true;return true;}
}
'''.replace('\\\\.','\\\\.'),encoding='utf-8')
p=r/'AssistService.java';s=p.read_text(encoding='utf-8').replace('public static volatile boolean running=false;', 'public static volatile boolean running=false;static final PairingGate PAIRING=new PairingGate();')
s=s.replace('token(this);new Thread', 'token(this);PAIRING.open(System.currentTimeMillis());new Thread')
s=s.replace('return START_NOT_STICKY;', 'PAIRING.open(System.currentTimeMillis());return START_NOT_STICKY;')
s=s.replace('  byte[] expected=', '''  if(path.equals("/pair")&&method.equals("GET")){if(!PAIRING.claim(headers.get("origin"),headers.get("x-memo-plugin"),System.currentTimeMillis())){respond(s,423,obj("error","APK에서 자동 연결을 시작하세요"));return;}respond(s,200,new JSONObject().put("token",token(this)).put("service","Memo Conversation Assist"));return;}
  byte[] expected=''' )
s=s.replace('Authorization, Content-Type\\r\\n','Authorization, Content-Type, X-Memo-Plugin\\r\\n');p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8')
s=s.replace("if(!r.ok)throw Error(data.error||'HTTP '+r.status);", "if(!r.ok){const error=Error(data.error||'HTTP '+r.status);error.httpStatus=r.status;throw error;}")
a=s.index('async function check(){');b=s.index('function enqueue(',a)
s=s[:a]+'''let pairingTask=null,checkingTask=null;
async function autoPair(){if(pairingTask)return pairingTask;pairingTask=(async()=>{$('connection').textContent='보조 앱과 자동 연결 중';const r=await fetch(base+'/pair',{headers:{'X-Memo-Plugin':'com.mcnex.conversation.phone'},signal:AbortSignal.timeout(5000),credentials:'omit'});const data=await r.json();if(!r.ok)throw Error('보조 APK를 열고 자동 연결을 시작하세요. 키 입력은 필요 없습니다.');if(data.service!=='Memo Conversation Assist'||typeof data.token!=='string'||!/^[A-Za-z0-9_=-]{24,128}$/.test(data.token))throw Error('자동 연결 응답 오류');$('key').value=data.token;await gm.storage.set('conversation.connection.v1',{token:data.token});})().finally(()=>{pairingTask=null;});return pairingTask;}
async function check(){if(checkingTask)return checkingTask;checkingTask=(async()=>{connected=false;if(!$('key').value.trim())await autoPair();let health;try{health=await request('/health',undefined,7000);}catch(e){if(e.httpStatus!==401)throw e;await autoPair();health=await request('/health',undefined,7000);}if(health.service!=='Memo Conversation Assist')throw Error('다른 보조 앱입니다');if(health.version!=='0.5.0')throw Error('보조 APK를 0.5.0으로 업데이트하세요');connected=true;await gm.storage.set('conversation.connection.v1',{token:$('key').value.trim()});$('connection').textContent=health.model?'자동 연결됨 · AI 도움 준비됨':'자동 연결됨 · 자막 사용 가능';setStatus('대화 준비 완료');})().finally(()=>{checkingTask=null;});return checkingTask;}
''' +s[b:]
s=s.replace("if($('key').value)void safe(check);", "void safe(check);")
p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/index.html');s=p.read_text(encoding='utf-8').replace('<label>연결 키<input id="key" type="password" autocomplete="off" placeholder="보조 앱에서 복사한 키"></label><button id="connect">연결 확인 · 저장</button>','<button id="connect">자동 연결 확인</button><details><summary>수동 연결 · 복구용</summary><label>연결 키<input id="key" type="password" autocomplete="off" placeholder="기본은 자동 연결"></label></details>');p.write_text(s,encoding='utf-8')
