import sys, pickle, ezdxf, math
from ezdxf import path as zpath
doc=ezdxf.readfile(sys.argv[1]); msp=doc.modelspace()
SKIP_T={'DIMENSION','ARC_DIMENSION','HATCH','WIPEOUT','REGION','POINT','SOLID','LEADER'}
lines=[]; texts=[]
def add_entity(e,lay):
    t=e.dxftype()
    if t in SKIP_T: return
    if t in ('TEXT','MTEXT','ATTRIB'):
        try:
            s=e.plain_text() if t=='MTEXT' else e.dxf.text
            p=e.dxf.insert; h=e.dxf.get('char_height') if t=='MTEXT' else e.dxf.get('height',1)
            rot=e.dxf.get('rotation',0) or 0
            if t=='TEXT' and (e.dxf.get('halign',0) or e.dxf.get('valign',0)):
                q=e.dxf.get('align_point'); p=q if q else p
            texts.append((lay,str(s).strip(),p[0],p[1],h or 1,rot,t, e.dxf.get('halign',0) if t=='TEXT' else e.dxf.get('attachment_point',1)))
        except Exception: pass
        return
    try:
        pth=zpath.make_path(e)
        for sp in pth.sub_paths():
            pts=[(v.x,v.y) for v in sp.flattening(0.15)]
            if len(pts)>1: lines.append((lay,pts))
    except Exception: pass
for e in msp:
    lay=e.dxf.get('layer')
    L=doc.layers.get(lay)
    if L is not None and (not L.is_on() or L.is_frozen()): continue
    if e.dxftype()=='INSERT':
        try:
            for v in e.virtual_entities():
                vl=v.dxf.get('layer'); vl=lay if vl=='0' else vl
                if v.dxftype()=='INSERT':
                    for w in v.virtual_entities(): add_entity(w,vl)
                else: add_entity(v,vl)
            for a in e.attribs: add_entity(a,lay)
        except Exception: pass
    else: add_entity(e,lay)
print('lines',len(lines),'pts',sum(len(p) for _,p in lines),'texts',len(texts))
pickle.dump((lines,texts),open(sys.argv[2],'wb'))
