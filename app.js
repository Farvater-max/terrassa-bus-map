const $=s=>document.querySelector(s);
const mx=lon=>(lon+180)/360, my=lat=>{const s=Math.sin(lat*Math.PI/180);return .5-Math.log((1+s)/(1-s))/(4*Math.PI)};
const hms=t=>{t=Math.floor(t)%86400;return [t/3600|0,t/60%60|0,t%60].map(n=>String(n).padStart(2,'0')).join(':')};
const vivid=c=>{const n=parseInt(c.slice(1),16),r=n>>16,g=(n>>8)&255,b=n&255;return (r*299+g*587+b*114)/1000<90?'#'+[r,g,b].map(v=>Math.round(v+(255-v)*.6).toString(16).padStart(2,'0')).join(''):c};
const DATA=JSON.parse($('#emb').textContent),SETS=DATA.sets;
let cur=null,stops,routes,trips,lines,SH=[];
function useSet(S){
  if(cur===S)return;cur=S;
  stops=S.stops.map(s=>({name:s[0],x:mx(s[2]),y:my(s[1])}));
  routes=S.routes.map(r=>({short:r[0],color:r[1],text:r[2],line:vivid(r[1])}));
  trips=S.trips.map((t,i)=>({id:i,P:S.pats[t[0]],s0:t[1],route:t[2],svc:S.svc[t[3]],head:S.heads[t[4]],end:t[1]+S.pats[t[0]][1].at(-1)}));
  SH=(S.shapes||[]).map(sh=>{const pts=sh.map(p=>[mx(p[1]),my(p[0])]),cum=[0];
    for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return{pts,cum}});
  lines=[];const seen=new Set();
  trips.forEach(t=>{const P=t.P,sh=P[2]!=null?SH[P[2]]:null,k=t.route+'|'+P[0].join('>');if(seen.has(k))return;seen.add(k);
    lines.push({route:t.route,pts:sh?sh.pts.slice(P[3][0],P[3].at(-1)+1).map(q=>({x:q[0],y:q[1]})):P[0].map(i=>stops[i])})});
  hidden.clear();sel=null;buildChips();fit();
}
let day=[],hidden=new Set(),simT=0,playing=true,speed=1,last=performance.now(),dirty=true,sel=null,hits=[],noteDate='';
let cx=.5,cy=.5,Z=12;

function services(S,ymd,ignore){
  const dow=new Date(+ymd.slice(0,4),+ymd.slice(4,6)-1,+ymd.slice(6)).getDay(),s=new Set();
  S.cal.forEach(c=>{if(c[1][dow]=='1'&&(ignore||(c[2]<=ymd&&ymd<=c[3])))s.add(c[0])});
  if(!ignore)S.cd.forEach(e=>{if(e[1]==ymd)e[2]=='1'?s.add(e[0]):s.delete(e[0])});
  return s;
}
const span=S=>S.cal.length?Math.max(...S.cal.map(c=>+c[3]))-Math.min(...S.cal.map(c=>+c[2])):1e9;
function buildDay(){
  const ymd=$('#date').value.replace(/-/g,''),mode=$('#set').value;let S,note='';
  if(mode=='auto'){
    const hits=SETS.filter(s=>services(s,ymd,false).size).sort((a,b)=>span(a)-span(b));
    if(hits.length)S=hits[0];else{S=SETS[0];note=' Дата вне периода действия расписаний, использую по дню недели.'}
  }else S=SETS.find(s=>s.id==mode)||SETS[0];
  useSet(S);
  let sv=services(S,ymd,false);
  if(!sv.size){sv=services(S,ymd,true);note=' Дата вне периода действия этого расписания, использую по дню недели.'}
  day=trips.filter(t=>sv.has(t.svc));
  noteDate=' Расписание: '+S.label+'.'+note+' Данные от '+DATA.generated+'.';dirty=true;
}
function along(sh,d){
  const c=sh.cum;let lo=0,hi=c.length-1;while(hi-lo>1){const m=(lo+hi)>>1;c[m]<=d?lo=m:hi=m}
  const f=Math.min(1,Math.max(0,(d-c[lo])/((c[hi]-c[lo])||1))),a=sh.pts[lo],b=sh.pts[hi];
  return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
}
function pos(t,now){
  const P=t.P,R=P[1],S=P[0],rel=now-t.s0,n=S.length,sh=P[2]!=null?SH[P[2]]:null;
  if(rel<0||rel>R.at(-1))return null;
  for(let i=0;i<n-1;i++){
    if(rel<R[i+1]){const f=(rel-R[i])/((R[i+1]-R[i])||1);
      if(sh){const d0=sh.cum[P[3][i]],d1=sh.cum[P[3][i+1]];return along(sh,d0+(d1-d0)*f)}
      const a=stops[S[i]],b=stops[S[i+1]];return [a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f]}}
  const e=stops[S[n-1]];return [e.x,e.y];
}

