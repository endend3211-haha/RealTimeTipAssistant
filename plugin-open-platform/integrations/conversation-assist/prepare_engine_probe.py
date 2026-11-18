from pathlib import Path
import struct,hashlib
p=Path('integrations/conversation-assist/stories15M-test.gguf');data=p.read_bytes()
assert hashlib.sha256(data).hexdigest()=='66967fbece6dbe97886593fdbb73589584927e29119ec31f08090732d1861739'
pos=24; alignment=32
nt,nk=struct.unpack_from('<QQ',data,8)
def u32():
 global pos
 v=struct.unpack_from('<I',data,pos)[0];pos+=4;return v
def u64():
 global pos
 v=struct.unpack_from('<Q',data,pos)[0];pos+=8;return v
def string():
 global pos
 n=u64();v=data[pos:pos+n];pos+=n;return v
def value(t):
 global pos
 sizes={0:1,1:1,2:2,3:2,4:4,5:4,6:4,7:1,10:8,11:8,12:8}
 if t==8:return string()
 if t==9:
  sub=u32();n=u64()
  for _ in range(n):value(sub)
 else:
  n=sizes[t];v=int.from_bytes(data[pos:pos+n],'little');pos+=n;return v
for _ in range(nk):
 key=string();t=u32();v=value(t)
 if key==b'general.alignment':alignment=v
kv_end=pos
for _ in range(nt):
 string();n=u32();pos+=n*8+4+8
old_data=(pos+alignment-1)//alignment*alignment
key=b'tokenizer.chat_template';val=b'chatml'
entry=struct.pack('<Q',len(key))+key+struct.pack('<IQ',8,len(val))+val
head=bytearray(data[:kv_end]+entry+data[kv_end:pos]);struct.pack_into('<Q',head,16,nk+1)
head+=b'\0'*((-len(head))%alignment)
Path('integrations/conversation-assist/stories15M-chat-test.gguf').write_bytes(head+data[old_data:])
b=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
p=b/'MeetingManager.java';s=p.read_text(encoding='utf-8').replace('try{if(!modelFile(kind).isFile())','try{if(!queued.isEmpty())throw new IOException("회의록 생성 완료 후 모델을 변경하세요");if(!modelFile(kind).isFile())').replace('try{synchronized(this){if(selectedModel().equals(kind)', 'try{if(!queued.isEmpty())throw new IOException("회의록 생성 완료 후 모델을 등록하세요");synchronized(this){if(selectedModel().equals(kind)');p.write_text(s,encoding='utf-8')
p=b/'MainActivity.java';s=p.read_text(encoding='utf-8');s=s.replace('.setTitle("AI 모델 관리").setMessage("선택: "+manager.modelName()+"\\n\\n두 형식을 각각 보관하며 한 번에 하나만 실행합니다. 자막 인식은 별도로 계속됩니다.").setPositiveButton("메뉴",(d,w)->new AlertDialog.Builder(this).setTitle("AI 모델 관리").setItems(actions,', '.setTitle("AI 모델 · "+manager.modelName()).setItems(actions,').replace('else testModel();}).setNegativeButton("닫기",null).show()).setNegativeButton("닫기",null).show();}', 'else testModel();}).setNegativeButton("닫기",null).show();}');p.write_text(s,encoding='utf-8')
