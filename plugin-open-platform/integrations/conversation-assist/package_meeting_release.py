from pathlib import Path
import shutil,json,zipfile
root=Path.cwd();out=root/'dist/memo-conversation-assist-0.5.0';out.mkdir(exist_ok=True)
shutil.copyfile(root/'integrations/conversation-assist/android/build/outputs/apk/debug/MemoConversationAssist-debug.apk',out/'MemoConversationAssist-0.5.0.apk')
shutil.copyfile(root/'dist/MemoConversationAssist-0.5.0.mmpkg',out/'MemoConversationAssist-0.5.0.mmpkg')
old=root/'dist/memo-conversation-assist-0.4.0'
for p in old.iterdir():
 if p.is_file() and (p.name.startswith('conversation_assist_glass.') or p.name=='manifest.json'):shutil.copyfile(p,out/p.name)
shutil.copytree(old/'licenses',out/'licenses',dirs_exist_ok=True)
doc='''# Memo 회의 0.5.0

## 이번 변경

### 회의 전체 원문 저장과 회의록

- 듣기 시작 시 APK에 회의별 저장을 시작합니다. 자막 확정 문장과 시간, 마지막 미확정 자막 체크포인트를 저장합니다. 음성 원본은 저장하지 않습니다.
- **회의 원문에는 500개 발언 제한이 없습니다.** 최근 화면 캐시와 별개로 앱 내부 파일에 계속 기록합니다. 1시간 이상 회의도 저장 공간이 허용하는 동안 보존합니다.
- 일시정지 후 다시 시작하면 같은 회의에 이어 저장합니다. ‘회의 완료 · 회의록 생성’을 누르면 그 회의를 종료하고 저장된 전체 텍스트로 로컬 회의록을 생성합니다.
- 긴 원문을 모두 구간별 분석하고 계층적으로 통합합니다. 종합 회의록과 구간별 상세 요약을 함께 보관합니다. 앞/뒤 500개 발언만 사용하는 방식이 아닙니다.
- 결정 사항·할 일·담당자·기한·확인 필요 사항을 정리하도록 지시하며, 언급되지 않은 내용은 추측하지 않도록 합니다. AI·음성인식 오류가 있을 수 있으니 원문을 확인하세요.
- 원문과 회의록을 별도로 볼 수 있고 각각 TXT로 내보낼 수 있습니다. 화면 미리보기는 20만 자까지이며 TXT 저장은 전체 파일을 복사합니다.
- 앱이 중단되면 원문을 복구하고, 완료하지 못한 회의록 생성은 다시 실행할 수 있도록 표시합니다. 회의록 생성은 길이에 따라 시간이 걸립니다.

### APK 화면과 아이콘

짙은 녹색·라임색의 새 아이콘과 화면. 메인에는 연결 상태와 날짜별 회의 카드만 표시하고, 모델·연결 키 설정은 설정 메뉴로 분리했습니다. 날짜 선택/전체 보기와 ‘자막 원문 / AI 회의록’ 탭을 제공합니다. 테스트용 회의는 일반 APK 시작 시 testFixture 표시를 확인하여 정리하며 실제 회의 기록은 지우지 않습니다.

### 자동 연결

기존에 저장된 연결 키는 실행 시 자동 재사용합니다. 최초 연결은 APK에서 ‘자동 연결 시작’을 누른 뒤 60초 안에 MemoMind 폰 플러그인을 실행하면 키를 받아 저장합니다. 이후에는 수동 입력이 필요하지 않습니다. 복구용 키 복사는 설정 메뉴에 남겨 두었습니다.

자동 교환은 127.0.0.1의 HTTP Origin과 지정 플러그인 헤더, 한 번만 사용하는 60초 연결 창으로 제한합니다. 인터넷 웹페이지에 무인증 키를 공개하지 않습니다. 같은 휴대폰의 신뢰할 수 있는 앱을 전제로 한 로컬 연결입니다. 창이 만료되면 APK에서 다시 자동 연결을 시작하세요. 실제 MemoMind 호스트에서 최초 자동 교환은 최종 기기 검증이 필요합니다.

### 글라스 화면

- 연결·청취 상태: 오른쪽 위.
- 최근 발언/도움 안내와 조작 안내: 이미지 요청대로 같은 맨 아래 줄에서 오른쪽으로 배치.
- 위쪽 상태 줄을 줄여 자막 8줄 표시. 긴 발언은 최신 자막을 따라갑니다.
- 새 도움말은 아래에서 올라오는 카드로 표시. 약 0.24초 등장 → 완전히 보이는 상태 5초 → 약 0.24초 후 사라짐. 자막·청취는 유지됩니다.
- 카드에는 짧은 미리보기, 폰에는 전체 도움을 보관합니다. 두 번 누르면 마지막 도움 전체를 볼 수 있습니다. 안경 무선 전송 속도에 따라 실제 애니메이션은 매끄러움·시점에 차이가 있을 수 있습니다.

## 업데이트

1. MemoConversationAssist-0.5.0.apk를 기존 앱 위에 업데이트 설치. 앱을 삭제하지 마세요. Gemma 모델·연결 키·사용자 회의는 유지합니다.
2. 앱에서 자동 연결 시작.
3. Studio에서 폰 플러그인을 MemoConversationAssist-0.5.0.mmpkg로 교체하고 종료·재시작.
4. 글라스 GMP·manifest.json은 기존 것과 동일합니다. 폰·글라스를 페어로 설치하는 경우 함께 제공한 파일을 사용하세요.
5. 듣기 시작 → 필요하면 일시정지/재개 → 회의 완료 · 회의록 생성. APK의 날짜별 목록에서 원문과 회의록을 각각 확인합니다.

이 폴더는 개발 산출물이며 공식 MemoMind 설치 ZIP이 아닙니다. Studio에서 페어를 구성해 공식 설치 QR/ZIP을 만드세요.

## 검증 결과

- Android 저장 테스트 5개 통과: 620개 발언으로 1시간 이상 분량의 저장·재열기, 500자 초과 원문 보존, 미확정 자막 복구, 중복 방지, 깨진 저널 꼬리 뒤 복구, 전체 문자 분석 구간 포함, 경로 제한, 자동 연결 창 제한.
- 폰 논리 테스트 12개 통과: 프레임 연속성, 중간 자막/확정 합치기, 요청 제한·중복 억제, UI 바인딩, 로컬 WebSocket CSP, 카드 등장·5초 유지·사라짐.
- 실제 휴대폰 Gemma로 고정 테스트 회의 원문을 저장하고 결정·담당자·기한이 포함된 회의록 생성 성공. 날짜별 두 회의 카드의 실제 APK 화면을 확인했습니다. 테스트 데이터이며 사용자의 실제 회의가 아닙니다.
- 그 후 출력 길이·화면·종료 복구를 보완했고 최종 빌드/테스트를 통과했으나, USB가 끊겨 최종 APK 재설치와 추가 화면 확인은 아직 못 했습니다.
- 기존 0.4의 지속 인식 경로 유지: 실제 휴대폰에서 약 121초 음성의 중간 자막 316회, 24문장 확정 확인. 0.5에서 실제 1시간 연속 녹음·회의록 생성 전체를 실시간으로 시험한 것은 아닙니다.
- 5초 카드 애니메이션·최종 오른쪽 배치는 코드/시간 테스트를 통과했으며 실제 글라스에서의 재확인이 필요합니다. APK의 TXT 내보내기 파일 선택 경로도 추가 기기 확인이 필요합니다.

## 환경과 데이터

Android 13 이상, 기기 내 한국어 및 외부 PCM 입력 지원 필요. 자막은 Android on-device 한국어 인식기, 문맥 도움·회의록은 별도의 로컬 Gemma GPU 엔진입니다. 외부 AI API·인터넷 중계 서버를 사용하지 않습니다. 큰 Whisper 모델은 APK에 포함하지 않습니다.

회의 자료는 앱 내부 저장소에 있습니다. 앱 삭제/데이터 초기화 시 사라질 수 있으니 중요한 회의는 TXT로 내보내세요. 앱 업데이트는 삭제 없이 설치하세요. 주변 사람에게 자막·기록 중임을 알리고 사용하세요. 백그라운드·화면 꺼짐·Bluetooth 정책에 따른 중단 가능성은 남아 있습니다.

## 소스와 빌드

Android: integrations/conversation-assist/android, JDK21에서 gradlew.bat assembleDebug / testDebugUnitTest. 기기 검증 컴포넌트는 -PincludeDeviceProbes일 때만 포함합니다.
Phone: PhoneSDK/examples/conversation-assist.
일반 APK에는 시험 음성·instrumentation 컴포넌트와 검증용 모델이 포함되지 않습니다. 자체 벡터 adaptive icon을 사용합니다.
'''
(out/'README.md').write_text(doc,encoding='utf-8')
p=root/'CONVERSATION_ASSIST.md';p.write_text(p.read_text(encoding='utf-8')+'\n\n'+doc,encoding='utf-8')
with zipfile.ZipFile(out/'MemoConversationAssist-0.5.0.apk') as z:
 assert not any('probe.pcm' in n or 'ggml-' in n for n in z.namelist())
print(json.dumps({p.name:p.stat().st_size for p in out.iterdir() if p.is_file()},ensure_ascii=False))
