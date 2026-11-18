# MemoMind Health Companion Phone 플러그인

Health Connect 요약을 MemoMind Glass 플러그인으로 보내는 H5 Phone 플러그인입니다.

## 메시지 계약

- 요청 채널: `0x4647` (`17991`)
- 응답 채널: `0x4648` (`17992`)
- 요청 payload: UTF-8 텍스트
- 첫 줄: `MEMOMIND HEALTH/1`

네이티브 Health Companion 앱이 데이터를 주입할 때는 WebView 호스트가
`window.__memoMindHealthUpdate({ type: "health.update", metrics: {...} })`를
호출하거나 같은 객체를 `window.postMessage()`로 전달할 수 있습니다. 수신한
예약 데이터는 입력값에 반영된 뒤 자동으로 Glass 채널로 전송됩니다.

Android 브로드캐스트를 그대로 전달하는 호스트는 다음 형태도 사용할 수 있습니다.

```js
window.postMessage({
  action: 'com.memomind.health.companion.HEALTH_UPDATE',
  extras: { sleep, heartRate, steps, distance, calories }
});
```

현재 공개 MemoMind SDK에는 외부 Android 앱이 실행 중인 H5 플러그인에 직접 값을
넣는 표준 API가 없으므로, MemoMind 호스트가 이 브리지 호출을 구현해야 합니다.

플러그인을 단독으로 실행하면 예제값을 입력해 Glass 전송을 테스트할 수 있습니다.
