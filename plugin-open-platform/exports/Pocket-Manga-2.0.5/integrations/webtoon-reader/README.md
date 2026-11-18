# 포켓 만화 2.0.5 — 가입 없는 공용 중계

중계 주소: **https://proxy.cors.dev**

휴대폰 2.0.5 패키지는 이 주소가 기본값입니다. 이전 localhost / 임시 Workers 주소는 최초 실행 시 한 번 교체합니다. PC를 켜두거나 Cloudflare에 가입할 필요가 없습니다. 기존 `/api?path=` 중계와 주소 형식이 다르므로 **구버전에 주소만 입력하지 말고 2.0.5를 설치하세요.**

## 설치

- `dist/Pocket-Manga-2.0.5.mmpkg`: 휴대폰 플러그인 업데이트.
- 이미 설치한 안경 Mirror v2는 그대로 사용합니다. v1은 `gm.pocket-fast-frame`이 없으므로 v2로 교체해야 합니다.
- Source Studio 입력 폴더: `PhoneSDK/examples/pocket-manga`.
- 휴대폰에서 ‘연결 및 성능 설정’ 주소가 `https://proxy.cors.dev`인지 확인하고 연결을 누르세요.

이 서비스는 MangaDex 전용 서버가 아닌 외부 사업자의 공용 CORS 프록시입니다. GET/HEAD는 가입·키 없이 제공됩니다. 서비스 공식 안내 기준 응답당 6 MiB, IP당 분당 600회, 요청 시간 30초 제한이 있습니다. 무료 서비스의 가용성과 정책은 변할 수 있습니다. 본문은 data-saver를 우선 사용합니다. 큰 이미지나 429 오류는 표시하고 인증/크기 제한을 우회하지 않습니다.

서비스 안내: https://cors.dev/

## 실제 검증 및 한계

2026-11-06 공용 주소를 통한 한국어 목록 7개, JPEG 표지, 공개 회차, 본문 20개 주소 발급과 첫 JPEG 본문 이미지 HTTP 200을 확인했습니다. 응답에 브라우저용 CORS 헤더도 확인했습니다. 휴대폰 실기기와 안경의 표시·fps를 원격으로 확인한 것은 아닙니다.

@Home 전송 보고는 공식 `/report`에 POST를 시도합니다. 공용 무료 프록시는 POST를 전달하지 않으므로 이 보고는 브라우저/네트워크 정책에 따라 실패할 수 있습니다. 확실한 서버 측 보고가 필요한 배포는 기존 네이티브 연결 또는 자체 게이트웨이를 사용해야 합니다. 이 한계가 없는 것처럼 주장하지 않습니다.

## 화면과 버튼

Pocket의 7개 덱 자체에 만화 표지와 제목이 들어갑니다. 기존 게임 덱과 분리된 iframe 목록이 아닙니다. 선택하면 동일한 600×350 뷰포트를 휴대폰과 안경에 표시합니다. 한국어 공개 본문이 없으면 영어 등 번역 언어를 선택하세요. 외부 사이트 전용/본문 0개/미공개 회차는 제외합니다.

| 화면 | 한 번 | 두 번 | 길게 |
|---|---|---|---|
| 표지 덱 | 다음 작품 | 이전 작품 | 선택 / 본문 |
| 읽기 | 다음 미독 화면 | 이전 화면 | 덱으로 복귀 |

2.0.5부터 표지 덱의 머리 동작 인식을 제거했습니다. 버튼으로 이동·선택합니다. 본문 이미지를 너비 600에 맞추고 높이 350으로 잘라 표시합니다. 긴 페이지는 50픽셀을 겹쳐 300픽셀씩 이동한 뒤 다음 실제 이미지로 이동합니다. 표시 완료 ACK를 받은 위치만 읽은 위치로 저장합니다. 휴대폰의 로컬 미리보기는 안경 표시 완료로 기록하지 않습니다.

## 성능과 전송

2.0.5는 중앙 표지는 원본 232×280을 그대로 유지하고 뒤쪽 표지만 낮은 품질로 처리합니다. 중심까지 거리 0.5칸 이하는 원본, 중앙 진입 중인 0.5~0.9칸은 116×140/8단계, 인접 배경은 58×70/8단계, 먼 배경은 29×35/4단계로 캐시합니다. 원본 Canvas는 수정하지 않습니다. 낮춘 밝기는 최종 프레임에 동일하게 적용합니다.

배경은 겹침 없는 정수 픽셀 열을 2/3/4픽셀씩 묶어 투영해 반복 draw 호출을 줄이고, 앞쪽은 기존 1픽셀 투영을 유지합니다. 마지막 1픽셀보다 작은 정착 오차를 위해 여러 프레임을 보내지 않도록 전환 완료 허용치를 조정했습니다.

