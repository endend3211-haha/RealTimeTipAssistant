from pathlib import Path
import shutil
root=Path.cwd();new=root/'dist/memo-conversation-assist-0.1.1';old=root/'dist/memo-conversation-assist-0.1.0'
new.mkdir(exist_ok=True)
for p in old.iterdir():
 if p.is_file() and p.suffix!='.mmpkg':shutil.copyfile(p,new/p.name)
shutil.copytree(old/'licenses',new/'licenses',dirs_exist_ok=True)
shutil.copyfile(root/'dist/MemoConversationAssist-0.1.1.mmpkg',new/'MemoConversationAssist-0.1.1.mmpkg')
section='''\n\n## 폰 플러그인 0.1.1 — 듣기 시작 콘텐츠 차단 수정\n\n설치된 MemoMind의 `assets/memo_gecko_view/host.js`는 `audio.open`에서 page-realm WebSocket을 `ws://127.0.0.1:임의포트/세션경로`로 생성합니다. 0.1.0의 `connect-src`가 보조 APK HTTP 주소만 허용하여 `NS_ERROR_CONTENT_BLOCKED (0x805e0006)`가 발생했습니다.\n\n0.1.1은 `connect-src http://127.0.0.1:18772 ws://127.0.0.1:*`로 수정했습니다. 인터넷 WebSocket이나 임의 외부 서버는 허용하지 않습니다. 폰 패키지 버전은 0.1.1, 보조 APK는 0.1.0, 글라스 GMP는 버전 1입니다.\n\n**기존 폰 플러그인을 Studio에서 MemoConversationAssist-0.1.1.mmpkg로 업데이트한 뒤 플러그인을 종료·재시작하세요.** 기존 글라스 GMP/manifest는 그대로 사용합니다. 보조 APK·모델 재설치는 필요 없습니다. 같은 플러그인 ID를 유지하며 기록과 연결 키를 삭제하지 마세요.\n\nCSP 회귀 테스트를 포함해 Node 테스트 5개 통과 및 MMPKG 생성 확인. 실제 MemoMind에 수정본을 설치한 뒤 녹음 시작 성공과 실제 음성 수신은 추가 확인해야 합니다.\n'''
p=root/'CONVERSATION_ASSIST.md';doc=p.read_text(encoding='utf-8');doc+=section;p.write_text(doc,encoding='utf-8');(new/'README.md').write_text(doc,encoding='utf-8')
p=root/'integrations/conversation-assist/.gitignore';s=p.read_text(encoding='utf-8');s+='\n/memomind-host-inspect.apk\n/host-inspect/\n';p.write_text(s,encoding='utf-8')
print(new/'MemoConversationAssist-0.1.1.mmpkg')
