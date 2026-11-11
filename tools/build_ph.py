import json, struct, math, pickle, sys, re
import numpy as np

def write_bin(path, header, groups):
    """groups: list of (style, [subpath coords flat list in plan px])"""
    counts=[]; flags=[]; coords=[]
    for st,subs in groups:
        first=True
        for i,s in enumerate(subs):
            if len(s)<4: continue
            sti=st[i] if isinstance(st,list) else st
            counts.append(len(s)//2); flags.append(sti | (0 if first else 0x80)); coords.extend(s); first=False
    a=np.round(np.array(coords,dtype=np.float64)*2)
    a=np.clip(a,0,65535).astype('<u2')
    header=dict(header,n=len(counts),scale=0.5)
    hj=json.dumps(header,ensure_ascii=False,separators=(',',':')).encode()
    hj+=b' '*((-len(hj))%4)
    with open(path,'wb') as f:
        f.write(struct.pack('<I',len(hj))); f.write(hj)
        f.write(np.array(counts,dtype='<u4').tobytes())
        fl=np.array(flags,dtype='u1').tobytes(); fl+=b'\0'*((-len(fl))%4); f.write(fl)
        f.write(a.tobytes())
    print(path,len(counts),'subpaths',len(a)//2,'pts')

# ---- Phuoc Hai from pdf extraction
import pymupdf
doc=pymupdf.open('/home/claude/ph/ph.pdf'); p=doc[0]
clip=(330,0,1356,1191); S=200/72
RM=p.rotation_matrix
def pt(q):
    q=pymupdf.Point(q)*RM; return ((q.x-clip[0])*S,(q.y-clip[1])*S)
def bez(a,b,c,d,n=5):
    return [(((1-t)**3)*a[0]+3*((1-t)**2)*t*b[0]+3*(1-t)*t*t*c[0]+t**3*d[0], ((1-t)**3)*a[1]+3*((1-t)**2)*t*b[1]+3*(1-t)*t*t*c[1]+t**3*d[1]) for t in [i/n for i in range(1,n+1)]]
hx=lambda c: None if c is None else '#%02x%02x%02x'%tuple(int(round(v*255)) for v in c[:3])
styles={}; groups=[]; txt=[]
for d in p.get_drawings():
    col=hx(d.get('color')); fill=hx(d.get('fill')); w=(d.get('width') or 0)*S
    if d.get('type')=='f': col=None
    if d.get('type')=='s': fill=None
    key=(col,fill,round(w,2) if col else 0,1 if d.get('even_odd') else 0)
    si=styles.setdefault(key,len(styles))
    subs=[]; cur=[]
    def flush():
        global cur
        if cur: subs.append([v for xy in cur for v in xy])
        cur=[]
    for it in d['items']:
        op=it[0]
        if op=='l':
            a,b=pt(it[1]),pt(it[2])
            if cur and abs(cur[-1][0]-a[0])+abs(cur[-1][1]-a[1])<0.02: cur.append(b)
            else: flush(); cur=[a,b]
        elif op=='c':
            a=pt(it[1])
            if not(cur and abs(cur[-1][0]-a[0])+abs(cur[-1][1]-a[1])<0.02): flush(); cur=[a]
            cur+=bez(a,pt(it[2]),pt(it[3]),pt(it[4]))
        elif op=='re':
            r=it[1]; flush(); cur=[pt(r.tl),pt(r.tr),pt(r.br),pt(r.bl),pt(r.tl)]; flush()
        elif op=='qu':
            q=it[1]; flush(); cur=[pt(q.ul),pt(q.ur),pt(q.lr),pt(q.ll),pt(q.ul)]; flush()
    flush()
    if d.get('closePath'): subs=[s+s[:2] if len(s)>4 else s for s in subs]
    r=d['rect']; sz=max(r.width,r.height)*S
    if (d.get('width') or 0)<=0.13 and sz<12 and (col or fill) and (fill in (None,'#000000')):
        txt.append((subs,'f' if fill else 's'))
    else: groups.append((si,subs))
# cluster glyph strokes into labels
bbs=[]
for subs,_k in txt:
    a=np.array([v for s in subs for v in s]).reshape(-1,2); bbs.append((a[:,0].min(),a[:,1].min(),a[:,0].max(),a[:,1].max()))
par=list(range(len(txt)))
def f(i):
    while par[i]!=i: par[i]=par[par[i]]; i=par[i]
    return i
G=1.3; cell={}
for i,b in enumerate(bbs):
    for cx in range(int((b[0]-G)//8),int((b[2]+G)//8)+1):
        for cy in range(int((b[1]-G)//8),int((b[3]+G)//8)+1):
            for j in cell.get((cx,cy),[]):
                c=bbs[j]
                if b[0]-G<=c[2] and c[0]<=b[2]+G and b[1]-G<=c[3] and c[1]<=b[3]+G: par[f(i)]=f(j)
            cell.setdefault((cx,cy),[]).append(i)
cl={}
TS=styles.setdefault(('#000000',None,0.3,0,'txt'),len(styles)); TF=styles.setdefault((None,'#000000',0,0,'txt'),len(styles))
for i in range(len(txt)):
    subs,k=txt[i]; e=cl.setdefault(f(i),([],[]))
    for sp in subs: e[0].append(sp); e[1].append(TF if k=='f' else TS)
for subs,sts in cl.values(): groups.append((sts,subs))
print('glyph strokes',len(txt),'labels',len(cl))
st=[{'stroke':k[0],'fill':k[1],'w':k[2],'eo':k[3],**({'txt':1} if len(k)>4 else {})} for k,_ in sorted(styles.items(),key=lambda x:x[1])]
assert len(st)<128
write_bin('/home/claude/v2/plans/phuochai.bin',{'styles':st,'texts':[],'hideRaster':True},groups)

