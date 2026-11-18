from pathlib import Path
import shutil
r=Path('integrations/conversation-assist/android')
s=Path('integrations/gemini-loopback-android/build.py').read_text(encoding='utf-8')
s=s.replace('"CN=MemoMind Gemini Development"','"CN=Memo Conversation Development"').replace('gemini-loopback-bridge-1.2.0.apk','MemoConversationAssist-0.1.0.apk')
s=s.replace('DIST = ROOT.parents[1] / "dist"','DIST = ROOT.parents[2] / "dist"')
s=s.replace('archive.write(BUILD / "dex/classes.dex", "classes.dex")','archive.write(BUILD / "dex/classes.dex", "classes.dex")\n        for base, prefix in [(ROOT / "libs", "lib"), (ROOT / "assets", "assets")]:\n            for path in base.rglob("*"):\n                if path.is_file(): archive.write(path, prefix + "/" + path.relative_to(base).as_posix())')
(r/'build.py').write_text(s,encoding='utf-8')
for src,dst in [('GlassSDK/examples/stock_watch_glass/plugin.c','GlassSDK/examples/conversation_assist_glass/plugin.c')]:shutil.copyfile(src,dst)
