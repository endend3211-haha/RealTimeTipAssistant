# MemoMind 개발 환경 개선 검토

검토일: 2026-11-18. 대상: 현재 PC의 plugin-open-platform-main과 제조사 공개 문서. 이 작업 트리는 공식 SDK 외에 사용자 제작·복사 예제를 포함한다. 따라서 현재 트리의 문제를 전부 제조사 배포본의 결함으로 간주하지 않는다. 모바일 앱·펌웨어·Desktop Studio의 내부 소스는 검토 범위에 없다.

## 결론

우선순위는 기능 수 확대보다 **실기기 지원 여부의 사전 확인, 음성 API, 전송·복구 안정성, 호환 페어 자동 패키징, 진단 로그**다. C ABI·권한 계약·Opus 스트림·패키지 검토 파일·HOGP 문서는 이미 제공된다. 필요한 것은 이를 하나의 검증 가능한 개발 흐름으로 묶는 것이다.

## 제조사 요청 항목

| 우선순위 | 개선 | 확인 근거·현재 불편 | 제안하는 완료 조건 |
|---|---|---|---|
| P0 | 실기기 기능 탐색 및 버전 매트릭스 | getCapabilities는 있지만 Web Speech, TTS, 페이지 이동, 오디오 경로 같은 브라우저/네이티브 차이를 앱 개발자가 개별 탐지한다. 위치도 호스트 버전·권한에 의존한다. | 앱·펌웨어·SDK·Studio 버전 및 지원 메서드/권한 상태/기능 미지원 이유를 하나의 진단 화면·JSON으로 제공. Studio에서 대상 기기 프로필로 사전 검사. |
| P0 | 공식 한국어 STT/TTS·오디오 경로 API | 현 Web SDK에는 범용 전사/인식 서비스가 없고, speak/HFP 출력 선택 메서드도 없다. 사용자 환경에서 speechSynthesis는 작동하는 사례가 있지만 SpeechRecognition은 미지원이었다. | 시작/중간결과/최종결과/취소/오류 이벤트를 가진 STT, TTS 시작·완료·문자 위치·정지, 선택 가능한 실제 마이크/출력 장치와 지원 여부. 로컬/클라우드 처리·개인정보·비용 구분. |
| P0 | 화면 전송 세션과 복구를 SDK에서 관리 | 현재 플러그인들이 프레임 ID, 타일, 압축, 큐, 이전 화면 취소를 직접 구현한다. GLOW 게임 종료 멈춤은 보고됐지만 원인은 미확정이다. | begin/cancel/flush 또는 화면 소유권 API, 이전 화면의 늦은 프레임 거부, 제한된 큐·역압·전송 지표·시간 초과 복구. 전송 중 종료/재연결/홈 복귀 스트레스 시험 제공. |
| P0 | 페어·리뷰 파일 자동 묶기 | 실제 Missing protocol gm.glow-battery와 검토 첨부 누락 가능 사례가 있었다. 후자는 선택 경로의 누락은 확인했으나 실패 원인 확정은 아니다. | 폰 manifest 기준 최신 호환 GMP와 review 해시를 자동 선택. ID·버전·프로토콜·절대 경로 표시, 누락 파일 위치와 해결 버튼 제공. 한 명령으로 검증된 전달물 생성. |
| P0 | 통합 진단 패키지 | UI의 일반 오류와 INFO 공유 종료 로그만으로는 실패 지점이 구분되지 않는다. | 폰 JS 오류/권한/네트워크/TTS·위치/GM 요청·응답/펌웨어 로그에 공통 request ID. 사용자 동의 기반 익명화 ZIP 내보내기. 기밀 토큰·본문·음성을 기본 제외. |
| P1 | 공식 다중 화면 라우터·입력 소유권 | 실제 앱에서 location.assign 페이지 이동이 차단되어 단일 페이지·공유 SDK·화면별 이벤트 필터를 직접 만들었다. 이는 웹뷰 정책 자체가 결함이라는 뜻은 아니다. | 허용되는 내부 이동 방식 문서화 및 SPA 예제. active screen 입력·디스플레이·구독 정리/재개를 공통 도구로 제공. |
| P1 | 호스트 네트워크·인증 연동 | 브라우저 fetch는 CORS·CSP와 서버 정책 영향을 받는다. 현 계약에 일반 외부 브라우저 OAuth 왕복 메서드는 보이지 않는다. | 도메인 allowlist 기반 native HTTP 선택지 또는 공식 중계 예제. 외부 인증 브라우저+PKCE+state+복귀 API. 비밀키를 앱 JS에 넣지 않는 설계. 외부 사이트 차단을 우회하는 기능은 요청하지 않음. |
| P1 | 백그라운드 작업별 보장 | lifecycle 상태는 있지만 일반 웹 페이지의 지속 실행은 보장되지 않는다. 화면 잠금·오디오 캡처는 작업별로 다르다. | 녹음·길안내·TTS 등 허용 작업별 지속 조건/최대 시간/종료 원인 명시. foreground 알림·해제/재개 정책, 잠금/앱 전환 시험 시나리오 자동화. 무제한 백그라운드 실행 요청이 아님. |
| P1 | 안경 상태를 폰 API에 제공 | 안경 C Host에는 battery_percent/charging이 있지만 현재 시뮬레이터 device.getInfo는 connected/transport/profile만 반환한다. 배터리 표시 때문에 custom GMP와 채널 권한을 추가했다. | 배터리·충전·착용·기기/펌웨어 버전·연결 품질을 gm.device 상태 및 이벤트로 제공. 타임스탬프와 미확인 값 명시. |
| P1 | 입력 계약·HOGP 검사 도구 | ABI는 single/double/long/very_long/release/trigger를 정의하며 triple은 없다. BLE HOGP와 Classic HID는 별개다. | 버튼 이벤트 타이밍·중복 여부·길게/해제 규칙 문서화. 이벤트 레코더/재생기, HID Report Map 분석·검증·매핑 마법사, 검증 모델/펌웨어 목록 제공. 키 매핑으로 Classic을 BLE로 바꿀 수 없음을 명확히 안내. |
| P1 | 테스트 채널·공유/업데이트 | Studio 공식 ZIP과 개발자 전달용 ZIP을 사용자가 혼동하기 쉽다. 다른 계정 설치는 소유권·심사 정책 영향이 있다. | 테스터 초대/배포 채널, 재현 가능한 설치 URL, 서명·권한 변경 표시, 이전 버전 복구, 데이터 보존 업데이트. 계정 검증을 없애는 제안은 아님. |
| P2 | 표준 UI·한글 렌더링·게임 템플릿 | 해상도·GRAY_4·스택 등 제약은 문서에 있지만 페이지 나눔·전체 지우기·포커스·한글 줄바꿈을 앱마다 만든다. | 안전 영역, 전체 화면 초기화, 줄바꿈/페이지 레이아웃, 로컬 게임과 전송 HUD 각각의 권장 템플릿 및 물리 기기 성능 목표. |
| P2 | 배포 SDK 정리·Windows 재현성 | GMP packer의 manifest.read_text()는 인코딩 미지정. 현재 작업 환경에서 한글 manifest를 빌드할 때 cp949 오류가 실제 발생했고 PYTHONUTF8로 우회했다. | UTF-8 명시, UTF-8 한글 경로/manifest Windows CI, Python/Node/도구체인 버전 고정·진단. 공식 예제와 제3자/사용자 예제 출처·지원 수준 구분. |

