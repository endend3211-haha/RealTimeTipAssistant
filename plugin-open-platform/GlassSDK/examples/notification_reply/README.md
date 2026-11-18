# Notification Reply Glass

전용 GlassSDK 플러그인입니다. PhoneSDK 플러그인과 Bluetooth 채널 `20050`으로 통신합니다.

- 알림 이벤트 수신: 화면에 수신 payload를 표시
- Primary 한 번: 답장 모드
- Primary 두 번: 음성 입력 시작/종료 요청
- Primary 길게: 최종 보내기 요청
- Back: 취소

현재 GlassSDK에는 음성 인식 API가 없으므로, 음성 텍스트 변환은 PhoneSDK/Android 호스트가 수행합니다. 안경은 마이크 캡처 시작·종료 명령을 휴대폰에 보내고, 인식된 텍스트를 다시 받아 표시합니다.
