import test from 'node:test';
import assert from 'node:assert/strict';
import { apiUrl,normalizePage,jikanUrl,normalizeJikan } from '../../PhoneSDK/examples/webtoon-reader/api.mjs';
import { buttonCommand } from '../../PhoneSDK/examples/webtoon-reader/controls.mjs';
import { HudSender } from '../../PhoneSDK/examples/webtoon-reader/transport.mjs';

test('Korea API query matches upstream provider/page/keyword fields',()=>{
 const url=apiUrl('https://example.test',{keyword:'마음 & 숲',provider:'KAKAO_PAGE',page:2,perPage:20,updateDay:'MON'});
 assert.equal(url.pathname,'/webtoons');assert.equal(url.searchParams.get('keyword'),'마음 & 숲');assert.equal(url.searchParams.get('provider'),'KAKAO_PAGE');assert.equal(url.searchParams.get('page'),'2');
 assert.throws(()=>apiUrl('http://example.test'));assert.throws(()=>apiUrl('https://x.test',{perPage:101}));
 const result=normalizePage({webtoons:[{id:7,title:'숲의 이야기',thumbnail:['https://image.test/a.jpg','javascript:alert(1)'],url:'https://comic.naver.com/webtoon/list?titleId=7'}],total:1,isLastPage:true});
 assert.equal(result.webtoons[0].thumbnail.length,1);assert.equal(result.webtoons[0].source,'KOREA');assert.match(result.webtoons[0].url,/comic.naver.com/);
});
test('Jikan search, ranking, detail and metadata-only URLs stay distinct',()=>{
 assert.equal(jikanUrl('https://api.jikan.moe/v4',{keyword:'forest'}).searchParams.get('q'),'forest');
 assert.equal(jikanUrl('https://api.jikan.moe/v4',{top:true}).pathname,'/v4/top/manga');
 assert.equal(jikanUrl('https://api.jikan.moe/v4',{id:13}).pathname,'/v4/manga/13');
 const data=normalizeJikan({data:[{mal_id:13,title:'작품',url:'https://myanimelist.net/manga/13',images:{jpg:{image_url:'https://cdn.test/a.jpg'}},authors:[{name:'작가'}],synopsis:null}],pagination:{has_next_page:true,items:{total:100}}});
 const item=normalizePage(data).webtoons[0];assert.equal(item.url,'');assert.match(item.catalogUrl,/myanimelist/);assert.equal(item.source,'JIKAN');assert.equal(item.synopsis,'');assert.equal(data.isLastPage,false);
});
test('final hardware controls depend on catalog vs reading state',()=>{
 assert.deepEqual(['single','double','long'].map(action=>buttonCommand(action,'catalog')),['nextItem','previousItem','open']);
 assert.deepEqual(['single','double','long'].map(action=>buttonCommand(action,'reading')),['nextUnread','previous','catalog']);
 assert.equal(buttonCommand('long','catalog',false),'demoCatalog');assert.equal(buttonCommand('single','unavailable'),null);
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function mockTransport(){let release,blocked=true,concurrent=0,maximum=0;const calls=[];
 const gm={display:{createPage:async()=>calls.push(['page']),beginFrame:async params=>calls.push(['begin',params]),updateFrameImageLz4:async params=>{calls.push(['tile',params]);concurrent++;maximum=Math.max(maximum,concurrent);if(blocked){blocked=false;await new Promise(resolve=>{release=resolve;});}concurrent--;}}};
 return {gm,calls,release:()=>release(),maximum:()=>maximum};
}
test('BLE queue retains only the newest pending frame and commits after final ACK',async()=>{
 const mock=mockTransport(),acks=[],sender=new HudSender(mock.gm,(data,r)=>acks.push([data[0],r]));sender.ready=true;
 const a=sender.offer(new Uint8Array(105000));await tick();
 const b=sender.offer(new Uint8Array(105000).fill(0x11)).catch(error=>error.message);
 const c=sender.offer(new Uint8Array(105000).fill(0x22));assert.equal(acks.length,0);assert.match(await b,/대체/);
 mock.release();await a;await c;assert.deepEqual(acks.map(x=>x[0]),[0,0x22]);assert.equal(mock.maximum(),1);
 assert.equal(mock.calls.filter(x=>x[0]==='begin').length,2);
 const count=mock.calls.length;const unchanged=await sender.offer(new Uint8Array(105000).fill(0x22));assert.equal(unchanged.tiles,0);assert.equal(mock.calls.length,count);
 for(const [,tile]of mock.calls.filter(x=>x[0]==='tile')){assert.ok(tile.decodedSize<=79800);assert.equal(tile.x%2,0);}
});
test('disconnect prevents stale frame commit and forces a full refresh',async()=>{
 const mock=mockTransport(),acks=[],sender=new HudSender(mock.gm,data=>acks.push(data));sender.ready=true;
 const first=sender.offer(new Uint8Array(105000)).catch(error=>error.message);await tick();sender.suspend();mock.release();assert.match(await first,/중断|중단|연결/);assert.equal(acks.length,0);
 sender.active=true;await sender.offer(new Uint8Array(105000).fill(0x77));const begins=mock.calls.filter(x=>x[0]==='begin');assert.equal(begins.at(-1)[1].tileCount,2);
});