/* ---- map ---- */
const cv=$('#cv'),ctx=cv.getContext('2d'),wrap=$('#wrap');
const BASES={dark:['https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png','#0f1214','© OpenStreetMap © CARTO'],
  light:['https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png','#e8e6e0','© OpenStreetMap © CARTO'],
  osm:['https://tile.openstreetmap.org/{z}/{x}/{y}.png','#d8d8d0','© OpenStreetMap'],
  mbdark:['https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/512/{z}/{x}/{y}?access_token={t}','#0f1214','© Mapbox © OpenStreetMap',1],
  mbstreets:['https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token={t}','#e8e6e0','© Mapbox © OpenStreetMap',1],
  mbsat:['https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}?access_token={t}','#0f1214','© Mapbox © OpenStreetMap © Maxar',1],
  esridark:['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}','#0f1214','Tiles © Esri'],
  esri:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}','#e8e6e0','Tiles © Esri'],
  none:[null,'#0f1214','']};
let token='';try{token=localStorage.getItem('mbtoken')||''}catch(e){}
const usable=()=>BASES[base][0]&&(!BASES[base][3]||token);
let base='dark',tiles=new Map(),tileErr=0,tileOk=0;
function tile(z,x,y){
  const k=z+'/'+x+'/'+y;let t=tiles.get(k);if(t)return t;
  if(tiles.size>500)tiles.clear();
  t=new Image();t.referrerPolicy='no-referrer';
  t.onload=()=>{tileOk++;dirty=true};
  t.onerror=()=>{if(++tileErr>=6&&!tileOk)showWarn(BASES[base][3]?'Тайлы Mapbox не загрузились. Проверьте токен (нужен публичный, pk., без ограничений по URL) и интернет.':'Фоновая карта не загрузилась, поэтому показаны только линии, остановки и автобусы. Выберите другую подложку или «Без подложки».')};
  t.src=BASES[base][0].replace('{s}','abcd'[(x+y)%4]).replace('{t}',encodeURIComponent(token)).replace('{z}',z).replace('{x}',x).replace('{y}',y);
  tiles.set(k,t);return t;
}
function showWarn(m){$('#warn').textContent=m;$('#warn').hidden=false}
function setBase(b){base=b;tiles.clear();tileErr=tileOk=0;$('#warn').hidden=true;
  $('#tkl').hidden=!BASES[b][3];if(BASES[b][3]&&!token)showWarn('Вставьте публичный токен Mapbox (начинается с pk.) в поле вверху. Пока токена нет, показан фон без карты.');$('#attr').textContent=BASES[b][2];dirty=true}
function fit(){
  const W=cv.clientWidth||600,H=cv.clientHeight||400;
  let x0=1,x1=0,y0=1,y1=0;stops.forEach(s=>{x0=Math.min(x0,s.x);x1=Math.max(x1,s.x);y0=Math.min(y0,s.y);y1=Math.max(y1,s.y)});
  cx=(x0+x1)/2;cy=(y0+y1)/2;Z=Math.log2(Math.min(W/(x1-x0||1e-4),H/(y1-y0||1e-4))*.88/256);dirty=true;
}
function zoomAt(px,py,nz){
  const W=cv.clientWidth,H=cv.clientHeight,K=256*2**Z,wx=cx+(px-W/2)/K,wy=cy+(py-H/2)/K;
  Z=Math.min(19,Math.max(9,nz));const K2=256*2**Z;cx=wx-(px-W/2)/K2;cy=wy-(py-H/2)/K2;dirty=true;
}

