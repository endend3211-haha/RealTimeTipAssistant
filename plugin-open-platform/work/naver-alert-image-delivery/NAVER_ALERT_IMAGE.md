# 네이버 알림 이미지 안내 (외부 API 미사용)

## 구현 범위
- 폰: 네이버 지도 Android 시스템 알림을 해석해 560×272 캔버스에 화살표·거리·원문을 그리고 GRAY4로 변환합니다.
- 전송: 폰의 image-sender.mjs가 display.updateImage로 완성 이미지를 전송합니다.
- 글라스: naver_alert_image.gmp가 SDK Scene/bitmap 메시지를 받아 표시합니다.
- 네이버 지도/길찾기 API, API 키, 프록시, 외부 서버, AI 추론을 사용하지 않습니다.
- 여기서 제외한 API는 외부 서비스 API입니다. Android OS 알림 기능과 로컬 MemoMind SDK 호출은 사용합니다.

## 파일
- PhoneSDK/examples/naver-alert-image: 폰 플러그인 소스
  - notification-core.mjs: 대상 패키지·시간 검증, 방향과 거리 추출, GRAY4 변환
  - render.mjs: 폰 Canvas 이미지 생성
  - image-sender.mjs: 실제 이미지 전송, 중복 억제, 최신 프레임 큐, 응답 시간 측정
- GlassSDK/examples/naver_alert_image: 글라스 수신기
  - 기존 SDK web_bridge 수신 코드를 복제하고 별도 플러그인 ID로 패키징했습니다.
- integrations/naver-alert-android: Android Host 병합용 Kotlin 소스 및 manifest 서비스 조각
- PhoneSDK/tools/test/naver-alert-image.test.mjs: 자동 테스트

폰에는 생성/전송 모듈을 하나의 mmpkg로 묶었습니다. 글라스에는 별도 gmp를 설치합니다.

## 중요: 실제 알림 수신 연결
mmpkg 자체는 Android 시스템 알림을 읽을 수 없습니다. 공개 저장소에 MemoMind Android Host 본체가 없으므로, 제공한 Kotlin을 제품 Host에 병합해야 합니다. 이 결과물에 별도 설치 APK는 없습니다.
1. Kotlin 파일을 같은 Android Host 모듈에 추가합니다(AndroidX WebKit 의존성 필요).
2. AndroidManifest-snippet.xml의 service를 Host의 application에 병합합니다.
3. 사용자가 Android 설정의 '알림 접근'에서 Host 앱을 직접 허용합니다.
4. Host는 이 플러그인만 제공하는 전용 HTTPS WebView origin을 사용합니다.
5. 메인 스레드에서 페이지 로드 전 다음처럼 연결합니다:
   NaverNotificationRuntime.attach(
       "com.mcnex.naver-alert-image", pluginWebView, "https://naver-alert.local")
6. 외부 페이지 이동을 차단하고, 화면/플러그인 중지·교체·파괴 또는 navigation 전에 detach()를 호출합니다. 재개 시 재연결합니다.
7. JS 로드 후 MemoNaverHost로 ready를 보냅니다. ready 이전 알림은 저장하거나 재전송하지 않습니다.
8. 알림 수신기는 com.nhn.android.nmap만 전달합니다. 다른 앱, 그룹 요약, 오래된 알림은 표시하지 않습니다.

iOS용 타 앱 알림 수집은 구현하지 않았습니다. Android 잠금/절전 상태에서 WebView가 중지되면 자동 이미지 생성도 중지됩니다. 상시 사용은 Host의 런타임 관리와 실기기 검증이 필요합니다.

## 설치·테스트
1. Studio에서 naver_alert_image.gmp를 설치/실행합니다.
2. naver-alert-image-1.0.0.mmpkg를 가져옵니다.
3. 테스트 이미지 만들기로 폰 미리보기를 확인합니다.
4. 글라스 전송 켜기를 누르면 현재 이미지를 보냅니다.
5. 실제 알림 검증은 위 Android Host 연결 후 네이버 지도 안내를 실행합니다.
6. 다시 보내기로 전송 실패를 재시도할 수 있습니다. PNG 저장은 폰 미리보기 PNG를 저장하며, 글라스에는 PNG가 아닌 GRAY4가 전송됩니다.

브라우저 시뮬레이터:
  node PhoneSDK/tools/run-browser-studio.mjs --plugin examples/naver-alert-image --port 4187
  http://127.0.0.1:4187
브라우저 시뮬레이터는 실제 Bluetooth나 GMP 실행을 검증하지 않습니다.

## 파싱과 표시 규칙
- 단일 좌회전/우회전/직진/유턴을 인식합니다.
- 해당 방향 앞에 있는 m/km/미터/킬로미터 거리만 사용합니다.
- 복수 방향 또는 알 수 없는 문구는 방향을 추정하지 않고 원문을 표시합니다.
- 거리 미제공은 '거리 미제공'으로 표시합니다.
- 원문은 작은 화면에서 최대 두 줄로 표시됩니다.
- 60초 후 만료 화면으로 교체하고, 현재 알림 제거 시 종료 화면으로 교체합니다.
- 실시간 남은 거리를 자체 추정하지 않습니다. 정확한 교차로 형상·지도·차선·속도단속 정보는 알림에 없는 경우 생성하지 않습니다.

## 전송 사양과 측정
- 위치 (8,8), 크기 560×272, stride 280, GRAY4.
- 픽셀 76,160 B / Scene bitmap 헤더 포함 76,170 B / Base64 101,548 문자.
- SDK raw bitmap 제한(이미지 81,891 B) 안에 들어갑니다.
- 수치는 Bluetooth 전체 패킷 비용을 포함하지 않습니다.
- 브리지 호출부터 Promise 완료까지의 시간을 표시합니다. 실제 광학 화면 표시나 사용자 인지를 측정한 값이 아닙니다.
- 동일 화면 재전송 억제, 전송 중 최신 대기 프레임 하나만 유지, 실패 후 재시도 가능.
- 압축하지 않는 버전으로 LZ4 펌웨어 의존성을 피했습니다. 압축·부분 갱신 최적화는 포함하지 않았습니다.

## 검증
자동 테스트: 대상 앱 필터·알림 만료·방향/거리/모호성·GRAY4 변환·전송 크기·중복 억제·실패 재시도·최신 프레임 큐.
폰 mmpkg 패키징 및 글라스 RISC-V GMP 빌드 완료.
Kotlin은 호스트 병합용 소스이며 Android 컴파일과 실기기 네이버 알림/Bluetooth/광학 표시는 아직 검증하지 않았습니다.
테스트 실행: node --test PhoneSDK/tools/test/naver-alert-image.test.mjs
폰 패키징:
  node PhoneSDK/tools/build-mmpkg.mjs PhoneSDK/examples/naver-alert-image PhoneSDK/dist/naver-alert-image-1.0.0.mmpkg
글라스 빌드(Python 실행 경로는 환경에 맞게):
  python GlassSDK/build.py build --example naver_alert_image
