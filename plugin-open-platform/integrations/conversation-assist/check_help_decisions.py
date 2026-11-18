from pathlib import Path
import json
p=Path('integrations/conversation-assist/help-speed-device-verified.json');d=json.loads(p.read_text(encoding='utf-8'))
for i in d['samples']:
 if i['case']=='도움 불필요 판단':print(i['model'],json.dumps(i['help'],ensure_ascii=False))
p=Path('integrations/conversation-assist/HELP_SPEED_COMPARISON.md');s=p.read_text(encoding='utf-8');s+='\n도움이 불필요한 일상 대화 사례에서 Gemma는 두 번 모두 none, EXAONE은 두 번 모두 reply를 반환했습니다. 이 사례에서는 Gemma가 불필요한 도움을 더 잘 억제했습니다. 전체 판단 품질의 일반적 우열로 확대할 수는 없습니다.\n';p.write_text(s,encoding='utf-8')
