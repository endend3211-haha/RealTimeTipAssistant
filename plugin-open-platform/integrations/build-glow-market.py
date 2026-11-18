from pathlib import Path
import shutil, json, hashlib

ROOT = Path(__file__).resolve().parents[1]
sources = [ROOT/'PhoneSDK/examples'/n for n in ('life-desk','news-reader','stock-watch')]
snapshot = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for d in sources for p in d.rglob('*') if p.is_file()}
out = ROOT/'PhoneSDK/examples/glow-market'
if out.exists():
    raise SystemExit('Output already exists; edit the separate plugin directly.')
shutil.copytree(sources[0], out)
for name, source in [('news',sources[1]),('stocks',sources[2])]:
    shutil.copytree(source,out/name)
    (out/name/'manifest.json').unlink()
manifest=json.loads((out/'manifest.json').read_text('utf-8'))
manifest.update(id='com.mcnex.glow-market.phone',name='Glow 뉴스 · 주식',version='1.0.0')
manifest['permissions']=[p for p in manifest['permissions'] if p['name']!='device.info']
manifest['deviceRequirements']['preferredPluginId']='com.mcnex.glow-market.glass'
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf-8')
p=out/'plugin.js'; s=p.read_text('utf-8')
s=s.replace("'태풍'", "'뉴스'").replace("'집중'", "'주식'")
s=s.replace("`${storms.length} ACTIVE`", "'HEADLINES'").replace("`${focusMinutes} MIN`", "'PORTFOLIO'")
s=s.replace("function setScreen(next) {", "function setScreen(next) {\n  if (next === 'typhoon' || next === 'focus') { location.assign(next === 'typhoon' ? './news/index.html' : './stocks/index.html'); return; }")
s=s.replace("`lifedesk:${key}`", "`glow-market:${key}`")
s=s.replace("await Promise.all([fetch날씨(), fetchStorms()]);", "await fetch날씨();")
s=s.replace("text('LOADING WEATHER'", "text('날씨 불러오는 중'")
s=s.replace("toLocaleTimeString('zh-CN'", "toLocaleTimeString('ko-KR'").replace("toLocaleDateString('zh-CN'", "toLocaleDateString('ko-KR'")
# News and stock icons retain the original card geometry.
a=s.index("    ctx.beginPath(); ctx.arc(cx, cy, size * .42",s.index("name === 'typhoon'")); b=s.index("  } else if (name === 'calculator')",a)
s=s[:a]+"    strokeRoundRect(cx-size*.4, cy-size*.4, size*.8, size*.8, 3, level, 2);\n    for (let i=0;i<3;i++) line(cx-size*.25,cy-8+i*8,cx+size*.25,cy-8+i*8,level,2);\n"+s[b:]
a=s.index("    ctx.beginPath(); ctx.arc(cx, cy, size * .4",s.index("name === 'focus'"));b=s.index("  } else if (name === 'clock')",a)
s=s[:a]+"    line(cx-size*.4,cy+size*.3,cx-size*.4,cy-size*.4,level,2);\n    line(cx-size*.4,cy+size*.3,cx+size*.4,cy+size*.3,level,2);\n    line(cx-size*.3,cy+size*.1,cx-size*.05,cy-size*.1,level,2);\n    line(cx-size*.05,cy-size*.1,cx+size*.1,cy,level,2);\n    line(cx+size*.1,cy,cx+size*.4,cy-size*.3,level,2);\n"+s[b:]
s += "\nfor (const [id,app] of [['openNews','typhoon'],['openStocks','focus']]) document.getElementById(id).onclick=()=>setScreen(app);\n"
p.write_text(s,'utf-8')
p=out/'index.html';s=p.read_text('utf-8').replace('zh-CN','ko').replace('Glow OS','Glow 뉴스 · 주식').replace('https://www.gdacs.org','https://memo-public-news-relay.plaincoach2.chatgpt.site https://memo-naver-stock-relay.majorfacet1.chatgpt.site').replace('날씨 및 태풍 데이터 불러오는 중','뉴스 · 주식 · 날씨').replace('</section>','</section>',1)
s=s.replace('<section class="guide-card">','<section class="guide-card"><div class="input-row"><button id="openNews" type="button">뉴스 열기</button><button id="openStocks" type="button">주식 열기</button></div>')
p.write_text(s,'utf-8')
for name in ('news','stocks'):
    p=out/name/'index.html';s=p.read_text('utf-8').replace('<body>','<body><nav class="glow-navigation"><a href="../index.html">⌂ Glow 홈</a><span>안경 버튼 길게: 홈</span></nav>')
    p.write_text(s,'utf-8')
    p=out/name/'style.css';p.write_text(p.read_text('utf-8')+'\n.glow-navigation{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#101a15;color:#b4c4bb;font:13px system-ui}.glow-navigation a{color:#70ee9c;text-decoration:none;font-weight:700}\n','utf-8')
    p=out/name/'plugin.js';s=p.read_text('utf-8')
    if name=='news':
        s=s.replace("else if(['long','very_long'].includes(a))home();", "else if(['long','very_long'].includes(a))location.assign('../index.html');")
        s=s.replace("두 번: 목록'", "두 번: 목록 · 길게: 홈'")
        # Consistent teardown for both native WebView and Studio navigation.
        s += "\nwindow.addEventListener('pagehide',()=>{suspended=true;cancel();if(subscription)void gm.device.unsubscribeEvents(subscription).catch(()=>{});gm.close();});\n"
    else:
        s=s.replace("if(action==='long'||action==='very_long'){mode='list';draw();return;}", "if(action==='long'||action==='very_long'){location.assign('../index.html');return;}")
        s=s.replace('길게: 목록','길게: 홈').replace('두 번: 열기\'', '두 번: 열기 · 길게: 홈\'')
        s=s.replace("await gm.device.subscribeEvents(['button','connection'])", "await gm.device.subscribeEvents(['button','imuGesture','connection'])")
        s += "\nlet headArmed=true,lastHead=0;gm.device.onGesture(e=>{if(e.active===false){headArmed=true;return;}if(!headArmed||performance.now()-lastHead<800||busy||suspended)return;const g=String(e.gesture).toLowerCase();const delta=['headraise','up','head_raise','7','left'].includes(g)?-1:['headlower','down','head_lower','8','right'].includes(g)?1:0;if(!delta)return;headArmed=false;lastHead=performance.now();if(mode==='list')selected=(selected+delta+watch.length)%Math.max(1,watch.length);else focus=(focus+delta+3)%3;draw();});\n"
    p.write_text(s,'utf-8')
glass=ROOT/'GlassSDK/examples/glow_market_glass'
shutil.copytree(ROOT/'GlassSDK/examples/news_reader_glass',glass)
p=glass/'manifest.json';m=json.loads(p.read_text('utf-8'));m.update(id='com.mcnex.glow-market.glass',name='Glow 뉴스 주식 Glass');p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n','utf-8')
report=ROOT/'output/glow-market';report.mkdir(parents=True,exist_ok=True)
(report/'original-sha256.json').write_text(json.dumps(snapshot,indent=2),'utf-8')
assert all(hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h for p,h in snapshot.items())
print('Separate phone and glass sources created; originals unchanged:',len(snapshot),'files')
