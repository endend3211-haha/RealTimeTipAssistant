# Kakao 지도 스마트 글라스 턴바이턴

이 예제는 카카오 Local 키워드 검색과 Kakao Mobility 길찾기를 사용해 목적지를 검색하고, 현재 위치를 따라가며 다음 회전 정보를 GlassSDK HUD로 전송합니다. `demo` 버튼은 API 키 없이도 Studio에서 화면과 메시지 흐름을 확인할 수 있습니다.

## 실행

1. 카카오 디벨로퍼에서 REST API 키를 발급합니다.
2. 프록시를 실행합니다.

```powershell
$env:KAKAO_REST_API_KEY = '발급받은-REST-API-키'
node ..\..\..\kakao-proxy\server.js
```

3. 저장소 루트에서 `python build.py web`을 실행합니다.
4. `Studio/windows/gm-plugin-studio-desktop.exe`를 실행하고 워크스페이스를 새로 고칩니다.
5. `com.mcnex.kakao-navigation` Web 플러그인과 `com.mcnex.kakao-navigation-glass` HUD를 함께 선택합니다.

프록시는 카카오 키를 WebView에 노출하지 않도록 검색과 길찾기를 중계합니다. Studio에서 API 키 없이 UI와 HUD를 확인하려면 `데모 시연`을 누르세요.
