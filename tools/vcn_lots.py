import pickle, re, math, json, collections, numpy as np, sys
sys.path.insert(0,'/home/claude/scripts')
from shapely.geometry import Point, LineString, MultiLineString
from shapely.strtree import STRtree
from pyproj import Transformer
tr=Transformer.from_crs("+proj=tmerc +lat_0=0 +lon_0=108.25 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs","EPSG:4326",always_xy=True)
ll=lambda x,y:(lambda r:[round(r[1],7),round(r[0],7)])(tr.transform(x,y))
lines,texts=pickle.load(open('lhp.pkl','rb')); vcn=pickle.load(open('vcn.pkl','rb'))
exec(open('/home/claude/scripts/lhp_build.py').read().split('# ---------- geometry')[0].split('# ---------- text decoding')[1].join(['','']) if False else '')
src=open('/home/claude/scripts/lhp_build.py').read()
ns={'re':re}; exec(src[src.index('TCVN3=dict'):src.index('# ---------- geometry')],ns)
dec=ns['dec']
inV=lambda x,y: vcn.contains(Point(x,y))
# curbs
CURB=('0','DUONG GT$0$DUONG GT$0$DUONG GT$0$DUONG GT$0$@DUONG QH MOI','DUONG GT$0$DUONG GT$0$@CHI GIOI')
curbs=[LineString(p) for l,p in lines if l in CURB and len(p)>1 and vcn.buffer(60).contains(Point(p[0]))]
segs=[]
for c in curbs:
    cs=list(c.coords)
    for a,b in zip(cs,cs[1:]):
        if math.dist(a,b)>0.3: segs.append(LineString([a,b]))
tree=STRtree(segs)
# road labels
roads=[]
for t in texts:
    if not t[0].startswith('DUONG GT') or not inV(t[2],t[3]): continue
    s=dec(t[1]).upper()
    m=re.search(r'ĐƯỜNG\s*([A-Z]\d+)',s)
    if not m: continue
    r=math.radians(t[5] or 0); w=(t[4] or 2)*0.6*len(t[1])
    cx=t[2]+math.cos(r)*w/2; cy=t[3]+math.sin(r)*w/2
    roads.append((m.group(1),cx,cy,(t[5] or 0)%180))
print('road labels',len(roads),sorted(set(r[0] for r in roads)))
def road_at(M,ang):
    best=None
    for code,x,y,a in roads:
        da=abs(((a-ang)+90)%180-90)
        if da>20: continue
        ux,uy=math.cos(math.radians(a)),math.sin(math.radians(a))
        dx,dy=M[0]-x,M[1]-y
        perp=abs(-uy*dx+ux*dy); along=abs(ux*dx+uy*dy)
        if perp>9: continue
        sc=along+perp*5
        if best is None or sc<best[0]: best=(sc,code)
    return best[1] if best else None
# lot numbers
nums=[t for t in texts if t[0] in('@DIEN TICH LO','so thu tu lo') and inV(t[2],t[3]) and re.fullmatch(r'\d{1,3}[A-Za-z]?',t[1].strip())]
areas=[t for t in texts if t[0] in('@DIEN TICH LO','dien tich lo') and inV(t[2],t[3]) and re.fullmatch(r'\d+\.\d+|\d{2,4}',t[1].strip())]
from scipy.spatial import cKDTree
def cen(t):
    h=t[4] or 1; w=h*0.6*len(t[1]); r=math.radians(t[5] or 0)
    if t[7]: return (t[2],t[3]+h/2) if True else None
    return (t[2]+math.cos(r)*w/2-math.sin(r)*h/2, t[3]+math.sin(r)*w/2+math.cos(r)*h/2)
AP=np.array([cen(t) for t in areas]); atree=cKDTree(AP)
DIRS=['Bắc','Đông Bắc','Đông','Đông Nam','Nam','Tây Nam','Tây','Tây Bắc']
out={}; miss=0; dup=collections.Counter(); per=collections.defaultdict(list)
def road_for(P):
    best=None
    for code,x,y,a in roads:
        ux,uy=math.cos(math.radians(a)),math.sin(math.radians(a))
        dx,dy=P[0]-x,P[1]-y
        perp=abs(-uy*dx+ux*dy); along=abs(ux*dx+uy*dy)
        if perp>35 or along>320: continue
        sc=perp+along*0.04
        if best is None or sc<best[0]: best=(sc,code,x,y,a,ux,uy)
    return best