실제 한국어 공개 표지 7개를 사용한 로컬 네이티브 Canvas 비교 결과 (`work/pocket-manga/render-bench/results.json`):
- 동일 21개 포즈의 프레임당 평균 LZ4 데이터 39,758 → 36,699바이트, 약 7.7% 감소.
- 평균 로컬 draw 시간 13.53 → 8.70ms. 캔버스 구현/CPU 차이가 있으므로 실제 Android WebView 성능 수치가 아닙니다.
- 중앙 내부 224×272 영역의 변경된 RGB 성분 수는 0개. 원본 픽셀 유지 확인.
- ACK 지연을 가정한 한 칸 전환은 15 → 10프레임, 총 압축 데이터 579,741 → 358,669바이트로 38.1% 감소. 배경 LOD와 마무리 프레임 단축을 함께 적용한 결과입니다.

이 수치는 로컬 비교이며 실제 통신 속도나 안경 fps 향상률을 보장하지 않습니다. 본문 읽기 화면의 화질/조작과 안경 플러그인은 바꾸지 않았습니다.


HUD와 동일한 휴대폰 미리보기의 픽셀 밝기를 0.8배로 낮춥니다. 하드웨어 LED 설정 변경이 아닌 렌더링 톤 조정입니다.

휴대폰이 API·이미지 해독·3D 투영·spring 애니메이션·한글·GRAY_4 양자화·LZ4 압축을 처리합니다. 안경은 framebuffer 표시와 IMU/button 전달만 담당합니다.

- 이동/정지 모두 600×350 GRAY_4를 사용합니다. 밝기 0.8을 반영한 유효 13단계를 유지합니다. 이동 중 저해상도·4단계 전환은 제거했습니다.
- 표지는 겹침 없는 정수 목적지 열로 투영하고 부드러운 이미지 샘플링을 사용합니다. 덱별 투명도는 재사용 투명 레이어에서 한 번만 합성해 겹친 조각이 밝은 세로줄을 만드는 현상을 줄입니다.
- 이동 중 하단 제목·번호를 고정하고 정착 후 갱신해 이동 프레임의 변경 영역을 단일 타일 안에 유지합니다.
- 오랫동안 멈춘 뒤 첫 전환은 16ms로 시작하고 다음 프레임은 최대 64ms만 진행해 첫 프레임 점프와 늦은 ACK의 큰 위치 점프를 제한합니다. 빠른 연속/반대 입력은 기존 spring 속도를 유지합니다.
- 마지막 ACK 화면과 다른 사각형만 전송. 진행 중 1개 + 최신 대기 1개로 제한.
- 552×286 덱 영역은 디코드 79,800바이트 안에 들어가 단일 요청/ACK 사용.
- 전체 화면은 atomic frame 2타일. 실패/연결 해제 후에는 전체 화면을 재전송.
- 전송 완료에 맞춰 spring을 진행. 생성 목표 최대 30fps이며 실기기 fps 보장이 아님.
- 다음 이미지 미리 불러오기, 압축 이미지 캐시 3개 제한.
- 휴대폰 미리보기는 안경 ACK 기준. 화면의 fps는 최근 2초 표시 응답 횟수.

SDK 공식 전송은 Android Bluetooth Classic SPP / iOS iAP2 앱 브리지입니다. 임의 BLE UUID를 사용하지 않습니다. 빠른 요청 채널은 0x4d46, 표시 완료 ACK는 0x4d47입니다.

로컬 픽셀 변환 벤치마크(600×350, 준비 6회 후 30회): 이전 중앙값 4.946ms, 새 경로 0.425ms. 캔버스 렌더·readback·전송은 제외한 CPU 측정이며 실기기 fps 측정이 아닙니다. `work/pocket-manga/quality-benchmark.json`에 결과가 있습니다.

## 선택 가능한 다른 연결

Android Host에 `integrations/webtoon-reader/android`의 AAR를 통합하면 네이티브 HTTP를 우선 사용합니다. `.mmpkg`만으로 AAR가 설치되지는 않습니다. 공용 중계 모드에서는 이 AAR가 필수는 아닙니다.

`mangadex-gateway.mjs`는 자체 PC 개발 서버이고, `cloudflare/`는 사용자 소유 Workers 서버 배포 소스입니다. 이전 임시 서버·Quick Tunnel 주소는 기본 연결로 쓰지 않습니다.

## 빌드와 검증

```powershell
node integrations/webtoon-reader/sync-pocket.mjs
node PhoneSDK/tools/build-mmpkg.mjs PhoneSDK/examples/pocket-manga dist/Pocket-Manga-2.0.5.mmpkg
node --test work/webtoon-reader/deck-lod.test.mjs work/webtoon-reader/render-quality.test.mjs work/webtoon-reader/public-proxy.test.mjs work/webtoon-reader/cloudflare.test.mjs work/webtoon-reader/mangadex.test.mjs work/webtoon-reader/pocket-flow.test.mjs work/webtoon-reader/webtoon.test.mjs work/cartridge-library/coverflow.test.mjs work/cartridge-library/frame-pipeline.test.mjs
```

MangaDex 공식 문서: https://api.mangadex.org/docs/swagger.html
