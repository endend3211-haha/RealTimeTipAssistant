const {chromium}=require('C:/Users/MCNEX/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:800,height:950}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4189/plugin/index.html');
  await page.waitForSelector('#preview');
  const result=await page.evaluate(async()=>{
   const {render,gray4,fraction}=await import('/plugin/render.js'),canvas=document.getElementById('preview');
   let counts=[],previous=Infinity;
   for(const meters of [500,300,100,20,0]){
    render(canvas,meters,'우회전');const ctx=canvas.getContext('2d'),image=ctx.getImageData(0,0,560,272);
    let count=0;for(let y=0;y<205;y++)for(let x=5;x<250;x++){let i=(y*560+x)*4;if(image.data[i+1]>130&&image.data[i+1]>image.data[i]*1.3)count++;}
    if(count>=previous)throw Error('Arrow pixel count did not decrease: '+meters);
    previous=count;counts.push({meters,count});if(gray4(canvas).length!==76160)throw Error('GRAY4 size');
   }
   if(counts.at(-1).count!==0)throw Error('Arrow did not vanish at zero');
   render(canvas,100,'우회전');return {counts,image:canvas.toDataURL()};
  });
  if(errors.length)throw Error(errors.join('\n'));
  await fs.writeFile('C:/Users/MCNEX/Documents/Codex/2026-10-29/plugin-open-platform-main/outputs/Naver-Depth-Studio-Preview-100m.png',Buffer.from(result.image.split(',')[1],'base64'));
  console.log(JSON.stringify({rendering:'PASS',counts:result.counts,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
