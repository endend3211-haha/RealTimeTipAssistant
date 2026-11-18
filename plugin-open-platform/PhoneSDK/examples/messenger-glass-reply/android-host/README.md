# Android Host 병합 안내

이 디렉터리는 공개 Plugin Open Platform에 포함되지 않은 **MemoMind Android Host 앱**에 병합할 코드 계약입니다. `.mmpkg` 내부 WebView만으로는 Android 시스템 알림에 접근할 수 없습니다.

## 필요한 연결

1. `AndroidManifest-snippet.xml`의 서비스를 Host 앱 매니페스트에 추가합니다.
2. 사용자에게 Android 설정의 **알림 접근 권한**을 직접 승인받습니다. 플러그인이 승인 화면을 자동으로 누르면 안 됩니다.
3. 해당 플러그인을 `WebViewAssetLoader` 같은 전용 HTTPS asset origin에서 제공하고, 그 origin만 `MemoMessengerRuntime.attach(pluginId, webView, allowedOrigin)`에 전달합니다. `file://`, `content://`, 외부 navigation과 서브프레임은 차단합니다. 어댑터는 ID가 `com.memomind.demo.messenger-glass-reply`인 WebView의 허용된 최상위 origin 메시지만 받습니다. AndroidX WebKit의 origin allowlist 메시지 API가 필요합니다.
4. 제품의 기존 MemoMind glasses Opus 캡처 → 디코더 → **온디바이스 STT** 구현을 `MemoMessengerRuntime.recognizer`에 연결합니다. 네트워크/메신저 API는 사용하지 않습니다.
5. 기본 뮤즈AI 대상은 Google Play의 `com.museai.asst.mobile`입니다. 다른 동명 앱이면 실제 패키지명을 확인해 `MessengerConfig.musePackageNames`에 추가합니다.

```kotlin
MemoMessengerRuntime.config = MessengerConfig(
    musePackageNames = setOf("실제.뮤즈AI.패키지명"),
)
MemoMessengerRuntime.recognizer = productOfflineRecognizer
MemoMessengerRuntime.attach(
    "com.memomind.demo.messenger-glass-reply",
    pluginWebView,
    "https://memo-messenger.local",
)
```

## 보안/수명

- 알림 본문은 Web 플러그인이 실행 중일 때만 전달하고 장기 저장하지 않습니다.
- `Notification.Action`/`RemoteInput`/`PendingIntent`는 알림 키별로 메모리에만 보관합니다.
- 알림이 제거되면 답장 대상을 즉시 삭제합니다.
- `RemoteInput`이 없는 알림은 표시만 가능하고 답장할 수 없습니다.
- 잠금 화면 비공개 알림, 업무 프로필 정책, 제조사 배터리 정책에 따라 내용이나 답장 액션이 제한될 수 있습니다.

## 온디바이스 STT

공개 SDK가 제공하는 안경 음성은 16 kHz mono Opus입니다. `GlassesOfflineSpeechRecognizer` 구현은 제품 Host의 기존 캡처 소유권과 동시 실행 제한을 지켜야 하며, Opus 프레임 경계를 보존해 디코딩한 뒤 오프라인 엔진에 공급해야 합니다. Android 기본 `SpeechRecognizer`가 오프라인을 요청해도 장치/언어팩에 따라 네트워크를 사용할 수 있고 임의 Opus 스트림 입력도 보장하지 않으므로, 이 샘플은 이를 ‘완전 오프라인’ 구현으로 간주하지 않습니다.

## 통합 수신함 확장 (2026-11-02)

LINE 패키지 jp.naver.line.android를 기본 허용합니다. notification.select 요청으로 답장 대상을 명시적으로 고정하고 notification.deselect로 해제합니다. 다른 알림은 고정 대상을 덮어쓰지 않습니다. 선택한 알림 자체가 교체되면 제거 이벤트를 먼저 보내 초안을 무효화합니다. 이 코드는 Android 앱에 병합해야 하며 독립 APK가 아닙니다. Kotlin 컴파일과 기기 검증은 아직 수행하지 않았습니다.
