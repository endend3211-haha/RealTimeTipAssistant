import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Tetris,cells} from '../PhoneSDK/examples/glow-market/tetris/engine.mjs';
test('all pieces have four cells; movement and rotation stay inside the board',()=>{
 for(let type=0;type<7;type++)for(let rotation=0;rotation<4;rotation++)assert.equal(cells({type,rotation,x:0,y:0}).length,4);
 const g=new Tetris(()=>0.25);for(let i=0;i<30;i++)g.move(-1);assert(g.fits(g.piece));for(let i=0;i<10;i++)g.rotate();assert(g.fits(g.piece));for(let i=0;i<30;i++)g.move(1);assert(g.fits(g.piece));
});
test('hard drop locks a piece, scores its distance and spawns the next',()=>{
 const g=new Tetris(()=>0.25);g.drop();assert(g.score>0);assert.equal(g.board.flat().filter(Boolean).length,4);assert.equal(g.piece.y,0);
});
test('a completed row is removed and scored',()=>{
 const g=new Tetris(()=>0.25);g.board[19].fill(1);for(let x=3;x<7;x++)g.board[19][x]=0;g.piece={type:0,rotation:0,x:3,y:18};assert(g.fits(g.piece));g.down();assert.equal(g.lines,1);assert.equal(g.score,100);assert(g.board.every(row=>row.every(v=>v===0)));
});
test('stacking reaches game over and reset restores a playable board',()=>{
 const g=new Tetris(()=>0.25);let attempts=0;while(!g.over&&attempts++<100)g.drop();assert(g.over);const score=g.score;g.drop();assert.equal(g.score,score);g.reset();assert(!g.over);assert.equal(g.score,0);assert(g.fits(g.piece));
});
