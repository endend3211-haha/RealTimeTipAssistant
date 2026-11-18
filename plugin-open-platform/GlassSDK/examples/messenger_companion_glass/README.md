# Memo Messenger Companion Glass (APK)

Android 보조 APK와 직접 통신하는 GlassSDK 예제입니다. 기존 예제와 같은 소스·빌드·Studio 검색 구조를 사용합니다.

## SDK 루트에서 실행

```powershell
.\run-messenger-companion.ps1
```

이 스크립트는 해당 Glass 예제만 빌드하고, 검토 파일을 포함한 안경 전용 ZIP을 갱신하며, Studio가 실행 중이 아니면 `Studio/windows/gm-plugin-studio-desktop.exe`를 시작합니다.

Studio 화면에서 Glass 목록 새로고침 후 **Memo Messenger Companion Glass (APK)**를 선택하고 Phone은 비활성화하세요. 또는 상단 **Import package**에서 `dist/MemoMessengerCompanion-Glass-Studio.zip`을 선택하면 Glass 전용 구성을 적용할 수 있습니다. 스크립트가 Studio 화면을 자동 조작하거나 해당 항목을 자동 선택하는 것은 아닙니다.

## 예제 구조

소스:
`GlassSDK/examples/messenger_companion_glass/manifest.json`
`GlassSDK/examples/messenger_companion_glass/messenger_companion_glass.c`

빌드 결과:
`GlassSDK/build-host/.build/messenger_companion_glass/messenger_companion_glass.gmp`

단독 빌드:
```powershell
python GlassSDK/build.py build --example messenger_companion_glass
```

루트의 `python build.py glass`도 이 예제를 발견합니다. 다른 예제까지 빌드할 필요 없이 위 명령으로 선택 빌드할 수 있습니다.

## 확인할 동작

Studio에서 실행하면 **Memo 보조 앱 메신저 / 휴대폰 보조 APK 연결 대기**가 표시됩니다. Phone을 비활성화했으므로 Studio 안에서는 실제 휴대폰 알림이나 음성 인식 결과가 발생하지 않습니다. QR로 안경에 설치·실행한 뒤 Android 보조 앱을 연결하면 채널 20051, 바이너리 버전 2로 실제 알림·답장 명령을 주고받는 구성입니다.

플러그인 ID는 `com.memomind.companion.messenger-glass`입니다. 기존 `Messenger Glass Reply Glass` 및 Phone 웹 플러그인과 구분되는 별도 예제이며, Phone 의존성 메타데이터를 갖지 않습니다.

## 검증 범위

공식 SDK 빌드와 GMP/소스 검토 해시는 검증했습니다. Windows 화면 제어 런타임 오류로 Studio의 실제 목록 검색·선택·실행·QR 생성은 자동 검증하지 못했습니다. 안경과 Android 보조 앱의 실기기 연결도 별도 확인이 필요합니다.
