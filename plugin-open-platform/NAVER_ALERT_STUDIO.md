# Studio에서 네이버 안내 이미지 플러그인 열기

1. 프로젝트 루트의 run-naver-alert-studio.cmd를 실행합니다.
2. Studio 상단의 Import package(패키지 가져오기)를 누릅니다.
3. dist\NaverAlertImage-Studio-1.0.1.zip을 선택합니다.
   이 ZIP은 소스 배포용 naver-alert-image-1.0.0.zip과 다른, Studio용 통합 패키지입니다.
4. 폰: 네이버 알림 이미지 안내 / 글라스: Naver Alert Image Receiver를 확인합니다.
5. 실행 버튼이 보이면 실행하고 폰 화면에서 '테스트 이미지 만들기'를 누릅니다.
6. '글라스 전송 켜기'를 누르면 가상 글라스에 폰에서 만든 이미지를 보냅니다.

워크스페이스 방식: Import workspace로 이 프로젝트 루트를 선택한 뒤 각 목록을 새로고침해도 됩니다.
폰 경로: PhoneSDK/examples/naver-alert-image
글라스 경로: GlassSDK/examples/naver_alert_image
GMP 경로: GlassSDK/build-host/.build/naver_alert_image/naver_alert_image.gmp

검증: 통합 ZIP에 폰 패키지와 GMP가 최상위에 포함되어 있으며 GMP·검토 소스 해시를 확인했습니다.
Studio GUI에서 실제 가져오기/실행은 자동 제어 런타임 오류로 아직 검증하지 못했습니다.
Studio에서 실제 네이버 지도 알림은 발생하지 않습니다. 테스트 입력으로 표시를 확인합니다.
실제 폰 알림은 integrations/naver-alert-android 코드를 MemoMind Android Host에 병합해야 합니다.


## 1.0.1 수정
페이지 로드 즉시 gm.ready()를 호출하도록 변경했습니다. 1.0.0은 버튼 클릭까지 준비 완료 신호가 지연되어 Host 시작 타임아웃을 일으킬 수 있었습니다.
사용자 클릭 전 준비 신호 호출을 검증하는 회귀 테스트를 포함해 6개 테스트가 통과했습니다.
실제 휴대폰에서 재설치 후 시작 성공 여부는 추가 확인이 필요합니다.
