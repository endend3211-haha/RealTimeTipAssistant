from pathlib import Path
exec(Path(__file__).with_name('device_smoke.py').read_text(encoding='utf-8-sig').split("assert req('/health'")[0])
results=[]
for term in ['HDR','CMOS','CMOS']:
 start=time.monotonic();code,data=req('/explain',{'context':'역광 카메라에서 HDR을 적용하고 CMOS 센서 기술을 검토합니다.','term':term})
 row={'term':term,'status':code,'wallMs':round((time.monotonic()-start)*1000),'timing':data.get('timing'),'text':data.get('text'),'source':data.get('source')};results.append(row);print(json.dumps(row,ensure_ascii=True),flush=True)
 assert code==200,data
Path(__file__).with_name('latency-benchmark.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
