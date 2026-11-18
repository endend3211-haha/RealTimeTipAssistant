from pathlib import Path
import hashlib,subprocess,json
name='Qwen3-0.6B_dynamic_wi4b32_afp32.litertlm'
p=Path('integrations/conversation-assist/models')/(name+'.part')
expected='bf1aba9ce8d963124407353c6aa4cbf72eba78db21ae133de983eac672ce83e0'
assert p.stat().st_size==343490560
with p.open('rb') as f:
 assert f.read(8)==b'LITERTLM'
with p.open('rb') as f: actual=hashlib.file_digest(f,'sha256').hexdigest()
assert actual==expected,'Download checksum mismatch'
final=p.with_name(name);p.replace(final)
adb=['adb','-s','R3CY10PW8KD'];target='/sdcard/Download/'+name
subprocess.run(adb+['push',str(final),target],check=True)
r=subprocess.run(adb+['shell','sha256sum',target],capture_output=True,check=True)
assert r.stdout.decode().split()[0]==expected,'Phone checksum mismatch'
record={'file':name,'phonePath':target,'bytes':final.stat().st_size,'sha256':actual,'phoneVerified':True,'source':'https://huggingface.co/litert-community/Qwen3-0.6B','importedIntoApp':False}
Path('integrations/conversation-assist/models/qwen-download-verified.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print(json.dumps(record,indent=2))
