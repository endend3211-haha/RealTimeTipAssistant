# MemoMind One 통합 메신저 — AI 인수인계
작성일: 2026-11-02 (Asia/Seoul)

## 1. 사용자 목표와 반드시 지킬 요구사항
Android 휴대폰의 카카오톡, Telegram, LINE 등 여러 메신저 알림을 MemoMind One 안경에서 구분해 읽고, 안경 마이크로 답장을 말하고, 변환된 텍스트를 안경에서 확인한 다음 명시적으로 전송한다.
- 초기 권한 설정 외 일상 사용은 휴대폰을 꺼내지 않고 안경에서 수행하는 것이 목표.
- MemoMind One의 물리 버튼은 하나다. 방향 버튼이 있다고 설명하면 안 된다.
- 머리 동작에 의존하지 않고 버튼 하나로 메시지 이동·본문 페이지·답장·취소·전송을 제공.
- 알림에 제공된 본문을 끝까지 페이지로 확인. 메신저 전체 대화 기록 조회와는 다름.
- 앱 이름과 작은 앱 구분 아이콘/배지로 메시지를 구분.
- 화면은 심플하고 세련되게. 버튼·안내 문구 겹침 금지.
- 뮤즈AI 기본 대상 및 사용자 패키지 입력란 제거. 카카오톡/Telegram/LINE 중심.
- MemoMind One만 자동 감지. 매번 기기 선택/연결 버튼을 누르게 하지 않기.
- 연결 코드를 매번 복사·입력하지 않게 하기.
- APK에 큰 Whisper 모델을 넣지 않고 Android 기본 음성인식 활용.
- 인식 결과를 사용자 승인 없이 자동 발송하지 않기.

## 2. 현재 최신 버전 (혼동 주의)
- Android: MemoMessengerCompanion 1.6.3, versionCode 11.
- Android package: com.memomind.companion.
- Studio Phone 표시 이름: Memo One Messenger 1.6.3.
- Phone ID: com.memomind.companion.phone.
- Studio Glass 표시 이름: Memo Messenger Glass 7.
- Glass ID: com.memomind.companion.messenger-glass, manifest version 7.
- 카드 wire protocol: 6. gm.memo-messenger-card protocol version 6.0.
- Android 1.6.3은 연결된 휴대폰에 adb install -r로 설치 완료하고 설치 버전 확인.
- 실제 최신 Glass 7/Phone 1.6.3이 안경에서 동작하는지는 아직 확인하지 못함.
- 이전 Messenger Glass Reply / messenger_glass_reply 예제는 별도 경로다. 최신 대상으로 착각하지 말 것.

## 3. 실제 프로젝트 위치
기존 작업을 HI에서만 찾아 소스가 없다고 잘못 판단했지만, Documents/Codex 아래에 독립 Android 앱이 있었음. 이후 사용자 요청으로 프로젝트 전체를 이동 완료.

현재 보조 앱 프로젝트 루트:
C:\Users\MCNEX\Desktop\HI\MemoMessengerCompanion
Android 소스:
C:\Users\MCNEX\Desktop\HI\MemoMessengerCompanion\work\android
배포 파일:
C:\Users\MCNEX\Desktop\HI\MemoMessengerCompanion\outputs
최신 APK:
C:\Users\MCNEX\Desktop\HI\MemoMessengerCompanion\outputs\MemoMessengerCompanion-1.6.3-debug.apk
최신 소스 ZIP:
C:\Users\MCNEX\Desktop\HI\MemoMessengerCompanion\outputs\MemoMessengerCompanion-1.6.3-source.zip
최신 플러그인 폴더:
C:\Users\MCNEX\Desktop\HI\MemoMessengerCompanion\outputs\MemoMessenger-1.6.3-plugins
  memo-messenger-companion-1.6.3.mmpkg
  messenger_companion_glass.gmp
  messenger_companion_glass.review.json
  messenger_companion_glass.review-source.enc
