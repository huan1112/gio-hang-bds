import pickle, numpy as np, math, json, re, time
from PIL import Image, ImageDraw, ImageChops
from scipy.spatial import cKDTree
from rapidocr_onnxruntime import RapidOCR
from pyproj import Transformer
back=Transformer.from_crs("EPSG:4326","+proj=tmerc +lat_0=0 +lon_0=108.25 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs",always_xy=True)
A=np.load('/home/claude/lhp/A.npy'); X0r,Y1r,R=600050,1354400,1.5
M=np.vstack([A,[0,0,1]]); Mi=np.linalg.inv(M)
def cad2pdf(x,y): u=(x-X0r)*R; v=(Y1r-y)*R; p=Mi@[u,v,1]; return p[:2]
H=json.load(open('/home/claude/lhp/vcn_hints.json'))
items=pickle.load(open('items.pkl','rb'))
gly=[it for it in items if it['w']<=0.13 and it['sz']<12]
gc=np.array([np.array([v for s in it['subs'] for v in s]).mean(0) for it in gly]); gt=cKDTree(gc)
th=math.radians(15); D=np.array([math.cos(th),-math.sin(th)]); N=np.array([math.sin(th),math.cos(th)])
eng=RapidOCR(); K=14
def read(c,du=7,v0=-2.6,v1=2.6):
    ids=[j for j in gt.query_ball_point(c,10) if abs((gc[j]-c)@D)<du and v0<(gc[j]-c)@N<v1]
    if not ids: return None
    pts=np.array([v for i in ids for s in gly[i]['subs'] for v in s]); U=(pts-c)@D; V=(pts-c)@N
    u0,vv0=U.min()-1.5,V.min()-1.5; W=int((U.max()-u0+1.5)*K); Hh=int((V.max()-vv0+1.5)*K)
    if W<10 or Hh<10: return None
    im=Image.new('L',(W,Hh),255); d=ImageDraw.Draw(im)
    for i in ids:
        subs=[[(((np.array(p)-c)@D-u0)*K,((np.array(p)-c)@N-vv0)*K) for p in s] for s in gly[i]['subs']]
        if gly[i]['fill']:
            m=Image.new('1',(W,Hh),0)
            for s in subs:
                if len(s)>2:
                    mm=Image.new('1',(W,Hh),0); ImageDraw.Draw(mm).polygon(s,fill=1); m=ImageChops.logical_xor(m,mm)
            im.paste(0,mask=m)
        else:
            for s in subs:
                if len(s)>1: d.line(s,fill=0,width=3)
    s=max(1,48/Hh); im=im.resize((int(W*s),int(Hh*s)))
    big=Image.new('L',(im.width+60,im.height+30),255); big.paste(im,(30,15))
    res,_=eng(np.array(big.convert('RGB')))
    if not res: return None
    res=sorted(res,key=lambda r:-float(r[2])); return res[0][1].replace(' ',''),float(res[0][2])
out={}; t0=time.time(); n=0
for k,o in H['lots'].items():
    pts=[o['p']]+o.get('alts',[])
    road,no=k.split('_',1)
    for pi,p in enumerate(pts):
        x,y=back.transform(p[1],p[0]); c=cad2pdf(x,y)+np.array([1.76,2.25])
        r=read(c)
        out.setdefault(k,[]).append(dict(c=c.tolist(),pdf=r,p=p))
        n+=1
    if n%100<len(pts): print(n,round(time.time()-t0),k,r,flush=True)
pickle.dump(out,open('verify.pkl','wb')); print('done')
