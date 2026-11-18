export const NAVER_PACKAGE='com.nhn.android.nmap', MAX_AGE_MS=60000;
export function parseNotification(raw,now=Date.now()){
 if(!raw || raw.packageName!==NAVER_PACKAGE)return null;
 const at=Number(raw.postedAt);
 if(!Number.isFinite(at)||at<now-MAX_AGE_MS||at>now+5000)return null;
 const text=[...new Set([raw.title,raw.text,raw.subText].filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean))].join(' · ').slice(0,600);
 if(!text)return null;
 const base={key:typeof raw.key==='string'?raw.key.slice(0,512):'',postedAt:at,text,distText:''};
 if(/재탐색|경로.*탐색 중|안내.*종료|목적지에 도착|목적지 도착/.test(text))return {...base,message:text};
 const hits=[...text.matchAll(/유턴|우회전|좌회전|직진/g)];
 if(hits.length!==1)return {...base,message:text};
 const hit=hits[0],prefix=text.slice(Math.max(0,hit.index-45),hit.index);
 const d=[...prefix.matchAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(km|m|킬로미터|미터)(?![A-Za-z])/gi)].at(-1);
 const [kind,angle]=({'유턴':['uturn',0],'우회전':['arrow',90],'좌회전':['arrow',-90],'직진':['arrow',0]})[hit[0]];
 return {...base,maneuver:{kind,angle},distText:d?d[1]+(/km|킬로미터/i.test(d[2])?' km':' m'):'거리 미제공'};
}
export function packGray4(rgba,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||rgba.length!==width*height*4)throw Error('잘못된 이미지 크기');
 const stride=Math.ceil(width/2),out=new Uint8Array(stride*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,n=Math.max(0,Math.min(15,Math.round((rgba[i]*.299+rgba[i+1]*.587+rgba[i+2]*.114)/17)));
  out[y*stride+(x>>1)]|=x%2?n:n<<4;
 }return out;
}
