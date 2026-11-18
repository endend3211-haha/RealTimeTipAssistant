// Keep the standalone Studio example and the embedded Pocket module identical.
import { cp, mkdir } from 'node:fs/promises';
const source=new URL('../../PhoneSDK/examples/webtoon-reader/',import.meta.url),destination=new URL('../../PhoneSDK/examples/cartridge-library/',import.meta.url);
await mkdir(destination,{recursive:true});
for(const file of ['index.html','style.css','plugin.js','mangadex.mjs','coverflow.mjs','controls.mjs','transport.mjs','fast-frame.mjs','frame-pipeline.mjs','lz4.mjs','reader-state.mjs','reader-navigation.mjs','transition-clock.mjs','deck-lod.mjs'])await cp(new URL(file,source),new URL(file,destination));
await cp(new URL('vendor',source),new URL('vendor',destination),{recursive:true});
const clean=new URL('../../PhoneSDK/examples/pocket-manga/',import.meta.url);
await mkdir(clean,{recursive:true});
for(const file of ['index.html','style.css','plugin.js','manifest.json','mangadex.mjs','coverflow.mjs','controls.mjs','transport.mjs','fast-frame.mjs','frame-pipeline.mjs','lz4.mjs','reader-navigation.mjs','transition-clock.mjs','deck-lod.mjs'])await cp(new URL(file,destination),new URL(file,clean));
await cp(new URL('vendor',source),new URL('vendor',clean),{recursive:true});
console.log('Pocket 웹툰 모듈 동기화 완료');
