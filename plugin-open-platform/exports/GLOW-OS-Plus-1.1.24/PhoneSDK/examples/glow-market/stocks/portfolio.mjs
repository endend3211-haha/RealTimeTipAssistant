const Q=1000000n;
function fixed(value,digits,label){const s=String(value??'').trim().replaceAll(',','');if(!new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(s))throw Error(`${label} 형식을 확인하세요 (소수 ${digits}자리까지)`);const [a,b='']=s.split('.');return BigInt(a)*10n**BigInt(digits)+BigInt(b.padEnd(digits,'0'));}
export function parseHolding(quantity,averagePrice){
 const q=fixed(quantity,6,'보유 수량');if(q===0n)return null;
 const p=fixed(averagePrice,2,'평균 매입단가');if(q>1000000000000n||p<=0n||p>100000000000n)throw Error('수량은 100만 주 이하, 평균단가는 0원 초과 10억 원 이하로 입력하세요');
 return {quantity:String(quantity).trim().replaceAll(',',''),averagePrice:String(averagePrice).trim().replaceAll(',','')};
}
function amount(q,cents){return (q*cents+Q/2n)/Q;}
export function portfolioTotals(watch,holdings,entries,now=Date.now()){
 let cost=0n,value=0n,count=0,covered=0,stale=false;const positions=[];
 for(const stock of watch){let h;try{h=holdings[stock.symbol]&&parseHolding(holdings[stock.symbol].quantity,holdings[stock.symbol].averagePrice);}catch{continue;}if(!h)continue;
  const q=fixed(h.quantity,6,'수량'),positionCost=amount(q,fixed(h.averagePrice,2,'평균단가'));cost+=positionCost;count++;
  const entry=entries.get(stock.symbol);let price;try{price=entry?.quote&&Number.isFinite(entry.quote.price)&&entry.quote.price>=0?fixed(entry.quote.price,2,'현재가'):null;}catch{price=null;}
  if(price===null||price===undefined){positions.push({symbol:stock.symbol,cost:Number(positionCost)/100,value:null,profit:null,percent:null});continue;}
  const positionValue=amount(q,price),profit=positionValue-positionCost;value+=positionValue;covered++;
  stale ||= !!entry.error||!Number.isFinite(entry.fetchedAt)||now-entry.fetchedAt>45000;
  positions.push({symbol:stock.symbol,cost:Number(positionCost)/100,value:Number(positionValue)/100,profit:Number(profit)/100,percent:positionCost>0n?Number(profit)/Number(positionCost)*100:null});
 }
 const complete=count===covered;const profit=value-cost;
 return {count,covered,complete,stale,cost:Number(cost)/100,value:complete?Number(value)/100:null,knownValue:Number(value)/100,profit:complete?Number(profit)/100:null,percent:complete&&cost>0n?Number(profit)/Number(cost)*100:null,positions};
}
export function sanitizeHoldings(saved,watch){const result={};if(!saved||typeof saved!=='object')return result;for(const w of watch){try{const h=saved[w.symbol];if(h){const clean=parseHolding(h.quantity,h.averagePrice);if(clean)result[w.symbol]=clean;}}catch{}}return result;}

export function holdingLabels(holding){let h;try{h=holding&&parseHolding(holding.quantity,holding.averagePrice);}catch{}if(!h)return {quantity:'보유 미등록',cost:'매입 —'};const q=fixed(h.quantity,6,'수량'),cost=Number(amount(q,fixed(h.averagePrice,2,'평균단가')))/100;return {quantity:'보유 '+new Intl.NumberFormat('ko-KR',{maximumFractionDigits:6}).format(Number(h.quantity))+'주',cost:'매입 '+new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(cost)+'원'};}
