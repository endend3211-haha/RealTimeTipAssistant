import zipfile,struct,json,sys
from pathlib import Path
apk=Path(sys.argv[1]) if len(sys.argv)>1 else Path('integrations/conversation-assist/android/build/outputs/apk/debug/MemoConversationAssist-debug.apk')
report=[]
with zipfile.ZipFile(apk) as z:
 for name in z.namelist():
  if not name.startswith('lib/') or not name.endswith('.so'):continue
  b=z.read(name);assert b[:6]==b'\x7fELF\x02\x01',name
  phoff=struct.unpack_from('<Q',b,32)[0];entry,count=struct.unpack_from('<HH',b,54)
  load=[];relro=[]
  for i in range(count):
   t,flags,off,va,pa,fs,ms,align=struct.unpack_from('<IIQQQQQQ',b,phoff+i*entry)
   if t==1:
    assert align>=16384 and (va-off)%16384==0,(name,'LOAD',hex(align))
    load.append(align)
   if t==0x6474e552:
    assert (va+ms)%16384==0,(name,'RELRO',hex((va+ms)%16384))
    relro.append(0)
  assert load,name
  report.append({'library':name,'loadAlignments':load,'relroRemainders':relro,'ok':True})
print(json.dumps(report,ensure_ascii=False,indent=2))
Path('integrations/conversation-assist/elf-16kb-verified.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
