# MemoMind Health Companion Glass 플러그인

Phone 플러그인이 보내는 건강 요약 텍스트를 MemoMind 안경의 LVGL 화면에
표시하는 네이티브 Glass 플러그인입니다.

- 요청 채널: `0x4647` (`17991`)
- 응답 채널: `0x4648` (`17992`)
- 최대 표시 payload: 900 bytes
- 프로토콜: `gm.health-companion/1.0`

수신한 UTF-8 텍스트를 그대로 안경 화면에 표시하고 `HEALTH_OK` 응답을
Phone 플러그인으로 돌려보냅니다. 패키지 설치·선택은 MemoMind Plugin Studio가
관리합니다.
