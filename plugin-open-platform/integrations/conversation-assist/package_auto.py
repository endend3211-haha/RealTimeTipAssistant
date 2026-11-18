from pathlib import Path
import shutil,json
root=Path.cwd();out=root/'dist/memo-conversation-assist-0.3.0';out.mkdir(exist_ok=True)
shutil.copyfile(root/'integrations/conversation-assist/android/build/outputs/apk/debug/MemoConversationAssist-debug.apk',out/'MemoConversationAssist-0.3.0.apk')
shutil.copyfile(root/'dist/MemoConversationAssist-0.3.0.mmpkg',out/'MemoConversationAssist-0.3.0.mmpkg')
old=root/'dist/memo-conversation-assist-0.2.0'
for p in old.iterdir():
 if p.is_file() and (p.name.startswith('conversation_assist_glass.') or p.name=='manifest.json'):shutil.copyfile(p,out/p.name)
shutil.copytree(old/'licenses',out/'licenses',dirs_exist_ok=True)
doc='''# Memo 자동 대화 도움 0.3.0

## 사용자가 원하는 동작

사용자는 대화만 합니다. 안경은 대화 자막을 계속 갱신하고, AI가 최근 문맥을 읽어 이해나 답변에 필요한 도움 하나를 스스로 판단해 표시합니다. 단어·질문 선택과 상·중·하 설정은 없습니다. 개인의 경험·회사 수치·약속은 지어내지 않도록 지시합니다. 답변을 외부로 보내거나 대신 발화하지 않습니다.

- 자막: 2초 음성 구간을 연속 인식. 실제 표시 지연은 2초 수집 외에 인식·대기열·전송 시간이 더해집니다. 단어 단위 즉시 스트리밍을 보장하지 않습니다.
- 도움: 최근 대화 최대 500자. AI가 용어, 답변 힌트 또는 도움 불필요를 판단합니다. 도움이 없으면 아무것도 표시하지 않습니다.
- 최소 10초 간격, 새 문맥이 있을 때만 판단. 음성 대기열이 있으면 판단을 미룹니다. 한 번에 한 AI 작업, 같은 종류·주제는 10분간 중복 표시 방지.
- 도움 생성 중에도 수음은 유지. 도움은 자막 아래 별도 영역에 표시하며 2분 후 자막 화면에서 숨깁니다. 호스트 중단·연결 끊김·처리 속도 부족 때는 중단·안내합니다.
- 고정 사전은 AI가 고른 용어의 정확한 정의를 보완합니다. 자동 판단 자체는 로컬 Gemma가 수행합니다.

## 설치

이번 연결된 SM-S936N에는 보조 APK 0.3.0을 업데이트했습니다. 기존 Gemma 모델과 연결 키를 보존했습니다.

1. 다른 기기에서는 MemoConversationAssist-0.3.0.apk 설치. 기존 앱이 있으면 업데이트 설치하고 삭제하지 마세요.
2. Studio에서 폰 플러그인을 MemoConversationAssist-0.3.0.mmpkg로 교체, 종료 후 재시작. 기존 글라스 GMP와 인접 manifest.json 그대로 사용.
3. 보조 앱 서비스 시작 → 폰 플러그인 연결 확인 → 듣기 시작. 기존 연결 키를 유지합니다.
4. 안경 한 번: 페이지 / 두 번: 자막·이미 생성된 도움 전환 / 길게: 듣기 시작·정지. 도움을 받기 위해 선택하거나 누를 필요가 없습니다.

이 폴더는 개발 산출물이며 공식 MemoMind 설치 ZIP이 아닙니다. Studio에서 페어를 구성해 공식 QR/ZIP을 생성하세요.

## 실제 검증

- Whisper base Q5_1, 새 greedy JNI의 실제 휴대폰 모델 로딩 및 /prepare 200 확인. 모델 59,707,625 bytes, 공식 LFS SHA256 422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898.
- 기존 Gemma 4 E2B GPU 모델로 자동 판단 성공. 고정 카메라/HDR 예문은 term/HDR 도움, 손떨림 보정 질문은 두 방식 차이 도움, 점심 인사 예문은 none으로 표시 생략.
- 이번 단일 시험: 첫 HDR 판단 6.061초(모델 로딩 포함), 다음 질문 예문 1.644초, 인사 생략 판단 0.878초. 일반 성능 보장이 아니며 실제 대화 흐름의 시간과 다릅니다.
- 논리·CSP·연속 음성 프레임·UI 바인딩·자동 판단 요청 제한 테스트 9개 통과. APK·MMPKG 빌드 성공.
- 실제 안경 마이크의 말소리 → 연속 자막 속도·정확도와 안경 버튼/표시는 아직 미검증입니다. API/모델 시험이 전체 연동을 검증한 것은 아닙니다.

## 자원과 품질

한국어 Whisper base를 2초 구간으로 인식하므로 경계에서 단어가 잘리거나 오인식될 수 있습니다. 작은 모델과 greedy 탐색은 속도 우선이며 이전 small 모델과 정확도가 다를 수 있습니다. 새 AI 도움은 판단 주기와 생성 시간만큼 늦을 수 있고, AI가 필요성을 잘못 판단하거나 내용을 틀릴 수 있습니다.

AI 모델은 첫 사용 후 메모리에 유지되어 다시 로드하는 시간을 줄입니다. 배터리·발열·메모리 부담이 없어지는 것은 아닙니다. 자동 도움을 끄거나 보조 앱 서비스를 중지할 수 있습니다. 화면 꺼짐·백그라운드 수음 지속은 MemoMind 호스트 정책에 영향을 받습니다.

음성 원본은 파일로 저장하지 않습니다. 대화 텍스트는 폰 플러그인에 최근 500개 발언을 저장하며 삭제할 수 있습니다. 외부 AI API나 인터넷 중계 서버는 사용하지 않습니다. 주변 사람에게 자막·기록 중임을 알리고 사용하세요.
'''
(out/'README.md').write_text(doc,encoding='utf-8')
p=root/'CONVERSATION_ASSIST.md';s=p.read_text(encoding='utf-8')+'\n\n'+doc;p.write_text(s,encoding='utf-8')
print(json.dumps({p.name:p.stat().st_size for p in out.iterdir() if p.is_file()},ensure_ascii=False))
