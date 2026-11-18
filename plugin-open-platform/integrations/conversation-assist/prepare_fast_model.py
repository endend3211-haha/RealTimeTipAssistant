import urllib.request,json,hashlib
from pathlib import Path
r=Path('integrations/conversation-assist/android')
url='https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin'
p=r/'assets/ggml-base-q5_1.bin'
with urllib.request.urlopen(url,timeout=60) as src,p.open('wb') as out:
 while True:
  b=src.read(1024*1024)
  if not b:break
  out.write(b)
h=hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
print(json.dumps({'bytes':p.stat().st_size,'sha256':h}))
# Verify against publisher LFS metadata before changing the application model.
with urllib.request.urlopen('https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/main?limit=1000',timeout=30) as f:items=json.load(f)
record=next(x for x in items if x['path']=='ggml-base-q5_1.bin')
assert record['lfs']['oid']==h and record['size']==p.stat().st_size,(record,h)
java=r/'src/com/memomind/companion/WhisperEngine.java'
s=java.read_text(encoding='utf-8').replace('ggml-small-q5_1.bin','ggml-base-q5_1.bin').replace('190085487L',str(p.stat().st_size)+'L').replace('ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',h).replace('Whisper small Q5_1','Whisper base Q5_1');java.write_text(s,encoding='utf-8')
backup=r/'.model-backup';backup.mkdir(exist_ok=True)
old=r/'assets/ggml-small-q5_1.bin'
if old.exists():old.replace(backup/old.name)
