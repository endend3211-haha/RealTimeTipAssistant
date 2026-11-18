from pathlib import Path
import json
Path('integrations/conversation-assist/gpu-first-run-timings.json').write_text(json.dumps({'device':'QUALCOMM Adreno(TM) 830','samePrompt':True,'cpuLoadMs':604,'cpuGenerateMs':18884,'openclLoadMs':41809,'openclGenerateMs':6473,'openclWarmMs':4358},indent=2),encoding='utf-8')
p=Path('.gitignore');s=p.read_text(encoding='utf-8') if p.exists() else '';line='/integrations/conversation-assist/gpu-build/libOpenCL.so';
if line not in s:p.write_text(s+'\n# Device vendor library is a local build-time link reference only.\n'+line+'\n',encoding='utf-8')
