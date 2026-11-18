export const catalog = [
  ['heartRate','심박수','Heart rate','bpm'],
  ['battery','링 배터리','Ring battery','%'],
  ['bloodOxygen','혈중 산소','Blood oxygen','%'],
  ['steps','걸음 수','Steps','steps'],
  ['calories','활동 칼로리','Active calories','kcal'],
  ['distance','이동 거리','Distance','km'],
  ['hrv','심박변이도','Heart rate variability','ms'],
  ['stress','스트레스','Stress',''],
  ['sleep','수면 시간','Sleep duration','h'],
  ['temperature','체온','Temperature','°C'],
  ['bloodPressure','혈압','Blood pressure','mmHg'],
  ['respiratoryRate','호흡수','Respiratory rate','/min'],
];
export function normalizeMeasurements(items) {
  const known = new Map(catalog.map(([id,nameKo,nameEn,unit]) =>
    [id,{id,nameKo,nameEn,unit,value:null,state:'pending',measuredAt:null}]));
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 64) continue;
    const base = known.get(item.id) || {id:item.id,nameKo:item.id,nameEn:item.id,unit:''};
    const state = ['measured','empty','unsupported','pending','error'].includes(item.state) ? item.state : 'pending';
    const valid = typeof item.value === 'string' && item.value.length <= 80 ||
      typeof item.value === 'number' && Number.isFinite(item.value);
    known.set(item.id,{...base,...item,state:state === 'measured' && !valid ? 'error' : state,
      measuredAt:Number.isFinite(item.measuredAt) && item.measuredAt > 0 ? item.measuredAt : null});
  }
  return [...known.values()];
}
export function encodeSnapshot(items, language, requestId) {
  const text = items.map(item => {
    const name = language === 'ko' ? item.nameKo : item.nameEn;
    const value = item.state === 'measured' ? String(item.value) + (item.unit ? ' '+item.unit : '') :
      language === 'ko' ? ({pending:'조회 대기',empty:'기록 없음',unsupported:'미지원',error:'조회 오류'}[item.state]) :
      ({pending:'Pending',empty:'No record',unsupported:'Unsupported',error:'Read error'}[item.state]);
    return name + ' '+value;
  }).join('\n');
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 800) throw new Error(language === 'ko' ? '안경 표시 용량을 초과했습니다. 항목을 나눠 보내야 합니다.' : 'Too many metrics for one display message.');
  const packet = new Uint8Array(bytes.length + 4);
  packet.set([1,1,(requestId >> 8)&255,requestId &255]);packet.set(bytes,4);
  return packet;
}

