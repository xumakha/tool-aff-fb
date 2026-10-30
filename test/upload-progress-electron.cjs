// UI integration with temporary SQLite rows. No Meta credentials, upload or build.
const {app,BrowserWindow}=require('electron');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {mkdtemp,rm}=require('node:fs/promises');
const {DatabaseSync}=require('node:sqlite');
const path=require('node:path');
const {tmpdir}=require('node:os');
const assert=require('node:assert/strict');
let folder,worker,win,db,exitCode=0;
app.on('window-all-closed',()=>{});
async function until(script){for(let i=0;i<150;i++){if(await win.webContents.executeJavaScript(script))return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('Progress UI timeout: '+script);}
(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'page-progress-'));app.setPath('userData',path.join(folder,'browser'));await app.whenReady();
 worker=spawn(process.execPath,[path.join(__dirname,'../server.mjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',DATA_DIR:folder,AFFILIATE_MASTER_DIR:folder,PORT:'0',HOST:'127.0.0.1',ADMIN_PASSWORD:'',META_APP_ID:'',META_APP_SECRET:'',DESKTOP_MODE:'1'},stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),10000);worker.once('error',reject);worker.on('message',message=>{if(message.type==='ready'){clearTimeout(timer);resolve(message);}});});
 db=new DatabaseSync(path.join(folder,'reels.sqlite'));
 const page=db.prepare('INSERT INTO pages VALUES(?,?,?)');page.run('1','Gia Dụng Thông Minh','unused');page.run('2','Một Chút English','unused');
 db.prepare('INSERT INTO media(id,name,size) VALUES(?,?,?)').run('video','Test video.mp4',32);
 const insert=db.prepare('INSERT INTO jobs(id,page_id,media_id,due,created,status,batch_id,progress) VALUES(?,?,?,?,?,?,?,?)');
 const job=(id,page,status,batch,progress,created='2026-10-30T01:00:00Z')=>insert.run(id,page,'video','2099-01-01T01:00:00Z',created,status,batch,progress);
 job('a-old','1','remote_scheduled','batch-old',100);job('a-new','1','remote_uploading','batch-new',63,'2026-10-30T02:00:00Z');job('b','2','remote_scheduled','batch-b',100);
 win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});await win.loadURL(`http://127.0.0.1:${ready.port}`);
 await until(`document.querySelectorAll('.upload-page').length===2`);
 assert.deepEqual(await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.upload-page h2')).map(node=>node.textContent)`),['Tiến độ tải lên Meta: Gia Dụng Thông Minh','Tiến độ tải lên Meta: Một Chút English']);
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[data-page-id="1"] .upload-items').children.length`),2);
 assert.ok(await win.webContents.executeJavaScript(`document.querySelector('[data-job-id="a-old"] small').textContent==='Gia Dụng Thông Minh đã nhận lịch'`));
 assert.ok(await win.webContents.executeJavaScript(`document.getElementById('jobs').textContent.includes('Một Chút English đã nhận lịch')`));
 await win.webContents.executeJavaScript(`document.querySelector('[data-page-id="1"] .upload-toggle').click();localStorage.setItem('activeRemoteBatch','batch-b');true;`);
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[data-page-id="1"] .upload-toggle').getAttribute('aria-expanded')`),'false');
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[data-page-id="2"] .upload-toggle').getAttribute('aria-expanded')`),'true');
 // New Page and another batch must not replace the previous Page blocks.
 page.run('3','Gia Dụng Thông Minh','unused');job('c','3','remote_uploading','batch-c',20,'2026-10-30T03:00:00Z');
 db.prepare("UPDATE jobs SET status='remote_scheduled',progress=100 WHERE id='a-new'").run();
 await win.webContents.executeJavaScript(`document.getElementById('refresh').click();true;`);
 await until(`document.querySelectorAll('.upload-page').length===3&&document.querySelector('[data-job-id="a-new"] progress').value===100`);
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[data-page-id="1"] .upload-toggle').getAttribute('aria-expanded')`),'false');
 assert.ok(await win.webContents.executeJavaScript(`document.querySelector('[data-page-id="1"] .upload-message').textContent.includes('đã nhận lịch cho 2 video')`));
 assert.ok(await win.webContents.executeJavaScript(`document.querySelector('[data-page-id="3"] .upload-message').textContent.includes('Đang tải')`));
 assert.ok(!(await win.webContents.executeJavaScript(`document.getElementById('upload-progress').textContent`)).includes('tắt app'));
 // Publishing and processing must not be presented as scheduled posts.
 db.prepare("UPDATE jobs SET status='published' WHERE id='b'").run();db.prepare("UPDATE jobs SET status='processing',progress=100,remote_now=1 WHERE id='c'").run();
 await win.webContents.executeJavaScript(`document.getElementById('refresh').click();true;`);
 await until(`document.querySelector('[data-job-id="b"] small').textContent==='Một Chút English đã đăng bài'`);
 assert.ok(await win.webContents.executeJavaScript(`document.querySelector('[data-page-id="3"] .upload-message').textContent.includes('chưa xác nhận xuất bản')`));
 // Clear history removes only the corresponding Page's progress block.
 db.prepare("UPDATE jobs SET history_hidden=1 WHERE page_id='2'").run();await win.webContents.executeJavaScript(`document.getElementById('refresh').click();true;`);
 await until(`document.querySelectorAll('.upload-page').length===2&&!document.querySelector('[data-page-id="2"]')`);
 console.log('PASS: separate Page progress across batches, named history statuses, independent collapse, publication states and history clearing');
})().catch(error=>{console.error(error);exitCode=1;}).finally(async()=>{db?.close();win?.destroy();if(worker&&worker.exitCode===null){const ended=once(worker,'exit');worker.kill();await ended;}if(folder)await rm(folder,{recursive:true,force:true}).catch(()=>{});app.exit(exitCode);});
