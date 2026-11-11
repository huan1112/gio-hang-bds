import pickle, numpy as np, cv2
from PIL import Image
lines,texts=pickle.load(open('lhp.pkl','rb'))
X0,X1,Y0,Y1=600050,601150,1353000,1354400; R=1.5   # px per metre
W,H=int((X1-X0)*R),int((Y1-Y0)*R)
cad=np.full((H,W),255,np.uint8)
for l,p in lines:
    a=np.array(p)
    if a[:,0].max()<X0 or a[:,0].min()>X1 or a[:,1].max()<Y0 or a[:,1].min()>Y1: continue
    q=np.stack([(a[:,0]-X0)*R,(Y1-a[:,1])*R],1).round().astype(np.int32)
    cv2.polylines(cad,[q],False,0,1,cv2.LINE_AA)
cv2.imwrite('cad.png',cad)
pdf=np.asarray(Image.open('/home/claude/gio-hang-bds/plans/phuochai.png').convert('RGBA'))[...,3]
pdf=255-pdf
s=R*0.258   # pdf px -> metres ~0.258
pdfs=cv2.resize(pdf,(int(pdf.shape[1]*s),int(pdf.shape[0]*s)),interpolation=cv2.INTER_AREA)
cv2.imwrite('pdfs.png',pdfs)
sift=cv2.SIFT_create(8000)
k1,d1=sift.detectAndCompute(pdfs,None); k2,d2=sift.detectAndCompute(cad,None)
m=cv2.BFMatcher().knnMatch(d1,d2,k=2)
good=[a for a,b in m if a.distance<0.8*b.distance]
print('kp',len(k1),len(k2),'good',len(good))
src=np.float32([k1[g.queryIdx].pt for g in good]); dst=np.float32([k2[g.trainIdx].pt for g in good])
M,inl=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,ransacReprojThreshold=4,maxIters=20000,confidence=0.999)
print('inliers',int(inl.sum()),M)
# pdf orig px -> cad metres
A=np.array([[M[0,0]*s,M[0,1]*s,M[0,2]],[M[1,0]*s,M[1,1]*s,M[1,2]]])
def pdf2cad(x,y):
    u,v=A@[x,y,1]; return (X0+u/R, Y1-v/R)
for p in [(0,0),(2851,0),(0,3309),(1785,2585),(225,607)]: print(p,pdf2cad(*p))
np.save('A.npy',A)
ov=cv2.cvtColor(cad,cv2.COLOR_GRAY2BGR)
warp=cv2.warpAffine(pdfs,M,(W,H),borderValue=255)
ov[warp<128]=(0,0,255)
cv2.imwrite('ov.png',ov)