안내:
C:\Users\MCNEX\Desktop\HI\MemoMessengerCompanion\outputs\사용안내-1.6.3.md
검증 JSON:
C:\Users\MCNEX\Desktop\HI\MemoMessengerCompanion\outputs\Android-1.6.3-validation.json

SDK 루트:
C:\Users\MCNEX\Desktop\HI\plugin-open-platform-main
최신 Phone 원본 (이 경로를 기준으로 편집하고 복사본 동기화에 주의):
PhoneSDK/examples/memo-messenger-companion
최신 Glass 원본:
GlassSDK/examples/messenger_companion_glass
Android 프로젝트 측 복사본:
MemoMessengerCompanion/work/phone-system
MemoMessengerCompanion/work/companion-glass
소스 동기화에 주의. work/phone와 SDK messenger-glass-reply는 예전 Host 통합 예제다.

이동 전 경로 (현재는 이동되어 없어졌음):
C:\Users\MCNEX\Documents\Codex\2026-10-29\c-users-mcnex-desktop-hi-plugin

## 4. 현재 구현 구조
Android CompanionService:
- NotificationListenerService(MessengerListener)에서 알림 수집.
- MessageInbox: 서비스 메모리에 최대 300건, 대화/알림 식별자로 답장 대상 구분.
- 알림의 원래 Notification.Action / RemoteInput / PendingIntent로 답장.
- 메신저 서버 API/Bot API/TDLib를 사용하지 않음.
- 직접 Bluetooth SPP GlassesLink로 채널 20051 메시지를 안경 GMP에 전달하고 버튼 명령 수신.
- PhoneRelay는 127.0.0.1:18769에만 바인딩하는 인증된 로컬 HTTP 서버.
- Phone Web은 이 로컬 서버의 /state와 /action을 사용해 목록·본문·답장을 제어하는 보조 화면.

중요: 로컬 중계 서버를 추가했다고 Bluetooth 충돌을 해결한 것은 아니다.
현재 Android 앱이 여전히 별도 SPP 명령/음성 소켓을 연다. 공식 MemoMind 앱의 기존 소켓을 공유하지 않는다.
공식 앱의 GMP 설치/시작과 직접 SPP 연결이 경쟁할 가능성이 남아 있다. 공식 앱 연결과의 공존은 미검증이다.

## 5. 음성인식 변경
예전 1.4.x~1.5.0:
- 안경 Opus를 디코딩하고 whisper.cpp + Whisper small Q5_1 모델로 휴대폰 CPU 인식.
- APK 약 193MB. 모델이 APK에 포함되어 있었음.

현재 1.6.3:
- 안경 Opus → Android MediaCodec → mono PCM16 / 16kHz → AndroidSpeechEngine → 기본 SpeechRecognizer.
- RecognizerIntent.EXTRA_AUDIO_SOURCE에 ParcelFileDescriptor 파이프로 안경 PCM 전달.
- 언어 ko-KR, EXTRA_PREFER_OFFLINE=true 요청.
- 이 옵션은 오프라인 보장이 아니다. 기본 음성인식 제공자가 네트워크를 사용할 수 있다.
- Android 13 이상을 외부 오디오 입력 조건으로 검사.
- 휴대폰 마이크를 직접 여는 AudioRecord 코드는 없음. 인식 서비스가 요구해 RECORD_AUDIO 권한은 추가함.
- 기본 서비스: com.google.android.tts/com.google.android.apps.speech.tts.googletts.service.GoogleTTSRecognitionService (기기 조회 결과).
- checkRecognitionSupport는 오류 14 반환: 지원 정보 조회가 안 되는 것이며, 인식 불가능을 확정하는 결과는 아님.
- 처음 무음 PCM 시험은 권한 오류 9. RECORD_AUDIO 권한 적용 후 무음 입력은 NO_MATCH 오류 7 반환.
- 실제 안경의 사용자 한국어 발화가 정확히 인식되는지는 아직 미검증. 무음 시험을 음성인식 성공으로 설명하면 안 됨.
- Whisper 모델·네이티브 라이브러리를 현재 APK에서 제외. 현재 APK 147,055바이트 (약 147KB).
- 이전 Whisper 자료는 예전 프로젝트/버전 출력에 보관. 삭제하지 않음.
- 현재 assets 소스는 app/src/system/assets. 예전 app/src/main/assets의 모델이 실수로 다시 패키징되지 않도록 주의.

