from pathlib import Path
p=Path('PhoneSDK/examples/conversation-assist/plugin.js');s=p.read_text(encoding='utf-8');a=s.index('function draw(){');b=s.index('function send(){',a)
s=s[:a]+'''function draw(){
 ctx.fillStyle='#000';ctx.fillRect(0,0,560,320);ctx.fillStyle='#fff';ctx.font='bold 16px sans-serif';ctx.textAlign='left';ctx.fillText('MEMO / '+(screen==='explanation'?'대화 도움':'대화 자막'),18,26,220);
 const connection=suspended?'일시정지':capture?'연결됨 · 청취 중':connected?'연결됨 · 대기':'연결 확인';
 ctx.textAlign='right';ctx.font='11px sans-serif';ctx.fillStyle='#bbb';ctx.fillText(connection+(explaining?' · AI 분석 중':''),542,25,270);ctx.textAlign='left';ctx.fillStyle='#555';ctx.fillRect(18,38,524,1);ctx.fillStyle='#fff';
 const perPage=8,content=screen==='explanation'?answer:[liveState.partial,...entries.slice(-2).reverse().map(e=>e.text)].filter(Boolean).join('\\n')||'듣기 시작을 누르면\\n대화 자막이 여기에 나타납니다.';
 const wrapped=lines(content,524,'22px sans-serif'),count=Math.max(1,Math.ceil(wrapped.length/perPage));pageIndex=Math.min(pageIndex,count-1);ctx.font='22px sans-serif';wrapped.slice(pageIndex*perPage,pageIndex*perPage+perPage).forEach((line,i)=>ctx.fillText(line,18,67+i*29));
 ctx.textAlign='right';ctx.fillStyle='#999';ctx.font='10px sans-serif';ctx.fillText(`${pageIndex+1}/${count} · ${screen==='explanation'?'도움말 · 두 번 눌러 자막 복귀':'최근 발언 · 두 번 눌러 도움 보기'}`,542,295,510);ctx.fillText('한 번: 페이지 · 두 번: 자막/도움 · 길게: 듣기/정지',542,313,510);ctx.textAlign='left';
 if(screen==='caption')drawHelpPopup();version++;if(ready&&!suspended)send();return count;
}
''' +s[b:];p.write_text(s,encoding='utf-8')
