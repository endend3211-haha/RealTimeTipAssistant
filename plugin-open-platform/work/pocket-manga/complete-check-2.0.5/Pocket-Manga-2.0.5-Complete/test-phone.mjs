import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const result=spawnSync(process.execPath,["--test", "work/webtoon-reader/deck-lod.test.mjs", "work/webtoon-reader/render-quality.test.mjs", "work/webtoon-reader/public-proxy.test.mjs", "work/webtoon-reader/cloudflare.test.mjs", "work/webtoon-reader/mangadex.test.mjs", "work/webtoon-reader/pocket-flow.test.mjs", "work/webtoon-reader/webtoon.test.mjs", "work/cartridge-library/coverflow.test.mjs", "work/cartridge-library/frame-pipeline.test.mjs"],{cwd:fileURLToPath(new URL('.',import.meta.url)),stdio:'inherit'});
if(result.error)throw result.error;process.exitCode=result.status??1;
