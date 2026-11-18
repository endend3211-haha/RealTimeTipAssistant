from pathlib import Path
import subprocess,json
r=subprocess.run(['adb','-s','R3CY10PW8KD','exec-out','run-as','com.mcnex.conversation','cat','files/style-animation-probe.json'],capture_output=True,check=True);d=json.loads(r.stdout);assert d['ok'];Path('integrations/conversation-assist/style-animation-device-verified.json').write_text(json.dumps(d,indent=2),encoding='utf-8')
notes='''# Memo 회의 0.13.0
앞서 공유된 MemoMind 화면의 밝은 회색 배경·흰 카드·검은 강조 버튼·둥근 모서리를 참고하여 앱 화면 색상과 여백을 맞췄습니다. 기존 녹색 계열 앱 강조색을 중립 색상으로 정리했습니다. 시스템 sans-serif를 본문400/제목600/버튼500 굵기, 작은 음수 자간과 일정한 줄 간격으로 적용했습니다. MemoMind의 비공개 폰트를 추출·복제하지 않았으므로 동일 폰트라는 의미는 아닙니다. 문서 인쇄 양식과 글라스 화면은 유지했습니다.
카테고리 터치/좌우 스와이프에300ms 가감속 슬라이드를 적용했습니다. 드래그 시 현재 페이지가 손가락 방향으로 움직이고, 손을 놓으면 다음 페이지가 들어옵니다. 전환 중 중복 터치를 막고 완료 후 이전 화면 비트맵을 해제합니다. 시스템 애니메이션 비활성화 설정을 따르며 끝 페이지에서 더 밀면 제자리로 복귀합니다. 회의 카드 삭제·공유 제스처는 페이지 이동과 분리합니다.
검증: Android JUnit10개 및 빌드 통과. 실제 휴대폰에서 카테고리 전환·스와이프 목표 페이지·전환 종료 후 임시 오버레이 제거 확인. 화면 녹화로 프레임률/버벅임을 정량 측정한 것은 아닙니다. 네이티브16KB 정렬 및 ZIP 검사 통과. 기존 회의·모델·연결 설정 유지, 폰/글라스 플러그인 변경 없음.
'''
Path('dist/memo-conversation-assist-0.13.0/README.md').write_text(notes,encoding='utf-8')
with Path('CONVERSATION_ASSIST.md').open('a',encoding='utf-8') as f:f.write('\n\n'+notes)
