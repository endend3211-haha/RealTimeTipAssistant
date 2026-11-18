from pathlib import Path
import subprocess,json
r=subprocess.run(['adb','-s','R3CY10PW8KD','exec-out','run-as','com.mcnex.conversation','cat','files/alignment-smoke.json'],capture_output=True,check=True)
report=json.loads(r.stdout);assert report['ok'];Path('integrations/conversation-assist/alignment-device-verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
notes='''# Memo 회의 0.8.1 — 16KB 네이티브 정렬 수정

0.8.0의 GPU 동적 라이브러리 5개에 4KB LOAD 정렬이 남아 Android 호환성 경고가 표시되었습니다. JNI 파일에만 적용했던 옵션을 CMake 전체 shared/module 타깃에 적용했습니다. max-page-size=16384와 common-page-size=16384를 함께 사용하여 RELRO 경계도 정렬했습니다.
구글 공식 LiteRT-LM 0.18.0/0.18.1의 사전 빌드 파일은 LOAD가 16KB였으나 RELRO 끝이 정렬되지 않았습니다. 0.19.0 공식 파일에서 두 경계를 확인한 뒤 SDK를 교체했습니다. 사전 빌드 바이너리를 임의 수정하거나 경고 숨기기 설정을 넣지 않았습니다.

## 검증
최종 APK의 arm64 공유 라이브러리 7개 전체에 대해 LOAD p_align >= 16384, 주소/파일 오프셋 합동 조건, RELRO 끝 정렬 검사 통과. zipalign -c -P 16 -v 4 통과. Android JUnit7개 통과.
실제 휴대폰에서 EXAONE CPU 응답, OpenCL GPU 응답, LiteRT-LM 0.19 Gemma 자동 도움 JSON 및 회의 요약 생성 성공. 이는 엔진 동작 검사이며 답변 내용의 사실 정확성 전체를 보증하는 시험은 아닙니다.
휴대폰 getconf PAGE_SIZE는 4096입니다. APK 구조 검증과 4KB 실기기 회귀 시험을 완료했으며 별도 16KB 커널 기기에서의 전체 실행 시험은 아직 하지 않았습니다.

## 업데이트
MemoConversationAssist-0.8.1.apk를 기존 앱 위에 설치합니다. 기존 Gemma/EXAONE 파일, 모델 선택, 회의 기록을 유지합니다. 폰 플러그인 0.6.0과 글라스 GMP는 변경 없습니다. GPU/모델 선택 방법은 0.8.0과 동일합니다.

정렬 재검사: python integrations/conversation-assist/verify_16kb.py <APK경로>. LOAD·RELRO JSON은 elf-16kb-verified.json, 기기 응답 기록은 alignment-device-verified.json.
공식 기준: https://developer.android.com/guide/practices/page-sizes
'''
Path('dist/memo-conversation-assist-0.8.1/README.md').write_text(notes,encoding='utf-8')
with Path('CONVERSATION_ASSIST.md').open('a',encoding='utf-8') as f:f.write('\n\n'+notes)
p=Path('dist/memo-conversation-assist-0.8.0/README.md');s=p.read_text(encoding='utf-8');p.write_text('> 업데이트: 16KB 정렬 경고를 수정한 0.8.1 APK를 사용하세요.\n\n'+s,encoding='utf-8')
