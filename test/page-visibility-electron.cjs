// Real UI, temporary Page records only; no OAuth, publishing or build.
const {app,BrowserWindow}=require('electron');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {mkdtemp,rm}=require('node:fs/promises');
const {DatabaseSync}=require('node:sqlite');
const path=require('node:path');
const {tmpdir}=require('node:os');
const assert=require('node:assert/strict');
let folder,worker,win,db,exitCode=0;app.on('window-all-closed',()=>{});
async function until(script){for(let i=0;i<150;i++){if(await win.webContents.executeJavaScript(script))return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('Page visibility UI timed out: '+script);}
(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'page-visibility-ui-'));app.setPath('userData',path.join(folder,'browser'));await app.whenReady();
 worker=spawn(process.execPath,[path.join(__dirname,'../server.mjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',DATA_DIR:folder,AFFILIATE_MASTER_DIR:folder,PORT:'0',HOST:'127.0.0.1',ADMIN_PASSWORD:'',META_APP_ID:'',META_APP_SECRET:'',DESKTOP_MODE:'1'},stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);worker.once('error',reject);worker.on('message',message=>{if(message.type==='ready'){clearTimeout(timer);resolve(message);}});});
 db=new DatabaseSync(path.join(folder,'reels.sqlite'));db.prepare('INSERT INTO pages VALUES(?,?,?)').run('1','Page A','unused');db.prepare('INSERT INTO pages VALUES(?,?,?)').run('2','Page B','unused');
 win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});await win.loadURL(`http://127.0.0.1:${ready.port}`);
 await until(`document.querySelectorAll('#page-list .page-visibility').length===2`);
 await win.webContents.executeJavaScript(`window.confirm=()=>true;document.getElementById('quick-page').value='1';document.getElementById('comments-tab').click();true;`);
 const doc=`document.getElementById('comments-frame').contentDocument`;
 await until(`!!${doc}?.querySelector('#page option[value="1"]')`);
 await win.webContents.executeJavaScript(`${doc}.getElementById('page').value='1';document.getElementById('studio-tab').click();document.querySelector('#page-list [data-page-id="1"]').click();true;`);
 await until(`!document.querySelector('#quick-page option[value="1"]')&&!!document.querySelector('#hidden-page-list [data-page-id="1"]')`);
 await until(`!${doc}.querySelector('#page option[value="1"]')`);
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('quick-page').value`),'');
 assert.equal(await win.webContents.executeJavaScript(`${doc}.getElementById('page').value`),'');
 await win.webContents.executeJavaScript(`document.getElementById('hidden-pages').open=true;document.querySelector('#hidden-page-list [data-page-id="1"]').click();true;`);
 await until(`!!document.querySelector('#quick-page option[value="1"]')&&!document.querySelector('#hidden-page-list [data-page-id="1"]')`);
 await until(`!!${doc}.querySelector('#page option[value="1"]')`);
 assert.equal(db.prepare('SELECT COUNT(*) AS count FROM pages').get().count,2);
 console.log('PASS: hide/restore Page, cleared active selections, live comment-tab synchronization, token records preserved');
})().catch(error=>{console.error(error);exitCode=1;}).finally(async()=>{db?.close();win?.destroy();if(worker&&worker.exitCode===null){const ended=once(worker,'exit');worker.kill();await ended;}if(folder)await rm(folder,{recursive:true,force:true}).catch(()=>{});app.exit(exitCode);});
