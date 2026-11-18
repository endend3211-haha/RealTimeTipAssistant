# Android 호스트 연결

이 저장소에는 Android 애플리케이션 모듈이 없으므로 아래 코드는 휴대폰 앱에 추가할 호스트 어댑터의 계약입니다.

`NotificationListenerService.onNotificationPosted()`에서 알림의 `Notification.Action`을 순회해 `RemoteInput`이 있는 액션을 찾습니다. 찾으면 `notification.posted`를 채널 20050으로 플러그인에 보냅니다.

최종 보내기 이벤트를 받으면 다음처럼 답장합니다.

```kotlin
val remoteInput = action.remoteInputs.firstOrNull() ?: return
val intent = Intent().apply {
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
val results = Bundle().apply { putCharSequence(remoteInput.resultKey, text) }
RemoteInput.addResultsToIntent(arrayOf(remoteInput), intent, results)
action.actionIntent.send(this, 0, intent)
```

실제 구현에서는 원래 `PendingIntent`와 `RemoteInput` 객체를 알림 ID별로 저장해야 하며, 만료·취소된 `PendingIntent` 예외를 처리해야 합니다. `RemoteInput` 액션이 없는 알림은 이 방식으로 답장할 수 없습니다.
