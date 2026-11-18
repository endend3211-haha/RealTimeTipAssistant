import {mountBluetoothDiagnostics} from './bluetooth-diagnostics.js';
import {createGMPlugin} from './vendor/gm-plugin-web-sdk.esm.js';
import {readHealth} from './health-provider.js';
import {catalog,normalizeMeasurements,encodeSnapshot} from './health-model.js';
const gm=createGMPlugin(), $=id=>document.getElementById(id);
let language='ko',measurements=normalizeMeasurements([]),records=[],queriedAt=null,ready=false,busy=false,requestId=0,pending=null;
try {language=localStorage.getItem('r08-health-language')||'ko';} catch {}
if(!['ko','en'].includes(language))language='ko';
const bluetoothDiagnostics=mountBluetoothDiagnostics({gm,language:()=>language,onBattery:value=>{
 measurements=normalizeMeasurements([...measurements,{id:'battery',value,state:'measured'}]);
 render();
}});
function text(ko,en){return language==='ko'?ko:en;}
function render(){
 bluetoothDiagnostics.render();
 document.documentElement.lang=language;$('language').value=language;
 $('title').textContent=text('나의 건강, 한눈에.','Your health at a glance.');
 $('description').textContent=text('링에서 조회한 건강 기록을 안경에서 확인하세요.','Review your ring’s health records on your glasses.');
 $('status').textContent=text(ready?'폰 플러그인 준비됨':'MemoMind 연결 중',ready?'Phone plugin ready':'Connecting to MemoMind');
 $('updated').textContent=queriedAt?text('마지막 조회 ','Last queried ')+new Date(queriedAt).toLocaleString(language):text('GATT 조회 기능 연결 대기 · 제조사 API 확인 후 활성화','GATT integration pending · awaiting manufacturer API');
 $('query').textContent=text('링 건강 기록 조회','Read ring health');
 $('importLabel').textContent=text('측정값 JSON 가져오기','Import measurements JSON');
 $('send').textContent=text('안경에 표시','Show on glasses');
 $('query').disabled=!ready||busy;$('send').disabled=!ready||busy||pending!==null;
 $('dateLabel').textContent=text('측정일','Measurement date');$('historyTitle').textContent=text('측정 기록','Measurement history');
 $('metrics').replaceChildren();
 for(const item of measurements){
  const card=document.createElement('article');card.className='metric';
  const title=document.createElement('h2');title.textContent=language==='ko'?item.nameKo:item.nameEn;
  const value=document.createElement('div');value.className='value';value.textContent=item.state==='measured'?String(item.value):'—';
  const unit=document.createElement('span');unit.className='unit';unit.textContent=item.unit;value.append(unit);
  const state=document.createElement('small');
  state.textContent=item.state==='measured'?item.measuredAt?new Date(item.measuredAt).toLocaleString(language):text('측정 시각 확인 전','Measurement time unavailable'):
    text({pending:'조회 연결 대기',empty:'저장 기록 없음',unsupported:'링에서 미지원',error:'조회 오류'}[item.state],
    {pending:'Waiting for data connection',empty:'No saved records',unsupported:'Unsupported by ring',error:'Read error'}[item.state]);
  card.append(title,value,state);$('metrics').append(card);
 }
 $('history').replaceChildren();
 const rows=records.filter(r=>new Date(r.timestamp).toLocaleDateString('sv-SE')===$('date').value);
 if(!rows.length){const p=document.createElement('p');p.textContent=text('선택한 날짜에 수신된 측정 기록이 없습니다.','No received measurements for this date.');$('history').append(p);}
 for(const record of rows){const row=document.createElement('div');row.className='record';row.textContent=new Date(record.timestamp).toLocaleString(language)+' · '+record.hr+' bpm';$('history').append(row);}
 $('note').textContent=text('조회 대기 항목은 측정값 JSON으로 채울 수 있습니다. 안경에서 클릭하면 다음 페이지로 이동합니다.','Import measurement JSON to fill pending items. Click on the glasses to advance pages.');
}
$('query').onclick=async()=>{
 busy=true;render();
 try {
  const result=await readHealth();
  measurements=normalizeMeasurements([...measurements,...result.measurements]);records=Array.isArray(result.records)?result.records:[];
  queriedAt=Number.isFinite(result.queriedAt)?result.queriedAt:Date.now();
  $('feedback').textContent=text('링 조회 완료','Ring query complete');
 } catch(error){$('feedback').textContent=error.code==='GATT_BRIDGE_PENDING'?text('제조사 GATT Bridge 답변을 기다리고 있습니다. 현재 수집된 실제 데이터가 없습니다.','Awaiting the manufacturer GATT Bridge API. No live data has been collected.'):String(error.message||error);}
 finally {busy=false;render();}
};
$('healthFile').onchange=async(event)=>{
 const file=event.target.files?.[0];
 if(!file)return;
 try{
  if(file.size>65536)throw new Error();
  const snapshot=JSON.parse(await file.text());
  if(!snapshot || !Array.isArray(snapshot.measurements) || !snapshot.measurements.length ||
      snapshot.measurements.length>catalog.length)throw new Error();
  const ids=new Set();
  const entries=snapshot.measurements.map(item=>{
   const definition=catalog.find(([id])=>id===item?.id);
   if(!definition || ids.has(item.id))throw new Error();
   ids.add(item.id);
   const state=item.state??'measured';
   if(!['measured','empty','unsupported','pending','error'].includes(state))throw new Error();
   const {value}=item;
   if(state==='measured' && !(typeof value==='number' && Number.isFinite(value) ||
      item.id==='bloodPressure' && typeof value==='string' && /^\d{2,3}\/\d{2,3}$/.test(value)))throw new Error();
   if(item.id==='battery' && state==='measured' && (!Number.isInteger(value)||value<0||value>100))throw new Error();
   return {id:item.id,state,value:state==='measured'?value:null,measuredAt:item.measuredAt};
  });
  measurements=normalizeMeasurements([...measurements,...entries]);
  $('feedback').textContent=text('측정값을 가져왔습니다. 안경에 표시를 누르세요.','Measurements imported. Select Show on glasses.');
  render();
 }catch{
  $('feedback').textContent=text('측정값 JSON 형식을 확인해 주세요.','Check the measurement JSON format.');
 }finally{event.target.value='';}
};
$('send').onclick=async()=>{
 if(pending)return;
 const id=(++requestId)&65535;
 const entry={id,timer:null};pending=entry;render();
 try{
  const payload=encodeSnapshot(measurements,language,id);
  entry.timer=setTimeout(()=>{if(pending!==entry)return;pending=null;$('feedback').textContent=text('안경 응답 시간 초과 · R08 Health 글라스 플러그인을 실행하세요.','Glasses response timed out. Open the R08 Health glasses plugin.');render();},6000);
  await gm.plugin.sendMessage(21064,payload);
 }catch(error){clearTimeout(entry.timer);if(pending===entry)pending=null;$('feedback').textContent=String(error.message||error);render();}
};
$('language').onchange=()=>{language=$('language').value;try{localStorage.setItem('r08-health-language',language)}catch{}render();};
$('date').value=new Date().toLocaleDateString('sv-SE');$('date').onchange=render;
render();
try{
 await gm.ready();ready=true;
 gm.plugin.onMessage(({channel,data})=>{
  if(channel!==21065||!data||data.length!==4||data[0]!==1||data[1]!==2||!pending)return;
  if(((data[2]<<8)|data[3])!==pending.id)return;
  clearTimeout(pending.timer);pending=null;$('feedback').textContent=text('안경 표시 완료 응답을 받았습니다.','Glasses confirmed the display update.');render();
 });
 render();
}catch(error){$('feedback').textContent=String(error.message||error);}
window.addEventListener('pagehide',()=>{if(pending)clearTimeout(pending.timer);});

