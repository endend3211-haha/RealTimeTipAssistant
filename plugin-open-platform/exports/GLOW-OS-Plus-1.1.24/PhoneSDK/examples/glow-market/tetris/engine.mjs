// Tetromino masks follow GlassSDK/examples/game/tetris/tetris.c.
export const SHAPES=[[0x0f00,0x2222,0x00f0,0x4444],[0x8e00,0x6440,0x0e20,0x44c0],[0x2e00,0x4460,0x0e80,0xc440],[0x6600,0x6600,0x6600,0x6600],[0x6c00,0x4620,0x06c0,0x8c40],[0x4e00,0x4640,0x0e40,0x4c40],[0xc600,0x2640,0x0c60,0x4c80]];
export function cells(piece){const out=[],mask=SHAPES[piece.type][piece.rotation];for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(mask&(1<<(15-y*4-x)))out.push([piece.x+x,piece.y+y]);return out;}
export class Tetris{
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){this.board=Array.from({length:20},()=>Array(10).fill(0));this.score=0;this.lines=0;this.bag=[];this.over=false;this.next=this.take();this.spawn();}
 take(){if(!this.bag.length){this.bag=[0,1,2,3,4,5,6];for(let i=6;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}}return this.bag.pop();}
 fits(p){return cells(p).every(([x,y])=>x>=0&&x<10&&y>=0&&y<20&&!this.board[y][x]);}
 spawn(){this.piece={type:this.next,rotation:0,x:3,y:0};this.next=this.take();if(!this.fits(this.piece))this.over=true;}
 move(dx){if(this.over)return false;const p={...this.piece,x:this.piece.x+dx};if(!this.fits(p))return false;this.piece=p;return true;}
 rotate(){if(this.over)return false;for(const kick of [0,-1,1,-2,2]){const p={...this.piece,x:this.piece.x+kick,rotation:(this.piece.rotation+1)%4};if(this.fits(p)){this.piece=p;return true;}}return false;}
 down(){if(this.over)return false;const p={...this.piece,y:this.piece.y+1};if(this.fits(p)){this.piece=p;return true;}this.lock();return false;}
 drop(){if(this.over)return;while(this.down())this.score+=2;}
 lock(){for(const [x,y] of cells(this.piece))this.board[y][x]=this.piece.type+1;const remaining=this.board.filter(row=>!row.every(Boolean));const cleared=20-remaining.length;while(remaining.length<20)remaining.unshift(Array(10).fill(0));this.board=remaining;this.lines+=cleared;this.score+=[0,100,300,500,800][cleared]*(1+Math.floor((this.lines-cleared)/10));this.spawn();}
 get interval(){return Math.max(150,600-Math.floor(this.lines/10)*45);}
}