## 플랫폼 개선과 플러그인 책임의 구분

- 배터리를 연결 상태만 보고 가득 채운 것은 GLOW 구현 결함이었다. 제조사 개선은 battery API 표준화이지 이 표시 오류를 제조사 버그로 돌리는 것이 아니다.
- 뉴스·주식을 560×320만 덮어 이전 600×350 테두리가 남은 것은 렌더링 결함이었다. 제조사는 전체 화면 초기화 기본값·샘플을 개선할 수 있다.
- 중국어 도시 결과·결과 목록 미표시·검색 실패 시 자동 위치 해제는 플러그인 구현 문제였다. 제조사는 위치 권한 진단과 위치 API를 지원하면 된다. 도시 검색 데이터 품질은 Open-Meteo 측 영역이다.
- RSS 실패 시 고정 데이터를 '최신'이라 표시하고 확인되지 않은 설명을 붙인 외부 브리핑 예제는 해당 플러그인의 문제다. 플랫폼의 실시간 뉴스 기능 결함이 아니다.
- 웹뷰 SpeechRecognition 미지원은 플랫폼 기능 공백이다. 이를 사용해 음성 입력을 약속한 구현·검증도 부족했다. 모의 인식 시험은 실제 STT 작동의 증거가 아니다.
- 게임 멈춤은 실기기 재현 로그 없이 제조사 펌웨어 버그라고 확정할 수 없다. 앱 큐·구독·프레임 복구 구현도 조사 대상이다.
- gm.glow-battery는 GLOW가 만든 사용자 프로토콜이다. Missing protocol 검사는 정상 보호 기능이며 최신 페어 선택/표시 UX 개선을 요청해야 한다.
- Classic HID 전용 키보드는 BLE HOGP 입력 매핑만으로 연결할 수 없다. 지원 확대에는 제조사의 별도 Bluetooth Classic HID Host 구현이나 외부 중계가 필요하다.

