import zipfile,struct
with zipfile.ZipFile('dist/memo-conversation-assist-0.8.0/MemoConversationAssist-0.8.0.apk') as z:
 for n in z.namelist():
  if not n.endswith('.so'):continue
  b=z.read(n);phoff=struct.unpack_from('<Q',b,32)[0];size,count=struct.unpack_from('<HH',b,54)
  loads=[];relro=[]
  for i in range(count):
   t,flags,off,va,pa,fs,ms,align=struct.unpack_from('<IIQQQQQQ',b,phoff+i*size)
   if t==1:loads.append(hex(align))
   if t==0x6474e552:relro.append(hex((va+ms)%16384))
  print(n,'LOAD',loads,'RELRO end remainder',relro)
