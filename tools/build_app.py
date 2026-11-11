import time, os
D=os.path.dirname(os.path.abspath(__file__)); R=os.path.dirname(D)
open(os.path.join(R,'app.js'),'w').write(open(os.path.join(D,'engine.js')).read()+open(os.path.join(D,'ui.js')).read())
sh=open(os.path.join(D,'shell.html')).read(); v=str(int(time.time()))
for fn,mode,title in [('index.html','sale','Giỏ hàng BĐS'),('admin.html','admin','Quản trị giỏ hàng')]:
    open(os.path.join(R,fn),'w').write(sh.replace('{{MODE}}',mode).replace('{{TITLE}}',title).replace('{{V}}',v))
print('built',v)
