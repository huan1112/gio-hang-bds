"use strict";
const ADMIN=document.body.dataset.mode==="admin";
/* ============ Utilities ============ */
const CFG=window.MYGIA_CONFIG||{};
const DIRS=['Bắc','Đông Bắc','Đông','Đông Nam','Nam','Tây Nam','Tây','Tây Bắc'];
const STATUS={ban:'Đang bán',coc:'Đã cọc',daban:'Đã bán'};
const COL={ban:'#1f9d55',new:'#f08c00',coc:'#7c5cd6',daban:'#8d9491'};
const DAY=864e5;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>(v==null||isNaN(v))?'':(+v).toLocaleString('vi-VN',{maximumFractionDigits:d});
const fmtTy=v=>v==null?'Liên hệ':fmt(v)+' tỷ';
const num=s=>parseFloat(String(s).replace(',','.'));
const clean=o=>JSON.parse(JSON.stringify(o));
const safeId=k=>k.replace(/[^A-Za-z0-9_\-.~:@+]/g,'_');
const strip=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
function ago(t){ if(!t) return ''; const s=(Date.now()-t)/1000; if(s<60) return 'vừa xong'; if(s<3600) return Math.floor(s/60)+' phút trước';
  if(s<86400) return Math.floor(s/3600)+' giờ trước'; if(s<172800) return 'hôm qua'; const d=new Date(t); return d.getDate()+'/'+(d.getMonth()+1); }
function toast(m){ const t=$('#toast'); t.textContent=m; t.style.display='block'; clearTimeout(toast._t); toast._t=setTimeout(()=>t.style.display='none',2800); }
const normBlock=s=>String(s||'').toUpperCase().replace(/\s+/g,'').replace(/[.\/_]/g,'-');
const normLot=l=>String(l).trim().replace(/^0+(?=\d)/,'').toUpperCase();
const lotKey=(pid,b,l)=>pid+':'+normBlock(b)+'_'+normLot(l);

/* ============ State ============ */
const S={projects:{},pjOrder:[],hints:{},listings:{},pins:{},demands:{},pjDocs:{},
  cur:'all',canWrite:true,canUpload:false,mode:'local',f:{max:null,min:null,dirs:new Set(),status:new Set(),recent:false},sel:null,unpinnedOnly:false};

/* ============ Affine helpers (image px <-> projected metres) ============ */
const CRS=L.CRS.EPSG3857;
const proj=ll=>CRS.project(L.latLng(ll[0],ll[1]));
const unproj=p=>CRS.unproject(L.point(p[0],p[1]));
function solve3(A,b){ // 3x3 linear solve (Cramer)
  const d=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  const D=d(A); if(Math.abs(D)<1e-12) return null;
  return [0,1,2].map(i=>d(A.map((r,k)=>r.map((v,j)=>j===i?b[k]:v)))/D); }
function fitAffine(pairs,prev){ // pairs: [ix,iy,X,Y]; returns [a,b,c,d,e,f]: X=a*ix+b*iy+c, Y=d*ix+e*iy+f
  const n=pairs.length;
  if(n>=3){ const AtA=[[0,0,0],[0,0,0],[0,0,0]],bx=[0,0,0],by=[0,0,0];
    for(const [x,y,X,Y] of pairs){ const r=[x,y,1]; for(let i=0;i<3;i++){ for(let j=0;j<3;j++) AtA[i][j]+=r[i]*r[j]; bx[i]+=r[i]*X; by[i]+=r[i]*Y; } }
    const u=solve3(AtA,bx), v=solve3(AtA,by); if(u&&v) return [...u,...v]; }
  if(n>=2){ // similarity
    const [x1,y1,X1,Y1]=pairs[0],[x2,y2,X2,Y2]=pairs[1];
    const dx=x2-x1,dy=y2-y1,dX=X2-X1,dY=Y2-Y1,den=dx*dx+dy*dy; if(den<1e-9) return prev;
    // image y points down, map Y points up -> reflected similarity: X=a x+b y+c, Y=b x-a y+f
    const a=(dX*dx-dY*dy)/den, b=(dX*dy+dY*dx)/den;
    return [a,b,X1-a*x1-b*y1, b,-a,Y1-b*x1+a*y1]; }
  if(n===1&&prev){ const [x,y,X,Y]=pairs[0]; const [a,b,c,d,e,f]=prev; return [a,b,c+X-(a*x+b*y+c),d,e,f+Y-(d*x+e*y+f)]; }
  return prev; }
const applyT=(T,x,y)=>[T[0]*x+T[1]*y+T[2],T[3]*x+T[4]*y+T[5]];
function invT(T,X,Y){ const [a,b,c,d,e,f]=T, det=a*e-b*d; const x0=X-c,y0=Y-f; return [(e*x0-b*y0)/det,(-d*x0+a*y0)/det]; }
function ctrlToT(ctrl){ return fitAffine(ctrl.map(c=>{ const p=proj([c[2],c[3]]); return [c[0],c[1],p.x,p.y]; }),null); }
function TtoCtrl(T,w,h){ return [[0,0],[w,0],[0,h]].map(([x,y])=>{ const ll=unproj(applyT(T,x,y)); return [x,y,+ll.lat.toFixed(7),+ll.lng.toFixed(7)]; }); }

/* ============ Map ============ */
const map=L.map('map',{minZoom:12,maxZoom:22,zoomSnap:.5,preferCanvas:true,zoomControl:false});
map.attributionControl.setPrefix('');
L.control.zoom({position:'topright'}).addTo(map);
map.setView([12.238,109.172],15);
map.createPane('planPane').classList.add('planPane'); map.createPane('vecPane').style.zIndex=260; map.getPane('vecPane').style.pointerEvents='none';
const tiles={
  sat:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:17,maxZoom:22,attribution:'Ảnh © Esri'}),
  osm:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxNativeZoom:19,maxZoom:22,attribution:'© OpenStreetMap'})};
let tileFail=0; Object.values(tiles).forEach(t=>t.on('tileerror',()=>{ if(++tileFail===4) toast('Không tải được bản đồ nền ở đây — chạy bản GitHub để xem ảnh vệ tinh'); }));
let baseName='plain';
function setBase(n){ baseName=n; Object.values(tiles).forEach(t=>map.removeLayer(t)); if(tiles[n]) tiles[n].addTo(map);
  document.querySelectorAll('#layerSw button').forEach(b=>b.classList.toggle('on',b.dataset.l===n));
  for(const l of Object.values(planLayers)){ l._applyOp(); l._draw&&l._map&&l._draw(); } }
document.querySelectorAll('#layerSw button').forEach(b=>b.onclick=()=>setBase(b.dataset.l));

const VEC={}; // pid -> parsed vector data (promise)
function loadVec(url){
  if(VEC[url]) return VEC[url];
  return VEC[url]=fetch(url).then(r=>{ if(!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(buf=>{
    const hl=new DataView(buf).getUint32(0,true); const H=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,4,hl)));
    let off=4+hl; const n=H.n; const counts=new Uint32Array(buf.slice(off,off+4*n)); off+=4*n;
    const flags=new Uint8Array(buf,off,n); off+=n+((4-n%4)%4); const xy=new Uint16Array(buf,off);
    const starts=new Uint32Array(n+1); for(let i=0;i<n;i++) starts[i+1]=starts[i]+counts[i];
    const gs=[]; for(let i=0;i<n;i++) if(!(flags[i]&0x80)) gs.push(i); gs.push(n);
    const G=gs.length-1, C=128, sc=H.scale; let W=0,Hh=0;
    const bb=new Float32Array(G*4);
    for(let g=0;g<G;g++){ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
      for(let k=starts[gs[g]]*2;k<starts[gs[g+1]]*2;k+=2){ const x=xy[k]*sc,y=xy[k+1]*sc; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
      bb[g*4]=x0;bb[g*4+1]=y0;bb[g*4+2]=x1;bb[g*4+3]=y1; if(x1>W)W=x1; if(y1>Hh)Hh=y1; }
    const cw=Math.ceil(W/C)+1, ch=Math.ceil(Hh/C)+1, cells=Array.from({length:cw*ch},()=>[]), big=[];
    for(let g=0;g<G;g++){ const a=Math.floor(bb[g*4]/C),b=Math.floor(bb[g*4+1]/C),c=Math.floor(bb[g*4+2]/C),d=Math.floor(bb[g*4+3]/C);
      if((c-a+1)*(d-b+1)>48){ big.push(g); continue; } for(let j=b;j<=d;j++) for(let i=a;i<=c;i++) cells[j*cw+i].push(g); }
    const tcells=Array.from({length:cw*ch},()=>[]); (H.texts||[]).forEach((t,i)=>{ const ci=Math.floor(t[0]/C),cj=Math.floor(t[1]/C); if(ci>=0&&cj>=0&&ci<cw&&cj<ch) tcells[cj*cw+ci].push(i); });
    return {H,flags,xy,starts,gs,G,C,cw,ch,cells,big,tcells,bb,stamp:new Uint32Array(G),tick:0};
  }); }
const PlanLayer=L.Layer.extend({
  initialize(pj){ this.pj=pj; this.T=ctrlToT(pj.ctrl); this._op=.75; this._vecOn=false; },
  onAdd(map){ const img=this._img=L.DomUtil.create('img','plan-img leaflet-zoom-animated'); img.decoding='async';
    img.style.width=this.pj.w+'px'; img.style.height=this.pj.h+'px'; if(this.pj.img) img.src=this.pj.img; else img.style.display='none'; img.onerror=()=>toast('Không tải được ảnh sơ đồ '+this.pj.name);
    map.getPane('planPane').appendChild(img);
    if(this.pj.vec){ this._cv=L.DomUtil.create('canvas','vec-cv'); const vp=map.getPane('vecPane'); if(this.pj.kind==='overlay') vp.insertBefore(this._cv,vp.firstChild); else vp.appendChild(this._cv);
      loadVec(this.pj.vec).then(d=>{ this._vd=d; this._draw(); }).catch(e=>console.warn('vec',e)); }
    map.on('zoomanim',this._anim,this); map.on('viewreset zoomend moveend',this._reset,this); this._reset(); },
  onRemove(map){ L.DomUtil.remove(this._img); if(this._cv) L.DomUtil.remove(this._cv); map.off('zoomanim',this._anim,this); map.off('viewreset zoomend moveend',this._reset,this); },
  setT(T){ this.T=T; if(this._map) this._reset(); },
  setOpacity(){ this._applyOp(); },
  _applyOp(){ if(!this._img) return; const plain=baseName==='plain'; let o=plain?1:this._op;
    if(this._vecOn&&this._vd){ o=this._vd.H.hideRaster?0:Math.min(o,this._vd.H.rasterOpacity??.35); }
    this._img.style.opacity=o; this._img.style.filter=plain?'':'grayscale(1) invert(1) brightness(1.4)'; },
  corners(){ const {w,h}=this.pj; return [[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>unproj(applyT(this.T,x,y))); },
  bounds(){ return L.latLngBounds(this.corners()); },
  _mat(fn){ const {w,h}=this.pj, c=[[0,0],[w,0],[0,h]].map(([x,y])=>fn(unproj(applyT(this.T,x,y))));
    return [(c[1].x-c[0].x)/w,(c[1].y-c[0].y)/w,(c[2].x-c[0].x)/h,(c[2].y-c[0].y)/h,c[0].x,c[0].y]; },
  _set(fn){ const m=this._mat(fn); this._img.style.transform=`matrix(${m.join(',')})`; },
  _reset(){ if(!this._img) return; this._set(ll=>this._map.latLngToLayerPoint(ll)); this._draw(); },
  _anim(e){ this._set(ll=>this._map._latLngToNewLayerPoint(ll,e.zoom,e.center)); if(this._cv) this._cv.style.visibility='hidden'; },
  _draw(){
    const cv=this._cv, d=this._vd, map=this._map; if(!cv||!map) return;
    const m=this._mat(ll=>map.latLngToContainerPoint(ll)); const scale=Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]));
    const on=!!d&&scale>=(this.pj.vecMin||1);
    if(on!==this._vecOn){ this._vecOn=on; } this._applyOp();
    const size=map.getSize(), dpr=Math.min(window.devicePixelRatio||1,2);
    L.DomUtil.setPosition(cv,map.containerPointToLayerPoint([0,0])); cv.style.visibility='visible';
    if(cv.width!==size.x*dpr||cv.height!==size.y*dpr){ cv.width=size.x*dpr; cv.height=size.y*dpr; cv.style.width=size.x+'px'; cv.style.height=size.y+'px'; }
    const ctx=cv.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height); if(!on) return;
    // visible rect in plan px
    const det=m[0]*m[3]-m[1]*m[2], inv=(X,Y)=>{ const x=X-m[4],y=Y-m[5]; return [(m[3]*x-m[2]*y)/det,(-m[1]*x+m[0]*y)/det]; };
    const q=[inv(0,0),inv(size.x,0),inv(0,size.y),inv(size.x,size.y)];
    const x0=Math.min(...q.map(p=>p[0])),x1=Math.max(...q.map(p=>p[0])),y0=Math.min(...q.map(p=>p[1])),y1=Math.max(...q.map(p=>p[1]));
    const {C,cw,ch,cells,big,stamp,xy,starts,gs,flags,H}=d; const tick=++d.tick; const list=[];
    const add=g=>{ if(stamp[g]!==tick){ stamp[g]=tick; list.push(g); } }; big.forEach(add);
    const i0=Math.max(0,Math.floor(x0/C)),i1=Math.min(cw-1,Math.floor(x1/C)),j0=Math.max(0,Math.floor(y0/C)),j1=Math.min(ch-1,Math.floor(y1/C));
    for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) cells[j*cw+i].forEach(add);
    list.sort((a,b)=>a-b);
    ctx.setTransform(dpr*m[0],dpr*m[1],dpr*m[2],dpr*m[3],dpr*m[4],dpr*m[5]); ctx.lineJoin='round'; ctx.lineCap='round';
    const sat=baseName!=='plain', sc=H.scale;
    const T=[];
    for(const g of list){ const st=H.styles[flags[gs[g]]&0x7f];
      if(st.txt){ T.push(g); continue; }
      if(st.fill==='#ffffff'&&sat) continue;
      ctx.beginPath();
      for(let s=gs[g];s<gs[g+1];s++){ let k=starts[s]*2; const e=starts[s+1]*2; ctx.moveTo(xy[k]*sc,xy[k+1]*sc); for(k+=2;k<e;k+=2) ctx.lineTo(xy[k]*sc,xy[k+1]*sc); }
      if(st.fill){ ctx.fillStyle=sat&&st.fill==='#000000'?'#fff':st.fill; ctx.fill(st.eo?'evenodd':'nonzero'); }
      if(st.stroke){ ctx.strokeStyle=sat&&st.stroke==='#000000'?'#fff':st.stroke; ctx.lineWidth=Math.min(Math.max((st.w||0)*scale,.7),2.6)/scale; ctx.stroke(); } }
    // glyph labels (numbers drawn as strokes): enlarge around their centre + halo
    if(T.length){ const bb=d.bb; const draw=(pass)=>{ for(const g of T){
        const x0=bb[g*4],y0=bb[g*4+1],x1=bb[g*4+2],y1=bb[g*4+3]; const h=Math.min(y1-y0,x1-x0>3*(y1-y0)?y1-y0:Math.max(y1-y0,x1-x0)); const hp=(y1-y0)*scale;
        if(hp<2.2) continue; const k=Math.min(2.4,Math.max(1,11/hp)); const cx=(x0+x1)/2, cy=(y0+y1)/2;
        ctx.save(); ctx.translate(cx,cy); ctx.scale(k,k); ctx.translate(-cx,-cy);
        const ink=pass?(sat?'#fff':'#111'):(sat?'rgba(0,0,0,.8)':'rgba(255,255,255,.95)');
        ctx.strokeStyle=ink; ctx.fillStyle=ink; ctx.lineWidth=(pass?1.0:3.6)/(scale*k);
        const ps=new Path2D(), pf=new Path2D(); let hf=false;
        for(let s=gs[g];s<gs[g+1];s++){ const isF=!!H.styles[flags[s]&0x7f].fill; const P=isF?pf:ps; if(isF) hf=true;
          let q=starts[s]*2; const e=starts[s+1]*2; P.moveTo(xy[q]*sc,xy[q+1]*sc); for(q+=2;q<e;q+=2) P.lineTo(xy[q]*sc,xy[q+1]*sc); if(isF) P.closePath(); }
        ctx.stroke(ps); if(hf){ if(pass) ctx.fill(pf); ctx.stroke(pf); } ctx.restore(); } };
      draw(0); draw(1); }
    if(H.texts&&H.texts.length){ ctx.textAlign='center'; ctx.textBaseline='middle'; const seen=new Set();
      for(let j=Math.max(0,j0-1);j<=Math.min(ch-1,j1+1);j++) for(let i=Math.max(0,i0-1);i<=Math.min(cw-1,i1+1);i++) for(const ti of d.tcells[j*cw+i]){
        const t=H.texts[ti]; const boost=t[5]===0?1.6:t[5]===3?1.25:1; let px=t[2]*scale*boost;
        if(t[5]===0){ if(px<4.5) continue; if(px<11) px=11; } else if(px<(t[5]===1?8:9)) continue; if(px>(t[5]===1?40:22)) px=t[5]===1?40:22;
        const fs=px/scale; ctx.save(); ctx.translate(t[0],t[1]); if(t[3]) ctx.rotate(t[3]*Math.PI/180);
        ctx.font=`${t[5]===3?600:700} ${fs}px "Be Vietnam Pro",Arial,sans-serif`;
        ctx.lineJoin='round'; ctx.lineWidth=3/scale; ctx.strokeStyle=sat?'rgba(0,0,0,.85)':'rgba(255,255,255,.95)'; ctx.strokeText(t[4],0,0);
        ctx.fillStyle=sat?'#fff':(t[5]===1?'#0f6b5c':t[5]===2?'#2d6a2a':t[5]===3?'#6b4a2a':'#111'); ctx.fillText(t[4],0,0); ctx.restore(); } }
  }
});
const planLayers={};
function syncPlans(){ // add plan images when in view (lazy)
  if(!document.getElementById('v-map').classList.contains('on')) return;
  const b=map.getBounds().pad(.3);
  for(const pj of Object.values(S.projects)){ if(!(pj.img||pj.vec)||!pj.ctrl) continue;
    let l=planLayers[pj.id];
    if(!l){ l=planLayers[pj.id]=new PlanLayer(pj); }
    const vis=b.intersects(l.bounds())&&map.getZoom()>=13;
    if(vis&&!map.hasLayer(l)) l.addTo(map); else if(!vis&&map.hasLayer(l)) map.removeLayer(l); } }
