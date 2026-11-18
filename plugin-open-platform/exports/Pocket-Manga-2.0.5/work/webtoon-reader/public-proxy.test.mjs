import test from 'node:test';import assert from 'node:assert/strict';
import {gatewayRequestUrl,MangaDexClient,PUBLIC_GATEWAY} from '../../PhoneSDK/examples/webtoon-reader/mangadex.mjs';
test('public proxy prefixes the full official URL; private gateway retains its signed API contract',()=>{
 assert.equal(gatewayRequestUrl(PUBLIC_GATEWAY,'json','/manga?limit=7'),PUBLIC_GATEWAY+'/https://api.mangadex.org/manga?limit=7');
 assert.equal(gatewayRequestUrl(PUBLIC_GATEWAY+'/','image','https://uploads.mangadex.org/covers/test.jpg'),PUBLIC_GATEWAY+'/https://uploads.mangadex.org/covers/test.jpg');
 assert.throws(()=>gatewayRequestUrl(PUBLIC_GATEWAY,'json','https://other.test'));
 const u=new URL(gatewayRequestUrl('https://own.test','image','https://node.test/page.jpg','signed'));assert.equal(u.pathname,'/image');assert.equal(u.searchParams.get('token'),'signed');
});
test('public mode fetches JSON and images without credentials or a PC API endpoint',async()=>{
 const oldFetch=globalThis.fetch,oldWindow=globalThis.window,calls=[];globalThis.window=new EventTarget();
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);return url.includes('api.mangadex.org')?Response.json({result:'ok',data:[],total:0}):new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/jpeg'}});};
 const client=new MangaDexClient({gateway:PUBLIC_GATEWAY,host:()=>undefined});try{assert.equal((await client.json('/manga?limit=7')).result,'ok');const b=await client.request('image','https://uploads.mangadex.org/covers/test.jpg');assert.equal(b.size,3);assert.equal(calls.length,2);assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[1][0],PUBLIC_GATEWAY+'/https://uploads.mangadex.org/covers/test.jpg');}finally{client.close();globalThis.fetch=oldFetch;globalThis.window=oldWindow;}
});
