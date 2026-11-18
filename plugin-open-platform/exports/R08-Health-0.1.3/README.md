# R08 Health 0.1.3

MemoMind용 R08 건강정보 UI 및 Bluetooth 진단 플러그인입니다.

## 현재 기능과 제한
폰 manifest 버전 0.1.3, 글라스 버전 1을 포함합니다. 실제 건강 측정값 조회는 아직 구현되지 않았습니다. health-provider.js는 GATT_BRIDGE_PENDING 오류를 반환하는 연결 대기 어댑터입니다. 진단 기능은 실행 환경의 Web Bluetooth 지원 여부를 확인하며, 지원 환경에서 링 배터리 서비스(180F/2A19)를 시험합니다. 실제 센서·건강 기능이 검증된 완성 앱으로 해석하면 안 됩니다.

## 설치
release/r08-health-0.1.3.mmpkg와 release/r08-health.gmp 및 manifest·검토 파일을 MemoMind Studio에서 올바른 페어로 선택해 공식 패키징·설치합니다. 다른 계정 설치는 플랫폼 정책이 적용됩니다. 직접 BLE 시험은 안경과 링의 기존 연결에 영향을 줄 수 있습니다.

## 소스 빌드
공식 matching plugin-open-platform SDK의 동일 경로에 이 소스를 복사해 SDK 도구로 빌드합니다. 전체 SDK는 포함하지 않습니다. vendor SDK와 원본 라이선스 조건은 LICENSE를 참조하세요.

개인 건강 기록·Bluetooth 장치 식별 로그·인증키는 포함하지 않았습니다. DIAGNOSTICS-KO.txt는 예전 0.1.1 진단 안내이므로 현재 버전 표시와 구분하세요.