## 6. 새 단일 버튼 조작 (Glass 7 기준)
목록:
- 한번: 다음 메시지
- 두번: 현재 메시지 열기
- 길게: 이전 메시지
본문:
- 한번: 답장 / 다른 메시지 / 목록 선택 이동
- 두번: 선택 실행
- 길게: 다음 본문 페이지 (마지막에서 처음으로 순환)
녹음:
- 한번 또는 두번: 녹음 완료
- 길게: 취소
답장 확인:
- 한번: 전송 / 다시 녹음 / 취소 선택 이동
- 두번: 선택 실행
- 길게: 다음 답장 페이지
- 전체 답장 페이지가 전달되기 전에는 전송 차단.
VERY_LONG은 취소로 처리하지만 하드웨어/OS가 이 이벤트를 전달하는지는 추가 확인 필요.
머리 동작 입력 경로는 소스에 남아 있지만 필수 조작은 버튼 하나로 제공하도록 변경.
기존 Glass 5/6과 조작법이 다르다. 최신 APK/Glass를 맞춰야 한다.

## 7. 연결 코드 편의성 변경 (신규, 실기기 E2E 미검증)
- 이전에는 연결 코드를 복사해 Phone Web에 붙여넣었음.
- 현재 Phone Web이 /pair/request로 자동 요청.
- Android 앱 알림 또는 앱 상단 버튼에서 '연결 허용'을 최초 한 번 누름.
- 짧은 수명의 requestId + origin에 대해 사용자가 허용한 뒤에만 /pair/result가 토큰 반환.
- PairingWindow: 120초 만료, 잘못된 ID/다른 origin/승인 전에는 인증 불가.
- Phone은 gm.storage에 토큰 저장, 이후 자동 연결.
- 고급 설정의 수동 코드 입력은 대체 경로로 유지.
- 실제 기기에서 사용자가 알림을 허용한 후 새 Phone 플러그인까지 자동 연결되는 전 과정은 아직 미검증.
- 임의 웹페이지에 인증키를 무조건 공개하는 구현으로 바꾸지 말 것.

## 8. 사용자에게 발생했던 실제 오류와 수정
A. '안경 연결 안내 전달 실패'
실제 기기 로그에서 Bluetooth heartbeat 성공 후 INT8 7을 확인.
- 플러그인 INT8 7 = GM_PLUGIN_ESTATE (실행 상태 오류).
- 시스템 STATUS 7 = Busy. 둘은 다른 오류 체계.
- GmWire.requireApplicationOk에서 종류를 구분하도록 수정.
- 플러그인 미실행 시 안내를 재시도하도록 변경.
- 올바른 수신 GMP를 공식 앱에서 실행해야 함.

B. 공식 앱 start.failed / cleanup.failed
사용자 screenshot의 원문:
GmPluginInstallException(TimeoutException ... GM plugin logical send timed out)
elapsedMs 약 28848.
- GMP 설치/시작 명령의 응답 시간 초과가 최초 오류.
- cleanup.failed / StateError는 후속 정리 오류.
- 보조 APK의 별도 SPP 연결과 공식 앱 설치/시작이 경쟁할 가능성은 의심되나 확정하지 못함.
- 비교 방법: 보조 APK 자동 연결을 끈 상태에서 공식 앱으로 플러그인 설치/실행, 이후 보조 앱 연결.
- 자동 연결 타이밍/공식 경로 이용 구조를 추가로 검토해야 함.

