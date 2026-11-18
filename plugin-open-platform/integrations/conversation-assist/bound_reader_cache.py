from pathlib import Path
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/MainActivity.java');s=p.read_text(encoding='utf-8').replace('detailDocuments.put(id+":"+tab,shown);','if(detailDocuments.size()>=4&&!detailDocuments.containsKey(id+":"+tab))detailDocuments.clear();detailDocuments.put(id+":"+tab,shown);');p.write_text(s,encoding='utf-8')