map.on('moveend',syncPlans);

const gList=L.layerGroup().addTo(map), gLab=L.layerGroup().addTo(map), gSel=L.layerGroup().addTo(map), gMode=L.layerGroup().addTo(map), gPj=L.layerGroup().addTo(map);
const renderer=L.canvas({padding:.3,tolerance:6});

/* ============ Listing geometry ============ */
const pidOf=k=>k.split(':')[0];
const codeOf=k=>{ const s=k.slice(k.indexOf(':')+1); const i=s.lastIndexOf('_'); return [s.slice(0,i),s.slice(i+1)]; };
function hintOf(k){ const h=S.hints[pidOf(k)]; if(!h) return null; const c=k.slice(k.indexOf(':')+1); return h.lots[c]||null; }
function posOf(k){ const r=S.listings[k]; if(r&&r.p) return r.p; const pin=S.pins[safeId(k)]; if(pin&&pin.p) return pin.p; const h=hintOf(k); return h?h.p:null; }
function polyOf(k){ const r=S.listings[k]; if(r&&r.poly) return r.poly; const pin=S.pins[safeId(k)]; if(pin) return pin.poly||null; const h=hintOf(k); return h&&h.poly||null; }
function posSrc(k){ const r=S.listings[k]; if(r&&r.p) return 'tay'; if(S.pins[safeId(k)]) return 'tay'; return hintOf(k)?'cad':null; }
function dirOf(k){ const r=S.listings[k]; return (r&&r.dir)||(hintOf(k)&&hintOf(k).d)||''; }
function areaOf(k){ const r=S.listings[k]; if(r&&r.area) return {v:r.area,est:false}; const h=hintOf(k); return h&&h.a?{v:h.a,est:true}:null; }
function titleOf(k){ const r=S.listings[k]||{}; const pj=S.projects[pidOf(k)];
  if(pj&&pj.kind==='le') return r.title||r.addr||'Nhà/đất'; const [b,n]=codeOf(k); return b+' · Lô '+n; }
function shortOf(k){ const r=S.listings[k]||{}; const pj=S.projects[pidOf(k)];
  if(pj&&pj.kind==='le') return r.title||r.addr||'Nhà/đất'; const [b,n]=codeOf(k); return (pj?pj.name.replace(/^KĐT\s*/,'')+' ':'')+b+' lô '+n; }

/* ============ Filters & render ============ */
const isRecent=r=>r&&r.priceChangedAt&&Date.now()-r.priceChangedAt<DAY;
const stateOf=r=>{ const st=r.status||'ban'; return st==='ban'&&isRecent(r)?'new':st; };
const filterOn=()=>{ const f=S.f; return f.max!=null||f.min!=null||f.dirs.size||f.status.size||f.recent; };
function inProject(k){ return S.cur==='all'||pidOf(k)===S.cur; }
function matches(k){ const r=S.listings[k], f=S.f; if(!r) return false;
  if(f.status.size&&!f.status.has(r.status||'ban')) return false;
  if(f.max!=null&&!(r.price!=null&&r.price<=f.max)) return false;
  if(f.min!=null&&!(r.price!=null&&r.price>=f.min)) return false;
  if(f.dirs.size&&!f.dirs.has(dirOf(k))) return false;
  if(f.recent&&!isRecent(r)) return false; return true; }
function renderMap(){
  gList.clearLayers(); gLab.clearLayers(); gPj.clearLayers();
  const z=map.getZoom(); let n=0; const per={};
  for(const k in S.listings){ const r=S.listings[k]; const p=posOf(k); const ok=matches(k);
    if(ok){ n++; per[pidOf(k)]=(per[pidOf(k)]||0)+1; }
    if(!p) continue;
    const st=stateOf(r), col=COL[st]; const poly=polyOf(k);
    const opt={renderer,color:'#fff',weight:2,fillColor:col,fillOpacity:ok?.95:.25,opacity:ok?1:.4,bubblingMouseEvents:false};
    const lay=(poly&&z>=16.5)?L.polygon(poly,{...opt,color:col,weight:2.5,opacity:ok?1:.4,fillOpacity:ok?.42:.15}):L.circleMarker(p,{...opt,radius:z>=18?9:z>=16?7:5});
    lay.on('click',()=>openLot(k)); gList.addLayer(lay);
    if(z>=16.5) L.tooltip({permanent:true,direction:'top',offset:[0,-8],className:'lp '+(st==='ban'?'':st)+(ok?'':' dim'),interactive:false})
      .setLatLng(p).setContent(r.price!=null?fmt(r.price):'?').addTo(gLab); }
  if(z<15) for(const pj of Object.values(S.projects)){ const l=planLayers[pj.id]; if(!l||pj.kind==='overlay') continue;
    L.marker(l.bounds().getCenter(),{icon:L.divIcon({className:'',html:`<div class="pj" style="transform:translate(-50%,-50%);display:inline-block;white-space:nowrap">${esc(pj.name)} · ${per[pj.id]||0}</div>`})})
      .on('click',()=>selectProject(pj.id)).addTo(gPj); }
  $('#bFilter').classList.toggle('on',filterOn());
  $('#fCount').textContent=filterOn()?n+' căn khớp bộ lọc':'';
}
map.on('zoomend',renderMap);

/* ============ Projects ============ */
async function loadProjects(){
  let base=[]; try{ base=await (await fetch('projects.json',{cache:'no-cache'})).json(); }catch(e){ console.warn(e); }
  for(const p of base) S.projects[p.id]={...p};
  applyPjDocs();
  await Promise.all(Object.values(S.projects).filter(p=>p.hints).map(async p=>{ try{ const h=await (await fetch(p.hints)).json(); S.hints[p.id]=h; }catch(e){ console.warn(e); } }));
  renderPjSelects(); syncPlans(); renderAll();
  const b=allBounds(); if(b){ S._initB=b; if(typeof CURV!=='undefined'&&CURV==='map') map.fitBounds(b,{padding:[20,20]}); }
}
function applyPjDocs(){
  for(const [id,d] of Object.entries(S.pjDocs)){ if(d.deleted){ delete S.projects[id]; continue; }
    S.projects[id]={...(S.projects[id]||{}),...d,id}; const l=planLayers[id];
    if(l){ if(l.pj.img!==S.projects[id].img){ if(map.hasLayer(l)) map.removeLayer(l); delete planLayers[id]; } else { l.pj=S.projects[id]; if(d.ctrl&&!ALIGN) l.setT(ctrlToT(d.ctrl)); } } }
  syncPlans(); }