C. 안경에 '보조 APK 연결 완료 / 메시지 32건 · 목록 불러오는 중'만 표시되고 모든 버튼 무반응
코드에서 확인한 상태 경쟁:
- showConnected가 안내 ACK를 기다리는 동안 알림 동기화가 displayId를 변경.
- ACK callback이 id!=displayId라는 이유로 연결 성공 자체를 무시.
- pluginReady=false가 유지되어 실제 목록 card 전송 차단.
- 안경 입력도 기존 화면 ID라 오래된 명령으로 거부됨.
수정(1.6.2부터):
- 연결 확인은 연결 generation으로만 판정하고 메시지 선택 ID와 분리.
- 성공 후 현재 목록 재전송.
- 준비 전 select/refresh 요청은 목록 복구에 허용하되 실제 답장 전송의 ID 검증은 유지.
아직 수정 후 실제 안경의 32건 목록/버튼 성공을 검증하지 못함.

D. 하단 텍스트/버튼 겹침
사용자 Studio screenshot에 동작 안내와 세 버튼이 겹쳤음.
- 기본 root padding과 상대 정렬이 섞여 있었고, 대기 화면에 예전 안내가 남았음.
수정(Glass 7):
- root와 label의 기본 padding 명시적으로 0.
- 본문/한 줄 hint/하단 action 영역을 별도 절대 좌표로 분리.
- 대기 화면에서는 action 문구와 배경 숨김.
- 조작 안내를 한 버튼 기준으로 교체.
아직 실제 Studio 렌더링을 다시 직접 확인하지 못함. 수정됐다고 단정하면 안 됨.

## 9. 핵심 소스 파일
Android app/src/main/java/com/memomind/companion/:
- MainActivity.java: 폰 UI, 권한, 자동 연결 스위치, 최초 연결 허용 버튼.
- CompanionService.java: 메시지/읽기/답장 상태, GM 명령, pluginReady, Phone API.
- MessengerListener.java: Kakao/Telegram/LINE 알림 추출 및 RemoteInput.
- GlassesLink.java: 직접 SPP 연결/수신/명령 직렬화/heartbeat.
- GmWire.java: GM TLV/프레임, v6 readerCard, 오류 구분.
- MemoOnePolicy.java / MemoOneAutoConnection.java: MemoMind One 이름 필터, 기존 연결 감지/재시도.
- OfflineVoice.java: 안경 Opus 수신/디코딩 (이름은 남아 있지만 AndroidSpeechEngine 사용).
- AndroidSpeechEngine.java / SpeechPcm.java / Pcm16k.java.
- PhoneRelay.java / PairingWindow.java.
- MessageInbox.java / MessagePages.java / ReplyScreenCycle.java.

안경 모델 제한은 광고 이름을 정규화해 memomindone과 일치하는지 확인하는 방식이다. 암호학적 모델 인증은 아니다.

카드 v6 payload:
byte0=6, byte1=flags, byte2..65=task ID, byte66=app code(K=1/T=2/L=3), byte67=view, byte68=focus, byte69 reserved.
byte70.. = title + U+001F + body + U+001F + action labels separated by '|'.
안경→폰 명령은 v2, 길이 66, 채널 20051.

## 10. 빌드/검증 명령
PowerShell:
& 'C:\Users\MCNEX\Desktop\HI\gradle-8.9\bin\gradle.bat' -p 'C:\Users\MCNEX\Desktop\HI\MemoMessengerCompanion\work\android' :app:assembleDebug :app:testDebugUnitTest :app:lintDebug --offline

SDK root에서:
& 'C:\Users\MCNEX\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' GlassSDK/build.py build --example messenger_companion_glass
node PhoneSDK/tools/build-mmpkg.mjs PhoneSDK/examples/memo-messenger-companion PhoneSDK/dist/memo-messenger-companion-1.6.3.mmpkg
node --test PhoneSDK/tools/test/memo-messenger-autopair.test.mjs

배포 스크립트:
C:\Users\MCNEX\Desktop\HI\MemoMessengerCompanion\work\package_system.py
현재 version=1.6.3, 모델 없는 APK/소스 ZIP/플러그인 폴더/검증 JSON 생성.
예전 package_android.py는 Whisper를 전제로 하므로 현재 경량 버전 배포에 쓰지 말 것.

