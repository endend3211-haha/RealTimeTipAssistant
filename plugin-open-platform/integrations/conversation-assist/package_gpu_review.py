from pathlib import Path
import json,subprocess,zipfile
r=subprocess.run(['adb','-s','R3CY10PW8KD','exec-out','run-as','com.mcnex.conversation','cat','files/gpu-benchmark.json'],capture_output=True,check=True)
report=json.loads(r.stdout);assert report['ok'];Path('integrations/conversation-assist/gpu-device-verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
p=Path('dist/memo-conversation-assist-0.8.0/MemoConversationAssist-0.8.0.apk')
with zipfile.ZipFile(p) as z:
 assert 'lib/arm64-v8a/libggml-opencl.so' in z.namelist()
 assert 'lib/arm64-v8a/libggml-cpu.so' in z.namelist()
 assert 'lib/arm64-v8a/libOpenCL.so' not in z.namelist()
 assert not any(n.startswith('assets/') and ('probe' in n.lower() or n.endswith('.gguf')) for n in z.namelist())
 for n in z.namelist():
  if n.endswith('.dex'):assert b'GpuBenchmarkProbe' not in z.read(n)
notes=f'''# Memo 회의 0.8.0 — GGUF OpenCL GPU 검토·지원

사용자 SM-S936N에서 QUALCOMM Adreno(TM) 830을 확인하고 EXAONE-3.5-2.4B-Instruct-Q4_K_M.gguf의 OpenCL GPU 가속을 검증했습니다. 기존 CPU 및 LiteRT-LM 지원은 유지합니다. CPU/GPU 백엔드를 별도로 로딩하므로 CPU 사용 시 OpenCL 초기화는 하지 않습니다. GPU가 없는 기기에서는 CPU를 선택합니다. GPU 요청 실패를 CPU 성공으로 숨기는 자동 대체는 하지 않습니다.

## 사용
설정 → AI 모델 관리 → 사용할 모델 선택 → GGUF.
같은 관리 메뉴 → GGUF 연산 장치 · CPU / GPU → GPU · OpenCL / Adreno.
‘선택 모델 응답 테스트’로 준비·생성 시간을 확인합니다. 처음에는 준비에 시간이 걸립니다. 테스트 후 모델을 유지하면 다음 도움말은 이미 로딩된 모델로 처리합니다. 기본 모델 Gemma, GGUF 기본 연산 CPU는 유지했습니다.
모델·장치 변경은 기존 모델을 해제하며 AI 작업 중에는 변경을 막습니다. 변경 후 다음 요청에서 새 모델을 로딩합니다.

## 실기기 결과 (동일 고정 질문, 출력 제한 128토큰)
| 시험 | CPU 생성 | GPU 준비 | GPU 생성 | GPU 반복 생성 |
|---|---:|---:|---:|---:|
| 첫 시험 | 18.884초 | 41.809초 | 6.473초 | 4.358초 |
| 재시험 | 20.927초 | 7.547초 | 6.258초 | 3.135초 |

모델 로딩과 응답 생성을 나눠 측정했습니다. GPU의 첫 준비에는 커널 준비 등이 포함됩니다. 기기·드라이버 캐시 상태에 따라 재실행 준비 시간도 달라집니다. 숫자는 한 고정 질의 시험이며 일반적인 배속이나 장시간 성능 보장이 아닙니다. GPU/CPU 응답 문구가 약간 달랐으므로 토큰당 처리량의 정밀 비교도 아닙니다.
GPU 종료 후 CPU로 다시 로딩·응답 성공(28.622초), 이어 LiteRT-LM 한국어 응답 성공(준비 포함 7.897초). 실제 장시간 자막 동시 실행, 발열·배터리·백그라운드 안정성 시험은 별도입니다.

## 배포
APK {p.stat().st_size:,}바이트. 테스트 컴포넌트와 소형 테스트 모델은 최종 APK에서 제외했습니다. 사용자 EXAONE/Gemma 파일과 회의 자료는 유지합니다.
폰 플러그인 0.6.0과 기존 글라스 GMP를 그대로 사용합니다. 함께 제공한 파일도 같은 사본입니다. 외부 API·서버는 사용하지 않습니다.

## 빌드
llama.cpp의 OpenCL/Adreno 커널, Release -O3, GGML_BACKEND_DL. Android NDK26.3/CMake3.22.1. Windows에서는 PYTHONUTF8=1을 설정하고 Gradle assembleDebug를 실행합니다. gpu-build/OpenCL-Headers는 Khronos 공개 헤더, gpu-build/libOpenCL.so는 해당 휴대폰 /vendor/lib64/libOpenCL.so의 로컬 링크 참조입니다. 제조사 라이브러리는 소스 공유 대상 및 APK에서 제외했습니다. APK는 휴대폰에 설치된 시스템 OpenCL 라이브러리를 사용합니다.
검증: Android JUnit7개 통과, 실제 GPU 추론/CPU 복귀/LiteRT-LM 호환 확인. 상세 원본은 integrations/conversation-assist/gpu-device-verified.json 및 gpu-first-run-timings.json.
'''
Path('dist/memo-conversation-assist-0.8.0/README.md').write_text(notes,encoding='utf-8')
with Path('CONVERSATION_ASSIST.md').open('a',encoding='utf-8') as f:f.write('\n\n'+notes)
print('APK bytes:',p.stat().st_size)
