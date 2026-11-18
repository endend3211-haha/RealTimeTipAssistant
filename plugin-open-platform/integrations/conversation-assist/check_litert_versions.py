import zipfile,struct
from pathlib import Path
for path in Path('integrations/conversation-assist/elf-inspect').glob('*.aar'):
 with zipfile.ZipFile(path) as z:
  n=next(n for n in z.namelist() if n.endswith('arm64-v8a/liblitertlm_jni.so'));b=z.read(n);off=struct.unpack_from('<Q',b,32)[0];size,count=struct.unpack_from('<HH',b,54)
  rows=[struct.unpack_from('<IIQQQQQQ',b,off+i*size) for i in range(count)]
  print(path.name,[(hex(r[0]),hex(r[3]),hex(r[6]),hex(r[7])) for r in rows if r[0] in (1,0x6474e552)])
