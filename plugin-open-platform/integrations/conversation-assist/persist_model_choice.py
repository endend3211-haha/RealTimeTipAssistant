from pathlib import Path
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/MeetingManager.java');s=p.read_text(encoding='utf-8').replace('.putString("selected",kind).apply();','.putString("selected",kind).commit();');p.write_text(s,encoding='utf-8')