function draw(){
  const dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;
  if(cv.width!=Math.round(W*dpr)||cv.height!=Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=BASES[base][1];ctx.fillRect(0,0,W,H);
  const K=256*2**Z,sx=x=>(x-cx)*K+W/2,sy=y=>(y-cy)*K+H/2;
  if(usable()){
    const zt=Math.min(19,Math.max(0,Math.round(Z)-(BASES[base][3]?1:0))),n=2**zt,ts=K/n;
    const xa=Math.floor((cx-W/2/K)*n),xb=Math.floor((cx+W/2/K)*n),ya=Math.max(0,Math.floor((cy-H/2/K)*n)),yb=Math.min(n-1,Math.floor((cy+H/2/K)*n));
    for(let x=xa;x<=xb;x++)for(let y=ya;y<=yb;y++){
      const im=tile(zt,((x%n)+n)%n,y);
      if(im.complete&&im.naturalWidth)ctx.drawImage(im,sx(x/n),sy(y/n),ts+.5,ts+.5)}
  }
  ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=3;ctx.globalAlpha=.65;
  lines.forEach(l=>{if(hidden.has(l.route))return;ctx.strokeStyle=routes[l.route].line;ctx.beginPath();
    l.pts.forEach((p,i)=>i?ctx.lineTo(sx(p.x),sy(p.y)):ctx.moveTo(sx(p.x),sy(p.y)));ctx.stroke()});
  ctx.globalAlpha=1;ctx.fillStyle='#1b2124';ctx.strokeStyle='#93a09a';ctx.lineWidth=1;
  const names=Z>=15.5;ctx.font='11px system-ui,sans-serif';ctx.textAlign='left';
  stops.forEach(s=>{const x=sx(s.x),y=sy(s.y);if(x<-10||y<-10||x>W+10||y>H+10)return;
    ctx.beginPath();ctx.arc(x,y,3,0,7);ctx.fill();ctx.stroke();
    if(names){ctx.fillStyle=base=='light'||base=='osm'?'#222':'#cfd8d3';ctx.fillText(s.name,x+6,y+3);ctx.fillStyle='#1b2124'}});
  hits=[];let n=0;
  ctx.font='bold 11px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const t of day){
    if(hidden.has(t.route)||simT<t.s0||simT>t.end)continue;const p=pos(t,simT);if(!p)continue;n++;
    const x=sx(p[0]),y=sy(p[1]);if(x<-20||y<-20||x>W+20||y>H+20)continue;
    const r=routes[t.route];hits.push({x,y,t});
    ctx.beginPath();ctx.arc(x,y,13,0,7);ctx.fillStyle=r.color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.stroke();
    ctx.fillStyle=r.text;ctx.fillText(r.short,x,y+.5)}
  ctx.textBaseline='alphabetic';
  $('#clock').textContent=hms(simT);$('#slider').value=simT%86400;
  $('#info').textContent='Автобусов на линии: '+n+' · рейсов за день: '+day.length+'.'+noteDate;
  const pop=$('#pop');
  if(sel){
    let x,y,html;
    if(sel.t){const h=hits.find(h=>h.t.id==sel.t.id);if(h){x=h.x;y=h.y-0;const t=sel.t,rel=simT-t.s0;let i=t.P[1].findIndex(v=>v>rel);if(i<0)i=t.P[0].length-1;
      html=`<b>Линия ${routes[t.route].short}</b> → ${t.head}<br>Следующая: ${stops[t.P[0][i]].name}<br>По расписанию: ${hms(t.s0+t.P[1][i])}`}}
    else{x=sx(sel.s.x);y=sy(sel.s.y);html=`<b>${sel.s.name}</b>`}
    if(html){pop.hidden=false;pop.innerHTML=html;pop.style.left=x+'px';pop.style.top=y+'px'}else{pop.hidden=true;sel=null}
  }else pop.hidden=true;
}

