import pickle, json, re, struct, numpy as np, sys
sys.path.insert(0,'/home/claude/vec')
from pyproj import Transformer
tr=Transformer.from_crs("+proj=tmerc +lat_0=0 +lon_0=108.25 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs","EPSG:4326",always_xy=True)
ll=lambda x,y:(lambda r:[round(r[1],7),round(r[0],7)])(tr.transform(x,y))
# ---------- Phuoc Hai ctrl from registration
A=np.load('A.npy'); X0r,Y1r,R=600050,1354400,1.5
def pdf2cad(x,y): u,v=A@[x,y,1]; return (X0r+u/R, Y1r-v/R)
ph_ctrl=[[x,y]+ll(*pdf2cad(x,y)) for x,y in [(0,0),(2851,0),(0,3309)]]
vcn_poly=[pdf2cad(x,y) for x,y in [(150,250),(2851,250),(2851,3000),(150,3000)]]
print('ph ctrl',ph_ctrl)
# ---------- text decoding (TCVN3 / VNI-Windows legacy fonts)
TCVN3=dict(zip("¸µ¶·¹¨¾»¼½Æ©ÊÇÈÉË®ÐÌÎÏÑªÕÒÓÔÖÝ×ØÜÞãßáâä«èåæçé¬íêëìîóïñòô­øõö÷ùýúûüþ¡¢§£¤¥¦",
 "áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵĂÂĐÊÔƠƯ"))
def dec_tcvn(s): return ''.join(TCVN3.get(c,c) for c in s)
VNI_PAIRS=[("AÙ","Á"),("AØ","À"),("AÛ","Ả"),("AÕ","Ã"),("AÏ","Ạ"),("AÊÙ","Ắ"),("AÊØ","Ằ"),("AÊÛ","Ẳ"),("AÊÕ","Ẵ"),("AÊÏ","Ặ"),("AÊ","Ă"),
 ("AÁ","Ấ"),("AÀ","Ầ"),("AÅ","Ẩ"),("AÃ","Ẫ"),("AÄ","Ậ"),("AÂ","Â"),("EÙ","É"),("EØ","È"),("EÛ","Ẻ"),("EÕ","Ẽ"),("EÏ","Ẹ"),("EÁ","Ế"),("EÀ","Ề"),("EÅ","Ể"),("EÃ","Ễ"),("EÄ","Ệ"),("EÂ","Ê"),
 ("OÙ","Ó"),("OØ","Ò"),("OÛ","Ỏ"),("OÕ","Õ"),("OÏ","Ọ"),("OÁ","Ố"),("OÀ","Ồ"),("OÅ","Ổ"),("OÃ","Ỗ"),("OÄ","Ộ"),("OÂ","Ô"),("ÔÙ","Ớ"),("ÔØ","Ờ"),("ÔÛ","Ở"),("ÔÕ","Ỡ"),("ÔÏ","Ợ"),("Ô","Ơ"),
 ("UÙ","Ú"),("UØ","Ù"),("UÛ","Ủ"),("UÕ","Ũ"),("UÏ","Ụ"),("ÖÙ","Ứ"),("ÖØ","Ừ"),("ÖÛ","Ử"),("ÖÕ","Ữ"),("ÖÏ","Ự"),("Ö","Ư"),("YÙ","Ý"),("YØ","Ỳ"),("YÛ","Ỷ"),("YÕ","Ỹ"),("AË","Ặ"),("aë","ặ"),("Ò","Ị"),("ò","ị"),("Î","Ị"),("Í","Í"),("Ì","Ì"),("Æ","Ỉ"),("Ó","Ĩ"),("Ñ","Đ")]
VNI_PAIRS+=[(a.lower(),b.lower()) for a,b in VNI_PAIRS]
VNI_PAIRS.sort(key=lambda p:-len(p[0]))
def dec_vni(s):
    out='';i=0
    while i<len(s):
        for a,b in VNI_PAIRS:
            if s.startswith(a,i): out+=b;i+=len(a);break
        else: out+=s[i];i+=1
    return out
def dec(s):
    if re.search('[§¦®­¸µ¶·¹¨¾»¼½Æ©ÊÇÈÉË®ÐÌÎÏÑªÕÒÓÔÖÝ×ØÜÞãßáâä«èåæçé¬íêëìîóïñòô­øõö÷ùýúûüþ]',s) and not re.search('[ÑÖÙØÛÕÏÂÊÁÀÅÃÄ]{1}[A-Za-z ]',s):
        return dec_tcvn(s)
    if re.search('[ÑÖÔ][A-ZØÙÛÕÏ]|[AEOUY][ÙØÛÕÏÂÊÁÀÅÃÄ]',s): return dec_vni(s)
    return dec_tcvn(s)
