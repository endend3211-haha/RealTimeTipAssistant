from pathlib import Path
import shutil,json
root=Path.cwd();dist=root/'dist/memo-conversation-assist-0.1.0';dist.mkdir(parents=True,exist_ok=True)
assets={root/'integrations/conversation-assist/android/build/outputs/apk/debug/MemoConversationAssist-debug.apk':'MemoConversationAssist-0.1.0.apk',root/'dist/MemoConversationAssist-0.1.0.mmpkg':'MemoConversationAssist-0.1.0.mmpkg',root/'GlassSDK/examples/conversation_assist_glass/manifest.json':'manifest.json'}
for src,name in assets.items():shutil.copyfile(src,dist/name)
for src in (root/'GlassSDK/build-host/.build/conversation_assist_glass').glob('conversation_assist_glass.*'):
 if src.suffix in ['.gmp','.json','.enc']:shutil.copyfile(src,dist/src.name)
lic=dist/'licenses';lic.mkdir(exist_ok=True)
shutil.copyfile(Path('C:/Users/MCNEX/Desktop/HI/MemoMessengerCompanion/work/android/app/src/main/cpp/vendor/whisper.cpp-1.9.5/LICENSE'),lic/'whisper-MIT.txt')
(lic/'NOTICE.txt').write_text('LiteRT-LM 0.18.0: Apache-2.0, https://github.com/google-ai-edge/LiteRT-LM\nWhisper / whisper.cpp: MIT, https://github.com/ggml-org/whisper.cpp\nGemma is imported separately. Follow the model publisher license. No Gemma model is redistributed in this folder.\nDevelopment-signed APK. Includes a debug-only instrumentation smoke test.\n',encoding='utf-8')
doc='''# Memo 대화 도우미 0.1.0 — 단어 설명 프로토타입

## 현재 구성

안경 마이크 → 공식 MemoMind 앱/폰 플러그인 → 휴대폰 내부 127.0.0.1:18772 → 독립 APK의 Opus 디코더와 Whisper → 한국어 자막. 단어를 고르면 로컬 사전을 우선 사용하고, 사전에 없는 단어만 Gemma 4 E2B로 설명합니다. 외부 음성인식/AI API, 인터넷 중계 서버, 직접 블루투스 연결은 사용하지 않습니다. 상·중·하 선택 기능은 없습니다.

**듣기와 설명을 독립 처리합니다.** 설명을 요청해도 듣기를 의도적으로 멈추지 않습니다. 다만 백그라운드 정책, 처리 지연, 버퍼 초과 또는 연결 끊김으로 중단될 수 있습니다.

## 설치 파일

- MemoConversationAssist-0.1.0.apk: Android 12 이상 ARM64 개발 서명 앱. Whisper small Q5_1 한국어 인식 모델 포함, 약 213MB.
- MemoConversationAssist-0.1.0.mmpkg: MemoMind 폰 플러그인.
- conversation_assist_glass.gmp + 인접 manifest.json: 글라스 플러그인과 프로토콜 메타데이터. 리뷰 소스 파일도 함께 제공.
- 이 폴더는 개발 산출물입니다. 공식 MemoMind 설치 ZIP이 아닙니다. Studio에서 폰/글라스 페어를 구성하고 공식 설치 QR/ZIP을 생성하세요.

## 사용 순서

1. 보조 APK 설치 후 열기. 이번 연결된 휴대폰에는 테스트 앱 설치와 기존 Gemma 모델 가져오기를 완료했습니다.
2. 새 휴대폰에서는 **기존 Gemma 모델 가져오기**로 `.litertlm` 파일 선택. 앱 내부로 복사되므로 모델 크기만큼 여유 공간 필요.
3. **연결 키 복사** → **대화 서비스 시작**. 서비스 알림이 표시되며 앱에서 중지할 수 있습니다.
4. Studio로 폰·글라스 플러그인을 설치하고 폰 플러그인 연결 키에 한 번 붙여넣기 → **연결 확인**.
5. **문장 입력으로 AI 테스트**에 고정 문장을 입력해 후보 단어를 확인하거나, 설명할 단어를 직접 입력합니다.
6. 주변 사람에게 자막·기록 중임을 알리고 **듣기 시작**. 음성 원본은 저장하지 않습니다.

안경 자막 화면: **한 번** 선택 이동(단어/자막 다음), **두 번** 선택 실행. 설명 화면: **한 번** 다음 페이지, **두 번** 자막 복귀. **길게** 듣기 시작·정지.

안경 상단은 자막, 하단은 짧은 단어 설명으로 구분합니다. 오래된 도움말은 자막 화면에서 2분 후 숨깁니다. 설명 출처는 폰 화면에 사전/로컬 AI로 구분합니다.

## 자원 절감

- 등록 용어와 영문 약어를 규칙으로 추출합니다. 모든 한국어 전문 용어를 자동 탐지하는 범용 분류기는 아닙니다. 후보에 없으면 폰에서 직접 입력할 수 있습니다.
- HDR, OIS, EIS, MTF, SNR, ISP, API, SDK, LLM, NPU, GPU, EBITDA, 양자화는 사전에서 반환하며 AI 모델을 로드하지 않습니다.
- 미등록 단어의 AI 입력은 최근 문맥 최대 500자와 선택 단어로 제한. 최대 96 출력 토큰, 짧은 비추론 응답.
- 미등록 단어 자동 AI 요청은 최소 45초 간격, 한 번에 하나. 같은 단어는 10분간 자동 재설명하지 않습니다. 모델을 유지해 반복 로딩을 피하므로 첫 요청 후 메모리 사용은 계속될 수 있습니다. 서비스 중지 시 해제합니다.
- 음성은 6초 구간. 대기 큐 최대 두 구간이며 처리 속도가 따라가지 못하면 유실을 숨기지 않고 중단·표시합니다. 무음 구간은 디코딩 후 Whisper를 실행하지 않습니다.
- 대화 기록은 폰 플러그인 저장소에 최근 500개 발언(각 500자), 폰에 최근 30개 표시. 기록 삭제 제공. 임시 음성은 메모리에서만 처리합니다.

## 실제 휴대폰에서 확인한 내용

2026-11-03, SM-S936N, Android 17, RAM 약 12GB.

- 기존 파일 `/sdcard/Download/gemma-4-E2B-it.litertlm`, 2,588,147,712 bytes.
- 앱 내부 모델과 원본 SHA256 일치: `181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c`. 이는 복사 무결성 확인이며 제작사 공식 체크섬 검증은 아닙니다.
- LiteRT-LM 0.18.0 GPU 백엔드에서 한국어 설명 생성 성공.
- Whisper 모델 무결성 확인·JNI 로딩 성공. 테스트 중 Whisper와 Gemma 모델을 같은 프로세스에 로드했습니다.
- Bearer 키 없는 접근 401, 인증 후 상태 조회 정상.
- 6초 무음 Opus 디코딩 성공. AI 요청 중 무음 오디오 요청 200.
- 단일 측정: 사전 HDR 약 73ms. 미등록 CMOS 첫 요청 6.509초(로딩 4.364초 + 생성 2.133초), 모델 유지 후 같은 입력 1.188초(생성 1.168초). ADB 포워딩을 이용한 API 단위 측정이며 안경 마이크→화면 지연 측정이 아닙니다. 입력·발열·메모리에 따라 변합니다.
- Node 논리 테스트 4개 통과, 폰 패키지 및 글라스 GMP 빌드 통과.

## 아직 확인해야 할 부분

**실제 MemoMind 플러그인에서 localhost 통신, 안경 마이크의 실제 발화 인식, 글라스 표시·버튼, 지속 대화 시 자막 처리 속도와 발열은 미검증입니다.** ADB 포워딩 테스트는 MemoMind WebView의 로컬 통신 허용 여부를 증명하지 않습니다. Studio UI 테스트도 수행하지 않았습니다.

음성 구간 경계에서 단어가 잘릴 수 있으며, 멀리 있는 사람의 수음 품질·잡음에 영향을 받습니다. 초저지연 자막, 화자 구분, 번역, 화면 꺼짐 지속 수음을 보장하지 않습니다. AI 설명에는 오류가 있을 수 있으며 사전 설명은 개별 문맥을 추론하지 않습니다.

## 빌드 및 소스

- Android: `integrations/conversation-assist/android`에서 JDK 21을 사용해 `gradlew.bat assembleDebug`.
- Phone: `node PhoneSDK/tools/build-mmpkg.mjs PhoneSDK/examples/conversation-assist dist/MemoConversationAssist-0.1.0.mmpkg`.
- Glass: Python으로 `GlassSDK/build.py build --example conversation_assist_glass`.
- `.gitignore`로 모델·네이티브 라이브러리·빌드 캐시 제외. Android 소스 빌드에는 기존 Whisper 자산 190,085,487 bytes 및 ARM64 libmemo-whisper.so 필요. 새 Gemma 모델은 앱과 별도로 가져옵니다.
- `device_smoke.py`, `latency_benchmark.py`는 연결된 테스트 단말 전용. 토큰은 출력하지 않습니다. 테스트용 포워딩은 검증 후 제거합니다.
- `android/native`의 GGUF JNI는 초기 실험이며 현재 APK에 포함하지 않습니다. 현재 실행 엔진은 LiteRT-LM입니다.

## 라이선스

whisper.cpp/Whisper MIT, LiteRT-LM Apache-2.0 및 각 모델의 배포 조건을 따릅니다. Gemma 모델은 이 배포 폴더에 포함하지 않습니다. APK는 개발용 서명이며 별도 프로덕션 배포 서명과 동일하지 않습니다.
'''
(root/'CONVERSATION_ASSIST.md').write_text(doc,encoding='utf-8');(dist/'README.md').write_text(doc,encoding='utf-8')
# Remove only the obsolete builder created for this prototype; Gradle is the supported path.
p=root/'integrations/conversation-assist/android/build.py'
if p.is_file():p.unlink()
print(json.dumps([{ 'file':p.name,'bytes':p.stat().st_size} for p in dist.iterdir() if p.is_file()],ensure_ascii=False))
