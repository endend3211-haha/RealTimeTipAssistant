# Messenger Glass Reply Glass

PhoneSDK의 `messenger-glass-reply`와 채널 `20051`로 통신하는 MemoMind 전용 GMP입니다.

- 휴대폰 알림 텍스트를 600×350 LVGL 화면에 표시
- 한 번 누름: 답장 모드
- 두 번 누름: 안경 마이크 음성 입력 시작/종료
- 길게 누름: 인식된 답장 전송
- Back 트리거: 취소

음성 PCM/STT와 Android `RemoteInput` 실행은 Glass ABI가 아니라 휴대폰 Host가 담당합니다. 이 GMP는 화면과 버튼 명령을 담당합니다.