/* ---- input ---- */
const ptrs=new Map();let moved=0,pinch=0;
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,[e.offsetX,e.offsetY]);moved=0;pinch=0});
cv.addEventListener('pointermove',e=>{
  if(!ptrs.has(e.pointerId))return;
  const o=ptrs.get(e.pointerId),K=256*2**Z;
  if(ptrs.size==1){cx-=(e.offsetX-o[0])/K;cy-=(e.offsetY-o[1])/K;moved+=Math.abs(e.offsetX-o[0])+Math.abs(e.offsetY-o[1])}
  ptrs.set(e.pointerId,[e.offsetX,e.offsetY]);
  if(ptrs.size==2){const [a,b]=[...ptrs.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);
    if(pinch)zoomAt((a[0]+b[0])/2,(a[1]+b[1])/2,Z+Math.log2(d/pinch));pinch=d;moved=99}
  dirty=true;
});
cv.addEventListener('pointerup',e=>{
  ptrs.delete(e.pointerId);
  if(moved<6&&!pinch){
    let best=null,bd=20;hits.forEach(h=>{const d=Math.hypot(h.x-e.offsetX,h.y-e.offsetY);if(d<bd){bd=d;best={t:h.t}}});
    if(!best){const W=cv.clientWidth,H=cv.clientHeight,K=256*2**Z;let sd=14;stops.forEach(s=>{const d=Math.hypot((s.x-cx)*K+W/2-e.offsetX,(s.y-cy)*K+H/2-e.offsetY);if(d<sd){sd=d;best={s}}})}
    sel=best;dirty=true}
  if(!ptrs.size)pinch=0;
});
cv.addEventListener('pointercancel',e=>{ptrs.delete(e.pointerId);pinch=0});
cv.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.offsetX,e.offsetY,Z-e.deltaY*.0015)},{passive:false});
$('#zi').onclick=()=>zoomAt(cv.clientWidth/2,cv.clientHeight/2,Z+1);
$('#zo').onclick=()=>zoomAt(cv.clientWidth/2,cv.clientHeight/2,Z-1);

/* ---- chips & controls ---- */
function buildChips(){$('#chips').innerHTML='';Object.keys(routes).sort((a,b)=>routes[a].short.localeCompare(routes[b].short,undefined,{numeric:true})).forEach(id=>{
  const r=routes[id],c=document.createElement('span');c.className='chip';c.textContent=r.short;
  c.style.borderColor=r.line;c.style.background=r.color;c.style.color=r.text;
  c.onclick=()=>{id=+id;hidden.has(id)?hidden.delete(id):hidden.add(id);c.classList.toggle('off',hidden.has(id));dirty=true};
  $('#chips').appendChild(c)})}
function setNow(){const d=new Date();simT=d.getHours()*3600+d.getMinutes()*60+d.getSeconds();dirty=true}
const d0=new Date();$('#date').value=d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');
$('#date').onchange=buildDay;
$('#speed').onchange=e=>speed=+e.target.value;
$('#base').onchange=e=>setBase(e.target.value);
$('#tk').value=token;
$('#tk').onchange=e=>{token=e.target.value.trim();try{localStorage.setItem('mbtoken',token)}catch(x){}setBase(base)};
$('#play').onclick=e=>{playing=!playing;e.target.textContent=playing?'Пауза':'Пуск'};
$('#now').onclick=setNow;
$('#slider').oninput=e=>{simT=+e.target.value;dirty=true};

function loop(now){
  const dt=(now-last)/1000;last=now;
  if(playing){simT=(simT+dt*speed)%86400;dirty=true}
  if(dirty){dirty=false;draw()}
  requestAnimationFrame(loop);
}
$('#set').innerHTML='<option value="auto">Авто (по дате)</option>'+SETS.map(s=>`<option value="${s.id}">${s.label}</option>`).join('');
$('#set').onchange=buildDay;
setNow();setBase('esridark');buildDay();
requestAnimationFrame(()=>{fit();requestAnimationFrame(loop)});
