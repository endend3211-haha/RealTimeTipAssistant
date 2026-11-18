# Notification Reply

Studio와 Memomind 안경에서 알림을 표시하고 음성으로 답장하는 PhoneSDK 예제입니다.

실제 Android 앱에서는 `NotificationListenerService`가 알림을 받아 `showNotification()`을 호출하도록 연결합니다. 이 웹 플러그인은 Android 알림 권한을 직접 읽지 않으며, Studio에서는 입력 폼으로 알림을 시뮬레이션합니다.

연동 채널은 `20050`입니다. Android 호스트는 `{type:"notification.posted",notification:{app,sender,message}}` JSON을 보내고, 플러그인은 `{type:"notification.reply",notification,text}` JSON을 돌려보냅니다. 호스트는 `notification`의 `RemoteInput` 답장 액션에 `text`를 넣어 `PendingIntent.send()`해야 실제 앱으로 발송됩니다. 알림에 RemoteInput 액션이 없으면 자동 발송할 수 없습니다.

음성 인식은 Web Speech API를 우선 사용합니다. 브라우저가 지원하지 않으면 안경 마이크를 `gm.audio.openRecording()`으로 열어 캡처 성공 여부를 확인하고, 음성 인식(STT)은 휴대폰 앱 또는 서버에서 수행해야 합니다.
