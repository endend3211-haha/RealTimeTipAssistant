import subprocess,xml.etree.ElementTree as E,urllib.request,json
adb=['adb','-s','R3CY10PW8KD']
try:
 r=subprocess.run(adb+['exec-out','run-as','com.mcnex.conversation','cat','shared_prefs/connection.xml'],capture_output=True,check=True)
 root=E.fromstring(r.stdout);token=next(e.text for e in root if e.get('name')=='token')
 subprocess.run(adb+['forward','tcp:18773','tcp:18772'],capture_output=True,check=True)
 try:
  request=urllib.request.Request('http://127.0.0.1:18773/transcript',headers={'Authorization':'Bearer '+token})
  data=json.load(urllib.request.urlopen(request,timeout=3));print(json.dumps({'speechRunning':data.get('running',False)},ensure_ascii=False))
 except Exception:print('Service not responding; no active speech confirmed through endpoint')
 finally:subprocess.run(adb+['forward','--remove','tcp:18773'],capture_output=True)
except Exception:print('Service state unavailable')
