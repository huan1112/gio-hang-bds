import json, struct, numpy as np
def write_bin(path, header, groups):
    """groups: list of (style, [subpath coords flat list in plan px])"""
    counts=[]; flags=[]; coords=[]
    for st,subs in groups:
        for i,s in enumerate(subs):
            if len(s)<4: continue
            counts.append(len(s)//2); flags.append(st | (0x80 if i>0 else 0)); coords.extend(s)
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

