from pathlib import Path
import subprocess
r=subprocess.run(['adb','-s','R3CY10PW8KD','exec-out','screencap','-p'],capture_output=True,check=True)
p=Path('output/conversation-assist/minutes-cards-090.png');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(r.stdout)
