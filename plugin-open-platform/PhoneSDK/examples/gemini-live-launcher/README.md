# Gemini Live Launcher 1.0.2 — 로컬 HTTP 수신기 버전

첨부 명세의 “실기 WebView 차단 오류 해결판” 중 해결책 A를 구현했습니다.
이 버전은 외부 intent/deep-link 이동을 제거하고 같은 휴대폰의
http://127.0.0.1:8765 수신기로 인증된 HTTP 요청만 보냅니다.
.mmpkg와 별도 Android 수신기 APK가 모두 필요합니다.

## 설치 순서
1. Android 휴대폰에 gemini-loopback-bridge-1.0.1.apk를 설치합니다.
   개발 서명 APK이며 스토어 배포본이 아닙니다.
2. Gemini Loopback Bridge 앱을 열고 알림을 허용한 뒤 “수신 시작”을 누릅니다.
   상단 알림에 “수신 중 · 127.0.0.1:8765”가 표시되어야 합니다.
3. 수신기 앱에서 “연결 코드 복사”를 누릅니다.
4. MemoMind Studio에서 아래 Phone/Glasses 쌍을 선택해 설치합니다.
5. 휴대폰에서 플러그인을 열어 연결 코드를 붙여넣고 “수신기 연결 확인”을 누릅니다.
6. “수신기 연결됨”을 확인한 뒤 단일 클릭, 끄덕임, 화면 호출 버튼을 사용합니다.
7. 수신기가 백그라운드라면 “Gemini 열기” 알림을 누릅니다.
   분할 화면으로 수신기 앱이 보이는 경우에는 직접 실행을 요청합니다.
8. 필요하면 Gemini에서 Live 버튼을 눌러 대화를 시작합니다.

Google/Gemini를 기본 디지털 어시스턴트로 설정하고 안경의 블루투스
통화 오디오 연결을 확인하세요. 수신기 앱의 화면 실행 테스트로도
어시스턴트의 실행 가능 여부를 확인할 수 있습니다.

## Studio 선택
| 항목 | 이름 / ID | 파일 |
| --- | --- | --- |
| Phone | Gemini Live Launcher / com.example.gemini-live-launcher | PhoneSDK/dist/com.example.gemini-live-launcher-1.0.2.mmpkg |
| Glasses | GM 웹 브리지 / com.gm.example.web-bridge | GlassSDK/build-host/.build/web_bridge/web_bridge.gmp |
| 프로토콜 | gm.scene 1.0 / gm.device-events 1.0 | 공식 web_bridge 사용 |

배포 ZIP은 파일 전달용 묶음입니다. 먼저 압축을 푼 다음 Studio의 Import package로
.mmpkg와 .gmp를 각각 불러오세요. 수신기 APK는 Studio가 아니라 Android에 설치합니다.
GMP와 .review.json, .review-source.enc 세 파일을 함께 유지하세요.

## 1.0.0에서 바뀐 점
- 외부 앱 스킴 이동 및 대체 Intent 버튼 제거.
- 현재 Bridge 2.0 형식의 network 권한 추가 (문서의 문자열 권한은 사용하지 않음).
- 단일 클릭과 활성 NOD만 허용. 실제 구독 이름은 imuGesture.
- 2.5초 HTTP 타임아웃, 요청 취소, 상태/JSON 응답 검증.
- 연결 실패나 수신 성공을 Gemini가 “듣는 중”이라고 표시하지 않음.
- 별도 Android 수신기 APK와 소스/재빌드 스크립트 포함.

## 명세에서 보완한 부분
명세의 단순 Service 코드를 그대로 사용하지 않았습니다.
Android 서비스 수명주기에 맞춰 사용자가 시작하는 foreground service를 사용하며,
백그라운드에서 강제로 화면을 열었다고 성공 처리하지 않습니다.
수신기가 보이는 경우에만 직접 실행하고, 그 외에는 사용자가 누르는 알림을 제공합니다.
알림이 금지되어 있거나 대상 앱을 찾을 수 없으면 HTTP 409를 반환합니다.
앱 실행 요청은 실제 Live 대화 시작 확인이 아닙니다.

서버는 127.0.0.1에만 바인딩됩니다. 임의 웹페이지가 호출하지 못하도록 기기별
32자리 난수 연결 코드가 필요합니다. 상태 확인은 GET /health,
호출은 POST /launch-gemini, 인증 헤더는 X-Gemini-Token입니다.
OPTIONS 사전 요청은 실행을 유발하지 않습니다.
클라우드 요청, API 키, 별도 마이크 녹음, BLE 직접 연결은 사용하지 않습니다.
연결 코드는 플러그인 페이지가 닫히면 지워지며 매번 붙여넣어야 합니다.

## 실제 기기에서 확인할 제한
network 권한은 MemoMind의 HTTP/cleartext, CSP, 혼합 콘텐츠, 로컬 네트워크 정책을
자동으로 변경하지 않습니다. 로컬 HTTP가 차단되면 이 방식도 연결되지 않습니다.
수신기에서 usesCleartextTraffic을 바꿔도 MemoMind 앱의 정책은 바뀌지 않습니다.
연결 실패 시 수신 시작/연결 코드/포트 중복/호스트 네트워크 정책을 확인하세요.
1초 미만의 지연, 팝업 완전 해결, 즉시 Live 실행은 실기기 검증 없이 보장하지 않습니다.
동일 폰 수신기 설치는 추가 APK이므로 기존의 “추가 앱 설치 없음” 조건과는 다릅니다.
삼성 루틴/푸시 웹훅은 구현하지 않았고 외부 서버로 요청을 보내지 않습니다.

