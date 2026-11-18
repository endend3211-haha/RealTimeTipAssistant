import {createGMPlugin} from './vendor/gm-plugin-web-sdk.esm.js';
const gm=createGMPlugin();let active='home',running=true,ready,subscription;const clients=new Map();let displayQueue=Promise.resolve();
const directions = new Map([
 ['2', 'left'], ['up', 'left'],
 ['5', 'up'], ['right', 'up'],
 ['3', 'right'], ['down', 'right'],
 ['4', 'down'], ['left', 'down'],
]);
function lifecycle(){for(const [id,c] of clients)for(const fn of c.lifecycle){try{fn({state:running&&id===active?'running':'suspended'});}catch(e){console.error('Glow lifecycle',id,e);}}}
gm.on('runtime.lifecycleChanged',e=>{running=e.state==='running';lifecycle();});
export function activate(id){active=id;lifecycle();}
export function setMessengerMode(enabled){
 const task=displayQueue.then(async()=>{
  await (ready??=gm.ready());
  const result=await gm.plugin.sendMessage(0x4752,Uint8Array.of(enabled?1:0));
  if(!result.sent||result.handled===false)throw Error('안경의 메신저 화면을 전환할 수 없습니다.');
 });
 displayQueue=task.catch(()=>{});
 return task;
}
export async function resubscribe(){if(subscription){const old=await subscription;await gm.device.unsubscribeEvents(old.subscriptionId).catch(()=>{});}subscription=gm.device.subscribeEvents(['button','connection']);return subscription;}
export function createScopedPlugin(id){
 const client={lifecycle:[],buttons:new Set()};clients.set(id,client);const device={...gm.device};
 device.onButton=fn=>{client.buttons.add(fn);return()=>client.buttons.delete(fn);};
 device.onConnection=fn=>gm.device.onConnection(e=>{if(active===id&&running)fn(e);});
 device.subscribeEvents=async()=>{subscription??=gm.device.subscribeEvents(['button','connection']);return subscription;};
 device.unsubscribeEvents=async()=>({released:true});
 const isActive=()=>active===id&&running;
 const enqueueDisplay=(fn,...args)=>{
  const task=displayQueue.then(()=>{
   if(!isActive())throw Error('화면 전환됨');
   return fn(...args);
  });
  displayQueue=task.catch(()=>{});
  return task;
 };
 const display=Object.fromEntries(Object.entries(gm.display).map(([key,fn])=>[key,(...args)=>enqueueDisplay(fn,...args)]));
 const sendDisplayMessage=(channel,data)=>enqueueDisplay(gm.plugin.sendMessage,channel,data);
 return {...gm,device,display,isActive,sendDisplayMessage,ready:()=>ready??=gm.ready(),close(){},on(name,fn){if(name==='runtime.lifecycleChanged'){client.lifecycle.push(fn);return()=>{client.lifecycle=client.lifecycle.filter(f=>f!==fn);};}return gm.on(name,fn);}};
}
window.addEventListener('pagehide',()=>gm.close());
function dispatchButton(event) {
  const client=clients.get(active);
  if(!running||!client)return;
  const direction=active==='home'&&event.action==='trigger'&&directions.get(String(event.button).toLowerCase());
  const mapped=direction ? {...event,button:direction} : event;
  for(const fn of client.buttons)fn(mapped);
}
gm.device.onButton(dispatchButton);
gm.plugin.onMessage(({channel,data})=>{
  if(channel===0x4752&&data.length===1&&data[0]===2&&active==='messenger'&&running){
    window.dispatchEvent(new CustomEvent('glow:navigate',{detail:'home'}));
    return;
  }
  if(channel!==0x4751||data.length!==2)return;
  const button=(data[0]<<8)|data[1];
  if(button>=2&&button<=9)dispatchButton({button,action:'trigger'});
});
