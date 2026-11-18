import {createScopedPlugin} from '../hub.mjs';
import {navigate} from '../navigation.mjs';
import {fullFrameTiles} from '../full-frame.mjs';
import {compressLz4,toBase64} from '../news/image.mjs';
import {Tetris,cells} from './engine.mjs';
export async function mount(root){
 const $=s=>root.querySelector(s),gm=createScopedPlugin('tetris'),game=new Tetris(),ctx=$('#board').getContext('2d',{alpha:false});
 let ready=false,active=true,paused=false,created=false,frame=0,revision=0,sending=null,lastTiles=[],accumulator=0,lastTick=performance.now(),armed=true,lastHead=-Infinity;
 function label(s,x,y,size=16,color='#fff'){ctx.font=`${size}px sans-serif`;ctx.fillStyle=color;ctx.fillText(s,x,y);}
 function box(x,y,value,side=14){ctx.fillStyle=value?'#eee':'#080808';ctx.fillRect(x+1,y+1,side-2,side-2);if(value){ctx.strokeStyle='#888';ctx.strokeRect(x+2,y+2,side-4,side-4);}}
 function draw(){
  ctx.fillStyle='#000';ctx.fillRect(0,0,560,320);label('TETRIS',18,28,24);label('점수 '+game.score,18,66,20);label('삭제 '+game.lines+'줄',18,94,16);label('다음 블록',18,133,14,'#aaa');
  for(const [x,y] of cells({type:game.next,rotation:0,x:0,y:0}))box(23+x*18,148+y*18,1,18);
  ctx.strokeStyle='#666';ctx.strokeRect(204,7,142,282);
  for(let y=0;y<20;y++)for(let x=0;x<10;x++)box(205+x*14,8+y*14,game.board[y][x]);
  if(!game.over)for(const [x,y] of cells(game.piece))box(205+x*14,8+y*14,1);
  label(game.over?'게임 오버':paused?'일시 정지':'고개 좌우: 이동',367,70,18);label(game.over?'버튼: 다시 시작':'한 번: 회전',367,107,16);label('두 번: 바로 내리기',367,142,15);label('길게: 일시정지 / 재개',367,177,16);label('휴대폰에서 실행',367,233,13,'#aaa');
  label('고개 좌우 이동 · 한 번 회전 · 두 번 내리기 · 길게 일시정지',18,313,13,'#aaa');
  $('#score').textContent=`점수 ${game.score} · ${game.lines}줄`;$('#pause').textContent=paused?'재개':'일시정지';revision++;if(ready&&active)void send();
 }
 async function send(){if(sending)return;sending=(async()=>{while(ready&&active){const version=revision;try{
   if(!created){await gm.display.createPage();created=true;lastTiles=[];}
   const tiles=fullFrameTiles(ctx),dirty=tiles.map((raw,index)=>({raw,index})).filter(({raw,index})=>!lastTiles[index]||raw.some((v,j)=>v!==lastTiles[index][j]));
   if(dirty.length){const id=++frame;await gm.display.beginFrame({frameId:id,tileCount:dirty.length});for(let i=0;i<dirty.length;i++){const {raw,index}=dirty[i];await gm.display.updateFrameImageLz4({frameId:id,tileIndex:i,x:0,y:index*50,width:600,height:50,stride:300,decodedSize:raw.length,dataBase64:toBase64(compressLz4(raw))});}lastTiles=tiles;}
   $('#status').textContent='안경 표시 중';
  }catch(e){created=false;$('#status').textContent='안경 전송: '+e.message;break;}if(version===revision)break;}})().finally(()=>{sending=null;});return sending;}
 function action(kind){if(!active)return;if(kind==='home'){navigate('home');return;}if(kind==='pause'){paused=!paused;accumulator=0;draw();return;}if(game.over){game.reset();paused=false;draw();return;}if(paused)return;
  if(kind==='left')game.move(-1);if(kind==='right')game.move(1);if(kind==='rotate')game.rotate();if(kind==='drop'){game.drop();accumulator=0;}if(kind==='down')game.down();draw();
 }
 gm.device.onButton(e=>{const b=String(e.button).toLowerCase();if(['long','very_long'].includes(e.action))action('home');else if(e.action==='single')action('rotate');else if(e.action==='double')action('drop');else if(e.action==='trigger'){if(['4','left'].includes(b))action('left');else if(['5','right'].includes(b))action('right');else if(['2','up'].includes(b))action('rotate');else if(['3','down'].includes(b))action('down');else if(['10','11','back','home'].includes(b))action('home');}});
 gm.device.onGesture(e=>{if(e.active===false){armed=true;return;}const key=String(e.gesture).toLowerCase(),now=performance.now();if(!armed||now-lastHead<180)return;const direction=['left','7'].includes(key)?'left':['right','8'].includes(key)?'right':'';if(direction){armed=false;lastHead=now;action(direction);}});
 gm.device.onConnection(e=>{created=false;lastTiles=[];paused=!e.connected;draw();});
 gm.on('runtime.lifecycleChanged',e=>{active=e.state==='running';created=false;accumulator=0;lastTick=performance.now();if(active)draw();});
 for(const button of root.querySelectorAll('[data-action]'))button.onclick=()=>action(button.dataset.action);
 $('.glow-navigation a').onclick=e=>{e.preventDefault();action('home');};
 window.addEventListener('tetris:pause',()=>action('pause'));
 const timer=setInterval(()=>{const now=performance.now(),elapsed=Math.min(200,now-lastTick);lastTick=now;if(!active||paused||game.over||!ready||document.hidden)return;accumulator+=elapsed;if(accumulator>=game.interval){accumulator=0;game.down();draw();}},50);
 window.addEventListener('pagehide',()=>{clearInterval(timer);active=false;});
 draw();try{await gm.ready();await gm.device.subscribeEvents(['button','imuGesture','connection']);ready=true;draw();}catch(e){$('#status').textContent='초기화 실패: '+e.message;}
}