def up(s): return re.sub(r'\s+',' ',s).strip()
def fixcase(o,s):
    U=sum(c.isupper() for c in o if c.isascii()); Lw=sum(c.islower() for c in o if c.isascii())
    return s.upper() if U>Lw else s
# ---------- geometry
lines,texts=pickle.load(open('lhp.pkl','rb'))
from shapely.geometry import Polygon, Point, LineString
vcn=Polygon(vcn_poly)
DROP=re.compile(r'(?i)^(khu 1 - hien trang|h-0|thong so|tayluy|bldg-hght|baxi|tem to|moctd|giai toa|netthay|net thay|dim|a-dim|kt-lo|dim-chialo|vatgoc|defpoints)')
ROAD=re.compile(r'(?i)(long.?duong|duong|via he|tim duong|le-d|bo-gt|bo moi|bo-co|vienco|chi gioi|heduong)')
LOT=re.compile(r'(?i)(chia ?lo|ranh gioi lo|chjalo|oibo|chigoixd|^8$|congtrinh|cong trinh)')
GREEN=re.compile(r'(?i)(cay xanh|htch-opsp)')
X0,Y1,K=600100,1355100,5.0
groups=[]; drop=0
for lay,p in lines:
    if DROP.search(lay): drop+=1; continue
    a=np.array(p)
    # skip parts inside VCN (PDF already shows them)
    c=a.mean(0)
    if vcn.contains(Point(c[0],c[1])): continue
    st=1 if ROAD.search(lay) else 2 if LOT.search(lay) else 3 if GREEN.search(lay) else 0
    px=np.stack([(a[:,0]-X0)*K,(Y1-a[:,1])*K],1)
    if px.min()<0 or px[:,0].max()>32000 or px[:,1].max()>32000: continue
    groups.append((st,[list(px.ravel())]))
print('groups',len(groups),'dropped',drop)
styles=[{'stroke':'#6b7570','fill':None,'w':0.5,'eo':0},{'stroke':'#2f3a37','fill':None,'w':1.1,'eo':0},
        {'stroke':'#3d4a46','fill':None,'w':0.7,'eo':0},{'stroke':'#3f8a4a','fill':None,'w':0.7,'eo':0}]
TXT={'so thu tu lo':0,'chia lo moi':0,'TEXT-CHIALO':0,'ten duong':1,'TENDUONG':1,'Text':1,'dien tich lo':3,'@DIEN TICH LO':3}
tx=[]
for t in texts:
    cls=TXT.get(t[0])
    if cls is None: continue
    s=fixcase(t[1],up(dec(t[1])))
    if s.startswith("ĐƯ") or s.startswith("đư"): s=s.upper().replace("LẤ ","LÊ ")
    if not s or len(s)>40: continue
    if vcn.contains(Point(t[2],t[3])): continue
    if cls==3 and not re.fullmatch(r'\d+(\.\d+)?',s): cls=0 if re.fullmatch(r'\d{1,3}[A-Za-z]?',s) else 3
    if cls==0 and not re.fullmatch(r'[0-9A-Za-z\-_.]{1,8}',s): continue
    h=t[4] or 1
    x=(t[2]-X0)*K; y=(Y1-t[3])*K
    # left-baseline TEXT -> shift to centre approx
    if t[6]=='TEXT' and not t[7]:
        import math; r=math.radians(t[5] or 0); w=h*0.6*len(s)
        x+=(math.cos(r)*w/2-math.sin(r)*h/2)*K; y-=(math.sin(r)*w/2+math.cos(r)*h/2)*K
    tx.append([round(x,1),round(y,1),round(h*K*(1.0 if cls!=1 else 0.9),2),round(-(t[5] or 0),1),s,cls])
print('texts',len(tx)); print([t[4] for t in tx if t[5]==1][:40])

from binlib import write_bin
W=2200*K; H=(Y1-1350150)*K
write_bin('/home/claude/gio-hang-bds/plans/lhp1.bin',{'styles':styles,'texts':tx,'hideRaster':True},groups)
lhp_ctrl=[[0,0]+ll(X0,Y1),[W,0]+ll(X0+W/K,Y1),[0,H]+ll(X0,Y1-H/K)]
json.dump({'ph_ctrl':ph_ctrl,'lhp_ctrl':lhp_ctrl,'w':W,'h':H},open('ctrl.json','w'))
print(lhp_ctrl)
