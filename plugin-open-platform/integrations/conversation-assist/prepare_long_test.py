from pathlib import Path
import wave
r=Path('integrations/conversation-assist/android/debug');model=Path('integrations/conversation-assist/streaming/sherpa-onnx-streaming-zipformer-korean-2024-06-16-mobile/test_wavs')
parts=[]
for i in range(4):
 with wave.open(str(model/(str(i)+'.wav'))) as w:parts.append(w.readframes(w.getnframes())+bytes(32000))
(r/'assets/korean-long-probe.pcm').write_bytes(b''.join(parts)*6)
p=r/'ContinuousPipelineProbe.java';s=p.read_text(encoding='utf-8').replace('open("korean-probe.pcm")','open("korean-long-probe.pcm")').replace('for(int i=0;i<3;i++){all.write(source);all.write(new byte[32000]);}','all.write(source);').replace('>30000','>audio.length*1000L/32000+15000')
s=s.replace('int offset=0,packetCount=0,partialChanges=0;', '''Thread aiWork=new Thread(()->{try{Thread.sleep(15000);long begin=SystemClock.elapsedRealtime();try(LiteAi ai=new LiteAi(new java.io.File(getTargetContext().getFilesDir(),"model.litertlm"),getTargetContext().getCacheDir())){String help=ai.explain("역광 카메라에서 HDR 처리 방법을 검토합니다.","자동 대화 도움","assist");try(FileOutputStream f1=getTargetContext().openFileOutput("concurrent-ai-probe.json",0)){f1.write(new JSONObject().put("elapsedMs",SystemClock.elapsedRealtime()-begin).put("result",help).toString().getBytes("UTF-8"));}}}catch(Exception ignored){}},"parallel-ai-probe");aiWork.start();
  int offset=0,packetCount=0,partialChanges=0;''')
p.write_text(s,encoding='utf-8')