JDK17 / SDK35 / Gradle8.9 / AGP8.7.3. 이전 Whisper NDK 자료는 보관되어 있으나 현재 빌드에는 externalNativeBuild 없음.
최신 검사: Android 단위 테스트 44개 통과, lint 오류 0. Phone 자동 연결 흐름 Node 테스트 1개 통과.
이전 기기 테스트: 가짜 메시지 목록/읽기/페이지/이전 대상 전송 차단/읽기 전용 보호 통과. 최신 Glass 7의 물리 버튼 실험을 뜻하지는 않음.
실기기 로컬 서버: 무인증 401, 인증 200, 가짜 메시지 3건 조회 확인 (자동 페어링 추가 전).
실제 다른 사람에게 메시지를 보내는 시험은 수행하지 않음.

## 11. 기기 및 Studio 제약
휴대폰: Samsung Galaxy SM-S936N, adb serial R3CY10PW8KD.
사용자가 요청해 최신 APK까지 설치했음. 다음 작업 시작 시 adb devices -l로 현재 연결 확인. 연결 없으면 adb -s ... logcat 명령이 대기하므로 먼저 확인할 것.
Studio:
C:\Users\MCNEX\Desktop\HI\plugin-open-platform-main\Studio\windows\gm-plugin-studio-desktop.exe
사용자가 Studio에서 확인해 달라고 여러 번 요청함.
Windows computer-use/node_repl은 시작 시 다음 오류로 반복 종료:
CreateProcessSecurityEnvironment failed (HRESULT = 0x8007000F).
따라서 AI는 실제 Studio UI를 클릭하거나 최신 렌더링을 검증하지 못했음. 빌드 성공을 Studio 화면 검증이라고 표현하면 안 됨.
해당 환경에서 Windows UI 자동화 시 computer-use 스킬 지침을 따를 것. 실패했다고 임의 PowerShell UI automation 우회 금지.
사용자가 직접 Studio에서 파일을 가져와 screenshot을 제공했음.
GMP와 review sidecars를 함께 유지하고, 최종 설치 ZIP/QR은 공식 Studio로 생성. 임의 조립 ZIP을 공식 설치 패키지라고 부르지 말 것.

## 12. 다음 AI의 우선 작업
1. 최신 Android 1.6.3 / Phone 1.6.3 / Glass 7 조합이 실제 선택·설치되어 있는지 먼저 확인.
2. 실제 Studio 화면에서 겹침 수정 여부 확인. Windows 제어가 계속 실패하면 사용자 screenshot을 근거로만 평가.
3. 실제 안경 목록→본문→페이지→메뉴→녹음→문장 확인→명시 전송을 버튼 하나로 시험. 이 단계가 아직 완성 검증되지 않았음.
4. 목록 정지 문제 수정 후 상태 로그/버튼 명령이 정상인지 확인. displayId와 연결 readiness를 다시 섞지 말 것.
5. 공식 MemoMind 앱과 직접 SPP 앱의 공존/설치 timeout을 재현·분리. 필요하면 공식 Web SDK 메시징 경로로 실제 표시/버튼 전달을 옮기는 구조 검토. 현재 PhoneRelay는 UI 제어용이지 기존 소켓 충돌 해결책이 아님.
6. 실제 안경 PCM으로 Android 기본 한국어 인식 및 잠금/백그라운드 동작 검증. 무음 NO_MATCH 시험만으로 완료 선언 금지.
7. 최초 연결 허용 알림→토큰 저장→앱 재진입 자동 연결 E2E 확인.
8. 사용자에게 반복적인 수동 설정/코드 복사/버전 혼동을 요구하지 않게 UX 개선. 단, 사용자 확인 없는 자동 메시지 발송은 금지.

사용자는 반복된 '완료' 설명 후 실제 미동작, 겹침, 방향 버튼이 없는 하드웨어에 잘못된 조작 안내가 나온 점에 불만이 있음. 구현/빌드/실제 검증을 명확히 구분하고, 추가 설명보다 재현 가능한 동작 확인을 우선할 것.
