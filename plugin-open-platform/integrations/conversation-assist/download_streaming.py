from pathlib import Path
import urllib.request,tarfile,concurrent.futures
r=Path('integrations/conversation-assist/streaming');r.mkdir(exist_ok=True)
def get(url,name):
 p=r/name
 urllib.request.urlretrieve(url,p)
 print(name,p.stat().st_size,flush=True)
 return p
with concurrent.futures.ThreadPoolExecutor(2) as ex:
 jobs=[ex.submit(get,'https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-2.0.1.aar','sherpa-onnx-2.0.1.aar'),ex.submit(get,'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-korean-2024-06-16-mobile.tar.bz2','korean-mobile.tar.bz2')]
 for j in jobs:j.result()
with tarfile.open(r/'korean-mobile.tar.bz2') as t:t.extractall(r,filter='data')
