const {chromium}=require('C:/Users/MCNEX/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"msedge"});
 const page=await browser.newPage({viewport:{width:1100,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4187/plugin/index.html');
 await page.locator('#test').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('300m'));
 const before=await page.locator('#preview').evaluate(c=>c.toDataURL());
 await page.locator('#input').fill('1.2km 앞 좌회전');
 await page.locator('#test').click();
 const after=await page.locator('#preview').evaluate(c=>c.toDataURL());
 if(before===after)throw Error('Preview did not update');


 await page.screenshot({path:'work/naver-alert-preview.png',fullPage:true});
 await fs.writeFile('work/naver-alert-preview-image.png',Buffer.from(after.split(',')[1],'base64'));
 console.log(JSON.stringify({errors,status:await page.locator('#status').textContent(),metrics:await page.locator('#metrics').textContent()}));

 await browser.close();if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});


