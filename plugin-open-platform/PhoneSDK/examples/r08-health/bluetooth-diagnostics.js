export function inspectBluetooth(env = globalThis) {
 const bt = env.navigator?.bluetooth;
 return {secureContext: env.isSecureContext === true, webBluetooth: !!bt,
  requestDevice: typeof bt?.requestDevice === 'function',
  getAvailability: typeof bt?.getAvailability === 'function'};
}

export function mountBluetoothDiagnostics({gm, language, onBattery}) {
 const $ = id => document.getElementById(id);
 let device=null, busy=false, generation=0;
 const lines=[];
 const t=(ko,en)=>language()==='ko'?ko:en;
 const log=(name,value)=>{
  lines.push(new Date().toLocaleTimeString()+' '+name+' '+(typeof value==='string'?value:JSON.stringify(value)));
  if(lines.length>100)lines.shift();
  $('btLog').textContent=lines.join('\n');
 };
 const controls=()=>{
  $('btCheck').disabled=busy;
  $('btSelect').disabled=busy||!inspectBluetooth().requestDevice;
  $('btRead').disabled=busy||!device;
  $('btDisconnect').disabled=busy||!device?.gatt?.connected;
 };
 const run=async(fn)=>{if(busy)return;busy=true;controls();let stage="START";try{await fn(value=>{stage=value;log("STAGE",value);});}catch(e){log("ERROR",{stage,name:e.name,code:e.code,message:e.message});}finally{busy=false;controls();}};
 function render(){
  $('btTitle').textContent=t('블루투스 진단','Bluetooth diagnostics');
  $('btNote').textContent=t('API 확인은 연결을 변경하지 않습니다. 링 직접 연결은 안경 연결에 영향을 줄 수 있습니다. 이 패널은 안경↔링 무선 패킷 캡처가 아닙니다.','Checking APIs does not change connections. Connecting directly to the ring may affect its glasses connection. This panel does not capture radio packets between the glasses and ring.');
  $('btCheck').textContent=t('API 확인','Check APIs');
  $('btSelect').textContent=t('링 선택','Select ring');
  $('btRead').textContent=t('직접 연결 · 배터리 읽기','Connect · read battery');
  $('btDisconnect').textContent=t('직접 연결 해제','Disconnect');
  controls();
 }
 $('btCheck').onclick=()=>run(async()=>{
  const support=inspectBluetooth();log('ENV',support);
  if(support.getAvailability)log('BLUETOOTH_AVAILABLE',await navigator.bluetooth.getAvailability());
  if(!support.requestDevice)log('DIRECT_BLE',t('현재 실행 환경에 Web Bluetooth API가 없습니다. 링 신호 없음이라는 뜻은 아닙니다.','Web Bluetooth is unavailable in this runtime. This does not mean that the ring has no signal.'));
  await gm.ready();
  log('MEMOMIND_CAPABILITIES',await gm.runtime.getCapabilities());
 });
 $('btSelect').onclick=()=>run(async(stage)=>{
  // Call immediately in the click handler's activation; no preceding await.
  stage("REQUEST_DEVICE");
  const selected=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'R08'},{namePrefix:'RT08'}],optionalServices:[0x180f]});
  stage("DEVICE_RETURNED");
  if(device && device!==selected && device.gatt?.connected)device.gatt.disconnect();
  device=selected;
  const current=++generation;
  log('DEVICE_SELECTED',{name:device.name||'',gattAvailable:!!device.gatt});
  try{
   device.addEventListener?.('gattserverdisconnected',()=>{
    if(current===generation){log('GATT_DISCONNECTED',true);controls();}
   });
  }catch(e){log('EVENT_LISTENER_ERROR',{message:e.message});}
 });
 $('btRead').onclick=()=>run(async(stage)=>{
  if(!device?.gatt)throw new Error('Selected device has no GATT interface');
  if(!confirm(t('휴대폰이 링에 직접 연결합니다. 안경과 링의 연결에 영향을 줄 수 있습니다. 진행할까요?','The phone will connect directly to the ring and may affect its glasses connection. Continue?')))return;
  try{
   stage("GATT_CONNECT");
   const server=await device.gatt.connect();log('GATT_CONNECTED',true);
   stage("BATTERY_SERVICE");
   const service=await server.getPrimaryService(0x180f);log('SERVICE',service.uuid);
   stage("BATTERY_CHARACTERISTIC");
   const characteristic=await service.getCharacteristic(0x2a19);log('CHARACTERISTIC',characteristic.uuid);
   stage("BATTERY_READ");
   const value=await characteristic.readValue();
   if(value.byteLength!==1||value.getUint8(0)>100)throw new Error('Invalid Battery Level response');
   onBattery?.(value.getUint8(0));
   log('BATTERY',{percent:value.getUint8(0),receivedAt:new Date().toISOString()});
  }finally{try{device.gatt.disconnect();log('DIRECT_CONNECTION_CLOSED',true);}catch(e){log('DISCONNECT_ERROR',{message:e.message});}}
 });
 $('btDisconnect').onclick=()=>{device?.gatt?.disconnect();controls();};
 window.addEventListener('pagehide',()=>device?.gatt?.disconnect());
 render();log('ENV',inspectBluetooth());
 return {render};
}
