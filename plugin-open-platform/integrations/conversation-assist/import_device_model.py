from pathlib import Path
import subprocess
r=Path(__file__).resolve().parent
adb=['adb','-s','R3CY10PW8KD']
subprocess.run(adb+['shell','run-as','com.mcnex.conversation','mkdir','-p','files'],check=True)
with (r/'gemma-4-E2B-it.litertlm').open('rb') as f:
 subprocess.run(adb+['exec-in','run-as','com.mcnex.conversation','sh','-c','cat > files/model.litertlm'],stdin=f,check=True)
print('Existing model copied into test app private storage')
