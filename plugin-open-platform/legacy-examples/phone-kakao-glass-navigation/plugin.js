const CONFIG={mode:'demo', apiProxy:'/api/route'};
let route=[], current={lat:0,lng:0};

export function setRoute(data){ route=data.points||[]; }
export function updateLocation(pos){
 current=pos;
 const next=findNextPoint(pos);
 renderHUD(next);
}
function findNextPoint(pos){
 if(!route.length) return {distance:120,direction:'↑',text:'직진 안내 준비'};
 let best=route[0]; let min=999999;
 route.forEach(p=>{let d=Math.hypot(p.lat-pos.lat,p.lng-pos.lng);if(d<min){min=d;best=p;}});
 return {distance:Math.round(min*111000),direction:'↑',text:'다음 안내'};
}
function renderHUD(n){
 const el=document.querySelector('#hud');
 if(el) el.innerHTML=`<div class="arrow">${n.direction}</div><div>${n.distance}m</div><div>${n.text}</div>`;
}

navigator.geolocation?.watchPosition(p=>updateLocation({lat:p.coords.latitude,lng:p.coords.longitude}));