## 권장 실행 순서

1. 대상 폰·안경 버전 식별, 진단 ZIP, 페어 사전 검사, STT/TTS 지원 명세를 먼저 제공.
2. 프레임 소유권·취소·역압 및 입력 구독 복구를 SDK 공통 코드로 제공. 공식 샘플을 실제 기기 장시간/반복 전환 CI로 검증.
3. 네이티브 음성 API·배터리 이벤트·내부 라우터·인증 왕복 API를 추가.
4. 테스터 배포 채널·권한/업데이트·HOGP 호환 목록과 UI 템플릿을 정비.

각 항목은 '문서에 API 존재', '시뮬레이터 통과', 'Android/iOS 실기기 통과', '지원 앱/펌웨어 버전'을 구분해 공개하는 것이 중요하다. 유료 AI 기능을 전부 무료 개방할 필요는 없지만, 지원 여부·비용·할당량·데이터 전송 경계는 API 계약으로 명시해야 한다.

## 확인한 로컬 근거

- PhoneSDK/packages/bridge-contract/src/permission-policy.js: 공개 메서드/권한 목록.
- PhoneSDK/packages/studio-runtime/src/index.js: getCapabilities 및 device.getInfo 시뮬레이터 응답. audioPlayback:false, 위치 simulated:true.
- PhoneSDK/docs/web-plugin/api-reference.md: H5 playback과 네이티브 HFP 경로 차이, speak/HFP 라우팅 메서드 없음.
- PhoneSDK/docs/web-plugin/location.md: 권한·전경·단일 활성 위치 작업·오류.
- PhoneSDK/docs/web-plugin/runtime-and-lifecycle.md, compatibility.md: 수명주기와 시뮬레이터 차이.
- GlassSDK/include/gm_plugin.h: 버튼 action 및 battery_percent/charging 콜백.
- GlassSDK/docs/REVIEW_PACKAGES.md, BLE_ACCESSORY_PROTOCOL.md: 검토 첨부와 액세서리 통신.
- GlassSDK/build-host/tools/gmp_xip_pack.py: manifest.read_text() 인코딩 미지정.
- PhoneSDK/examples/glow-market 및 integrations/glow-*-test.cjs: 사용자 앱의 복구·라우팅·TTS 등 우회 구현과 모의 시험.

공유 계약 시험 `node --test PhoneSDK/packages/bridge-contract/test/contract.test.mjs`: 6/6 통과. 이 결과는 실제 폰/펌웨어 호환을 검증하지 않는다. 전체 workspace 검사 결과는 별도 기록하며 사용자 예제가 섞인 작업 트리의 결과를 공식 SDK 결함 통계로 해석하지 않는다.

## 제조사 공식 문서

- [네트워크·범용 AI/STT 서비스 API 범위](https://open-platform.memo-mind.com/docs/build/networking/?lang=en)
- [백그라운드·수명주기](https://open-platform.memo-mind.com/docs/build/background-lifecycle/)
- [기능 및 호환성](https://open-platform.memo-mind.com/docs/reference/capability-matrix/?lang=en)
- [패키징·공식 설치 ZIP](https://open-platform.memo-mind.com/docs/test/device-package/?lang=en)
- [실기기 검증 단계](https://open-platform.memo-mind.com/docs/test/index/?lang=en)
- [HOGP 외부기기](https://open-platform.memo-mind.com/docs/build/hogp-accessories/?lang=en)

이 보고서는 제조사에 전달할 기술 검토안이며 메시지 전송·업로드는 하지 않았다. 프로젝트 소스도 변경하지 않았다.

검사 보충: 전체 check-workspace는 사용자 예제를 포함한 재귀 문법 검사로 오래 실행되어 중단했으며 완료·통과로 보고하지 않습니다. 범위를 좁힌 Bridge 계약 시험만 6/6 통과했습니다.
