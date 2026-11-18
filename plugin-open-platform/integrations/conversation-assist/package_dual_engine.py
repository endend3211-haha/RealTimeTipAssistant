from pathlib import Path
import subprocess,json,zipfile
raw=subprocess.run(['adb','-s','R3CY10PW8KD','exec-out','run-as','com.mcnex.conversation','cat','files/dual-engine-probe.json'],capture_output=True,check=True).stdout
report=json.loads(raw);assert report['ok'];Path('integrations/conversation-assist/dual-engine-device-verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
p=Path('dist/memo-conversation-assist-0.7.0/MemoConversationAssist-0.7.0.apk')
with zipfile.ZipFile(p) as z:
 assert 'lib/arm64-v8a/libconversation.so' in z.namelist()
 assert not any(n.startswith('assets/') and ('probe' in n.lower() or n.endswith('.gguf')) for n in z.namelist())
 for n in z.namelist():
  if n.endswith('.dex'):assert b'DualEngineProbe' not in z.read(n)
notes='''# Memo 회의 0.7.0 — 두 AI 엔진

기존 LiteRT-LM (.litertlm / GPU)을 유지하고 llama.cpp (.gguf / CPU 4 threads)를 추가했습니다. 휴대폰 다운로드 폴더의 EXAONE-3.5-2.4B-Instruct-Q4_K_M.gguf를 별도 등록했으며 기존 Gemma와 사용자 회의 자료는 보존했습니다. 기본 선택은 Gemma입니다.

## 사용법
설정 → AI 모델 관리 · 선택 / 테스트 → 사용할 모델 선택 → LiteRT-LM 또는 GGUF 선택.
같은 메뉴의 ‘선택 모델 응답 테스트’는 고정 대화에 대한 모델 응답과 준비·생성 소요 시간을 표시합니다. 이미 로드된 모델은 준비 시간이 짧게 나옵니다.
새 파일은 ‘모델 파일 등록’에서 선택합니다. 헤더로 형식을 판별하고 각 형식별 파일 하나를 보관합니다. 같은 형식 파일을 다시 등록하면 그 슬롯을 교체합니다. GGUF와 LiteRT-LM 슬롯은 서로 덮어쓰지 않습니다.
선택 시 이전 모델을 해제하고 다음 요청 때 새 모델을 로딩합니다. AI 처리·회의록 생성 대기/진행 중에는 변경을 막습니다. 자막용 Android on-device 음성인식은 별도 엔진입니다.

## 호환 범위
GGUF는 해당 llama.cpp 빌드가 지원하는 구조와 내장 채팅 템플릿을 사용합니다. EXAONE 3.5 실제 파일로 확인했습니다. 모든 GGUF 또는 모든 LiteRT-LM 모델의 호환성을 보장하지 않습니다. 템플릿이 없거나 지원되지 않는 모델은 명시적으로 거부합니다. 컨텍스트는 4096토큰입니다. 모델 파일은 APK에 포함하지 않습니다.
회의록은 선택 모델로 생성하고 문서에 모델 이름을 기록합니다. 다시 생성 시 기존 회의록을 갱신합니다. 모델별 회의록 복수 버전 보관 기능은 포함하지 않습니다.

## 검증
- Android 빌드 및 JUnit 7개 통과, 폰 플러그인 테스트 14개 통과.
- 실제 SM-S936N: 소형 GGUF 로딩/추론, 잘못된 경로 거부, 기존 Gemma 한국어 응답, EXAONE 선택·로딩·JSON 도움·짧은 회의 요약·Gemma로 복귀 성공.
- EXAONE: 로딩 1061ms, 고정 문맥 자동 도움 응답 24453ms. 전체 회의나 연속 음성 인식과 동시에 측정한 수치가 아니며 발열/문맥/출력 길이에 따라 달라집니다.
- LiteRT-LM 5490ms는 별도의 짧은 질의이므로 EXAONE 수치와 직접 비교하지 마세요. 앱 응답 테스트 메뉴는 같은 질의로 비교할 수 있습니다.
- GGUF는 Release -O3 빌드, GPU 가속은 추가하지 않았습니다.

## 설치
MemoConversationAssist-0.7.0.apk를 기존 앱 위에 업데이트 설치합니다. APK 크기 22,043,225바이트 (약22.04MB). 테스트 전용 컴포넌트/음성 자산/소형 테스트 모델은 최종 APK에서 제외했습니다.
폰 플러그인은 기존 0.6.0을 그대로 사용합니다. API 호환 버전 0.6.0 유지. 글라스 GMP도 변경되지 않았습니다. 함께 제공한 파일은 기존 플러그인의 동일 사본입니다.

소형 엔진 검증 모델 원본: https://huggingface.co/ggml-org/models-moved/blob/main/tinyllamas/stories15M-q4_0.gguf (SHA256 66967fbece6dbe97886593fdbb73589584927e29119ec31f08090732d1861739). 채팅 템플릿 메타데이터를 붙인 별도 테스트 사본으로만 시험했으며 제품에 포함하지 않습니다.
'''
Path('dist/memo-conversation-assist-0.7.0/README.md').write_text(notes,encoding='utf-8')
with Path('CONVERSATION_ASSIST.md').open('a',encoding='utf-8') as f:f.write('\n\n'+notes)
