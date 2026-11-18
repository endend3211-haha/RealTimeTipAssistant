import {activate,resubscribe,setMessengerMode} from './hub.mjs';
const mounted=new Set();let revision=0;
const routes=['home','news','stocks','manga','megadrive','naver','messenger'];
let messengerRequested=false;
async function show(app){
 if(!routes.includes(app))return;
 const ticket=++revision;
 if(app==='messenger'||messengerRequested){
  messengerRequested=app==='messenger';
  activate('transition');
  try{await setMessengerMode(messengerRequested);}
  catch(error){
   if(ticket!==revision)return;
   console.warn(error);
   if(messengerRequested){
    await show('home');
    const status=document.getElementById('toast');
    status.textContent=error.message;
    status.classList.add('show');
    setTimeout(()=>status.classList.remove('show'),3000);
    return;
   }
  }
  if(ticket!==revision)return;
 }
 for(const id of routes)document.getElementById(id+'Root').hidden=id!==app;
 activate(app);
 if(app==='home'&&mounted.has('home'))void resubscribe().catch(console.error);
 if(mounted.has(app))return;
 const host=document.getElementById(app+'Root');
 try{
  const module=await import(app==='home'?'./plugin.js':`./${app}/plugin.js`);
  if(ticket!==revision)return;
  let root=host;
  if(app!=='home'){
   const {default:template}=await import(`./${app}/template.mjs`);
   if(ticket!==revision)return;
   root=host.attachShadow({mode:'open'});root.innerHTML=template;
  }
  mounted.add(app);
  void module.mount(root).catch(e=>{console.error(e);host.hidden=false;});
 }catch(e){console.error(e);show('home');}
}
window.addEventListener('glow:navigate',e=>void show(e.detail));
void show('home');
