import {createGMPlugin} from './vendor/gm-plugin-web-sdk.esm.js';
const gm=createGMPlugin();let active='home',running=true,ready,subscription;const clients=new Map();
function lifecycle(){for(const [id,c] of clients)for(const fn of c.lifecycle)fn({state:running&&id===active?'running':'suspended'});}
gm.on('runtime.lifecycleChanged',e=>{running=e.state==='running';lifecycle();});
export function activate(id){active=id;lifecycle();}
export function createScopedPlugin(id){
 const client={lifecycle:[]};clients.set(id,client);const device={...gm.device};
 for(const key of ['onButton','onGesture','onConnection','onRawImu'])device[key]=fn=>gm.device[key](e=>{if(active===id&&running)fn(e);});
 device.subscribeEvents=async()=>{subscription??=gm.device.subscribeEvents(['button','imuGesture','connection']);return subscription;};
 device.unsubscribeEvents=async()=>({released:true});
 const display=Object.fromEntries(Object.entries(gm.display).map(([key,fn])=>[key,(...args)=>active===id&&running?fn(...args):Promise.reject(Error('화면 전환됨'))]));
 return {...gm,device,display,ready:()=>ready??=gm.ready(),close(){},on(name,fn){if(name==='runtime.lifecycleChanged'){client.lifecycle.push(fn);return()=>{client.lifecycle=client.lifecycle.filter(f=>f!==fn);};}return gm.on(name,fn);}};
}
window.addEventListener('pagehide',()=>gm.close());
