from pathlib import Path
import shutil,zipfile,json
root=Path.cwd();out=root/'dist/memo-conversation-assist-0.2.0';out.mkdir(exist_ok=True)
shutil.copyfile(root/'integrations/conversation-assist/android/build/outputs/apk/debug/MemoConversationAssist-debug.apk',out/'MemoConversationAssist-0.2.0.apk')
shutil.copyfile(root/'dist/MemoConversationAssist-0.2.0.mmpkg',out/'MemoConversationAssist-0.2.0.mmpkg')
old=root/'dist/memo-conversation-assist-0.1.1'
for p in old.iterdir():
 if p.is_file() and (p.name.startswith('conversation_assist_glass.') or p.name=='manifest.json'):shutil.copyfile(p,out/p.name)
shutil.copytree(old/'licenses',out/'licenses',dirs_exist_ok=True)
doc='''# 0.2.0 — 連続 자막 갱신 버전

## 반드시 업데이트할 파일

1. MemoConversationAssist-0.2.0.apk를 기존 보조 앱 위에 업데이트 설치합니다. 삭제 후 재설치하지 마세요. 기존 Gemma 모델과 연결 키를 유지합니다.
2. Studio에서 폰 플러그인을 MemoConversationAssist-0.2.0.mmpkg로 업데이트한 뒤 종료·재시작합니다.
3. 글라스 GMP와 인접 manifest.json은 기존 버전 그대로 사용합니다.
4. 보조 앱에서 서비스 시작 → 폰 플러그인 연결 확인 → 듣기 시작. 모델 준비 완료 후 녹음 채널을 엽니다.

## 변경점

- 6초 수집을 2초(20ms 프레임 100개)로 단축. 녹음을 멈추지 않고 다음 구간을 계속 받아 처리합니다.
- Whisper small Q5_1에서 경량 base Q5_1 다국어 모델로 변경. 공식 배포처 LFS SHA256과 다운로드 파일 일치 확인: 422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898, 59,707,625 bytes. APK에 포함하므로 별도 다운로드 불필요.
- 인식 엔진을 빔 탐색 5개에서 greedy 1개, 최대 출력 64토큰, 최대 CPU 4스레드로 변경. 한국어로 고정합니다.
- 최초 음성이 들어오기 전에 /prepare로 모델을 준비하여 첫 자막에 모델 로딩 시간을 더하지 않도록 구성했습니다. 모델 준비 자체의 대기 시간은 남습니다.
- 실제 수신 음성 시간과 인식 상태 표시. 8초 동안 음성이 안 들어오면 ‘안경 음성 수신 대기’ 안내.
- 네이티브 Gecko 음성 채널용 ws://127.0.0.1:* CSP 허용 유지.
- 상·중·하 설정 없이 단어 후보 → 사전 또는 로컬 AI 설명 기능 유지. 설명 중에 듣기를 의도적으로 멈추지 않습니다.

## 지연·정확도에 대한 한계

**매 단어가 즉시 표시되는 스트리밍 디코더가 아닙니다.** 2초 구간마다 인식 결과를 갱신하며 실제 표시 지연에는 음성인식 시간, 대기열, 안경 전송 시간이 추가됩니다. 2초 이내 표시를 보장하지 않습니다. 짧은 구간과 경량 모델·greedy 탐색은 인식 정확도에 영향을 줄 수 있으며 구간 경계에서 단어가 잘릴 수 있습니다.

처리 속도가 음성 속도를 따라가지 못해 큐가 두 구간을 초과하면 중단하고 안내합니다. 음성 데이터를 몰래 버려 빠르게 보이게 하지 않습니다. 호스트의 백그라운드/화면 꺼짐/블루투스 정책에 따라 중단될 수 있습니다.

## 검증

- 음성 분할·프레임 경계·꼬리 flush·중단 시 데이터 폐기·CSP 등 Node 테스트 7개 통과.
- ARM64 네이티브 Whisper 엔진, Android APK, 폰 MMPKG 빌드 통과.
- APK 안의 모델·네이티브 라이브러리와 버전 메타데이터 확인.
- 이 수정 시점에 휴대폰 ADB 연결이 없어 새 엔진의 실기기 로딩·실제 말소리 정확도·연속 처리 속도·안경 표시는 미검증입니다. 이전 0.1.x의 무음 디코딩·Gemma 설명 성공 결과를 이 버전의 전체 동작 검증으로 간주하지 않습니다.

실제 안경과 폰에서 수신 시간이 증가하는지 먼저 확인하세요. 수신 시간은 증가하지만 자막이 없으면 인식 단계, 수신 시간 자체가 없으면 녹음/연결 단계를 확인해야 합니다.
'''.replace('連続','연속')
(out/'README.md').write_text(doc,encoding='utf-8')
p=root/'CONVERSATION_ASSIST.md';s=p.read_text(encoding='utf-8')+'\n\n'+doc;p.write_text(s,encoding='utf-8')
with zipfile.ZipFile(out/'MemoConversationAssist-0.2.0.apk') as z:
 names=z.namelist();assert 'assets/ggml-base-q5_1.bin' in names;assert 'assets/ggml-small-q5_1.bin' not in names;assert 'lib/arm64-v8a/libmemo-whisper.so' in names
print(json.dumps({p.name:p.stat().st_size for p in out.iterdir() if p.is_file()},ensure_ascii=False))
