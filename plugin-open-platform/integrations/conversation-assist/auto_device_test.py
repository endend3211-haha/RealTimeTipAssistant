from pathlib import Path
exec(Path(__file__).with_name('device_smoke.py').read_text(encoding='utf-8-sig').split("assert req('/health'")[0])
print('Prepare speech model:',req('/prepare',{} )[0],flush=True)
cases=[('term','이번 카메라는 역광에서 얼굴이 어둡게 나옵니다. HDR 처리를 적용해서 밝은 배경과 어두운 얼굴의 디테일을 함께 살려야 합니다.'),('reply','동료가 질문했습니다. 카메라에서 광학식 손떨림 보정과 전자식 손떨림 보정의 차이는 무엇인가요?'),('none','안녕하세요. 오늘 점심 맛있게 드셨어요? 저는 밥을 먹었어요. 좋은 하루 보내세요.')]
reports=[]
for name,context in cases:
 start=time.monotonic();code,data=req('/explain',{'context':context,'term':'자동 대화 도움','mode':'assist'});item={'case':name,'status':code,'wallMs':round((time.monotonic()-start)*1000),'result':data};reports.append(item);print(json.dumps(item,ensure_ascii=True),flush=True);assert code==200
Path(__file__).with_name('auto-help-device.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
