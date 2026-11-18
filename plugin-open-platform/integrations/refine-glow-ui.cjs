const fs=require('fs'),path=require('path');
const {parseHTML}=require('../integrations/news-web-relay/node_modules/linkedom');
const root=path.resolve('PhoneSDK/examples/glow-market');
const read=n=>fs.readFileSync(path.join(root,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(root,n),s);
const icon=d=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const head=read('index.html').match(/<head>[\s\S]*?<\/head>/)[0].replace(/<title>.*?<\/title>/,'<title>GLOW OS Plus</title>').replace('</head>','<link rel="stylesheet" href="./theme.css"></head>');
write('index.html',`<!doctype html><html lang="ko">${head}<body><div id="homeRoot"><main class="console compact-home">
<header class="console-head"><div class="brand-lockup"><span class="brand-dot"></span><h1>GLOW OS <em>Plus</em></h1></div><div class="device-state" id="deviceState"><i></i><span>연결 중</span></div></header>
<section class="launch-card"><div class="section-title"><span>내 글라스</span><small>연결된 일상</small></div><button class="glass-home" id="wakeDevice">${icon('M3 10h6l2 5H3V10Zm12 0h6v5h-8l2-5ZM9 11h6')}<span>안경 홈 열기</span><b>↗</b></button></section>
<div class="quick-grid"><button id="openNews">${icon('M5 4h14v16H5V4Zm3 4h8M8 12h8M8 16h5')}<span>뉴스</span><small>관심 소식</small></button><button id="openStocks">${icon('M4 4v16h16M7 15l4-5 4 2 5-7')}<span>주식</span><small>나의 관심종목</small></button><button id="startTetris">${icon('M5 8h14l2 10h-5l-2-3h-4l-2 3H3L5 8Zm1 4h4M8 10v4m8-2h.1m2 2h.1')}<span>게임</span><small>테트리스</small></button></div>
<details class="settings-card"><summary>날씨 설정 <span>현재 위치 · 도시</span></summary><label class="toggle"><input id="autoLocation" type="checkbox" checked> 현재 위치 자동 사용</label><p id="locationState" role="status">위치 권한 허용이 필요합니다.</p><button id="refreshLocation" type="button">날씨 새로고침</button><details><summary>도시 직접 설정</summary><form id="cityForm"><label for="cityInput">도시</label><div class="input-row"><input id="cityInput" value="서울" maxlength="40"><button>저장</button></div></form></details><p class="muted">실행 중 5분 간격 갱신 · 위치 좌표가 날씨 제공업체에 전송됩니다.</p></details>
<details class="settings-card"><summary>안경 메모 <span id="saveState">자동 저장</span></summary><textarea id="memoInput" maxlength="240" rows="4" placeholder="안경에 남길 한마디"></textarea></details>
<details class="settings-card"><summary>사용 안내 <span>조작 · 연결 정보</span></summary><p>고개로 이동 · 한 번 선택 · 길게 홈</p><p>뉴스: 두 번 이전 / 주식: 두 번 실행<br>게임: 한 번 회전 · 두 번 내리기</p><p id="gameState">폰에서 게임을 실행합니다.</p><div class="screen-status"><span>현재 화면</span><strong id="screenName">홈</strong><small id="dataState"></small></div></details>
<footer class="home-footer">GLOW OS Plus <span>가볍게 연결하세요.</span></footer><canvas id="deviceCanvas" width="600" height="350" aria-hidden="true"></canvas><div class="toast" id="toast" role="status"></div></main></div><div id="newsRoot" hidden></div><div id="stocksRoot" hidden></div><div id="tetrisRoot" hidden></div><script type="module" src="./shell.mjs"></script></body></html>`);
function details(doc,title,id){const e=doc.createElement('details');if(id)e.id=id;e.innerHTML='<summary>'+title+'</summary>';return e;}
for(const app of ['news','stocks']){
 const {document:d}=parseHTML(read(app+'/index.html'));
 const nav=d.querySelector('.glow-navigation');nav.innerHTML='<a href="#">← 홈</a><span>GLOW OS Plus</span>';
 if(app==='news'){
  d.querySelector('header .brand').textContent='NEWS';d.querySelector('h1').textContent='뉴스';d.querySelector('h1 + p')?.remove();
  const sections=[...d.querySelectorAll('main > section')];
  for(const [section,title,id] of [[sections[2],'안경 미리보기 · 조작','news-preview'],[sections[3],'뉴스 설정','news-settings']]){const e=details(d,title,id);e.append(...section.childNodes);section.replaceWith(e);e.querySelector('h2')?.remove();}
  const opts=details(d,'관심 주제 관리');const row=d.querySelector('#add-topic').parentNode;opts.append(row);d.querySelector('#topics').after(opts);
  d.querySelector('#keyword').placeholder='종목 · 주제 검색';
  d.querySelector('#news-preview .muted').textContent='고개 이동 · 한 번 선택 · 두 번 이전 · 길게 홈';
 }else{
  const header=d.querySelector('header');header.innerHTML='<small>STOCKS</small><h1>주식</h1>';
  const sections=[...d.querySelectorAll('main > section')];
  const portfolio=sections[2],editor=details(d,'보유 정보 수정','holding-editor');editor.append(d.querySelector('#holding-form'));portfolio.prepend(editor);portfolio.querySelector('h2')?.remove();
  for(const [section,title,id] of [[sections[3],'연결 설정','stock-connection'],[sections[4],'안경 미리보기 · 차트','stock-preview']]){const e=details(d,title,id);e.append(...section.childNodes);section.replaceWith(e);}
  const status=d.querySelector('#status');d.querySelector('main').append(status);
  d.querySelector('footer').textContent='네이버 증권 공개 데이터 · 지연 시세일 수 있습니다.';
  d.querySelector('#search-form label').firstChild.textContent='종목명 또는 코드';d.querySelector('#search-form button').textContent='검색';
 }
 write(app+'/index.html',d.toString());
 let body=d.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g,'');
 write(app+'/template.mjs','export default '+JSON.stringify(`<link rel="stylesheet" href="./${app}/style.css"><link rel="stylesheet" href="./theme.css">`+body)+';\n');
}
let template=read('tetris/template.mjs').replace('<nav class="glow-navigation">','<link rel="stylesheet" href="./theme.css"><nav class="glow-navigation">').replace('⌂ Glow 홈','← 홈').replace('<h1>테트리스</h1><p>폰에서 게임을 실행하고 안경으로 표시합니다.</p>','<h1>테트리스</h1>');write('tetris/template.mjs',template);
const m=JSON.parse(read('manifest.json'));m.name='GLOW OS Plus';m.version='1.0.7';write('manifest.json',JSON.stringify(m,null,2)+'\n');
