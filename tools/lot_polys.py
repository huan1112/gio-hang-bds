import pickle, json, numpy as np, cv2
from pyproj import Transformer
items=pickle.load(open('items.pkl','rb'))
pj=[p for p in json.load(open('/home/claude/gio-hang-bds/projects.json')) if p['id']=='phuochai'][0]
to=Transformer.from_crs('EPSG:4326','EPSG:3857',always_xy=True); fr=Transformer.from_crs('EPSG:3857','EPSG:4326',always_xy=True)
A=[];B=[]
for x,y,la,lo in pj['ctrl']:
    X,Y=to.transform(lo,la); A.append([x,y,1]); B.append([X,Y])
M=np.linalg.solve(np.array(A),np.array(B))   # px->merc (3x2)
Mi=np.linalg.inv(np.vstack([M.T,[0,0,1]]))
K=4; W,H=2851*K,3309*K
img=np.zeros((H,W),np.uint8)
for it in items:
    if it['fill'] or round(it['w'],2)==0.72 or (it['w']<=0.13 and it['sz']<12): continue
    for s in it['subs']:
        if len(s)>1: cv2.polylines(img,[(np.array(s)*K).round().astype(np.int32)],False,255,3)
H_=json.load(open('/home/claude/gio-hang-bds/plans/phuochai.json'))
ok=0; bad=0
for k,o in H_['lots'].items():
    la,lo=o['p']; X,Y=to.transform(lo,la); px=Mi@[X,Y,1]; cx,cy=int(px[0]*K),int(px[1]*K)
    if not(0<=cx<W and 0<=cy<H): bad+=1; continue
    if img[cy,cx]:
        f=False
        for r in range(1,16):
            for dx,dy in ((r,0),(-r,0),(0,r),(0,-r),(r,r),(-r,-r),(r,-r),(-r,r)):
                if not img[cy+dy,cx+dx]: cx,cy=cx+dx,cy+dy; f=True; break
            if f: break
        if not f: bad+=1; continue
    x0,y0=max(cx-500,0),max(cy-500,0); sub=img[y0:cy+500,x0:cx+500].copy()
    mask=np.zeros((sub.shape[0]+2,sub.shape[1]+2),np.uint8)
    n,_,_,rect=cv2.floodFill(sub,mask,(cx-x0,cy-y0),128,flags=8|cv2.FLOODFILL_MASK_ONLY|(255<<8))
    area=n/K/K*(0.258**2)
    if n<50 or area>900 or rect[0]==0 or rect[1]==0 or rect[0]+rect[2]>=sub.shape[1] or rect[1]+rect[3]>=sub.shape[0]: bad+=1; continue
    m=mask[1:-1,1:-1]; m=cv2.dilate(m,np.ones((3,3),np.uint8),iterations=2)
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE); c=max(cs,key=cv2.contourArea)
    c=cv2.approxPolyDP(c,2.5,True)[:,0,:]
    poly=[]
    for x,y in c:
        X,Y=M.T@[(x+x0)/K,(y+y0)/K,1]; lo2,la2=fr.transform(X,Y); poly.append([round(la2,7),round(lo2,7)])
    o['poly']=poly; o['A']=round(area,1); ok+=1
print('ok',ok,'bad',bad)
import statistics
r=[o['A']/o['a'] for o in H_['lots'].values() if 'A' in o and o.get('a')]; print('ratio median',statistics.median(r), sum(1 for x in r if x>1.4 or x<0.7),'off');print(H_['lots'].get('B4_54',{}).get('A'))
json.dump(H_,open('/home/claude/gio-hang-bds/plans/phuochai.json','w'),ensure_ascii=False,separators=(',',':'))
