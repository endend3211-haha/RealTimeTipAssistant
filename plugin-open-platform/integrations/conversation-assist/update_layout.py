from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/style.css');s=p.read_text(encoding='utf-8');s+='\ninput[type=checkbox]{display:inline-block;width:auto;margin:0 8px 0 0;vertical-align:middle}\n';p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8').replace("entries.slice(-3).map(e=>e.text)","entries.slice(-2).reverse().map(e=>e.text)");p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/device_smoke.py');s=p.read_text(encoding='utf-8').replace('print(json.dumps(report,ensure_ascii=False),flush=True)','print(json.dumps(report,ensure_ascii=True),flush=True)');p.write_text(s,encoding='utf-8')
