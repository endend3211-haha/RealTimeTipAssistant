# Doom 글라스

fighter_arena의 게임 루프/입력 연동 방식을 참고한 Doom 포트입니다. Doom 엔진은 PhoneSDK WebView에서 WebAssembly로 실행되고, 320x200 프레임을 GRAY_4 이미지로 GM Web Bridge에 전송합니다.

## 실행

Studio에서 다음 패키지를 폰 플러그로 선택합니다.

`PhoneSDK/dist/doom-0.1.0.mmpkg`

글라스 플러그는 `GM Web Bridge`를 선택합니다.

## 조작

- 왼쪽/오른쪽: 회전
- 앞으로/뒤로: 이동
- 발사: Control
- 사용: Space

WAD는 `doom.zip`으로 패키지에 포함되며 실행 시 WebView 메모리 파일 시스템에 압축 해제됩니다.
