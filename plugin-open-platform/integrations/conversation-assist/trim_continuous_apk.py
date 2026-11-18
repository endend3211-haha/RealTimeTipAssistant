from pathlib import Path
r=Path('integrations/conversation-assist/android')
backup=r/'.model-backup';backup.mkdir(exist_ok=True)
for p in list((r/'assets').glob('ggml-*.bin')):
 target=backup/p.name
 if target.exists():p.unlink()
 else:p.replace(target)
p=r/'libs/arm64-v8a/libmemo-whisper.so'
if p.exists():p.replace(backup/'libmemo-whisper.so')
p=r/'debug/EmptyManifest.xml';p.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"/>\n',encoding='utf-8')
p=r/'build.gradle';s=p.read_text(encoding='utf-8');s+='''
// Device test audio and instrumentation are opt-in; never ship them in the normal APK.
if (!project.hasProperty('includeDeviceProbes')) {
 android.sourceSets.debug.manifest.srcFile 'debug/EmptyManifest.xml'
 android.sourceSets.debug.java.setSrcDirs([])
 android.sourceSets.debug.assets.setSrcDirs([])
}
''';p.write_text(s,encoding='utf-8')
p=r/'src/com/mcnex/conversation/MainActivity.java';s=p.read_text(encoding='utf-8').replace('1. 기존 Gemma 모델 가져오기','AI 도움말용 Gemma 모델 가져오기').replace('Gemma 모델 준비됨 · ','AI 도움말 준비됨 · ').replace('모델을 가져오세요','AI 도움말 모델 미준비 · 자막은 별도로 사용 가능').replace('모델: 다운로드 폴더의 gemma-4-E2B-it.litertlm 선택','자막: 휴대폰에 설치된 한국어 인식 모델 사용\\nAI 도움말: 다운로드 폴더의 gemma-4-E2B-it.litertlm 선택');p.write_text(s,encoding='utf-8')
