from pathlib import Path
import subprocess,json
r=Path('output/conversation-assist');r.mkdir(parents=True,exist_ok=True)
(r/'apk-home.png').write_bytes(subprocess.check_output(['adb','-s','R3CY10PW8KD','exec-out','screencap','-p']))
raw=subprocess.check_output(['adb','-s','R3CY10PW8KD','shell','run-as','com.mcnex.conversation','cat','files/meeting-feature-probe.json'])
Path('integrations/conversation-assist/meeting-device-test.json').write_bytes(raw)
print(r/'apk-home.png')
