const {app,BrowserWindow,dialog,shell,powerSaveBlocker}=require('electron');
const {spawn}=require('node:child_process');
const {mkdirSync,existsSync,copyFileSync,appendFileSync}=require('node:fs');
const path=require('node:path');
app.setName('Reels Desk PC');
let worker,window,blocker,stopping=false;
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
app.whenReady().then(async()=>{
 const home=app.getPath('userData');mkdirSync(home,{recursive:true});
 const envPath=path.join(home,'.env');if(!existsSync(envPath))copyFileSync(path.join(app.getAppPath(),'.env.example'),envPath);
 const config={};const dotenv=require('./settings.cjs');Object.assign(config,dotenv.readSettings(envPath));
 if(!config.TOKEN_ENCRYPTION_KEY){const key=require('node:crypto').randomBytes(32).toString('hex');appendFileSync(envPath,`\nTOKEN_ENCRYPTION_KEY=${key}\n`);config.TOKEN_ENCRYPTION_KEY=key;}
 const port=config.PORT || '3000';if(!/^\d+$/.test(port) || Number(port)<1024 || Number(port)>65535)throw Error('PORT phải nằm trong khoảng 1024–65535');
 const origin=`http://localhost:${port}`;
 worker=spawn(process.execPath,[path.join(app.getAppPath(),'server.mjs')],{cwd:home,env:{...process.env,...config,ELECTRON_RUN_AS_NODE:'1',HOST:'127.0.0.1',PORT:port,DATA_DIR:path.join(home,'data'),DESKTOP_MODE:'1'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 worker.stdout.on('data',()=>{});worker.stderr.on('data',()=>{});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Không khởi động được worker trong 20 giây. Kiểm tra cổng đang sử dụng.')),20000);worker.on('error',reject);worker.on('exit',()=>{clearTimeout(timer);if(!stopping)reject(Error('Worker không khởi động hoặc cổng đã được dùng. Đóng phiên tool cũ rồi thử lại.'));});worker.on('message',message=>{if(message.type==='ready'){clearTimeout(timer);resolve();}if(message.type==='pick-folder'){dialog.showOpenDialog(window,{title:'Chọn thư mục video',properties:['openDirectory']}).then(result=>{if(worker?.connected)worker.send({type:'picked-folder',id:message.id,path:result.canceled?'':result.filePaths[0]});}).catch(()=>{if(worker?.connected)worker.send({type:'picked-folder',id:message.id,path:''});});}});});
 blocker=powerSaveBlocker.start('prevent-app-suspension');
 window=new BrowserWindow({width:1380,height:930,minWidth:850,minHeight:650,title:'Reels Desk PC',backgroundColor:'#f6f8f7',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 const editConfig=()=>{if(process.platform==='win32'){const editor=spawn('notepad.exe',[envPath],{detached:true,stdio:'ignore'});editor.on('error',()=>dialog.showErrorBox('Mở cấu hình',`Mở file này bằng trình soạn thảo: ${envPath}`));editor.unref();}else shell.openPath(envPath);};
 const menu=require('electron').Menu.buildFromTemplate([{label:'Reels Desk',submenu:[{label:'Cấu hình Meta (.env)',click:editConfig},{label:'Mở thư mục dữ liệu',click:()=>shell.openPath(home)},{type:'separator'},{role:'quit',label:'Thoát tool'}]},{label:'Hiển thị',submenu:[{role:'reload',label:'Tải lại giao diện'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]}]);require('electron').Menu.setApplicationMenu(menu);
 const external=target=>{try{const u=new URL(target);if(u.origin===origin && u.pathname==='/auth/meta'){const login=new URL('/auth/meta',config.APP_URL || origin);if(login.protocol!=='https:' && !['localhost','127.0.0.1','[::1]'].includes(login.hostname))throw Error('APP_URL phải dùng HTTPS ngoài localhost');return shell.openExternal(login.href);}}catch{}return Promise.resolve();};
 window.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
 window.webContents.on('will-navigate',(event,target)=>{if(new URL(target).origin!==origin || new URL(target).pathname==='/auth/meta'){event.preventDefault();external(target);}});
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.webContents.on('login',(event,details,authInfo,callback)=>{if(!authInfo.isProxy && ['localhost','127.0.0.1'].includes(authInfo.host) && Number(authInfo.port)===Number(port) && config.ADMIN_PASSWORD){event.preventDefault();callback('desktop',config.ADMIN_PASSWORD);}});
 worker.on('exit',()=>{if(!stopping){dialog.showErrorBox('Worker đã dừng','Lịch đăng sẽ không chạy. Hãy thoát rồi mở lại ứng dụng.');app.quit();}});
 await window.loadURL(origin);window.on('closed',()=>{window=null;app.quit();});
}).catch(error=>{dialog.showErrorBox('Không mở được Reels Desk',error.message);app.quit();});
app.on('before-quit',()=>{stopping=true;if(worker)worker.kill();if(blocker!==undefined && powerSaveBlocker.isStarted(blocker))powerSaveBlocker.stop(blocker);});
app.on('window-all-closed',()=>app.quit());
}
