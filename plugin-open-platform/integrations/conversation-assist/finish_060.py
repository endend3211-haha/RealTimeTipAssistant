from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/core.mjs')
s=p.read_text(encoding='utf-8');a=s.index('export function acceptHelp(');b=s.index('\nexport function mergeLiveTranscript',a)
s=s[:a]+'''function canonical(value){return String(value).normalize('NFKC').toLowerCase().replace(/high[\\s-]*dynamic[\\s-]*range|하이\\s*다이내믹\\s*레인지/g,'hdr').replace(/optical[\\s-]*image[\\s-]*stabili[sz]ation|광학식?\\s*손떨림\\s*보정/g,'ois').replace(/electronic[\\s-]*image[\\s-]*stabili[sz]ation|전자식?\\s*손떨림\\s*보정/g,'eis').replace(/[^a-z0-9가-힣]/g,'');}
function similar(a,b){if(a===b)return true;if(Math.min(a.length,b.length)<16)return false;const grams=s=>new Set(Array.from({length:s.length-2},(_,i)=>s.slice(i,i+3))),x=grams(a),y=grams(b);let hit=0;for(const v of x)if(y.has(v))hit++;return hit/Math.max(x.size,y.size)>=.78;}
export function sessionEntries(entries,session){return session?entries.filter(e=>typeof e.id==='string'&&e.id.startsWith(session+':')):[];}
export function acceptHelp(help,seen,now=Date.now()){
 if(!help||!['term','reply'].includes(help.kind)||typeof help.topic!=='string'||!help.topic.trim()||typeof help.text!=='string'||!help.text.trim())return false;
 const topic=canonical(help.topic),text=canonical(help.text);if(!topic||!text)return false;
 for(const [key,value] of seen){if(key===topic||canonical(value?.topic||key.replace(/^(term|reply):/,''))===topic||typeof value==='object'&&similar(canonical(value.text||''),text))return false;}
 seen.set(topic,{topic:help.topic,text:help.text,at:now});return true;
}
''' + s[b:];p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8').replace('helpPopupFrame} from','helpPopupFrame,sessionEntries} from').replace("let popup=null,popupTimer=null;","let popup=null,popupTimer=null,displaySession='',helpMeeting='';\nfunction visibleEntries(){return sessionEntries(entries,displaySession);}\nasync function helpScope(id){if(id===helpMeeting)return;helpMeeting=id;explainedTerms.clear();await persistHelp();}\nfunction persistHelp(){const value={meeting:helpMeeting,items:[...explainedTerms]};saveChain=saveChain.catch(()=>{}).then(()=>gm.storage.set('conversation.helpSeen.v2',value));return saveChain;}")
s=s.replace('0.5.0','0.6.0')
s=s.replace("if(!connected)await check();starting=true;try{", "starting=true;displaySession='';captureSession='';liveState={entries,partial:'',revision:-1};answer='';answerTerm='';popup=null;clearTimeout(popupTimer);explainGeneration++;lastExplainAt=0;lastExplainText='';screen='caption';pageIndex=0;$('answer').textContent='';draw();try{if(!connected)await check();")
s=s.replace("captureSession=prepared.session;liveState=", "captureSession=prepared.session;displaySession=prepared.session;await helpScope(prepared.meeting?.activeId||prepared.session);liveState=")
s=s.replace("recentContext(entries)+'\\n'", "recentContext(visibleEntries())+'\\n'")
s=s.replace("mode:'assist'}", "mode:'assist',avoidTopics:[...explainedTerms.values()].slice(-12).map(v=>v.topic).filter(Boolean)}")
s=s.replace("answer=data.text;answerTerm=", "await persistHelp();answer=data.text;answerTerm=")
s=s.replace("[...entries.slice(-2).map", "[...visibleEntries().slice(-2).map")
s=s.replace("answerTerm='';explainedTerms.clear();", "answerTerm='';popup=null;clearTimeout(popupTimer);")
s=s.replace("ready=true;history();", "const seen=await gm.storage.get('conversation.helpSeen.v2');const saved=seen?.value??seen;if(saved&&typeof saved.meeting==='string'&&Array.isArray(saved.items)){helpMeeting=saved.meeting;for(const item of saved.items)if(Array.isArray(item)&&typeof item[0]==='string'&&item[1]&&typeof item[1].topic==='string'&&typeof item[1].text==='string')explainedTerms.set(item[0],item[1]);}ready=true;history();")
p.write_text(s,encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/manifest.json');p.write_text(p.read_text(encoding='utf-8').replace('0.5.0','0.6.0'),encoding='utf-8')
p=Path('PhoneSDK/examples/conversation-assist/core.test.mjs');s=p.read_text(encoding='utf-8').replace('helpPopupFrame} from','helpPopupFrame,sessionEntries} from');s+='''\ntest('help dedup survives long meetings, aliases and persisted state',()=>{const seen=new Map();assert.ok(acceptHelp({kind:'term',topic:'HDR',text:'밝고 어두운 부분을 함께 표현합니다.'},seen,1));const restored=new Map(JSON.parse(JSON.stringify([...seen])));assert.equal(acceptHelp({kind:'reply',topic:'High Dynamic Range',text:'다른 표현'},restored,7200000),false);assert.equal(acceptHelp({kind:'term',topic:'영상 밝기',text:'밝고 어두운 부분을 함께 표현합니다.'},restored,7200000),false);assert.ok(acceptHelp({kind:'term',topic:'GPU',text:'그래픽 연산을 처리하는 장치입니다.'},restored,7200000));});
test('new display sessions hide prior captions without erasing archive cache',()=>{const entries=[{id:'old:0',text:'이전 회의'},{id:'new:0',text:'새 회의'}];assert.deepEqual(sessionEntries(entries,''),[]);assert.deepEqual(sessionEntries(entries,'new').map(e=>e.text),['새 회의']);assert.equal(entries.length,2);});
''';p.write_text(s,encoding='utf-8')
