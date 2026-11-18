from pathlib import Path
import shutil,zipfile,json
root=Path.cwd();out=root/'dist/memo-conversation-assist-0.4.0';out.mkdir(exist_ok=True)
shutil.copyfile(root/'integrations/conversation-assist/android/build/outputs/apk/debug/MemoConversationAssist-debug.apk',out/'MemoConversationAssist-0.4.0.apk')
shutil.copyfile(root/'dist/MemoConversationAssist-0.4.0.mmpkg',out/'MemoConversationAssist-0.4.0.mmpkg')
old=root/'dist/memo-conversation-assist-0.3.0'
for p in old.iterdir():
 if p.is_file() and (p.name.startswith('conversation_assist_glass.') or p.name=='manifest.json'):shutil.copyfile(p,out/p.name)
shutil.copytree(old/'licenses',out/'licenses',dirs_exist_ok=True)
with zipfile.ZipFile(out/'MemoConversationAssist-0.4.0.apk') as z:
 names=z.namelist();assert not any('ggml-' in n for n in names);assert not any('probe.pcm' in n for n in names);assert not any('libmemo-whisper' in n for n in names)
doc='''# Memo 지속 한국어 자막·자동 도움 0.4.0

## 중요한 변경

**Whisper의 짧은 구간 반복 인식을 기본 경로에서 제거했습니다.** 자막은 Android 기기 내 한국어 인식기, 문맥·전문 용어·질문 도움은 로컬 Gemma가 각각 처리합니다.

- 안경 녹음 세션 유지 → 상태가 유지되는 Opus 디코더 → 연속 16kHz PCM 파이프 → Android 기기 내 한국어 인식.
- 발화 중 partial result를 같은 자막에 덮어 갱신. 문장 확정 결과만 대화 기록에 추가. 재전송·순서 역전으로 자막이 되돌아가거나 같은 문장이 중복 기록되지 않도록 처리.
- 약 200ms 오디오 묶음은 **전송 단위**입니다. 녹음·디코더·인식 문맥을 200ms마다 초기화하지 않습니다. 녹음을 멈춰 자막을 만드는 방식이 아닙니다.
- 자동 도움은 기존처럼 Gemma가 판단하며 단어/질문 선택이나 상·중·하 설정은 없음. 최근 문맥 최대 500자, 최소 10초 간격, 음성이 밀리면 판단을 미룹니다.
- 자막을 LLM 답변으로 재작성하지 않습니다. AI가 느려져도 그 결과를 기다려 자막을 표시하지 않습니다.

## 사용 환경과 권한

Android 13 이상, 기기 내 한국어 인식과 외부 PCM 입력을 지원하는 단말용입니다. SM-S936N / Android 17에서 on-device 지원 및 설치된 ko-KR 모델을 확인했습니다. 모든 Android 기기에서 동일하게 지원된다는 뜻은 아닙니다.

RECORD_AUDIO 및 전경 음성 서비스 권한이 필요합니다. 안경에서 전달받은 오디오를 EXTRA_AUDIO_SOURCE 파이프로 내장 인식기에 전달합니다. 앱은 휴대폰 마이크를 별도로 열지 않으며, 일반/클라우드 인식기로 자동 대체하지 않습니다. 지원되지 않으면 오류로 표시합니다.

## 업데이트 순서

1. MemoConversationAssist-0.4.0.apk를 기존 앱 위에 업데이트 설치. 앱을 삭제하지 마세요. 기존 Gemma와 연결 키는 보존합니다.
2. 보조 앱을 열고 음성 권한을 허용한 뒤 대화 서비스 시작. 처음 권한을 허용했다면 서비스 시작을 다시 누르세요.
3. Studio에서 폰 플러그인을 MemoConversationAssist-0.4.0.mmpkg로 업데이트하고 종료·재시작.
4. 기존 글라스 GMP/manifest.json은 그대로 사용. 폰 플러그인 연결 확인 → 듣기 시작.

자막과 도움은 분리해 표시합니다. 한 번: 페이지 / 두 번: 생성된 도움·자막 전환 / 길게: 듣기 시작·정지. 도움을 요청하기 위해 버튼을 누를 필요는 없습니다.

## 실제 검증과 한계

- 기기 내 한국어 모델 ko-KR 설치 확인.
- 고정 한국어 PCM을 실제 속도로 전달: 첫 중간 자막 약 610ms, 문장 중간 결과가 지속 갱신되고 확정 결과 반환.
- Opus 인코더 → 새 상태 유지 Opus 디코더 → 내장 한국어 인식 경로: 첫 중간 자막 약 622ms, 약 13.6초 음성에서 중간 자막 38회 갱신, 반복한 세 문장 각각 확정. 단일 시험 결과이며 일반 지연 보장이 아닙니다.
- 2분 이상 여러 한국어 문장과 로컬 AI를 동시에 실행하는 시험을 시작했으나 USB가 끊겨 최종 결과는 아직 미확인. AI 고정 도움 생성은 시험 중 6589ms로 완료된 파일을 확인했습니다.
- 중간 자막·확정 문장 합치기, 프레임 연속성, 중복 방지, CSP, 자동 도움 요청 제한, UI 바인딩 등 Node 테스트 11개 통과. 최종 APK·MMPKG 빌드 및 미사용 Whisper 모델·시험 음성 미포함 확인.
- 위 숫자는 안경 Bluetooth와 화면 전송을 포함한 전체 지연이 아닙니다. 실제 안경 마이크의 잡음·거리·발음·전문 용어에 대한 정확도와 장시간 성능은 추가 확인해야 합니다. 한국어 정확도 100%나 모든 상황에서의 지연을 보장하지 않습니다.

## 지속 사용과 자원

사용자가 정지하지 않는 동안 녹음·인식 상태를 유지하도록 구성했습니다. 다만 MemoMind 호스트의 백그라운드 중단, Bluetooth 끊김, Android 인식 서비스 종료, 처리 지연 때는 안내 후 중지될 수 있습니다. 무한 지속을 보장하지 않습니다.

자막용 큰 Whisper 모델과 JNI를 새 APK에 포함하지 않아 앱 크기를 줄였습니다. Gemma는 도움말용으로만 사용하며 초기 로딩 후 메모리에 유지하므로 배터리·메모리 부담은 남습니다. 실제 사용자 대화 음성을 원본 파일로 저장하지 않습니다. 확정된 텍스트는 폰 플러그인에 최근 500개 발언 저장, 삭제 가능. 주변 사람에게 자막·기록 중임을 알리고 사용하세요.

## 개발 검증

일반 APK: Android 폴더에서 JDK21, gradlew.bat assembleDebug. 시험 코드·시험 음성을 포함하려면 -PincludeDeviceProbes 옵션을 추가합니다. 일반 APK에는 instrumentation 시험 컴포넌트와 PCM 시험 데이터가 포함되지 않습니다. streaming 폴더의 Sherpa 모델은 연구·비교용이며 현재 배포의 음성인식 엔진이 아닙니다.
'''
(out/'README.md').write_text(doc,encoding='utf-8');p=root/'CONVERSATION_ASSIST.md';p.write_text(p.read_text(encoding='utf-8')+'\n\n'+doc,encoding='utf-8')
p=root/'integrations/conversation-assist/.gitignore';p.write_text(p.read_text(encoding='utf-8')+'\n/streaming/\n',encoding='utf-8')
print(json.dumps({p.name:p.stat().st_size for p in out.iterdir() if p.is_file()},ensure_ascii=False))
