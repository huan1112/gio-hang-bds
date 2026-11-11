
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