function allBounds(){ const b=L.latLngBounds([]); for(const pj of Object.values(S.projects)) if(pj.ctrl&&pj.kind!=='overlay') b.extend(new PlanLayer(pj).bounds()); return b.isValid()?b:null; }
function pjList(){ return Object.values(S.projects).filter(p=>p.kind!=='overlay').sort((a,b)=>(a.kind==='le')-(b.kind==='le')||a.name.localeCompare(b.name,'vi')); }
function renderPjSelects(){
  const opts=pjList();
  $('#pjSel').innerHTML=`<option value="all">Tất cả dự án</option>`+opts.map(p=>`<option value="${esc(p.id)}" ${S.cur===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
  const cur=$('#rawPj').value; $('#rawPj').innerHTML=opts.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if(cur&&S.projects[cur]) $('#rawPj').value=cur; else if(S.cur!=='all') $('#rawPj').value=S.cur;
  renderPjList(); }
function selectProject(id){ S.cur=id; $('#pjSel').value=id; closeSheet();
  if(id!=='all'){ const pj=S.projects[id]; $('#rawPj').value=id;
    if(pj.ctrl&&CURV==='map') map.flyToBounds(new PlanLayer(pj).bounds(),{padding:[20,20],duration:.7});
    else { const pts=Object.keys(S.listings).filter(k=>pidOf(k)===id).map(posOf).filter(Boolean); if(pts.length) map.flyToBounds(L.latLngBounds(pts).pad(.2),{maxZoom:17}); } }
  else { const b=allBounds(); if(b&&CURV==='map') map.flyToBounds(b,{duration:.7}); }
  renderAll(); }
$('#pjSel').onchange=e=>selectProject(e.target.value);
function renderPjList(){
  $('#pjList').innerHTML=pjList().map(p=>{ const cnt=Object.keys(S.listings).filter(k=>pidOf(k)===p.id).length;
    return `<div class="card"><div class="pjcard"><div class="ic">${p.kind==='le'?'🏠':'🏘️'}</div><div style="min-width:0;flex:1"><b>${esc(p.name)}</b>
    <div class="meta">${cnt} căn trong giỏ${p.kind==='le'?'':p.img?(p.aligned?' · sơ đồ đã canh':' · <span style="color:var(--bad)">sơ đồ chưa canh vị trí</span>'):' · chưa có sơ đồ'}</div>
    ${p.aliases&&p.aliases.length?`<div class="meta">Từ khoá trong tin Viber: ${esc(p.aliases.join(', '))}</div>`:''}</div></div>
    <div class="row"><button class="btn sm" data-go="${esc(p.id)}">Xem bản đồ</button>${S.canWrite&&p.kind!=='le'?`<button class="btn sm" data-al="${esc(p.id)}">📐 Canh sơ đồ</button>`:''}${S.canWrite?`<button class="btn sm" data-ed="${esc(p.id)}">Sửa</button>`:''}</div></div>`; }).join('');
  $('#pjList').querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ showView('map'); selectProject(b.dataset.go); });
  $('#pjList').querySelectorAll('[data-al]').forEach(b=>b.onclick=()=>{ showView('map'); startAlign(b.dataset.al); });
  $('#pjList').querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>editProject(b.dataset.ed));
}
$('#bNewPj').onclick=()=>{ if(!S.canWrite) return toast('Bạn chỉ có quyền xem'); editProject(null); };
function editProject(id){
  const p=id?S.projects[id]:{kind:'kdt',aliases:[]};
  openModal(`<h2>${id?'Sửa dự án':'Thêm dự án / khu'}</h2>
  <label class="f">Tên</label><input class="t" id="pN" value="${esc(p.name||'')}" placeholder="KĐT An Bình Tân">
  <label class="f" style="margin-top:8px">Loại</label><select class="t" id="pK"><option value="kdt" ${p.kind!=='le'?'selected':''}>Khu đô thị / dự án có sơ đồ phân lô</option><option value="le" ${p.kind==='le'?'selected':''}>Nhà phố, đất lẻ (không cần sơ đồ)</option></select>
  <label class="f" style="margin-top:8px">Từ khoá nhận diện trong tin Viber (cách nhau dấu phẩy)</label><input class="t" id="pA" value="${esc((p.aliases||[]).join(', '))}" placeholder="an bình tân, abt">
  <div id="pImgBox"><label class="f" style="margin-top:8px">Ảnh sơ đồ phân lô (JPG, PNG hoặc PDF)</label><input class="t" id="pF" type="file" accept="image/*,application/pdf">
  <div class="meta" id="pFmsg">${p.img?'Đang dùng sơ đồ hiện có. Chọn file mới để thay.':''}</div></div>
  <div class="row" style="margin-top:12px">${id&&!['mygia','phuochai','le'].includes(id)?'<button class="btn sm danger" id="pDel">Xoá dự án</button>':''}<span style="margin-left:auto"></span><button class="btn" onclick="closeModal()">Huỷ</button><button class="btn pri" id="pSave">Lưu</button></div>`);
  const kindSw=()=>$('#pImgBox').style.display=$('#pK').value==='le'?'none':''; $('#pK').onchange=kindSw; kindSw();
  $('#pSave').onclick=async()=>{ const name=$('#pN').value.trim(); if(!name) return toast('Nhập tên dự án');
    const btn=$('#pSave'); btn.disabled=true; btn.textContent='Đang lưu…';
    try{
      const nid=id||strip(name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)+'-'+Date.now().toString(36).slice(-4);
      const doc={...(S.pjDocs[nid]||{}),name,kind:$('#pK').value,aliases:$('#pA').value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)};
      const f=$('#pF').files[0];
      if(f&&doc.kind!=='le'){ $('#pFmsg').textContent='Đang xử lý sơ đồ…';
        const {blob,w,h}=await fileToPlan(f); $('#pFmsg').textContent='Đang tải lên…';
        doc.img=await store.upload(blob,nid); doc.w=w; doc.h=h;
        // place new plan in the current view; user then aligns
        const b=map.getBounds(), c=map.project(b.getCenter()), sz=map.getSize(); const s=Math.min(sz.x/w,sz.y/h)*.8;
        const tl=map.unproject(c.subtract(L.point(w*s/2,h*s/2))), tr=map.unproject(c.add(L.point(w*s/2,-h*s/2))), bl=map.unproject(c.add(L.point(-w*s/2,h*s/2)));
        doc.ctrl=[[0,0,tl.lat,tl.lng],[w,0,tr.lat,tr.lng],[0,h,bl.lat,bl.lng]]; doc.aligned=false; }
      await savePj(nid,doc); closeModal(); toast('Đã lưu dự án');
      if(f&&doc.kind!=='le'){ showView('map'); S.cur=nid; renderPjSelects(); startAlign(nid); }
    }catch(e){ err(e); btn.disabled=false; btn.textContent='Lưu'; } };
  if($('#pDel')) $('#pDel').onclick=async()=>{ await savePj(id,{deleted:true}); closeModal(); if(S.cur===id) selectProject('all'); toast('Đã xoá dự án'); };
}
async function savePj(id,doc){ doc=clean(doc); await store.set('projects',id,doc); S.pjDocs[id]=doc; applyPjDocs(); renderPjSelects(); renderAll(); }
let pdfjsReady=null;
function loadScript(src){ return new Promise((ok,no)=>{ const s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=()=>no(new Error('Không tải được '+src)); document.head.appendChild(s); }); }
async function fileToPlan(f){
  let canvas;
  if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){
    if(!pdfjsReady) pdfjsReady=loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js').then(()=>{ pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; });
    await pdfjsReady; const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise; const page=await pdf.getPage(1);
    const v0=page.getViewport({scale:1}); const scale=Math.min(4,3600/Math.max(v0.width,v0.height)); const vp=page.getViewport({scale});
    canvas=document.createElement('canvas'); canvas.width=vp.width; canvas.height=vp.height; const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport:vp}).promise;
  } else {
    const img=await new Promise((ok,no)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>no(new Error('Ảnh không đọc được')); i.src=URL.createObjectURL(f); });
    const s=Math.min(1,3600/Math.max(img.naturalWidth,img.naturalHeight));
    canvas=document.createElement('canvas'); canvas.width=Math.round(img.naturalWidth*s); canvas.height=Math.round(img.naturalHeight*s);
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
  }
  const blob=await new Promise(ok=>canvas.toBlob(ok,'image/jpeg',.85));
  return {blob,w:canvas.width,h:canvas.height};
}

/* ============ Map modes: align / pin / draw ============ */
let ALIGN=null, PIN=null;
function modeBar(html){ const m=$('#modeBar'); m.innerHTML=html; m.classList.add('on'); $('#filterPanel').classList.remove('on'); }
function endModes(){ ALIGN=null; PIN=null; gMode.clearLayers(); $('#modeBar').classList.remove('on'); map.getContainer().style.cursor=''; }
$('#bAlign').onclick=()=>{ if(!S.canWrite) return toast('Bạn chỉ có quyền xem');
  let id=S.cur; if(id==='all'||!S.projects[id]||!S.projects[id].img){ const vis=Object.values(planLayers).filter(l=>map.hasLayer(l)); if(vis.length===1) id=vis[0].pj.id; else return toast('Chọn dự án cần canh ở menu trên cùng'); }
  startAlign(id); };
function startAlign(id){
  endModes(); closeSheet(); const pj=S.projects[id]; if(!pj||!pj.img) return toast('Dự án chưa có sơ đồ');
  if(S.cur!==id){ S.cur=id; $('#pjSel').value=id; }
  syncPlans(); let l=planLayers[id]; if(!map.hasLayer(l)){ l.addTo(map); }
  map.flyToBounds(l.bounds(),{padding:[30,30],duration:.5});
  if(baseName==='plain') setBase('sat');
  ALIGN={id,l,T0:l.T.slice(),anchors:[]};
  modeBar(`<b>Canh sơ đồ: ${esc(pj.name)}</b>
  <div class="meta" style="color:#cfd6d3;margin-top:4px" id="alMsg"></div>
  <div class="row"><label class="f" style="margin:0;color:#cfd6d3">Độ đậm sơ đồ</label><input type="range" id="alOp" min="0.15" max="1" step="0.05" value="${l._op}" style="flex:1"></div>
  <div class="row"><button class="btn sm" id="alClr">Xoá điểm</button><button class="btn sm" id="alFit">Đưa sơ đồ vào giữa</button><button class="btn sm" id="alCancel">Huỷ</button><button class="btn sm pri" id="alSave" style="margin-left:auto">Lưu vị trí</button></div>`);
  $('#alOp').oninput=e=>{ l._op=+e.target.value; l._applyOp(); };
  $('#alClr').onclick=()=>{ ALIGN.anchors=[]; alignDraw(); };
  $('#alFit').onclick=()=>{ const {w,h}=pj, c=map.project(map.getCenter()), sz=map.getSize(), s=Math.min(sz.x/w,sz.y/h)*.7;
    const pts=[[0,0],[w,0],[0,h]].map(([x,y])=>{ const ll=map.unproject(c.add(L.point((x-w/2)*s,(y-h/2)*s))); const p=proj([ll.lat,ll.lng]); return [x,y,p.x,p.y]; });
    l.setT(fitAffine(pts,null)); ALIGN.anchors=[]; alignDraw(); };
  $('#alCancel').onclick=()=>{ l.setT(ALIGN.T0); endModes(); };
  $('#alSave').onclick=async()=>{ const ctrl=TtoCtrl(l.T,pj.w,pj.h); try{ await savePj(id,{...(S.pjDocs[id]||{}),ctrl,aligned:true}); toast('Đã lưu vị trí sơ đồ'); endModes(); }catch(e){ err(e); } };
  alignDraw();
}
function alignDraw(){
  gMode.clearLayers(); const A=ALIGN; if(!A) return; const n=A.anchors.length;
  $('#alMsg').innerHTML=[`Chạm vào một điểm dễ nhận ra <b>trên sơ đồ</b> (góc đường, ngã tư, góc khu) để đặt chấm cam, rồi <b>kéo chấm</b> tới đúng chỗ đó trên ảnh vệ tinh.`,
    `Đã có 1 điểm: kéo nó để dời cả sơ đồ. Thêm điểm thứ 2 ở xa điểm 1 để xoay / phóng sơ đồ.`,
    `2 điểm: sơ đồ đã xoay và co giãn theo. Thêm điểm 3 nếu sơ đồ bị méo.`,
    `${n} điểm. Kiểm tra vài chỗ khác cho khớp rồi bấm Lưu.`][Math.min(n,3)];
  A.anchors.forEach((a,i)=>{ const mk=L.marker(a.ll,{draggable:true,icon:L.divIcon({className:'',html:`<div class="anc">${i+1}</div>`,iconSize:[0,0]})}).addTo(gMode);
    mk.on('drag',e=>{ a.ll=e.target.getLatLng(); alignFit(); }); mk.on('dragend',()=>alignFit());
    mk.on('contextmenu',()=>{ A.anchors.splice(i,1); alignDraw(); }); });
}
function alignFit(){ const A=ALIGN; const pairs=A.anchors.map(a=>{ const p=proj([a.ll.lat,a.ll.lng]); return [a.ix,a.iy,p.x,p.y]; });
  const base=A.anchors.length===1?A.Tdrag:A.l.T; const T=fitAffine(pairs,base); if(T) A.l.setT(T); }
function onMapClickMode(e){
  if(ALIGN){ const p=proj([e.latlng.lat,e.latlng.lng]); const [ix,iy]=invT(ALIGN.l.T,p.x,p.y);
    if(ALIGN.anchors.length>=6) return toast('Tối đa 6 điểm');
    ALIGN.Tdrag=ALIGN.l.T.slice(); ALIGN.anchors.push({ix,iy,ll:e.latlng}); alignDraw(); return true; }
  if(PIN){ if(PIN.kind==='point'){ PIN.done([e.latlng.lat,e.latlng.lng],null); endModes(); }
    else { PIN.pts.push([e.latlng.lat,e.latlng.lng]); pinDraw(); } return true; }
  return false; }
map.on('click',onMapClickMode);
function startPin(k,kind){
  endModes(); closeSheet(); showView('map');
  const p=posOf(k); if(p) map.flyTo(p,Math.max(map.getZoom(),19),{duration:.5});
  else if(S.projects[pidOf(k)]&&planLayers[pidOf(k)]) map.flyToBounds(planLayers[pidOf(k)].bounds(),{duration:.5});
  PIN={k,kind,pts:[],done:async(pt,poly)=>{ await savePin(k,pt,poly); toast('Đã ghim vị trí'); openLot(k); }};
  map.getContainer().style.cursor='crosshair';
  modeBar(`<b>${kind==='poly'?'Khoanh ranh':'Ghim vị trí'}: ${esc(shortOf(k))}</b>
  <div class="meta" style="color:#cfd6d3;margin-top:4px">${kind==='poly'?'Chạm lần lượt các góc của lô (ít nhất 3 góc), rồi bấm Xong.':'Phóng to rồi chạm vào đúng lô trên sơ đồ.'}</div>
  <div class="row">${kind==='poly'?'<button class="btn sm" id="pnUndo">↶ Bỏ góc</button>':''}<button class="btn sm" id="pnCancel">Huỷ</button>${kind==='poly'?'<button class="btn sm pri" id="pnDone" style="margin-left:auto">Xong</button>':''}</div>`);
  $('#pnCancel').onclick=()=>{ endModes(); openLot(k); };
  if(kind==='poly'){ $('#pnUndo').onclick=()=>{ PIN.pts.pop(); pinDraw(); };
    $('#pnDone').onclick=()=>{ if(PIN.pts.length<3) return toast('Cần ít nhất 3 góc'); const pts=PIN.pts; const c=[pts.reduce((s,p)=>s+p[0],0)/pts.length,pts.reduce((s,p)=>s+p[1],0)/pts.length]; const d=PIN.done; endModes(); d(c,pts); }; }
}
function pinDraw(){ gMode.clearLayers(); if(!PIN) return; if(PIN.pts.length>1) L.polygon(PIN.pts,{color:'#c2410c',weight:2,fillOpacity:.15,interactive:false}).addTo(gMode);
  PIN.pts.forEach(p=>L.marker(p,{interactive:false,icon:L.divIcon({className:'',html:'<div class="vtx"></div>',iconSize:[0,0]})}).addTo(gMode)); }
function polyArea(poly){ if(!poly||poly.length<3) return null; const P=poly.map(p=>{ const q=proj(p); return [q.x,q.y]; }); let a=0;
  for(let i=0;i<P.length;i++){ const p=P[i],q=P[(i+1)%P.length]; a+=p[0]*q[1]-q[0]*p[1]; } const k=Math.cos(poly[0][0]*Math.PI/180); return Math.abs(a)/2*k*k; }

/* ============ Lot sheet ============ */
function openLot(k){
  if(ALIGN||PIN) return;
  S.sel=k; const r=S.listings[k]; const pj=S.projects[pidOf(k)]||{name:'?'}; gSel.clearLayers();
  const p=posOf(k), poly=polyOf(k);
  if(poly) L.polygon(poly,{weight:3,color:'#c2410c',fill:false,interactive:false}).addTo(gSel);
  else if(p) L.circleMarker(p,{radius:14,color:'#c2410c',weight:3,fill:false,interactive:false}).addTo(gSel);
  const st=r?(r.status||'ban'):'none'; const ar=areaOf(k), h=hintOf(k);
  let x=`<div class="meta" style="margin:0">${esc(pj.name)}</div><div style="display:flex;align-items:center;gap:8px"><h2>${esc(titleOf(k))}</h2><span class="st ${st}" style="margin-left:auto">${r?STATUS[st]:'Chưa có'}</span></div>`;
  if(r){ x+=`<div class="price">${fmtTy(r.price)}${r.price!=null&&ar?` <span style="font-size:14px;color:var(--mut);font-weight:500">≈ ${fmt(r.price*1000/ar.v,1)} tr/m²</span>`:''}</div>`;
    if(r.flag&&ADMIN) x+=`<div class="warn">⚠️ ${esc(r.flag)}</div>`; }
  x+=`<div class="kv">`;
  if(r&&r.addr) x+=`<span>Địa chỉ</span><span>${esc(r.addr)}</span>`;
  x+=`<span>Diện tích</span><span>${ar?fmt(ar.v,1)+' m²'+(ar.est?' <span class="tag">≈ theo bản vẽ CAD</span>':''):'—'}${(r&&r.front)||(h&&h.w)?` · ngang ${fmt((r&&r.front)||h.w,1)} m`:''}</span>`;
  x+=`<span>Hướng</span><span>${esc(dirOf(k)||'—')}${!(r&&r.dir)&&h&&h.d?' <span class="tag">theo bản vẽ</span>':''}${h&&h.c?' · <b>lô góc</b>':''}</span>`;
  if(r){ x+=`<span>Hoa hồng</span><span>${r.hh!=null?fmt(r.hh)+'%':'—'}</span><span>Nguồn</span><span>${esc(r.source||'—')}</span>`;
    x+=`<span>Người đăng</span><span>${esc(r.poster||'—')}${r.postedAt?' · '+esc(r.postedAt):''}</span><span>Cập nhật</span><span>${ago(r.updatedAt)}</span>`; }
  x+=`<span>Vị trí</span><span>${p?(posSrc(k)==='cad'?(h&&h.q?'<b style="color:var(--bad)">Tự động – chưa chắc</b>, bấm Ghim lại nếu sai':'Tự động theo số lô trên bản vẽ'):'Đã ghim tay'):'<b style="color:var(--bad)">Chưa ghim</b>'}</span></div>`;
  if(r&&r.note) x+=`<div class="note">${esc(r.note)}</div>`;
  if(r&&r.history&&r.history.length){ x+=`<div class="hist"><b>Lịch sử giá</b>`;
    r.history.forEach((q,i)=>{ const pr=r.history[i+1]; let d='';
      if(pr&&q.price!=null&&pr.price!=null&&q.price!==pr.price){ const df=q.price-pr.price; d=` <span class="${df>0?'up':'down'}">${df>0?'▲':'▼'} ${fmt(Math.abs(df))}</span>`; }
      x+=`<div><span>${new Date(q.at).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}${q.by?' · '+esc(q.by):''}</span><b>${fmtTy(q.price)}${d}</b></div>`; });
    x+=`</div>`; }
  x+=`<div class="row" style="margin-top:12px">`;
  if(r) x+=`<button class="btn sm pri" id="sDet">Xem chi tiết</button><button class="btn sm" id="sCopy">Copy</button>`;
  if(S.canWrite) x+=`<button class="btn sm" id="sEdit">${r?'Sửa giá / trạng thái':'＋ Thêm vào giỏ'}</button><button class="btn sm" id="sPin">📍 ${p?'Ghim lại':'Ghim vị trí'}</button><button class="btn sm" id="sPoly">⬠ Khoanh ranh</button>`;
  if(p) x+=`<a class="btn sm" target="_blank" rel="noopener" href="${gmaps(p)}">Google Maps</a>`;
  x+=`<button class="btn sm" id="sClose" style="margin-left:auto">Đóng</button></div>`;
  $('#sheetBody').innerHTML=x; $('#sheet').classList.add('on');
  $('#sClose').onclick=closeSheet;
  if($('#sCopy')) $('#sCopy').onclick=()=>copyText(lotText(k));
  if($('#sDet')) $('#sDet').onclick=()=>openDetail(k);
  if($('#sEdit')) $('#sEdit').onclick=()=>openEdit(k);
  if($('#sPin')) $('#sPin').onclick=()=>startPin(k,'point');
  if($('#sPoly')) $('#sPoly').onclick=()=>startPin(k,'poly');
}
const gmaps=p=>`https://www.google.com/maps?q=${p[0].toFixed(6)},${p[1].toFixed(6)}`;
function closeSheet(){ $('#sheet').classList.remove('on'); gSel.clearLayers(); S.sel=null; }
function lotText(k){ const r=S.listings[k]||{}, pj=S.projects[pidOf(k)]||{}, ar=areaOf(k), p=posOf(k), h=hintOf(k);
  return [`🏠 ${pj.kind==='le'?'':pj.name+' – '}${titleOf(k)}`, r.addr&&pj.kind!=='le'?'Địa chỉ: '+r.addr:'',
    [dirOf(k)?'Hướng '+dirOf(k):'',ar?'DT '+fmt(ar.v,1)+' m²':'',(r.front||(h&&h.w))?'ngang '+fmt(r.front||h.w,1)+' m':''].filter(Boolean).join(' · '),
    `Giá: ${fmtTy(r.price)}`, r.note?'Ghi chú: '+r.note:'', p?'Vị trí: '+gmaps(p):''].filter(Boolean).join('\n'); }
async function copyText(t){ try{ await navigator.clipboard.writeText(t); toast('Đã copy'); }
  catch(e){ openModal(`<h2>Copy nội dung</h2><textarea class="t" rows="9" readonly>${esc(t)}</textarea><div class="row"><button class="btn" onclick="closeModal()">Đóng</button></div>`);
    const ta=$('#mEditBox textarea'); ta.focus(); ta.select(); } }
function flyTo(k){ showView('map'); map.invalidateSize(); S._fit=1; const p=posOf(k), poly=polyOf(k);
  if(poly) map.flyToBounds(L.latLngBounds(poly).pad(1),{maxZoom:20,duration:.6}); else if(p) map.flyTo(p,Math.max(map.getZoom(),19),{duration:.6});
  setTimeout(()=>openLot(k),p?650:0); }

/* ============ Edit listing ============ */
function openModal(html){ $('#mEditBox').innerHTML=html; $('#mEdit').classList.add('on'); }
function closeModal(){ $('#mEdit').classList.remove('on'); }
$('#mEdit').addEventListener('click',e=>{ if(e.target.id==='mEdit') closeModal(); });
function parseLatLng(s){ s=String(s||''); let m=/@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(s)||/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(s)||/[?&](?:q|ll|query|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/.exec(s)||/(-?\d{1,2}\.\d{3,})\s*[,; ]\s*(-?\d{2,3}\.\d{3,})/.exec(s);
  return m?[+m[1],+m[2]]:null; }
let proj4Ready=null;
async function vn2000(text,lon0){
  if(!proj4Ready) proj4Ready=loadScript('https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.2/proj4.js'); await proj4Ready;
  const def=`+proj=tmerc +lat_0=0 +lon_0=${lon0} +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs`;
  const pts=[]; for(const ln of text.split(/\n/)){ const ns=(ln.match(/\d{6,7}[.,]\d+|\d{6,7}/g)||[]).map(v=>num(v)); if(ns.length<2) continue;
    let [a,b]=ns.slice(-2); let X=a,Y=b; if(X<Y){ [X,Y]=[Y,X]; } // X (northing, 7 digits) > Y (easting, 6 digits)
    const [lng,lat]=proj4(def,'EPSG:4326',[Y,X]); pts.push([+lat.toFixed(7),+lng.toFixed(7)]); }
  return pts; }
function openEdit(k,preset){
  const r=k?(S.listings[k]||{}):(preset||{}); const pid=k?pidOf(k):(r.pid||(S.cur!=='all'?S.cur:pjList()[0].id));
  const isLe=id=>(S.projects[id]||{}).kind==='le';
  const [b,n]=k&&!isLe(pid)?codeOf(k):['',''];
  openModal(`<h2>${k?esc(titleOf(k)):'Thêm hàng vào giỏ'}</h2>
  ${k?'':`<label class="f">Dự án</label><select class="t" id="eJ">${pjList().map(p=>`<option value="${esc(p.id)}" ${p.id===pid?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`}
  <div id="eKdt" class="grid2" style="margin-top:8px"><div><label class="f">Mã dãy</label><input class="t" id="eB" value="${esc(b||r.block||'')}" placeholder="LK5-8" ${k?'disabled':''}></div><div><label class="f">Số lô</label><input class="t" id="eL" value="${esc(n||r.lot||'')}" ${k?'disabled':''}></div></div>
  <div id="eLe" style="margin-top:8px"><label class="f">Tiêu đề</label><input class="t" id="eTi" value="${esc(r.title||'')}" placeholder="Nhà 3 tầng MT Phong Châu">
    <label class="f" style="margin-top:8px">Địa chỉ</label><input class="t" id="eAd" value="${esc(r.addr||'')}">
    <label class="f" style="margin-top:8px">Vị trí: dán link Google Maps hoặc toạ độ "12.23, 109.18"</label><input class="t" id="eLL" value="${r.p?r.p.join(', '):''}" placeholder="https://www.google.com/maps/@12.2312,109.1832,18z">
    <details style="margin-top:6px"><summary class="meta">Nhập toạ độ VN-2000 trên sổ (vẽ đúng ranh thửa)</summary>
      <textarea class="t" id="eVN" rows="4" placeholder="Mỗi dòng 1 góc: X  Y&#10;1354123.45  599876.12"></textarea>
      <div class="row"><label class="f" style="margin:0">Kinh tuyến trục</label><select class="t" id="eLon" style="width:auto"><option value="108.25">108°15' (Khánh Hoà)</option><option value="108.5">108°30' (Ninh Thuận, Phú Yên)</option><option value="107.75">107°45' (Lâm Đồng)</option></select></div></details></div>
  <div class="grid2" style="margin-top:8px"><div><label class="f">Giá (tỷ)</label><input class="t" id="eP" type="number" step="0.01" inputmode="decimal" value="${r.price??''}"></div>
  <div><label class="f">Hoa hồng (%)</label><input class="t" id="eH" type="number" step="0.1" inputmode="decimal" value="${r.hh??''}"></div>
  <div><label class="f">Diện tích (m²)</label><input class="t" id="eA" type="number" step="0.1" inputmode="decimal" value="${r.area??''}" placeholder="${k&&hintOf(k)?'≈ '+fmt(hintOf(k).a,1):''}"></div>
  <div><label class="f">Ngang (m)</label><input class="t" id="eW" type="number" step="0.1" inputmode="decimal" value="${r.front??''}"></div>
  <div><label class="f">Trạng thái</label><select class="t" id="eS">${Object.entries(STATUS).map(([v,t])=>`<option value="${v}" ${(r.status||'ban')===v?'selected':''}>${t}</option>`).join('')}</select></div>
  <div><label class="f">Hướng</label><select class="t" id="eD"><option value="">${k&&hintOf(k)&&hintOf(k).d?'Theo bản vẽ ('+hintOf(k).d+')':'—'}</option>${DIRS.map(d=>`<option ${r.dir===d?'selected':''}>${d}</option>`).join('')}</select></div>
  <div><label class="f">Nguồn</label><input class="t" id="eSrc" value="${esc(r.source||'')}" placeholder="Chính chủ"></div>
  <div><label class="f">Người đăng</label><input class="t" id="ePo" value="${esc(r.poster||'')}"></div></div>
  <label class="f" style="margin-top:8px">Ghi chú</label><textarea class="t" id="eN" rows="3">${esc(r.note||'')}</textarea>
  <div class="row" style="margin-top:12px">${k&&S.listings[k]?'<button class="btn sm danger" id="eDel">Xoá khỏi giỏ</button>':''}<span style="margin-left:auto"></span><button class="btn" onclick="closeModal()">Huỷ</button><button class="btn pri" id="eSave">Lưu</button></div>`);
  const sw=()=>{ const j=k?pid:$('#eJ').value; $('#eKdt').style.display=isLe(j)?'none':''; $('#eLe').style.display=isLe(j)?'':'none'; };
  if($('#eJ')) $('#eJ').onchange=sw; sw();
  $('#eSave').onclick=async()=>{
    const j=k?pid:$('#eJ').value; const v=x=>$(x).value.trim(); const nn=x=>v(x)===''?null:num(v(x));
    let kk=k, rec={price:nn('#eP'),hh:nn('#eH'),area:nn('#eA'),front:nn('#eW'),status:v('#eS'),dir:v('#eD')||null,source:v('#eSrc'),poster:v('#ePo'),note:v('#eN'),flag:null};
    if(isLe(j)){ rec.title=v('#eTi'); rec.addr=v('#eAd'); if(!rec.title&&!rec.addr) return toast('Nhập tiêu đề hoặc địa chỉ');
      if(v('#eVN')){ try{ const pts=await vn2000(v('#eVN'),v('#eLon')); if(pts.length>=3){ rec.poly=pts; rec.p=[pts.reduce((s,p)=>s+p[0],0)/pts.length,pts.reduce((s,p)=>s+p[1],0)/pts.length]; if(!rec.area) rec.area=Math.round(polyArea(pts)*10)/10; } else return toast('Cần ít nhất 3 góc toạ độ'); }catch(e){ return err(e); } }
      else if(v('#eLL')){ const p=parseLatLng(v('#eLL')); if(!p) return toast('Không đọc được vị trí. Mở Google Maps, chạm giữ vào lô, copy toạ độ dạng 12.23, 109.18'); rec.p=p; }
      if(!kk) kk=j+':'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); }
    else if(!kk){ const fb=fixBlock(j,v('#eB')); if(!fb.block||!v('#eL')) return toast('Nhập mã dãy và số lô'); kk=lotKey(j,fb.block,v('#eL')); }
    if(await saveListing(kk,rec)){ closeModal(); if(CURV==='detail') openDetail(kk); else if(CURV==='map') openLot(kk); toast('Đã lưu'); if(!posOf(kk)) toast('Đã lưu. Bấm "📍 Ghim vị trí" để đặt lô lên bản đồ'); } };
  if($('#eDel')) $('#eDel').onclick=async()=>{ await deleteListing(k); closeModal(); closeSheet(); toast('Đã xoá'); };
}

/* ============ Storage backends ============ */
let store=null;
function onData(coll,docs){
  if(coll==='listings'){ S.listings={}; for(const [id,x] of Object.entries(docs)){ if(!x) continue; const k=x.key||(x.block?lotKey(x.pid||'mygia',x.block,x.lot):null); if(k) S.listings[k]={...x,key:k}; }
    if(S.sel&&$('#sheet').classList.contains('on')&&!ALIGN&&!PIN) openLot(S.sel); }
  else if(coll==='demands') S.demands=docs;
  else if(coll==='pins') S.pins=docs;
  else if(coll==='projects'){ S.pjDocs=docs; applyPjDocs(); renderPjSelects(); }
  renderAll(); }
const COLLS=['projects','listings','pins','demands'];
function setConn(st,t){ const c=$('#conn'); c.className=st; c.textContent=t; }
function localStore(){
  const read=c=>{ try{ return JSON.parse(localStorage.getItem('bds_'+c)||'{}'); }catch(e){ return {}; } };
  const mem={}; COLLS.forEach(c=>mem[c]=read(c));
  const put=c=>{ try{ localStorage.setItem('bds_'+c,JSON.stringify(mem[c])); }catch(e){} onData(c,{...mem[c]}); };
  setConn('off','Chế độ thử · lưu trên máy này'); setTimeout(()=>COLLS.forEach(c=>onData(c,{...mem[c]})),0);
  return { async set(c,id,d){ mem[c][id]=d; put(c); }, async del(c,id){ delete mem[c][id]; put(c); },
    async upload(blob){ toast('Chế độ thử: sơ đồ chỉ giữ tới khi tải lại trang'); return URL.createObjectURL(blob); } };
}
async function claudeStore(){
  if(!window.claude||!claude.use) return null;
  const [db,user,assets]=await Promise.all([claude.use('db'),claude.use('user'),claude.use('assets')]);
  if(!db) return null;
  if(user){ try{ const c=await user.can('data.write'); if(c===false) S.canWrite=false; }catch(e){} }
  let timer=setTimeout(()=>setConn('off','Chưa kết nối được dữ liệu'),10000);
  for(const c of COLLS) db.collection(c).onSnapshot(snap=>{ const o={}; snap.docs.forEach(d=>o[d.id]=d.data()); onData(c,o);
      if(!snap.metadata.fromCache){ clearTimeout(timer); setConn('live','● Trực tuyến'+(S.canWrite?'':' · chỉ xem')); } },
    e=>{ clearTimeout(timer); setConn('off','Mất kết nối dữ liệu'); console.warn(e); });
  const wrap=async fn=>{ try{ return await fn(); }catch(e){ if(e&&e.code==='invalid_argument'){ S.canWrite=false; renderAll(); throw new Error('Bạn chỉ có quyền xem'); } throw e; } };
  return { set:(c,id,d)=>wrap(()=>db.collection(c).doc(safeId(id)).set(d)), del:(c,id)=>wrap(()=>db.collection(c).doc(safeId(id)).delete()),
    async upload(blob){ if(!assets) throw new Error('Chỉ chủ app mới tải được sơ đồ lên'); const a=await assets.upload(blob); return a.url||('/_blob/'+a.id); } };
}
async function supabaseStore(){
  if(!CFG.supabaseUrl||!CFG.supabaseKey) return null;
  await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
  const sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseKey); const T=CFG.table||'mygia';
  async function pull(){ const {data,error}=await sb.from(T).select('coll,id,data');
    if(error){ setConn('off','Lỗi dữ liệu'); console.warn(error); return; }
    const o={}; COLLS.forEach(c=>o[c]={}); for(const r of data) if(o[r.coll]) o[r.coll][r.id]=r.data;
    COLLS.forEach(c=>onData(c,o[c])); setConn('live','● Trực tuyến'+(S.canWrite?'':' · chỉ xem')); }
  async function auth(){ const {data}=await sb.auth.getSession(); S.canWrite=!!data.session;
    const b=$('#bLogin'); b.style.display=''; b.textContent=S.canWrite?'Đăng xuất':'Đăng nhập'; $('#conn').style.marginLeft='0'; renderAll(); renderPjList(); }
  $('#bLogin').onclick=async()=>{ if(S.canWrite){ await sb.auth.signOut(); await auth(); return; }
    openModal(`<h2>Đăng nhập để cập nhật giỏ hàng</h2><label class="f">Email</label><input class="t" id="aE" type="email" autocomplete="username"><label class="f" style="margin-top:8px">Mật khẩu</label><input class="t" id="aP" type="password" autocomplete="current-password">
      <div class="row" style="margin-top:12px"><span style="margin-left:auto"></span><button class="btn" onclick="closeModal()">Huỷ</button><button class="btn pri" id="aGo">Đăng nhập</button></div>`);
    $('#aGo').onclick=async()=>{ const {error}=await sb.auth.signInWithPassword({email:$('#aE').value.trim(),password:$('#aP').value});
      if(error) return toast('Sai email hoặc mật khẩu'); closeModal(); await auth(); toast('Đã đăng nhập'); }; };
  await auth(); await pull();
  sb.channel('bds').on('postgres_changes',{event:'*',schema:'public',table:T},()=>pull()).subscribe(); setInterval(pull,60000);
  const chk=r=>{ if(r.error) throw new Error(r.error.message); return r; };
  return { async set(c,id,d){ chk(await sb.from(T).upsert({coll:c,id,data:d,updated_at:new Date().toISOString()})); },
    async del(c,id){ chk(await sb.from(T).delete().eq('coll',c).eq('id',id)); },
    async upload(blob,name){ const path=name+'-'+Date.now()+'.jpg'; chk(await sb.storage.from('plans').upload(path,blob,{contentType:'image/jpeg'})); return sb.storage.from('plans').getPublicUrl(path).data.publicUrl; } };
}
async function initStore(){
  try{ store=await supabaseStore(); if(store){ S.mode='supabase'; return; } }catch(e){ console.warn(e); }
  try{ store=await claudeStore(); if(store){ S.mode='claude'; return; } }catch(e){ console.warn(e); }
  store=localStore(); S.mode='local'; }
function err(e){ toast(e&&e.message?e.message:'Không lưu được, thử lại sau'); console.warn(e); return false; }

async function saveListing(k,rec){
  const cur=S.listings[k]; const now=Date.now(); const pid=pidOf(k); const pj=S.projects[pid]||{};
  const m={...(cur||{}),...rec,key:k,pid}; if(pj.kind!=='le'){ const [b,n]=codeOf(k); m.block=b; m.lot=n; }
  for(const f of ['area','front','dir','hh']) if(m[f]==null||m[f]==='') delete m[f];
  const changed=!cur||cur.price!==m.price; const hist=(cur&&cur.history)?cur.history.slice():[];
  if(changed) hist.unshift({price:m.price,at:now,by:m.poster||''});
  m.history=hist.slice(0,20); m.updatedAt=now; m.priceChangedAt=changed?now:(cur&&cur.priceChangedAt)||now;
  const doc=clean(m);
  try{ await store.set('listings',k,doc); }catch(e){ return err(e); }
  S.listings[k]=doc; renderAll(); return true; }
async function deleteListing(k){ try{ await store.del('listings',k); }catch(e){ return err(e); } delete S.listings[k]; renderAll(); }
async function savePin(k,p,poly){ const pj=S.projects[pidOf(k)]||{};
  if(pj.kind==='le'){ const rec={p}; if(poly){ rec.poly=poly; const r=S.listings[k]; if(!(r&&r.area)) rec.area=Math.round(polyArea(poly)*10)/10; } else rec.poly=null; return saveListing(k,rec); }
  const d=clean({p,poly:poly||null,key:k,at:Date.now()});
  try{ await store.set('pins',k,d); }catch(e){ return err(e); } S.pins[safeId(k)]=d;
  if(poly&&S.listings[k]&&!S.listings[k].area) await saveListing(k,{area:Math.round(polyArea(poly)*10)/10}); else renderAll(); }
async function saveDemand(d){ const id='d'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); d=clean({...d,createdAt:Date.now()});
  try{ await store.set('demands',id,d); }catch(e){ return err(e); } S.demands[id]=d; renderAll(); return true; }
async function deleteDemand(id){ try{ await store.del('demands',id); }catch(e){ return err(e); } delete S.demands[id]; renderAll(); }

/* ============ Viber parser ============ */
const DIR_RE=/(đông\s*nam|đông\s*bắc|tây\s*nam|tây\s*bắc|đông|tây|nam|bắc)/gi;
const cap=s=>s.toLowerCase().replace(/\s+/g,' ').replace(/(^|\s)\S/g,m=>m.toUpperCase());
function fixBlock(pid,raw){
  const b=normBlock(raw); const h=S.hints[pid]; const set=h&&h._set||(h&&(h._set=new Set(h.blocks)));
  if(!set||!b||set.has(b)) return {block:b};
  const m=/^([A-Z]+)(\d)(\d{1,2})$/.exec(b); if(m&&set.has(m[1]+m[2]+'-'+m[3])) return {block:m[1]+m[2]+'-'+m[3],fixed:b};
  return {block:b,unknown:true}; }
function detectProject(t){ const s=strip(t); let best=null,len=0;
  for(const p of Object.values(S.projects)) for(const a of (p.aliases||[])){ const as=strip(a); if(as.length>len&&new RegExp('(^|[^a-z0-9])'+as.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)').test(s)){ best=p.id; len=as.length; } }
  return best; }
function roadLot(t,pid){
  const h=S.hints[pid]||{}; const al=h.aliases||{}; let m;
  m=/(?:^|[^A-Za-z0-9])([ABV]\d{1,2})\s*-\s*(\d{1,3}[A-Za-z]?)(?!\d)/.exec(t); if(m) return {road:m[1].toUpperCase(),lot:m[2],m:m[0]};
  m=/(?:^|[^A-Za-z0-9])(\d{1,3}A?)\s*([ABV]\d{1,2})(?!\d)/.exec(t); if(m) return {road:m[2].toUpperCase(),lot:m[1],m:m[0]};
  m=/l[ôo]\s*(\d{1,3}[A-Za-z]?)\s*(?:đường|duong)\s*([ABV]\d{1,2})(?!\d)/i.exec(t); if(m) return {road:m[2].toUpperCase(),lot:m[1],m:m[0]};
  m=/l[ôo]\s*(\d{1,3}[A-Za-z]?)\s*(?:đường|duong)\s+(\S+(?:\s+\S+)?)/i.exec(t);
  if(m){ const name=strip(m[2]).toUpperCase(); for(const [k,v] of Object.entries(al)) if(name.startsWith(strip(k).toUpperCase())) return {road:v,lot:m[1],m:m[0]}; }
  return null; }
function splitLots(msg,pid){
  const pj=S.projects[pid]||{}; if(!pj.roadLots) return [msg];
  const lines=msg.text.split('\n'); const idx=lines.map((l,i)=>roadLot(l,pid)?i:-1).filter(i=>i>=0);
  if(idx.length<2) return [msg];
  const tail=lines.filter((l,i)=>!idx.includes(i)&&/(ngu[ồo]n|hh|hoa h[ồo]ng|chính chủ|\bcc\b)/i.test(l)).join(' ');
  return idx.map((i,n)=>{ const end=n+1<idx.length?idx[n+1]:lines.length; const seg=lines.slice(i,end).join(' ');
    return {...msg,text:seg+(/(hh|hoa h)/i.test(seg)?'':' '+tail)}; }); }
function splitMessages(text){
  const lines=text.normalize('NFC').replace(/\r/g,'').split('\n'); const out=[]; let cur=null;
  const head=/^\s*\[?\s*((?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?[ ,]*)?\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?)\s*\]?\s*[-–]?\s*([^:\n]{2,40}?):\s*(.*)$/;
  for(const ln of lines){ const m=head.exec(ln);
    if(m){ cur={at:m[1].trim(),poster:m[2].trim(),text:m[3]}; out.push(cur); } else if(!ln.trim()) cur=null;
    else if(cur) cur.text+='\n'+ln; else { cur={text:ln}; out.push(cur); } }
  return out.filter(m=>m.text.trim()); }
function parsePrice(t){
  let m=/(\d{1,3})\s*t[ỷỉy]\s*(\d{1,3})(?!\s*[%\d])/i.exec(t); if(m) return {price:parseFloat(m[1]+'.'+m[2])};
  m=/gi[áa]\s*(?:b[áa]n|ch[àa]o)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(t[ỷỉy]|tr(?:i[ệe]u)?|t\b)?\s*(\/\s*m)?/i.exec(t)||/(\d+(?:[.,]\d+)?)\s*(t[ỷỉy])/i.exec(t);
  if(!m) return {}; const v=num(m[1]),u=(m[2]||'').toLowerCase();
  if(m[3]) return {unit:v}; if(u.startsWith('t')&&!u.startsWith('tr')) return {price:v}; if(u.startsWith('tr')) return {price:v/1000};
  if(v<20) return {price:v}; if(v<200) return {price:v/10,flag:`Giá viết tắt "${m[1]}" — đang hiểu là ${fmt(v/10)} tỷ, kiểm tra lại`};
  return {price:v/1000,flag:`Giá "${m[1]}" không có đơn vị — đang hiểu là ${fmt(v/1000)} tỷ`}; }
function common(t,r){
  const hm=/(?:hh|hoa\s*h[ồo]ng)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%/i.exec(t); if(hm) r.hh=num(hm[1]);
  if(/\b(cc|ch[íi]nh\s*ch[ủu])\b/i.test(t)) r.source='Chính chủ';
  r.status=/(đ[ãa]\s*b[áa]n|\bbay\b|ra\s*h[àa]ng|\bsold\b)/i.test(t)?'daban':/(đ[ãa]\s*c[ọo]c|\bdc\b)/i.test(t)?'coc':'ban';
  const hd=/h[ưu][ớo]ng\s*(đông\s*nam|đông\s*bắc|tây\s*nam|tây\s*bắc|đông|tây|nam|bắc)/i.exec(t); if(hd) r.dir=cap(hd[1]);
  const am=/(\d+(?:[.,]\d+)?)\s*m(?:2|²|\s*vuông)/i.exec(t); if(am) r.area=num(am[1]);
  const wm=/ngang\s*(\d+(?:[.,]\d+)?)\s*m?/i.exec(t); if(wm) r.front=num(wm[1]); }
function parseMsg(msg,defPid){
  const t=msg.text.replace(/\s+/g,' ').trim(); const r={raw:msg.text.trim(),poster:msg.poster||'',postedAt:msg.at||''};
  r.pid=detectProject(t)||defPid;
  const bm=/\b(LK|BT|SH|KD|NP|TM|NV|LO|DV|CL|A|B|C|D|E)\s*(\d{1,3})(?:\s*[-.\/]\s*(\d{1,3}))?\b/i.exec(t);
  const lm=/(?:^|[^a-zà-ỹ])(?:l[ôo]|c[ăa]n|n[ềe]n)\s*(?:s[ốo]\s*)?[:#]?\s*(\d{1,3}[a-z]?)\b/i.exec(t);
  const dm=/(c[ầa]n\s*mua|kh[áa]ch\s*(?:c[ầa]n|t\/c|tc|t[ìi]m)|t[ìi]m\s*l[ôo]|c[ầa]n\s*t[ìi]m|ai\s*c[óo])/i.exec(t);
  const pj=S.projects[r.pid]||{};
  if(dm||(/t\/c|tài chính/i.test(t)&&!lm)){ r.kind='demand';
    const b=/(?:t\/c|tc|t[àa]i\s*ch[íi]nh|t[ầa]m|kho[ảa]ng|d[ưu][ớo]i)\s*:?\s*(\d+(?:[.,]\d+)?)\s*t[ỷỉy]/i.exec(t)||/(\d+(?:[.,]\d+)?)\s*t[ỷỉy]/i.exec(t); if(b) r.budget=num(b[1]);
    const hi=t.search(/h[ưu][ớo]ng/i); r.dirs=[]; if(hi>=0){ const seg=t.slice(hi+5,hi+60); let m; DIR_RE.lastIndex=0; while((m=DIR_RE.exec(seg))){ const d=cap(m[1]); if(!r.dirs.includes(d)) r.dirs.push(d);} }
    r.dpid=detectProject(t); r.text=t; return r; }
  let rl=null; if(pj.roadLots) rl=roadLot(t,r.pid);
  if(rl || (bm&&lm&&pj.kind!=='le')){ r.kind='lot'; const fb=rl?{block:rl.road}:fixBlock(r.pid,bm[1]+bm[2]+(bm[3]?'-'+bm[3]:'')); r.block=fb.block; r.lot=normLot(rl?rl.lot:lm[1]);
    Object.assign(r,parsePrice(t)); common(t,r);
    if(fb.fixed) r.flag=[`Mã "${fb.fixed}" được hiểu là ${fb.block}`,r.flag].filter(Boolean).join(' · ');
    r.note=(rl?t.replace(rl.m,''):t.replace(bm[0],'').replace(lm[0].replace(/^[^a-zà-ỹ]/i,''),''))
      .replace(/gi[áa]\s*(?:b[áa]n|ch[àa]o)?\s*[:=]?\s*\d+(?:[.,]\d+)?\s*(?:t[ỷỉy]\s*\d{0,3}|tr(?:i[ệe]u)?(?:\s*\/\s*m2?)?)?/i,'')
      .replace(/(?:\bhh|hoa\s*h[ồo]ng)\s*[:=]?\s*\d+(?:[.,]\d+)?\s*%/i,'').replace(/(?:ngu[ồo]n\s*)?\b(?:cc|ch[íi]nh\s*ch[ủu])\b\.?/gi,'')
      .replace(/\s{2,}/g,' ').replace(/^[\s.,;:-]+|[\s.,;:-]+$/g,'');
    const k=lotKey(r.pid,r.block,r.lot), h=hintOf(k);
    if(r.unit){ const a=r.area||(h&&h.a); r.price=a?Math.round(r.unit*a/10)/100:null; r.flag=[r.flag,`Giá ${fmt(r.unit)} tr/m²`+(a?` × ${fmt(a,1)} m² = ${fmt(r.price)} tỷ`:' — chưa tính được tổng giá')].filter(Boolean).join(' · '); }
    if(r.dir&&h&&h.d&&r.dir!==h.d) r.flag=[r.flag,`Tin ghi hướng ${r.dir}, bản vẽ tính ra ${h.d}`].filter(Boolean).join(' · ');
    return r; }
  const pr=parsePrice(t);
  if(pr.price!=null||pr.unit!=null){ r.kind='le'; Object.assign(r,pr); common(t,r);
    if(pj.kind!=='le'){ const le=Object.values(S.projects).find(p=>p.kind==='le'); if(le&&!detectProject(t)) r.pid=le.id; }
    const am=/(?:mặt\s*tiền|\bmt\b|đường|hẻm|kiệt|hxh|ngõ)\s*([^,.;\n]{3,40})/i.exec(t); r.addr=am?am[0].trim():'';
    r.title=t.slice(0,70); if(r.unit&&r.area){ r.price=Math.round(r.unit*r.area/10)/100; }
    r.ll=parseLatLng(t); r.text=t; return r; }
  r.kind='note'; r.text=t; return r; }
let PV=[];
function runParse(){ const msgs=splitMessages($('#raw').value), po=$('#rawPoster').value.trim(), def=$('#rawPj').value;
  PV=msgs.flatMap(m=>{ if(!m.poster&&po) m.poster=po; const pid=detectProject(m.text)||def; return splitLots(m,pid).map(x=>{ const r=parseMsg(x,def); r.use=r.kind!=='note'; return r; }); });
  PV.forEach((r,i)=>{ if(r.kind!=='note') return; for(let j=i-1;j>=0;j--) if((PV[j].kind==='lot'||PV[j].kind==='le')&&(!r.poster||PV[j].poster===r.poster)){ r.attach=j; r.use=true; break; } });
  renderPreview(); }
function pjOpts(sel){ return pjList().map(p=>`<option value="${esc(p.id)}" ${p.id===sel?'selected':''}>${esc(p.name)}</option>`).join(''); }
function renderPreview(){
  const el=$('#preview'); if(!PV.length){ el.innerHTML=$('#raw').value.trim()?'<div class="empty">Không tách được tin nào.</div>':''; return; }
  let h=`<h3>Kết quả tách (${PV.length} tin)</h3>`;
  PV.forEach((r,i)=>{ const sel=`<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-i="${i}" class="pvUse" ${r.use?'checked':''}>`;
    const by=`<div class="raw">${r.poster?'<b>'+esc(r.poster)+'</b>'+(r.postedAt?' · '+esc(r.postedAt):'')+': ':''}${esc(r.raw||r.text)}</div>`;
    if(r.kind==='lot'){ const k=lotKey(r.pid,r.block,r.lot), cur=S.listings[k], hh=hintOf(k); let ch='<span class="tag">Mới</span>';
      if(cur){ if(cur.price!==r.price&&cur.price!=null&&r.price!=null){ const d=r.price-cur.price; ch=`<span class="tag o">Giá ${fmt(cur.price)} → ${fmt(r.price)} ${d>0?'▲':'▼'}</span>`; } else ch='<span class="tag">Đã có, cùng giá</span>'; }
      const pos=posOf(k)?(posSrc(k)==='cad'?(hh&&hh.q?'<span class="tag o">tự định vị – chưa chắc</span>':'<span class="tag">tự định vị</span>'):'<span class="tag">đã ghim</span>'):'<span class="tag o">chưa có vị trí – cần ghim</span>';
      h+=`<div class="card pv ${r.use?'':'skip'}">${sel}<b>${esc(r.block)} · Lô ${esc(r.lot)}</b></label> ${ch}${pos}${hh?`<span class="tag">${fmt(hh.a,1)} m² · ${esc(hh.d)}</span>`:''}
      <div class="g"><div><label class="f">Dự án</label><select data-i="${i}" data-k="pid">${pjOpts(r.pid)}</select></div>
        <div><label class="f">Mã dãy</label><input data-i="${i}" data-k="block" value="${esc(r.block)}"></div><div><label class="f">Lô</label><input data-i="${i}" data-k="lot" value="${esc(r.lot)}"></div>
        <div><label class="f">Giá (tỷ)</label><input data-i="${i}" data-k="price" inputmode="decimal" value="${r.price??''}"></div><div><label class="f">HH %</label><input data-i="${i}" data-k="hh" inputmode="decimal" value="${r.hh??''}"></div>
        <div><label class="f">Trạng thái</label><select data-i="${i}" data-k="status">${Object.entries(STATUS).map(([v,t])=>`<option value="${v}" ${r.status===v?'selected':''}>${t}</option>`).join('')}</select></div></div>
      ${r.flag?`<div class="warn">⚠️ ${esc(r.flag)}</div>`:''}${by}</div>`; }
    else if(r.kind==='le'){
      h+=`<div class="card pv le ${r.use?'':'skip'}">${sel}<b>Nhà / đất lẻ</b></label> ${r.ll?'<span class="tag">có toạ độ</span>':'<span class="tag o">chưa có vị trí</span>'}
      <div class="g"><div><label class="f">Dự án</label><select data-i="${i}" data-k="pid">${pjOpts(r.pid)}</select></div>
        <div style="grid-column:span 2"><label class="f">Địa chỉ</label><input data-i="${i}" data-k="addr" value="${esc(r.addr||'')}"></div>
        <div><label class="f">Giá (tỷ)</label><input data-i="${i}" data-k="price" inputmode="decimal" value="${r.price??''}"></div><div><label class="f">DT m²</label><input data-i="${i}" data-k="area" inputmode="decimal" value="${r.area??''}"></div><div><label class="f">HH %</label><input data-i="${i}" data-k="hh" inputmode="decimal" value="${r.hh??''}"></div></div>
      ${r.flag?`<div class="warn">⚠️ ${esc(r.flag)}</div>`:''}${by}</div>`; }
    else if(r.kind==='demand'){
      h+=`<div class="card pv demand ${r.use?'':'skip'}">${sel}<b>Khách cần mua</b></label>
      <div class="meta">Tài chính: <b>${r.budget?fmt(r.budget)+' tỷ':'?'}</b> · Hướng: <b>${r.dirs.length?esc(r.dirs.join(', ')):'bất kỳ'}</b>${r.dpid?' · '+esc(S.projects[r.dpid].name):''}</div>${by}</div>`; }
    else { const tg=r.attach!=null?PV[r.attach]:null;
      h+=`<div class="card pv note ${r.use?'':'skip'}">${sel}${tg?`Gộp vào ghi chú ${esc(tg.kind==='lot'?tg.block+' lô '+tg.lot:'tin '+(r.attach+1))}`:'Tin không có mã lô hay giá — bỏ qua'}</label>${by}</div>`; } });
  const n=PV.filter(r=>r.use&&(r.kind!=='note'||r.attach!=null)).length;
  h+=`<div class="row"><span class="meta">${S.canWrite?'':'Bạn chỉ có quyền xem, không lưu được.'}</span><button class="btn pri" id="bSaveAll" style="margin-left:auto" ${S.canWrite&&n?'':'disabled'}>Lưu ${n} tin vào giỏ</button></div>`;
  el.innerHTML=h;
  el.querySelectorAll('.pvUse').forEach(c=>c.onchange=()=>{ PV[c.dataset.i].use=c.checked; renderPreview(); });
  el.querySelectorAll('[data-k]').forEach(inp=>inp.onchange=()=>{ const r=PV[inp.dataset.i],k=inp.dataset.k; let v=inp.value.trim();
    if(k==='block') v=fixBlock(r.pid,v).block; else if(['price','hh','area'].includes(k)) v=v===''?null:num(v);
    r[k]=v; if(k==='price') r.flag=null; if(k==='pid'&&r.kind==='lot') r.block=fixBlock(v,r.block).block; renderPreview(); });
  if($('#bSaveAll')) $('#bSaveAll').onclick=saveParsed; }
async function saveParsed(){
  const btn=$('#bSaveAll'); btn.disabled=true; btn.textContent='Đang lưu…';
  const notes={}; PV.forEach(r=>{ if(r.kind==='note'&&r.use&&r.attach!=null) (notes[r.attach]=notes[r.attach]||[]).push(r.text); });
  let n=0,fail=0,unpinned=0;
  for(let i=0;i<PV.length;i++){ const r=PV[i]; if(!r.use) continue; let ok;
    const base={price:r.price??null,hh:r.hh??null,source:r.source||'',status:r.status||'ban',poster:r.poster,postedAt:r.postedAt,raw:r.raw,flag:r.flag||null};
    for(const f of ['dir','area','front']) if(r[f]) base[f]=r[f];
    if(r.kind==='lot'&&r.block&&r.lot){ const k=lotKey(r.pid,r.block,r.lot); ok=await saveListing(k,{...base,note:[r.note,...(notes[i]||[])].filter(Boolean).join('\n')}); if(ok&&!posOf(k)) unpinned++; }
    else if(r.kind==='le'){ const k=r.pid+':'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
      ok=await saveListing(k,{...base,title:r.title,addr:r.addr,p:r.ll||null,note:[r.text,...(notes[i]||[])].join('\n')}); if(ok&&!r.ll) unpinned++; }
    else if(r.kind==='demand') ok=await saveDemand({text:r.text,budget:r.budget??null,dirs:r.dirs,pid:r.dpid||null,poster:r.poster,postedAt:r.postedAt});
    else continue; ok?n++:fail++; }
  if(fail){ toast(`Lưu được ${n}, lỗi ${fail} tin`); renderPreview(); return; }
  toast(`Đã lưu ${n} tin`+(unpinned?` · ${unpinned} căn chưa có vị trí, xem ở Giỏ hàng → "Chưa ghim vị trí"`:'')); PV=[]; $('#raw').value=''; renderPreview(); }

/* ============ List & demands ============ */
$('#bUnpinned').onclick=()=>{ S.unpinnedOnly=!S.unpinnedOnly; $('#bUnpinned').classList.toggle('on',S.unpinnedOnly); renderList(); };
function matchDemand(d){ return Object.entries(S.listings).filter(([k,r])=>(r.status||'ban')==='ban'&&r.price!=null&&(!d.pid||pidOf(k)===d.pid)
  &&(!d.budget||r.price<=d.budget*1.05)&&(!d.dirs||!d.dirs.length||d.dirs.includes(dirOf(k)))).sort((a,b)=>b[1].price-a[1].price); }
function renderDemands(){
  const arr=Object.entries(S.demands).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  const nd=$('#nDem'); nd.textContent=arr.length; nd.style.display=arr.length?'':'none';
  if(!arr.length){ $('#demands').innerHTML='<div class="empty">Chưa có nhu cầu nào. Dán tin kiểu <i>"Khách t/c 5 tỷ cần mua lô hướng Đông"</i> ở tab Nhập Viber.</div>'; return; }
  $('#demands').innerHTML=arr.map(([id,d])=>{ const m=matchDemand(d);
    return `<div class="card"><div style="display:flex;gap:8px"><b>${d.budget?'≤ '+fmt(d.budget)+' tỷ':'Chưa rõ tài chính'} · ${d.dirs&&d.dirs.length?esc(d.dirs.join(' / ')):'mọi hướng'}${d.pid&&S.projects[d.pid]?' · '+esc(S.projects[d.pid].name):''}</b>${S.canWrite?`<button class="btn sm danger" data-del="${esc(id)}" style="margin-left:auto">Xong</button>`:''}</div>
    <div class="meta">${esc(d.poster||'')} ${d.postedAt?'· '+esc(d.postedAt):''} · ${ago(d.createdAt)}</div><div class="note">${esc(d.text)}</div>
    <div class="meta"><b>${m.length} căn khớp</b>${m.length?':':''}</div>${m.slice(0,8).map(([k,r])=>`<button class="chip" data-k="${esc(k)}" style="margin:4px 4px 0 0">${esc(shortOf(k))} · ${fmt(r.price)} tỷ${dirOf(k)?' · '+esc(dirOf(k)):''}</button>`).join('')}
    ${m.length?`<div class="row"><button class="btn sm" data-copy="${esc(id)}">📋 Copy danh sách gửi môi giới</button></div>`:''}</div>`; }).join('');
  $('#demands').querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>openDetail(b.dataset.k));
  $('#demands').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteDemand(b.dataset.del));
  $('#demands').querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copyText(matchDemand(S.demands[b.dataset.copy]).map(([k,r])=>`• ${shortOf(k)} – ${fmtTy(r.price)}${dirOf(k)?' – hướng '+dirOf(k):''}`).join('\n'))); }
$('#bCopyAll').onclick=()=>{ const arr=Object.entries(S.listings).filter(([k,r])=>inProject(k)&&(r.status||'ban')==='ban').sort((a,b)=>(a[1].price??1e9)-(b[1].price??1e9));
  const pj=S.projects[S.cur]; copyText(`GIỎ HÀNG ${pj?pj.name.toUpperCase():''} – ${new Date().toLocaleDateString('vi-VN')}\n`+arr.map(([k,r])=>{ const ar=areaOf(k);
    return `• ${shortOf(k)} – ${fmtTy(r.price)}${ar?' – '+fmt(ar.v,1)+' m²':''}${dirOf(k)?' – hướng '+dirOf(k):''}`; }).join('\n')); };
$('#bAdd').onclick=()=>{ if(!S.canWrite) return toast('Bạn chỉ có quyền xem'); openEdit(null); };
$('#lsort').onchange=renderList;

/* ============ Search & filter ============ */
$('#q').addEventListener('keydown',e=>{ if(e.key!=='Enter') return; const t=e.target.value.normalize('NFC').trim(); if(!t) return;
  const bm=/([A-Z]{1,4})\s*(\d{1,3})(?:\s*[-.\/]\s*(\d{1,3}))?/i.exec(t);
  const pids=S.cur!=='all'?[S.cur]:Object.keys(S.projects);
  if(bm){ const rest=t.slice(bm.index+bm[0].length), lm=/(\d{1,3}[a-z]?)/i.exec(rest);
    for(const pid of pids){ const b=fixBlock(pid,bm[1]+bm[2]+(bm[3]?'-'+bm[3]:'')).block;
      if(lm){ const k=lotKey(pid,b,lm[1]); if(S.listings[k]||hintOf(k)||S.pins[safeId(k)]){ e.target.blur(); if(!S.listings[k]&&hintOf(k)){ showView('map'); map.flyTo(hintOf(k).p,20); setTimeout(()=>openLot(k),650); } else flyTo(k); return; } }
      const h=S.hints[pid]; if(h){ const pts=Object.entries(h.lots).filter(([c])=>c.startsWith(b+'_')).map(([,v])=>v.p); if(pts.length){ e.target.blur(); map.flyToBounds(L.latLngBounds(pts),{padding:[60,60],duration:.6}); return; } } } }
  const s=strip(t); const hit=Object.keys(S.listings).filter(k=>inProject(k)&&strip(titleOf(k)+' '+(S.listings[k].addr||'')).includes(s));
  if(hit.length){ e.target.blur(); showView('home'); $('#hq').value=t; renderList(); return; }
  const ll=parseLatLng(t); if(ll){ map.flyTo(ll,19); return; }
  toast('Không tìm thấy "'+t+'"'); });
$('#bFilter').onclick=()=>{ $('#filterPanel').classList.toggle('on'); };
$('#fClose').onclick=()=>$('#filterPanel').classList.remove('on');
$('#fDirs').innerHTML=DIRS.map(d=>`<button class="chip" data-d="${d}">${d}</button>`).join('');
$('#fStatus').innerHTML=Object.entries(STATUS).map(([v,t])=>`<button class="chip" data-s="${v}">${t}</button>`).join('');
const tog=(set,v,el)=>{ set.has(v)?set.delete(v):set.add(v); el.classList.toggle('on'); renderMap(); };
$('#fDirs').onclick=e=>{ const d=e.target.dataset.d; if(d) tog(S.f.dirs,d,e.target); };
$('#fStatus').onclick=e=>{ const s=e.target.dataset.s; if(s) tog(S.f.status,s,e.target); };
$('#fRecent').onclick=e=>{ S.f.recent=!S.f.recent; e.target.classList.toggle('on'); renderMap(); };
$('#fMax').oninput=e=>{ S.f.max=e.target.value===''?null:+e.target.value; renderMap(); };
$('#fMin').oninput=e=>{ S.f.min=e.target.value===''?null:+e.target.value; renderMap(); };
$('#fClear').onclick=()=>{ S.f={max:null,min:null,dirs:new Set(),status:new Set(),recent:false}; $('#fMax').value=$('#fMin').value='';
  document.querySelectorAll('#filterPanel .chip.on').forEach(c=>c.classList.remove('on')); renderMap(); };
$('#legend').innerHTML=[[COL.ban,'Đang bán'],[COL.new,'Giá mới 24h'],[COL.coc,'Đã cọc'],[COL.daban,'Đã bán']].map(([c,t])=>`<span><i style="background:${c}"></i>${t}</span>`).join('');


/* ================= UI (mobile) ================= */
let CURV='home', PREV='home';
const ico=n=>`<svg class="i"><use href="#i-${n}"/></svg>`;
const FAV=(()=>{ try{ return new Set(JSON.parse(localStorage.getItem('bds_fav')||'[]')); }catch(e){ return new Set(); } })();
function saveFav(){ try{ localStorage.setItem('bds_fav',JSON.stringify([...FAV])); }catch(e){} }
function toggleFav(k){ FAV.has(k)?FAV.delete(k):FAV.add(k); saveFav(); renderSaved(); document.querySelectorAll(`[data-fav="${CSS.escape(k)}"]`).forEach(b=>b.classList.toggle('on',FAV.has(k))); }
const perM2=k=>{ const r=S.listings[k], a=areaOf(k); return r&&r.price!=null&&a?r.price*1000/a.v:null; };
const widthOf=k=>{ const r=S.listings[k]||{}, h=hintOf(k); return r.front||(h&&h.w)||null; };
const phoneOf=r=>{ const m=/(0\d{2,3})[\s.]?(\d{3})[\s.]?(\d{3,4})/.exec((r.raw||'')+' '+(r.poster||'')); return m?m[1]+m[2]+m[3]:null; };
const initials=s=>String(s||'?').replace(/[^\p{L}\s]/gu,'').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';

/* deterministic thumbnail: stylised site plan with the lot highlighted */
function hashStr(s){ let h=2166136261; for(const c of s) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }
const PAL=[['#0f3d3a','#1f6f63'],['#1e2a4a','#3b4f86'],['#3a2a1e','#8a5a32'],['#16324f','#2a6f97'],['#2d1e3a','#6b4a8a'],['#1f3a2a','#3f7a4f']];
function thumb(k,big){
  const h=hashStr(k), [c1,c2]=PAL[hashStr(pidOf(k))%PAL.length], st=stateOf(S.listings[k]||{});
  const hl={ban:'#34d399',new:'#fbbf24',coc:'#a78bfa',daban:'#cbd5e1'}[st]||'#34d399';
  const rot=-12+(h%9), cols=7, rows=4, hi=(h>>3)%cols, hr=1+((h>>7)%2);
  let cells='';
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const x=c*44, y=r*62+(r>1?26:0), me=c===hi&&r===hr;
    cells+=`<rect x="${x}" y="${y}" width="40" height="56" rx="4" fill="${me?hl:'rgba(255,255,255,.07)'}" stroke="rgba(255,255,255,${me?.9:.18})" stroke-width="${me?2.5:1}"/>`;
    if(me) cells+=`<rect x="${x-6}" y="${y-6}" width="52" height="68" rx="8" fill="none" stroke="${hl}" stroke-opacity=".45" stroke-width="2"/>`;
  }
  return `<div class="thumb" style="background:linear-gradient(150deg,${c1},${c2})"><svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice">
    <g transform="translate(150 150) rotate(${rot}) translate(-150 -140)"><g transform="translate(-4 0)">${cells}</g>
    <rect x="-40" y="124" width="400" height="18" fill="rgba(255,255,255,.10)"/><line x1="-40" y1="133" x2="360" y2="133" stroke="rgba(255,255,255,.35)" stroke-dasharray="10 8"/></g>
    ${big?'':`<text x="16" y="286" font-size="13" fill="rgba(255,255,255,.55)" font-family="Be Vietnam Pro" font-weight="700">${esc(((S.projects[pidOf(k)]||{}).name||'').replace(/^KĐT\s*/,''))}</text>`}
  </svg></div>`;
}
function stPill(k){ const r=S.listings[k]; if(!r) return ''; const st=stateOf(r); return `<span class="pill w" style="color:${COL[st]}">● ${st==='new'?'Giá mới':STATUS[r.status||'ban']}</span>`; }
function specsHTML(k,cls){ const a=areaOf(k), w=widthOf(k), d=dirOf(k), r=S.listings[k]||{};
  return [a?`<span class="${cls}">${ico('area')} ${fmt(a.v,0)} m²</span>`:'', w?`<span class="${cls}">${ico('width')} ${fmt(w,1)} m</span>`:'', d?`<span class="${cls}">${ico('compass')} ${esc(d)}</span>`:'', r.hh!=null?`<span class="${cls}">HH ${fmt(r.hh)}%</span>`:''].join(''); }
function bigCard(k){ const r=S.listings[k]||{}, pm=perM2(k), pj=S.projects[pidOf(k)]||{};
  return `<div class="bigcard" data-open="${esc(k)}">${thumb(k)}<div class="shade"></div>
  <div class="tl">${stPill(k)}</div><button class="heart tr ${FAV.has(k)?'on':''}" data-fav="${esc(k)}">${ico('heart')}</button>
  <div class="bt"><div class="row1"><div style="min-width:0"><h4>${esc(titleOf(k))}</h4><div class="sub">${esc(pj.name||'')} · ${ago(r.updatedAt)}</div></div>
  <div class="pr">${fmtTy(r.price)}${pm?`<small>${fmt(pm,0)} tr/m²</small>`:''}</div></div>
  <div class="specs">${specsHTML(k,'pill')}</div></div></div>`; }
function rowCard(k){ const r=S.listings[k]||{}, pm=perM2(k), pj=S.projects[pidOf(k)]||{}, h=r.history||[]; let d='';
  if(h.length>1&&h[0].price!=null&&h[1].price!=null&&h[0].price!==h[1].price){ const df=h[0].price-h[1].price; d=` <span class="${df>0?'up':'down'}" style="font-size:12px">${df>0?'▲':'▼'}${fmt(Math.abs(df))}</span>`; }
  const a=areaOf(k), w=widthOf(k);
  return `<div class="lcard" data-open="${esc(k)}">${thumb(k).replace('class="thumb"','class="thumb"')}
  <div class="info"><h4>${esc(titleOf(k))}</h4><div class="price">${fmtTy(r.price)}${d}${pm?`<small>${fmt(pm,0)} tr/m²</small>`:''}</div>
  <div class="meta">${ico('pin')} ${esc(pj.name||'')}${dirOf(k)?' · '+esc(dirOf(k)):''}</div>
  <div class="meta">${a?fmt(a.v,0)+' m²':''}${w?' · ngang '+fmt(w,1)+'m':''}${r.hh!=null?' · HH '+fmt(r.hh)+'%':''}</div>
  <div class="foot"><span class="st ${stateOf(r)}">${stateOf(r)==='new'?'Giá mới':STATUS[r.status||'ban']}</span>${ADMIN&&!posOf(k)?'<span class="tag o">chưa ghim</span>':''}${ADMIN&&r.flag?'<span class="tag o">kiểm tra</span>':''}
  <span style="margin-left:auto"></span><button class="heart sale-only ${FAV.has(k)?'on':''}" data-fav="${esc(k)}" style="background:#f1f4f8;color:var(--ink2)">${ico('heart')}</button></div></div></div>`; }
function bindCards(root){
  root.querySelectorAll('[data-fav]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); toggleFav(b.dataset.fav); });
  root.querySelectorAll('[data-open]').forEach(c=>c.onclick=()=>openDetail(c.dataset.open)); }

/* quick filters on home */
const QF=[['all','Tất cả'],['u5','Dưới 5 tỷ'],['5to10','5 – 10 tỷ'],['o10','Trên 10 tỷ'],['new','Giá mới 24h'],['coc','Đã cọc']];
let qf='all';
function qOk(k){ const r=S.listings[k]; const p=r.price;
  return qf==='all'||(qf==='u5'&&p!=null&&p<5)||(qf==='5to10'&&p!=null&&p>=5&&p<=10)||(qf==='o10'&&p!=null&&p>10)||(qf==='new'&&isRecent(r))||(qf==='coc'&&r.status==='coc'); }
function homeKeys(){ const q=strip($('#hq').value.trim());
  return Object.keys(S.listings).filter(k=>{ const r=S.listings[k]; if(!inProject(k)||!matches(k)||!qOk(k)) return false;
    if(!ADMIN&&r.status==='daban'&&qf!=='all') return false;
    if(ADMIN&&S.unpinnedOnly&&posOf(k)) return false;
    return !q||strip(titleOf(k)+' '+shortOf(k)+' '+(r.addr||'')+' '+(r.poster||'')+' '+(r.note||'')+' '+dirOf(k)).includes(q); }); }
function renderList(){
  const ks=homeKeys(), sort=$('#lsort').value;
  const byNew=[...ks].sort((a,b)=>(S.listings[b].updatedAt||0)-(S.listings[a].updatedAt||0));
  const arr=sort==='new'?byNew:[...ks].sort((a,b)=>{ const A=S.listings[a],B=S.listings[b];
    if(sort==='asc') return (A.price??1e9)-(B.price??1e9); if(sort==='desc') return (B.price??-1)-(A.price??-1);
    return (perM2(a)??1e9)-(perM2(b)??1e9); });
  const top=byNew.filter(k=>(S.listings[k].status||'ban')!=='daban').slice(0,8);
  $('#newest').innerHTML=top.length?top.map(bigCard).join(''):`<div class="empty" style="width:100%">${Object.keys(S.listings).length?'Không có lô khớp bộ lọc.':(ADMIN?'Chưa có hàng. Vào <b>Nhập tin</b> để dán tin Viber.':'Chưa có hàng trong giỏ.')}</div>`;
  $('#list').innerHTML=arr.map(rowCard).join('')||'';
  $('#listTitle').textContent=`Tất cả hàng · ${arr.length}`;
  bindCards($('#newest')); bindCards($('#list'));
  const all=Object.keys(S.listings).filter(inProject);
  $('#sub').textContent=`${all.filter(k=>(S.listings[k].status||'ban')==='ban').length} lô đang bán · ${all.filter(k=>isRecent(S.listings[k])).length} giá mới hôm nay`;
  if(ADMIN){ const unp=all.filter(k=>!posOf(k)).length;
    $('#stats').innerHTML=`<div class="tile"><b>${all.length}</b><small>Trong giỏ</small></div><div class="tile"><b style="color:var(--new)">${all.filter(k=>isRecent(S.listings[k])).length}</b><small>Giá mới 24h</small></div><div class="tile"><b style="color:${unp?'var(--bad)':'var(--ok)'}">${unp}</b><small>Chưa ghim</small></div>`;
    $('#bUnpinned').textContent=`Chưa ghim (${unp})`; }
}
function renderChips(){
  const pjs=pjList();
  $('#pjChips').innerHTML=[`<button class="chip ${S.cur==='all'?'on':''}" data-pj="all">Tất cả dự án</button>`,...pjs.map(p=>`<button class="chip ${S.cur===p.id?'on':''}" data-pj="${esc(p.id)}">${esc(p.name.replace(/^KĐT\s*/,''))}</button>`)].join('');
  $('#pjChips').querySelectorAll('[data-pj]').forEach(b=>b.onclick=()=>{ S.cur=b.dataset.pj; $('#pjSel').value=S.cur; if(S.cur!=='all') $('#rawPj').value=S.cur; renderChips(); renderAll(); });
  $('#qChips').innerHTML=QF.map(([v,t])=>`<button class="chip ${qf===v?'on':''}" data-q="${v}">${t}</button>`).join('');
  $('#qChips').querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{ qf=b.dataset.q; renderChips(); renderList(); });
}
const _rps=renderPjSelects; renderPjSelects=function(){ _rps(); renderChips(); };
$('#hq').addEventListener('input',()=>renderList());
$('#hq').addEventListener('keydown',e=>{ if(e.key!=='Enter') return; e.target.blur();
  const ks=homeKeys(); if(ks.length===1) openDetail(ks[0]); });
document.querySelector('.sec [data-sort]').onclick=()=>{ $('#lsort').value='new'; renderList(); $('#list').scrollIntoView({behavior:'smooth'}); };

/* filter panel shared by home & map */
document.body.appendChild($('#filterPanel')); $('#filterPanel').style.position='fixed'; $('#filterPanel').style.zIndex=860;
$('#hFilter').onclick=()=>$('#filterPanel').classList.toggle('on');
const _rm=renderMap; renderMap=function(){ _rm(); if(CURV==='home') renderList(); };

/* saved */
function renderSaved(){ const ks=[...FAV].filter(k=>S.listings[k]); const n=$('#nSaved'); n.textContent=ks.length; n.style.display=ks.length?'':'none';
  $('#savedList').innerHTML=ks.map(rowCard).join('')||'<div class="empty">Chưa lưu lô nào. Bấm ♥ trên lô để lưu lại gửi khách sau.</div>'; bindCards($('#savedList')); }

/* detail page */
let mini=null, miniMk=null;
const miniEl=document.createElement('div'); miniEl.id='miniMap';
function openDetail(k){
  const r=S.listings[k]||{}, pj=S.projects[pidOf(k)]||{}, a=areaOf(k), w=widthOf(k), d=dirOf(k), pm=perM2(k), p=posOf(k), h=hintOf(k), ph=phoneOf(r);
  S.det=k; if(CURV!=='detail') PREV=CURV;
  let x=`<div class="hero">${thumb(k,true)}<div class="shade"></div>
   <div class="bar"><button class="heart" id="dBack">${ico('back')}</button><div style="display:flex;gap:8px"><button class="heart" id="dShare">${ico('share')}</button><button class="heart ${FAV.has(k)?'on':''} sale-only" data-fav="${esc(k)}">${ico('heart')}</button></div></div>
   <div class="big">${esc(titleOf(k).replace(' · Lô ',' – '))}</div>
   <div class="stats">${stPill(k)}<span class="pill">${ico('clock')} ${ago(r.updatedAt)||'—'}</span>${h&&h.c?'<span class="pill">Lô góc</span>':''}</div></div>
  <div class="dpad"><h2>${esc(pj.kind==='le'?(r.title||'Nhà/đất'):pj.name||'')}</h2>
   <div class="price">${fmtTy(r.price)}${pm?`<small>≈ ${fmt(pm,1)} tr/m²</small>`:''}</div>
   <div class="loc">${ico('pin')} ${esc(r.addr||shortOf(k))}</div>
   ${ADMIN&&r.flag?`<div class="warn">⚠️ ${esc(r.flag)}</div>`:''}
   <div class="tiles"><div class="tile">${ico('area')}<b>${a?fmt(a.v,0):'—'}</b><small>m²${a&&a.est?' (bản vẽ)':''}</small></div>
    <div class="tile">${ico('width')}<b>${w?fmt(w,1):'—'}</b><small>Ngang m</small></div>
    <div class="tile">${ico('compass')}<b style="font-size:${d&&d.length>4?12:14}px">${esc(d||'—')}</b><small>Hướng</small></div>
    <div class="tile">${ico('pct')}<b>${r.hh!=null?fmt(r.hh):'—'}</b><small>Hoa hồng %</small></div></div>`;
  if(r.note) x+=`<div class="dsec">Mô tả</div><div class="note">${esc(r.note)}</div>`;
  x+=`<div class="dsec">Người đăng</div><div class="agent"><div class="avatar">${esc(initials(r.poster))}</div><div class="nm"><b>${esc(r.poster||'Không rõ')}</b><small>${esc(r.source||'Nguồn: —')}${r.postedAt?' · '+esc(r.postedAt):''}</small></div>
    ${ph?`<a class="btn-dark" href="tel:${ph}" style="text-decoration:none">${ph.replace(/(\d{4})(\d{3})(\d+)/,'$1 $2 $3')}</a>`:''}</div>`;
  x+=`<div class="dsec" style="display:flex;justify-content:space-between;align-items:baseline">Vị trí ${p?`<a href="${gmaps(p)}" target="_blank" rel="noopener" style="font-size:13px;color:var(--mut);font-weight:500">Google Maps</a>`:''}</div><div id="miniSlot"></div>`;
  if(!p) x+=`<div class="meta" style="margin-top:6px">${ADMIN?'Lô chưa có vị trí – bấm Ghim để đặt lên bản đồ.':'Lô chưa có vị trí trên bản đồ.'}</div>`;
  if(r.history&&r.history.length>1){ x+=`<div class="dsec">Lịch sử giá</div><div class="hist">`;
    r.history.forEach((q,i)=>{ const pr=r.history[i+1]; let dd='';
      if(pr&&q.price!=null&&pr.price!=null&&q.price!==pr.price){ const df=q.price-pr.price; dd=` <span class="${df>0?'up':'down'}">${df>0?'▲':'▼'}${fmt(Math.abs(df))}</span>`; }
      x+=`<div><span>${new Date(q.at).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}${q.by?' · '+esc(q.by):''}</span><b>${fmtTy(q.price)}${dd}</b></div>`; });
    x+=`</div>`; }
  x+=`</div>`;
  $('#v-detail').innerHTML=x; $('#v-detail').scrollTop=0;
  showView('detail');
  $('#dBack').onclick=()=>showView(PREV==='detail'?'home':PREV);
  $('#dShare').onclick=async()=>{ const t=lotText(k); try{ if(navigator.share){ await navigator.share({text:t}); return; } }catch(e){ if(e&&e.name==='AbortError') return; } copyText(t); };
  bindCards($('#v-detail'));
  // mini map
  if(p){ $('#miniSlot').appendChild(miniEl);
    if(!mini){ mini=L.map(miniEl,{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,boxZoom:false,keyboard:false,tap:false});
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:17,maxZoom:20}).addTo(mini);
      miniMk=L.circleMarker(p,{radius:10,color:'#fff',weight:3,fillColor:'#f43f5e',fillOpacity:1}).addTo(mini);
      miniEl.addEventListener('click',()=>flyTo(S.det)); }
    setTimeout(()=>{ mini.invalidateSize(); mini.setView(p,18); miniMk.setLatLng(p); },30); }
  // action bar
  const ab=$('#actbar');
  ab.innerHTML=ADMIN?`<button class="sq" id="aPin" title="Ghim vị trí">${ico('pin')}</button><button class="b1" id="aMap">${ico('map')} Bản đồ</button><button class="b2" id="aEdit">${ico('edit')} Sửa giá</button>`
    :`<button class="sq" id="aCopy" title="Copy">${ico('copy')}</button><button class="b1" id="aMap">${ico('map')} Xem bản đồ</button><button class="b2" id="aSend">${ico('share')} Gửi khách</button>`;
  ab.classList.add('on');
  $('#aMap').onclick=()=>{ if(posOf(k)) flyTo(k); else { showView('map'); openLot(k); } };
  if(ADMIN){ $('#aEdit').onclick=()=>openEdit(k); $('#aPin').onclick=()=>startPin(k,'point'); }
  else { $('#aCopy').onclick=()=>copyText(lotText(k)); $('#aSend').onclick=$('#dShare').onclick; }
}

/* views */
function showView(v){
  CURV=v; document.querySelectorAll('.view').forEach(x=>x.classList.toggle('on',x.id==='v-'+v));
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  document.body.classList.toggle('detail',v==='detail'); $('#actbar').classList.toggle('on',v==='detail');
  if(v!=='detail') $('#filterPanel').classList.remove('on');
  if(v==='map') setTimeout(()=>{ map.invalidateSize(); if(S._initB&&!S._fit){ S._fit=1; if(!S.det||PREV==='home') map.fitBounds(S._initB,{padding:[20,20]}); } syncPlans(); renderMap(); },0);
  if(v==='home') renderList();
}
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>showView(b.dataset.v));
$('#mBack').onclick=()=>showView(S.det&&PREV!=='map'?'detail':'home');
$('#bParse').onclick=runParse;
function renderAll(){ if(!ADMIN) S.canWrite=false; renderMap(); if(CURV==='home') renderList(); renderDemands(); renderSaved(); if(PV.length) renderPreview(); if(CURV==='detail'&&S.det&&!ALIGN&&!PIN) openDetail(S.det); }
setInterval(()=>{ if(CURV==='home') renderList(); renderDemands(); },60000);
if(!ADMIN) document.title='Giỏ hàng BĐS';
const _sv=startPin; startPin=function(k,kind){ PREV='detail'; _sv(k,kind); };
loadProjects(); initStore(); renderChips();
