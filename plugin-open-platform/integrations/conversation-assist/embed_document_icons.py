from pathlib import Path
import json
base=Path('integrations/conversation-assist/document-icons');mapping={'summary':'file-text','check':'check-check','tasks':'list-todo','question':'circle-help','notes':'messages-square'}
parts=['package com.mcnex.conversation;\nfinal class DocumentIcons {static String svg(String kind){switch(kind){']
for key,name in mapping.items():
 p=base/(name+'.svg');assert p.exists(),p
 parts.append('case '+json.dumps(key)+':return '+json.dumps(p.read_text(encoding='utf-8'),ensure_ascii=False)+';')
parts.append('default:return "";}}}\n')
Path('integrations/conversation-assist/android/src/com/mcnex/conversation/DocumentIcons.java').write_text(''.join(parts),encoding='utf-8')
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/MinutesDocument.java');s=p.read_text(encoding='utf-8').replace('.num{font-size:', 'h2 svg{width:20px;height:20px;vertical-align:-4px;margin-right:9px;color:#48633e}.num{font-size:');s=s.replace('.append("</span>").append(escape(section.title))', '.append("</span>").append(DocumentIcons.svg(MinutesCards.icon(section.title))).append(escape(section.title))');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/tests/com/mcnex/conversation/MeetingStoreTest.java');s=p.read_text(encoding='utf-8');i=s.rfind('}');s=s[:i]+''' @Test public void minutesDocumentEscapesContentAndIncludesOfflineIconsAndTasks(){String html=MinutesDocument.html("회의 <검토>","2026.11.03", "## 핵심 요약\\n<script>alert(1)</script>\\n## 실행 과제\\n시험 | 담당 미정 | 금요일");assertTrue(html.contains("회의 &lt;검토&gt;"));assertTrue(html.contains("&lt;script&gt;"));assertFalse(html.contains("<script>"));assertTrue(html.contains("<svg"));assertTrue(html.contains("<table>"));assertTrue(html.contains("@page{size:A4"));}
'''+s[i:];p.write_text(s,encoding='utf-8')
