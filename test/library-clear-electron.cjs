// Isolated library UI test; no real files, Meta traffic or build.
const {app,BrowserWindow}=require('electron');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {mkdtemp,rm,writeFile,readFile}=require('node:fs/promises');
const {DatabaseSync}=require('node:sqlite');
const path=require('node:path');
const {tmpdir}=require('node:os');
const assert=require('node:assert/strict');
let folder,worker,win,db,exitCode=0;app.on('window-all-closed',()=>{});
async function until(script){for(let i=0;i<150;i++){if(await win.webContents.executeJavaScript(script))return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('Library UI timed out: '+script);}
async function click(selector){await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click();true;`);}
(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'library-clear-ui-'));app.setPath('userData',path.join(folder,'browser'));await app.whenReady();
 worker=spawn(process.execPath,[path.join(__dirname,'../server.mjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',DATA_DIR:folder,AFFILIATE_MASTER_DIR:folder,PORT:'0',HOST:'127.0.0.1',ADMIN_PASSWORD:'',META_APP_ID:'',META_APP_SECRET:'',DESKTOP_MODE:'1'},stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);worker.once('error',reject);worker.on('message',message=>{if(message.type==='ready'){clearTimeout(timer);resolve(message);}});});
 db=new DatabaseSync(path.join(folder,'reels.sqlite'));
 for(let i=1;i<=3;i++){const file=path.join(folder,`video-${i}.mp4`);await writeFile(file,'preserved');db.prepare('INSERT INTO media(id,name,size,path) VALUES(?,?,?,?)').run(String(i).padStart(32,'0'),`video-${i}.mp4`,9,file);}
 win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});await win.loadURL(`http://127.0.0.1:${ready.port}`);
 await until(`document.querySelectorAll('.library-check').length===3`);
 await click('.library-check');
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('library-all').indeterminate`),true);
 await win.webContents.executeJavaScript('window.confirm=()=>false;true;');await click('#library-clear');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media WHERE COALESCE(hidden,0)=0').get().n,3);
 await win.webContents.executeJavaScript('window.confirm=()=>true;true;');await click('#library-delete');
 await until(`document.querySelectorAll('.library-check').length===2&&!document.getElementById('library-clear').disabled`);
 await click('#library-all');
 assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.library-check:checked').length`),2);
 await click('#library-all');
 assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.library-check:checked').length`),0);
 await click('#library-clear');
 await until(`document.querySelectorAll('.library-check').length===0&&document.getElementById('library-clear').disabled`);
 assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('#quick-rows tr[data-id]').length`),0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media WHERE hidden=1').get().n,3);
 for(let i=1;i<=3;i++)assert.equal(await readFile(path.join(folder,`video-${i}.mp4`),'utf8'),'preserved');
 console.log('PASS: individual/select-all selection, cancellation, selected delete, clear library, quick table refreshed, original files preserved');
})().catch(error=>{console.error(error);exitCode=1;}).finally(async()=>{db?.close();win?.destroy();if(worker&&worker.exitCode===null){const ended=once(worker,'exit');worker.kill();await ended;}if(folder)await rm(folder,{recursive:true,force:true}).catch(()=>{});app.exit(exitCode);});
