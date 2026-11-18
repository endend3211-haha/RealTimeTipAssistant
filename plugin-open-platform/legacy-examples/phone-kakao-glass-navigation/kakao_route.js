export async function getWalkingRoute(start,end){
 const res=await fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start,end})});
 return await res.json();
}
