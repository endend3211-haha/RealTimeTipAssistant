# 메신저별 무 API 음성 답장 검토

검토 기준: 2026-10-27. 메신저 사업자의 서버 API, Bot API, TDLib 및 카카오 디벨로퍼 메시지 API는 사용하지 않는다. Android가 수신한 원래 알림의 `Notification.Action`/`RemoteInput`만 실행한다.

## 지원 판정

| 앱 | 기본 Android 패키지 | 알림 표시 | 직접 답장 | 판정 |
|---|---|---:|---:|---|
| 카카오톡 | `com.kakao.talk` | 가능 | 알림에 자유 텍스트 `RemoteInput`이 있을 때만 가능 | 조건부 지원 |
| Telegram | `org.telegram.messenger`, `org.telegram.messenger.web`, `org.thunderdog.challegram` | 가능 | 알림에 자유 텍스트 `RemoteInput`이 있을 때만 가능 | 조건부 지원 |
| Muse AI - GPT-5.6 기반 | `com.museai.asst.mobile` | 가능 | 앱이 `RemoteInput`을 제공하는지 실기기 확인 필요 | 표시 지원, 답장 미검증 |
| 다른 MuseAI/Muse 동명 앱 | Host의 `musePackageNames`에 추가 | 가능 | 해당 앱 알림의 `RemoteInput` 제공 여부에 따름 | 앱 식별 후 검증 |

## 방식

1. Android `NotificationListenerService`가 허용 패키지의 알림만 받는다.
2. 발신자·본문과 답장 가능 여부를 Phone 플러그인에 전달한다.
3. Phone 플러그인이 전용 채널 `20051`로 Glass GMP에 UTF-8 텍스트를 보낸다.
4. 글라스 한 번 누름으로 답장을 선택하고, 두 번 누름으로 안경 마이크 기반 기기 내 STT를 시작/종료한다.
5. 인식 결과를 안경에 다시 표시하고 길게 누름으로 최종 전송한다.
6. Android Host가 원 알림의 `RemoteInput.resultKey`에 텍스트를 넣고 원래 `PendingIntent`를 실행한다.

## 지원하지 않는 동작

- 알림이 없는 임의 채팅방에 새 메시지 보내기
- `RemoteInput`이 없는 알림에 답장하기
- 메신저 내부 채팅 ID를 이름으로 추측하기
- 백그라운드에서 사용자 확인 없이 자동 전송하기
- 메신저 사업자의 서버/API를 통한 송수신

## 주의사항

- 답장 가능 여부는 앱 버전, 알림 종류, 채팅 권한, 잠금화면 개인정보 설정 및 OEM에 따라 바뀐다.
- 카카오톡 공개 메시지 API는 일반 수신 채팅에 대한 답장 API가 아니므로 사용하지 않았다.
- Telegram Bot API는 별도 bot 신원이며 사용자의 기존 채팅에 본인으로 답장하지 못하므로 사용하지 않았다.
- 뮤즈AI는 동명 앱이 많다. 이 구현의 기본 대상은 Google Play의 `com.museai.asst.mobile`이며, 사용자가 다른 앱을 뜻한다면 패키지명을 추가해야 한다.
- 알림이 삭제되거나 교체되면 저장된 `PendingIntent`가 만료되어 전송이 실패할 수 있다.
- Studio는 Android 시스템 알림·Bluetooth·실제 안경 마이크·온디바이스 STT를 제공하지 않으므로 입력 폼으로 흐름만 시뮬레이션한다.

## 참고

- Android NotificationListenerService: https://developer.android.com/reference/android/service/notification/NotificationListenerService
- Android Notification.Action: https://developer.android.com/reference/android/app/Notification.Action
- Android RemoteInput: https://developer.android.com/reference/android/app/RemoteInput
- Android PendingIntent: https://developer.android.com/reference/android/app/PendingIntent
- MemoMind Plugin Open Platform: https://github.com/memomind-open/plugin-open-platform
- Telegram Android 알림 구현: https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/messenger/NotificationsController.java
- Muse AI Google Play: https://play.google.com/store/apps/details?id=com.museai.asst.mobile&hl=ko
