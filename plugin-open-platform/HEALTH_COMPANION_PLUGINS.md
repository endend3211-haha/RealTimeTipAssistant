# MemoMind Health Companion 플러그인 쌍

생성된 플러그인은 다음과 같이 동작합니다.

1. Phone `.mmpkg`가 MemoMind Phone App의 WebView에서 실행됩니다.
2. Phone 플러그인이 건강 요약을 UTF-8 payload로 `0x4647` 채널에 전송합니다.
3. Glass `.gmp`가 같은 채널의 payload를 받아 안경 화면에 표시합니다.
4. Glass 플러그인은 `HEALTH_OK`를 `0x4648` 채널로 회신합니다.

## Studio에서 확인

- Phone package: `PhoneSDK/dist/health-companion-0.2.0.mmpkg`
- Glass package: `GlassSDK/build-host/.build/health-companion/health-companion.gmp`
- Studio에서 두 패키지를 각각 불러오고 Phone 플러그인의 paired device로
  `com.memomind.health.companion.glass`를 선택합니다.

## Health Connect 데이터 연결

현재 공개 PhoneSDK에는 외부 Android 앱이 실행 중인 H5 플러그인에 직접 값을
주입하는 공식 API가 없습니다. 네이티브 Health Companion 호스트가 다음 계약으로
값을 주입하면 Phone 플러그인이 값을 반영하고 Glass로 자동 전송합니다.

```js
window.__memoMindHealthUpdate({
  type: 'health.update',
  metrics: {
    sleep: '7시간 20분',
    heartRate: '72 bpm',
    steps: '3,855',
    distance: '5,917.0 m',
    calories: '1,198.4 kcal'
  }
});
```

이 주입 지점을 실제 Health Connect 앱과 연결하려면 MemoMind 호스트 앱이
WebView의 JavaScript 브리지나 공식 앱 간 메시지 API를 제공해야 합니다. Health
Companion은 `com.memomind.health.companion.HEALTH_UPDATE` 브로드캐스트로 요약을
발행합니다. 호스트가 이를 수신해 위 함수를 호출하면 예약 시간마다 안경 전송까지
자동으로 이어집니다.