why=collections.Counter()
ROADL=[l for l in set(l for l,_ in lines) if re.search(r'(?i)^0$|chi gioi|chinh trang',l) and 'QH MOI' not in l]
segs=[]
for l,p in lines:
    if l in ROADL and len(p)>1 and vcn.buffer(80).contains(Point(p[0])):
        for a,b in zip(p,p[1:]):
            if math.dist(a,b)>0.8: segs.append(LineString([a,b]))
tree=STRtree(segs)
def angd0(a,b): return abs(((a-b)+90)%180-90)
# fix label angles from nearest curb
fx=[]
for code,x,y,a in roads:
    pt=Point(x,y); idx=tree.query(pt.buffer(30)); sg=min((segs[i] for i in idx),key=lambda q:q.distance(pt)); (a0,b0)=sg.coords
    fx.append((code,x,y,math.degrees(math.atan2(b0[1]-a0[1],b0[0]-a0[0]))%180))
roads=[(c,x,y,(a if c[0]=='V' else (a if angd0(a,105 if c[0]=='A' else 15)<25 else (105 if c[0]=='A' else 15)))) for c,x,y,a in fx]
print('label angles',[(r[0],round(r[3])) for r in roads])
def road_at2(M,ang):
    best=None
    for code,x,y,a in roads:
        da=abs(((a-ang)+90)%180-90)
        if da>15: continue
        ux,uy=math.cos(math.radians(a)),math.sin(math.radians(a)); dx,dy=M[0]-x,M[1]-y
        perp=abs(-uy*dx+ux*dy); along=abs(ux*dx+uy*dy)
        if perp>14 or along>400: continue
        sc=perp*3+along*0.02
        if best is None or sc<best[0]: best=(sc,code)
    return best[1] if best else None
def off(x,y,a): r=math.radians(a); return -math.sin(r)*x+math.cos(r)*y
def alo(x,y,a): r=math.radians(a); return math.cos(r)*x+math.sin(r)*y
def angd(a,b): return abs(((a-b)+90)%180-90)
def match(M,ang):
    best=None
    for code,x,y,a in roads:
        if angd(a,ang)>8: continue
        dc=abs(off(M[0],M[1],ang)-off(x,y,ang))
        if dc>11: continue
        da=abs(alo(M[0],M[1],ang)-alo(x,y,ang))
        sc=da+dc*3
        if best is None or sc<best[0]: best=(sc,code)
    return best
info=[]; res={}
NP=cKDTree(np.array([cen(t) for t in nums]))
for t in nums:
    P=cen(t); pt=Point(P)
    idx=tree.query(pt.buffer(35))
    cands=sorted(((segs[i].distance(pt),segs[i]) for i in idx),key=lambda x:x[0])
    opts=[]; seen=[]
    for d,sg in cands[:25]:
        if d<0.8: continue
        q=sg.interpolate(sg.project(pt)); nx,ny=(q.x-P[0])/d,(q.y-P[1])/d
        (a0,b0)=sg.coords
        if abs(nx*(b0[0]-a0[0])+ny*(b0[1]-a0[1]))/sg.length>0.3: continue
        if any(nx*u+ny*v>0.9 for u,v in seen): continue
        seen.append((nx,ny))
        ray=LineString([(q.x+nx*0.8,q.y+ny*0.8),(q.x+nx*45,q.y+ny*45)])
        ds=[]
        for i2 in tree.query(ray):
            h=segs[i2].intersection(ray)
            if h.geom_type=='Point': ds.append(math.hypot(h.x-q.x,h.y-q.y))
        far=[x for x in ds if x>6]
        if not far: continue
        w=min(far); M=(q.x+nx*w/2,q.y+ny*w/2); ang=math.degrees(math.atan2(b0[1]-a0[1],b0[0]-a0[0]))%180
        if NP.query_ball_point(M,6.5): continue
        m=match(M,ang)
        if m: opts.append((d,m[0],m[1],nx,ny,ang))
        if len(seen)>=4: break
    if not opts: why['nolabel']+=1; miss+=1; continue
    d,sc,code,nx,ny,_a=min(opts,key=lambda o:o[0])
    info.append((t,P,opts,None,nx,ny)); res[len(info)-1]=code
