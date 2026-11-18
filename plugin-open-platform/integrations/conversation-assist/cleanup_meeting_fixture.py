from pathlib import Path
import subprocess,json,re
adb=['adb','-s','R3CY10PW8KD']
try:report=json.loads(subprocess.check_output(adb+['shell','run-as','com.mcnex.conversation','cat','files/meeting-feature-probe.json']).decode('utf-8'))
except Exception:report={}
for key in ['id','other']:
 ident=report.get(key,'')
 if not re.fullmatch('[a-f0-9-]{36}',ident):continue
 path='files/meetings/'+ident
 meta=json.loads(subprocess.check_output(adb+['shell','run-as','com.mcnex.conversation','cat',path+'/meta.json']).decode('utf-8'))
 if meta.get('testFixture') is True:
  subprocess.run(adb+['shell','run-as','com.mcnex.conversation','rm','-r',path],check=True)
  print('Removed own synthetic fixture',ident)
subprocess.run(adb+['shell','run-as','com.mcnex.conversation','touch','files/meeting-probe.done'])
