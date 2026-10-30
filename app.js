const $=s=>document.querySelector(s);
let DATA;
try {
  const endpoint = new URL('/rest/v1/feeds', window.SUPABASE_URL);
  endpoint.search = new URLSearchParams({ select: 'data,updated_at', order: 'id' });
  const response = await fetch(endpoint, { headers: {
    apikey: window.SUPABASE_ANON_KEY,
  } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json();
  if (!data?.length) throw new Error('No schedule feeds were found in the feeds table.');
  const latest = data.map(row => row.updated_at).filter(Boolean).sort().at(-1);
  DATA = { generated: latest ? new Date(latest).toLocaleDateString('ru-RU') : 'неизвестно', sets: data.map(row => row.data) };
} catch (error) {
  $('#info').textContent = `Could not load schedules from Supabase: ${error.message}`;
  throw error;
}
const mx=lon=>(lon+180)/360, my=lat=>{const s=Math.sin(lat*Math.PI/180);return .5-Math.log((1+s)/(1-s))/(4*Math.PI)};
const ll=(x,y)=>[x*360-180,(180/Math.PI)*Math.atan(Math.sinh(Math.PI*(1-2*y)))];
const hms=t=>{t=Math.floor(t)%86400;return [t/3600|0,t/60%60|0,t%60].map(n=>String(n).padStart(2,'0')).join(':')};
const vivid=c=>{const n=parseInt(c.slice(1),16),r=n>>16,g=(n>>8)&255,b=n&255;return (r*299+g*587+b*114)/1000<90?'#'+[r,g,b].map(v=>Math.round(v+(255-v)*.6).toString(16).padStart(2,'0')).join(''):c};
const SETS=DATA.sets;
let cur=null,stops,routes,trips,SH=[];
let map=null,currentStyle='dark-gray';
function useSet(S){
  if(cur===S)return;cur=S;
  stops=S.stops.map(s=>({name:s[0],x:mx(s[2]),y:my(s[1])}));
  routes=S.routes.map(r=>({short:r[0],color:r[1],text:r[2],line:vivid(r[1])}));
  trips=S.trips.map((t,i)=>({id:i,P:S.pats[t[0]],s0:t[1],route:t[2],svc:S.svc[t[3]],head:S.heads[t[4]],end:t[1]+S.pats[t[0]][1].at(-1)}));
  SH=(S.shapes||[]).map(sh=>{const pts=sh.map(p=>[mx(p[1]),my(p[0])]),cum=[0];
    for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return{pts,cum}});
  hidden.clear();sel=null;selectedTrip=null;selectedStop=null;buildChips();fit();
}
let day=[],hidden=new Set(),simT=0,playing=true,speed=1,last=performance.now(),dirty=true,sel=null,selectedTrip=null,selectedStop=null,busHits=[],stopHits=[],noteDate='';

function services(S,ymd,ignore){
  const dow=new Date(+ymd.slice(0,4),+ymd.slice(4,6)-1,+ymd.slice(6)).getDay(),s=new Set();
  S.cal.forEach(c=>{if(c[1][dow]=='1'&&(ignore||(c[2]<=ymd&&ymd<=c[3])))s.add(c[0])});
  if(!ignore)S.cd.forEach(e=>{if(e[1]==ymd)e[2]=='1'?s.add(e[0]):s.delete(e[0])});
  return s;
}
const span=S=>S.cal.length?Math.max(...S.cal.map(c=>+c[3]))-Math.min(...S.cal.map(c=>+c[2])):1e9;
function buildDay(){
  sel=null;selectedTrip=null;selectedStop=null;
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

function tripPath(t){
  const pattern=t.P;
  if(pattern[2]!=null){
    const shape=SH[pattern[2]],indexes=pattern[3];
    return shape.pts.slice(indexes[0],indexes.at(-1)+1).map(([x,y])=>({x,y}));
  }
  return pattern[0].map(index=>stops[index]);
}

function transferLines(stopIndex){
  return [...new Set(day
    .filter(trip=>trip.P[0].includes(stopIndex)&&trip.route!==selectedTrip?.route)
    .map(trip=>trip.route))]
    .sort((a,b)=>routes[a].short.localeCompare(routes[b].short,undefined,{numeric:true}))
    .map(routeIndex=>routes[routeIndex].short);
}

const escapeHTML=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function drawBusMarker(x,y,route){
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x-13,y-13,26,26,8);
  ctx.fillStyle=route.color;
  ctx.shadowColor='rgba(0,0,0,.45)';
  ctx.shadowBlur=3;
  ctx.fill();
  ctx.shadowBlur=0;
  ctx.lineWidth=2.5;
  ctx.strokeStyle='#fff';
  ctx.stroke();
  ctx.lineWidth=1;
  ctx.strokeStyle='#15191b';
  ctx.stroke();
  ctx.fillStyle=route.text;
  ctx.font='bold 10px system-ui,sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(route.short,x,y);
  ctx.restore();
}

/* ---- vector map ---- */
const cv=$('#cv'),ctx=cv.getContext('2d'),wrap=$('#wrap');
const esriStyle=style=>({version:8,sources:{esri:{type:'raster',tiles:[`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${style==='dark-gray'?'Dark':'Light'}_Gray_Base/MapServer/tile/{z}/{y}/{x}`],tileSize:256,maxzoom:16,attribution:'Tiles © Esri'}},layers:[{id:'esri-gray-canvas',type:'raster',source:'esri'}]});
function showWarn(m){$('#warn').textContent=m;$('#warn').hidden=false}
function setMapStyle(style){const changed=style!==currentStyle;currentStyle=style;$('#warn').hidden=true;$('#attr').textContent='Tiles © Esri';dirty=true;if(map&&changed)map.setStyle(esriStyle(style))}
function fit(){
  if(!map||!stops?.length)return;
  let x0=1,x1=0,y0=1,y1=0;stops.forEach(s=>{x0=Math.min(x0,s.x);x1=Math.max(x1,s.x);y0=Math.min(y0,s.y);y1=Math.max(y1,s.y)});
  map.fitBounds([ll(x0,y1),ll(x1,y0)],{padding:48,maxZoom:15,duration:0});dirty=true;
}

function draw(){
  if(!map)return;
  const dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;
  if(cv.width!=Math.round(W*dpr)||cv.height!=Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const project=(x,y)=>{const p=map.project(ll(x,y));return{x:p.x,y:p.y}},zoom=map.getZoom();
  ctx.lineJoin='round';ctx.lineCap='round';
  stopHits=[];
  if(selectedTrip&&!hidden.has(selectedTrip.route)){
    const route=routes[selectedTrip.route],path=tripPath(selectedTrip);
    if(path.length){
      ctx.beginPath();ctx.lineWidth=4;ctx.globalAlpha=.9;ctx.strokeStyle=route.line;
      path.forEach((point,i)=>{const p=project(point.x,point.y);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});
      ctx.stroke();ctx.globalAlpha=1;
    }
    ctx.font='11px system-ui,sans-serif';ctx.textAlign='left';
    selectedTrip.P[0].forEach(stopIndex=>{
      const stop=stops[stopIndex],{x,y}=project(stop.x,stop.y);
      if(x<-12||y<-12||x>W+12||y>H+12)return;
      stopHits.push({x,y,stopIndex});
      ctx.beginPath();ctx.arc(x,y,selectedStop===stopIndex?7:5,0,Math.PI*2);
      ctx.fillStyle=route.color;ctx.fill();ctx.lineWidth=selectedStop===stopIndex?3:2;
      ctx.strokeStyle=selectedStop===stopIndex?'#ffd166':'#fff';ctx.stroke();
      if(zoom>=14){
        ctx.fillStyle=currentStyle==='light-gray'?'#222':'#f1f4f2';
        ctx.fillText(stop.name,x+8,y+4);
      }
    });
  }
  busHits=[];let n=0;
  ctx.font='bold 11px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const t of day){
    if(selectedTrip&&t.id!==selectedTrip.id)continue;
    if(hidden.has(t.route)||simT<t.s0||simT>t.end)continue;const p=pos(t,simT);if(!p)continue;n++;
    const {x,y}=project(p[0],p[1]);if(x<-20||y<-20||x>W+20||y>H+20)continue;
    const r=routes[t.route];busHits.push({x,y,t});
    drawBusMarker(x,y,r)}
  ctx.textBaseline='alphabetic';
  $('#clock').textContent=hms(simT);$('#slider').value=simT%86400;
  $('#info').textContent='Автобусов на линии: '+n+' · рейсов за день: '+day.length+'.'+noteDate;
  const pop=$('#pop');
  if(sel){
    let x,y,html;
    if(sel.t){const h=busHits.find(hit=>hit.t.id===sel.t.id);if(h){x=h.x;y=h.y;const t=sel.t,rel=simT-t.s0;let i=t.P[1].findIndex(v=>v>rel);if(i<0)i=t.P[0].length-1;
      html=`<b>Линия ${escapeHTML(routes[t.route].short)}</b> → ${escapeHTML(t.head)}<br>Следующая: ${escapeHTML(stops[t.P[0][i]].name)}<br>По расписанию: ${hms(t.s0+t.P[1][i])}`}}
    else if(sel.stopIndex!=null){
      const stop=stops[sel.stopIndex],otherLines=transferLines(sel.stopIndex);
      ({x,y}=project(stop.x,stop.y));
      html=`<b>${escapeHTML(stop.name)}</b><br>Пересадка на линии: ${otherLines.length?otherLines.map(escapeHTML).join(', '):'других линий нет'}`;
    }
    if(html){pop.hidden=false;pop.innerHTML=html;pop.style.left=x+'px';pop.style.top=y+'px'}else{pop.hidden=true;sel=null}
  }else pop.hidden=true;
}

/* ---- input ---- */
map=new maplibregl.Map({container:'map',style:esriStyle(currentStyle),center:[2.02,41.56],zoom:12,attributionControl:false});
map.on('load',()=>{fit();dirty=true});
map.on('error',event=>{if(event.error&&!map.isStyleLoaded())showWarn('Не удалось загрузить подложку Esri. Проверьте подключение к интернету.')});
map.on('move',()=>{dirty=true});
map.on('resize',()=>{dirty=true});
map.on('click',e=>{
    const px=e.point.x,py=e.point.y;
    let bestBus=null,busDistance=20;
    busHits.forEach(hit=>{const distance=Math.hypot(hit.x-px,hit.y-py);if(distance<busDistance){busDistance=distance;bestBus=hit}});
    if(bestBus){selectedTrip=bestBus.t;selectedStop=null;sel={t:bestBus.t}}
    else{
      let bestStop=null,stopDistance=15;
      stopHits.forEach(hit=>{const distance=Math.hypot(hit.x-px,hit.y-py);if(distance<stopDistance){stopDistance=distance;bestStop=hit}});
      if(bestStop){selectedStop=bestStop.stopIndex;sel={stopIndex:bestStop.stopIndex}}
      else{selectedTrip=null;selectedStop=null;sel=null}
    }
    dirty=true;
});
$('#zi').onclick=()=>map.zoomTo(map.getZoom()+1,{duration:180});
$('#zo').onclick=()=>map.zoomTo(map.getZoom()-1,{duration:180});

/* ---- chips & controls ---- */
function buildChips(){$('#chips').innerHTML='';Object.keys(routes).sort((a,b)=>routes[a].short.localeCompare(routes[b].short,undefined,{numeric:true})).forEach(id=>{
  const r=routes[id],c=document.createElement('span');c.className='chip';c.textContent=r.short;
  c.style.borderColor=r.line;c.style.background=r.color;c.style.color=r.text;
  c.onclick=()=>{id=+id;hidden.has(id)?hidden.delete(id):hidden.add(id);if(hidden.has(id)&&selectedTrip?.route===id){selectedTrip=null;selectedStop=null;sel=null}c.classList.toggle('off',hidden.has(id));dirty=true};
  $('#chips').appendChild(c)})}
function setNow(){const d=new Date();simT=d.getHours()*3600+d.getMinutes()*60+d.getSeconds();dirty=true}
const d0=new Date();$('#date').value=d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');
$('#date').onchange=buildDay;
$('#speed').onchange=e=>speed=+e.target.value;
$('#style').onchange=e=>setMapStyle(e.target.value);
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
setNow();buildDay();setMapStyle(currentStyle);
requestAnimationFrame(loop);