# row direction: lots numbered n±2 sit side by side along their frontage road
def nval(x):
    m=re.match(r'0*(\d+)',x); return int(m.group(1)) if m else -99
pts=np.array([i[1] for i in info]); kt=cKDTree(pts); fixed=0
for k,(t,P,opts,_,nx,ny) in enumerate(info):
    n=nval(t[1]); dirs=[]
    for j in kt.query_ball_point(P,10):
        if j==k: continue
        if abs(nval(info[j][0][1])-n) in (1,2):
            v=pts[j]-np.array(P); dirs.append(math.degrees(math.atan2(v[1],v[0]))%180)
    if not dirs: continue
    rd=dirs[0]
    good=[o for o in opts if angd(o[5],rd)<20]
    if good:
        o=min(good,key=lambda o:o[0])
        if o[2]!=res[k]: fixed+=1
        res[k]=o[2]; info[k]=(t,P,opts,None,o[3],o[4])
print('row-direction fixes',fixed)
for k,code in res.items():
    t,P,M,ang,nx,ny=info[k]
    no=t[1].strip().upper().lstrip('0') or '0'; key=code+'_'+no
    deg=(math.degrees(math.atan2(nx,ny))+360)%360; dr=DIRS[int((deg+22.5)//45)%8]
    dd,ai=atree.query(P,k=4); a_=None
    for di,ii in zip(dd,ai):
        if di<4 and '.' in areas[ii][1]: a_=float(areas[ii][1]); break
    rec={'p':ll(P[0]+0.0,P[1]),'a':a_,'d':dr,'_xy':P}
    if key in out:
        o=out[key]
        if math.dist(o['_xy'],P)<4:
            if o['a'] is None: o['a']=a_
            continue
        o.setdefault('_alt',[]).append(rec); continue
    per[code].append(no); out[key]=rec
real=0
for k,o in list(out.items()):
    if o.get('_alt'):
        real+=1; o['q']=1; o['alts']=[a['p'] for a in o['_alt']]
    o.pop('_alt',None); o.pop('_xy',None)
    if o['a'] is None: o.pop('a')
print(why,'ambiguous keys',real)
print('lots',len(out),'miss',miss,'dups',sum(1 for v in dup.values() if v>1))
for c in sorted(per): 
    ns_=sorted(per[c],key=lambda x:(int(re.sub(r'\D','',x) or 0),x)); print(c,len(ns_),ns_[:6],'...',ns_[-4:])
print([k for k,v in dup.items() if v>1][:40])
json.dump({'lots':out,'blocks':sorted(per),'aliases':{'VŨ LĂNG':'A3'}},open('vcn_hints.json','w'),ensure_ascii=False,separators=(',',':'))
for k in ['B4_15','B4_17','B4_54','B4_46','A3_88','B8_7','A1_19','A1_11A']: print(k,out.get(k))
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
fig,ax=plt.subplots(figsize=(18,20))
ax.add_collection(LineCollection([p for l,p in lines if l in CURB and vcn.contains(Point(p[0]))],colors='#bbb',lw=.5))
cols={c:plt.cm.tab20(i%20) for i,c in enumerate(sorted(per))}
inv=tr  # reuse
from pyproj import Transformer as T2
back=T2.from_crs("EPSG:4326",tr.target_crs if False else "+proj=tmerc +lat_0=0 +lon_0=108.25 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs",always_xy=True)
for k,v in out.items():
    c,n=k.split('_'); x,y=back.transform(v['p'][1],v['p'][0]); ax.text(x,y,n,fontsize=5,color=cols[c],ha='center')
for code,x,y,a in roads: ax.text(x,y,code,fontsize=11,color=cols.get(code,'k'),rotation=a,weight='bold',ha='center')
ax.autoscale(); ax.set_aspect('equal'); ax.axis('off'); fig.savefig('assign.png',dpi=55,bbox_inches='tight')
