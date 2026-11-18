from pathlib import Path
import subprocess,xml.etree.ElementTree as E
adb=['adb','-s','R3CY10PW8KD']
subprocess.run(adb+['shell','am','force-stop','com.mcnex.conversation'],check=True)
r=subprocess.run(adb+['exec-out','run-as','com.mcnex.conversation','cat','shared_prefs/ai-models.xml'],capture_output=True,check=True)
tree=E.fromstring(r.stdout)
for item in tree:
 if item.get('name')=='selected':item.text='litertlm'
p=Path('integrations/conversation-assist/model-selection-restore.xml');p.write_bytes(E.tostring(tree,encoding='utf-8',xml_declaration=True))
subprocess.run(adb+['push',str(p),'/data/local/tmp/memo-model-selection.xml'],check=True)
subprocess.run(adb+['shell','chmod','644','/data/local/tmp/memo-model-selection.xml'],check=True)
subprocess.run(adb+['shell','run-as','com.mcnex.conversation','cp','/data/local/tmp/memo-model-selection.xml','shared_prefs/ai-models.xml'],check=True)
subprocess.run(adb+['shell','rm','-f','/data/local/tmp/memo-model-selection.xml'],check=True)
