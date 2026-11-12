import pickle, json, numpy as np, cv2
from pyproj import Transformer
items=pickle.load(open('items.pkl','rb'))
pj=[p for p in json.load(open('/home/claude/gio-hang-bds/projects.json')) if p['id']=='phuochai'][0]
to=Transformer.from_crs('EPSG:4326','EPSG:3857',always_xy=True); fr=Transformer.from_crs('EPSG:3857','EPSG:4326',always_xy=True)
A=[];B=[]
for x,y,la,lo in pj['ctrl']:
    X,Y=to.transform(lo,la); A.append([x,y,1]); B.append([X,Y])
M=np.linalg.solve(np.array(A),np.array(B)); Mi=np.linalg.inv(np.vstack([M.T,[0,0,1]]))
K=4; W,H=2851*K,3309*K
img=np.zeros((H,W),np.uint8)
for it in items:
    if it['fill'] or round(it['w'],2)==0.72 or (it['w']<=0.13 and it['sz']<12): continue
    for s in it['subs']:
        if len(s)>1: cv2.polylines(img,[(np.array(s)*K).round().astype(np.int32)],False,255,3)
n,lab,st,cen=cv2.connectedComponentsWithStats((img==0).astype(np.uint8),connectivity=4)
px2m2=(0.258/K)**2
Hh=json.load(open('/home/claude/gio-hang-bds/plans/phuochai.json'))
key_of={}
for k,o in Hh['lots'].items():
    la,lo=o['p']; X,Y=to.transform(lo,la); p=Mi@[X,Y,1]; cx,cy=int(p[0]*K),int(p[1]*K)
    for r in range(0,16):
        hit=None
        for dx,dy in ((r,0),(-r,0),(0,r),(0,-r),(r,r),(-r,-r)):
            if 0<=cy+dy<H and 0<=cx+dx<W and lab[cy+dy,cx+dx]>0: hit=lab[cy+dy,cx+dx]; break
        if hit: key_of.setdefault(int(hit),k); break
def ll(x,y):
    X,Y=M.T@[x/K,y/K,1]; lo,la=fr.transform(X,Y); return [round(la,6),round(lo,6)]
out=[]; kinds={'lot':0,'green':0}
for i in range(1,n):
    x,y,w,h,a=st[i]; m2=a*px2m2
    if x==0 or y==0 or x+w>=W or y+h>=H: continue
    if m2<25 or m2>30000: continue
    kind='lot' if m2<=1200 or i in key_of else 'green'
    sub=(lab[y:y+h,x:x+w]==i).astype(np.uint8)
    sub=cv2.dilate(sub,np.ones((3,3),np.uint8),iterations=2)
    cs,_=cv2.findContours(sub,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE); c=max(cs,key=cv2.contourArea)
    c=cv2.approxPolyDP(c,2.5 if kind=='lot' else 4,True)[:,0,:]
    if len(c)<3: continue
    rec={'t':'l' if kind=='lot' else 'g','p':[ll(px+x,py+y) for px,py in c],'a':round(m2,1)}
    if i in key_of: rec['k']=key_of[i]
    out.append(rec); kinds[kind]+=1
print(n,kinds,'keyed',sum(1 for o in out if 'k' in o))
json.dump({'blocks':out},open('/home/claude/gio-hang-bds/plans/phuochai_blocks.json','w'),ensure_ascii=False,separators=(',',':'))
import os; print(os.path.getsize('/home/claude/gio-hang-bds/plans/phuochai_blocks.json'))