## 빌드 및 검증
저장소 루트에서:

    node --test PhoneSDK/tools/test/gemini-live-launcher.test.mjs
    node PhoneSDK/tools/build-mmpkg.mjs PhoneSDK/examples/gemini-live-launcher PhoneSDK/dist/com.example.gemini-live-launcher-1.0.2.mmpkg
    python integrations/gemini-loopback-android/build.py

Android 수신기 빌드는 JDK 17, Android SDK build-tools 35.0.0,
platforms/android-35가 필요합니다. ANDROID_HOME을 지정할 수 있습니다.
Gradle 또는 외부 Maven 다운로드 없이 로컬 SDK로 빌드합니다.
개발 서명 키는 integrations/gemini-loopback-android/.build/development.keystore에 생성됩니다.
키를 지우고 재생성하면 기존 설치에 업데이트할 수 없으므로 보관하세요.
키 자체는 배포 ZIP에 포함하지 않습니다.

Windows 글라스 빌드:

    $env:PYTHONUTF8='1'
    python GlassSDK/build.py --example web_bridge

검증:
- 단일 클릭/종료 제스처 제외, cooldown, 인증 요청, health 구분, HTTP 오류,
  응답 검증, 취소, 타임아웃, 외부 스킴 제거: 10개 통과.
- Java 컴파일, DEX 생성, APK zipalign 및 v2/v3 서명 검증: 통과.
- .mmpkg manifest/권한/파일 해시 패키징 검증: 통과.
- 루트 build.py 재실행: 기존 GlassSDK/examples/TEST/naver_navigation.c 오류로 실패.
  배포 폴더의 full-build.log 참고. 이 예제는 이번 변경 범위에 포함하지 않음.
- 실제 휴대폰 HTTP 접근/알림/어시스턴트 실행/HFP 오디오 검증은 아직 수행하지 않음.

공식 플랫폼 근거:
- Android 백그라운드 화면 실행 제한:
  https://developer.android.com/guide/components/activities/background-starts
- Android 네트워크 보안:
  https://developer.android.com/privacy-and-security/security-config
- Gemini Live 사용:
  https://support.google.com/gemini/answer/15274899

SDK 동기화는 PhoneSDK에서 node tools/sync-example-sdk.mjs 실행 후 재패키징합니다.

## 1.0.2 수정
HUD updateText 호출에 필수 정수 필드 border:0, radius:0을 추가했습니다.
수신기 APK는 기존 1.0.1을 그대로 사용합니다.
사용자 실기기 로그의 NetworkError는 별도 문제이며 아직 원인이 확인되지 않았습니다.
수신기 미실행, CORS, cleartext/혼합 콘텐츠/호스트 정책을 기기 로그로 구분해야 합니다.

## 1.2.0 — Gemini 답변을 글라스에 표시
수신기 APK와 Phone 플러그인 모두 1.2.0으로 업데이트해야 합니다.
1. 수신기 앱에서 “Gemini 답변 읽기 접근성 설정”을 누릅니다.
2. 접근성 > 설치된 앱 > “Gemini 답변 → 글라스”를 직접 켭니다.
   시스템의 제한된 설정 안내가 표시되면 사용자가 확인해야 합니다.
3. 수신기 앱에서 “수신 시작”을 누릅니다.
4. Studio에서 com.example.gemini-live-launcher-1.2.0.mmpkg를 불러와 휴대폰에 설치합니다.
   Glasses는 기존 web_bridge를 그대로 사용합니다.
5. 연결 코드를 입력하고 연결을 확인합니다. “Gemini 답변을 글라스에 표시”를 켜 둡니다.
6. Gemini에서 질문하여 답변 본문을 화면에 표시합니다.
   휴대폰 접근성 서비스가 본문을 읽고, 플러그인이 약 1.2초 간격으로 조회합니다.
7. 긴 답변은 22자 × 7줄 기준으로 나눠 8초마다 넘깁니다.
   폰 화면의 이전/다음 페이지와 자동 넘김 끄기도 지원합니다.

확인된 요소만 읽음:
com.google.android.googlequicksearchbox:id/assistant_robin_text
실기에서 추출된 Gemini 어시스턴트 팝업 답변을 대상으로 합니다.
일반 Gemini 전체 화면/Live 자막에서 이 ID가 없으면 읽지 않습니다.
다른 앱/입력창/화면의 모든 텍스트를 긁어오는 대체 동작은 하지 않습니다.

개인정보:
- 접근성 대상은 Google/Gemini 두 패키지로 제한합니다.
- 답변은 수신 중에만 읽으며 메모리에 최대 2분 보관합니다.
- 답변 본문은 로그나 파일에 기록하지 않습니다.
- 인증된 로컬 GET /answer로 같은 휴대폰의 MemoMind 플러그인에만 제공합니다.
- 수신 중지 또는 접근성 서비스 종료 시 답변을 지웁니다.
- 플러그인의 답변 표시를 끄면 조회/글라스 표시를 중지합니다.
  캡처 자체를 중지하려면 수신기 중지 또는 접근성 서비스를 끄세요.

한계:
MemoMind WebView가 Gemini로 전환된 동안 JS/Bridge 실행을 중지한다면
실시간 글라스 갱신은 멈추고 MemoMind로 돌아왔을 때 이어집니다.
이 경우 Web 플러그인만으로 백그라운드 동작을 보장할 수 없습니다.
글라스의 한글 글꼴 렌더링 및 실제 화면 표시도 기기에서 확인해야 합니다.

검증:
12개 Node 테스트 통과, Java/DEX/APK 빌드와 v2/v3 서명 검증 통과,
연결 휴대폰 수신기 업데이트 설치 통과.
접근성 사용자가 켠 뒤의 실제 답변→글라스 표시 확인은 대기 상태입니다.
