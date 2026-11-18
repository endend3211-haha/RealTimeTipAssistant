from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/core.mjs');s=p.read_text(encoding='utf-8');s+='''
export function helpPopupFrame(start,now){const age=now-start,enter=240,hold=5000,leave=240;if(age<0||age>=enter+hold+leave)return {visible:false,y:330,alpha:0};const progress=age<enter?1-Math.pow(1-age/enter,3):age<enter+hold?1:1-Math.pow((age-enter-hold)/leave,2);return {visible:true,y:330-(330-166)*progress,alpha:Math.max(0,Math.min(1,progress)),animating:age<enter||age>=enter+hold,next:age<enter?80:age<enter+hold?enter+hold-age:80};}
''';p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8').replace('acceptHelp,mergeLiveTranscript}', 'acceptHelp,mergeLiveTranscript,helpPopupFrame}')
s=s.replace('const explainedTerms=new Map();','let popup=null,popupTimer=null;\nconst explainedTerms=new Map();')
s=s.replace("$('answer').textContent=answerTerm+'\\n'+answer;", "$('answer').textContent=answerTerm+'\\n'+answer;showHelpPopup(answerTerm,answer);")
a=s.index('function draw(){');s=s[:a]+'''function showHelpPopup(title,text){clearTimeout(popupTimer);popup={title,text,at:performance.now()};const animate=()=>{if(!popup)return;const frame=helpPopupFrame(popup.at,performance.now());if(!frame.visible){popup=null;draw();return;}draw();popupTimer=setTimeout(animate,Math.max(20,frame.next));};animate();}
function drawHelpPopup(){if(!popup)return;const f=helpPopupFrame(popup.at,performance.now());if(!f.visible)return;const x=16,y=f.y,w=528,h=112;ctx.save();ctx.globalAlpha=f.alpha;ctx.fillStyle='#111';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();if(ctx.roundRect){ctx.roundRect(x,y,w,h,12);ctx.fill();ctx.stroke();}else{ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}ctx.fillStyle='#fff';ctx.font='bold 17px sans-serif';let title=popup.title;while(ctx.measureText(title).width>490&&title.length>1)title=title.slice(0,-1);ctx.fillText(title,x+16,y+23);const body=lines(popup.text,490,'16px sans-serif');ctx.font='16px sans-serif';body.slice(0,3).forEach((line,i)=>ctx.fillText(i===2&&body.length>3?line.slice(0,-1)+'…':line,x+16,y+46+i*18));ctx.font='10px sans-serif';ctx.fillStyle='#aaa';ctx.fillText('잠시 후 자동 닫힘 · 두 번 눌러 전체 도움 보기',x+16,y+102);ctx.restore();}
''' +s[a:]
s=s.replace("const split=screen==='caption'&&Boolean(answer)&&Date.now()-answerAt<120000,perPage=split?3:6;", "const split=false,perPage=6;")
a=s.index(' if(split){');b=s.index(" ctx.fillStyle='#999';",a);s=s[:a]+s[b:]
s=s.replace('version++;if(ready&&!suspended)send();return count;', "if(screen==='caption')drawHelpPopup();version++;if(ready&&!suspended)send();return count;")
s=s.replace('clearInterval(helpTimer);clearInterval(transcriptTimer);', 'clearInterval(helpTimer);clearInterval(transcriptTimer);clearTimeout(popupTimer);')
p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/core.test.mjs');s=p.read_text(encoding='utf-8').replace('acceptHelp,mergeLiveTranscript}', 'acceptHelp,mergeLiveTranscript,helpPopupFrame}');s+='''
test('help card slides in, stays fully visible five seconds, then disappears',()=>{assert.equal(helpPopupFrame(1000,1000).alpha,0);assert.ok(helpPopupFrame(1000,1120).y>166);assert.equal(helpPopupFrame(1000,1240).y,166);assert.equal(helpPopupFrame(1000,6239).alpha,1);assert.ok(helpPopupFrame(1000,6360).alpha<1);assert.equal(helpPopupFrame(1000,6480).visible,false);});
''';p.write_text(s,encoding='utf-8')
