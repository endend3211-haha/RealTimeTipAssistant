# 스마트 글라스 통합 메신저 — 구현 상태 (2026-11-02)

## 이번 결과
- 카카오톡, Telegram, LINE(jp.naver.line.android), 기존 Muse AI 알림 식별.
- 메모리 전용 최대 30개 수신함. 앱/발신자/본문 및 메시지·페이지 번호 표시.
- 방향/페이지 입력: 본문 페이지 이동, 본문 끝에서는 이전/다음 메시지. 답장 중에는 답장 페이지 이동.
- 주 버튼 한번: 답장 선택, 두번: 음성 시작/종료 요청, 길게: 전송, BACK: 취소.
- 새 알림이 다른 앱에서 와도 작성 중인 수신 대상을 바꾸지 않음.
- 선택된 알림이 교체/삭제되면 Android 어댑터가 초안을 무효화함.
- 긴 인식 문장은 안경에 페이지로 표시. 마지막 페이지까지 표시한 현재 문장만 전송 허용.
- 답장 최대 500자. 전송 텍스트를 바이트 제한으로 조용히 잘라 보내지 않음.
- 알림의 원래 자유 텍스트 RemoteInput/PendingIntent 사용. 메신저 서버 API는 사용하지 않음.
- 전송 결과는 '답장 요청 전달'이며 상대방 수신이나 서버 전송 완료를 보장하지 않음.

## 빌드 결과
- PhoneSDK/dist/messenger-glass-reply-1.1.0.mmpkg
- GlassSDK/build-host/.build/messenger_glass_reply/messenger_glass_reply.gmp
- 같은 디렉터리에 SDK가 생성한 messenger_glass_reply.review.json 및 .review-source.enc

Studio에서 Phone은 Messenger Glass Reply, Glass는 Messenger Glass Reply Glass를 선택합니다.
이 작업은 messenger_companion_glass 예제와 별개입니다. SDK 결과를 선택한 후 최종 ZIP/QR은 Studio로 생성하세요.

## 확인 방법
1. Studio 시뮬레이터에서 카카오톡, Telegram, LINE 알림을 연속 추가합니다.
2. 방향 입력 또는 테스트 화면 이전/다음 버튼으로 메시지를 탐색합니다.
3. 한번 누르기로 답장을 선택합니다. Studio의 답장 입력란은 실제 STT가 아닌 테스트 입력입니다.
4. 긴 한국어 문장을 입력하고 방향 입력으로 답장 페이지를 끝까지 확인합니다.
5. 길게 누르면 Studio 전송 시뮬레이션으로 표시됩니다. Android Host가 없을 때 실제 발송하지 않습니다.

## 실기기 연결에서 남은 필수 작업
현재 android-host/는 MemoMind Android 앱에 병합할 Kotlin 어댑터이며, 독립 설치 APK가 아닙니다.
이 저장소에는 해당 제품 Host 앱의 소스가 없고 GlassesOfflineSpeechRecognizer 구현도 없습니다.
따라서 실제 알림·안경 마이크·STT·전송이 연결된 완성 앱으로 배포할 수 없습니다.

필요한 외부 입력:
- MemoMind Android Host 앱 소스/개발 접근 또는 제조사가 제공하는 알림·답장 Bridge 확장.
- 제품의 안경 Opus 캡처→디코더→한국어 STT 엔진 연결. 현재 어댑터는 recognizer 미연결 시 명확히 실패함.
- Android 휴대폰 및 실제 안경에서 알림 접근 권한, 한국어 표시, 마이크 라우팅, 잠금/백그라운드 동작 검증.

독립 보조 APK 방식을 선택하려면 MemoMind WebView와의 인증된 통신 경로를 먼저 별도 검증해야 합니다.
공개 SDK에 알림 조회/답장 API가 없으므로 일반 Web 패키지 설치만으로 시스템 권한이 생기지 않습니다.
항상 켜진 수신이나 플러그인 종료 상태에서 자동 화면 표시도 아직 검증되지 않았습니다.

## 검증
Node 프로토콜/수신함/컨트롤러 테스트 16개 통과. 공식 SDK C 빌드 및 소스 검토 부속 파일 생성 성공.
Web MMPKG 생성 성공. Android Kotlin 컴파일, APK 설치, Studio GUI 및 실제 기기 시험은 수행하지 않음.

테스트 명령:
node --test PhoneSDK/tools/test/messenger-glass-reply.test.mjs PhoneSDK/tools/test/messenger-inbox.test.mjs PhoneSDK/tools/test/messenger-flow.test.mjs
