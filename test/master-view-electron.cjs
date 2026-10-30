// Isolated UI smoke test. No build, real credentials, publishing or user data.
const {app,BrowserWindow}=require('electron');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const path=require('node:path');
const {tmpdir}=require('node:os');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
let folder,worker,win,exitCode=0;
async function until(script){for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript(script))return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('UI did not reach expected state: '+script);}
(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'master-view-ui-'));app.setPath('userData',path.join(folder,'browser'));await app.whenReady();
 const file=path.join(folder,'Tong-hop-affiliate.xlsx');const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('sheet 1');
 sheet.addRow(['Liên kết gốc','Tên sản phẩm','Link affiliate','Nội dung']);sheet.addRow(['https://shopee.vn/product/1/2','Đèn ngủ đẹp','https://s.shopee.vn/example','<img src=x onerror=alert(1)>\nDòng hai']);sheet.addRow(['https://shopee.vn/product/1/3','Nồi cơm','','Nội dung khác']);await book.xlsx.writeFile(file);const before=await readFile(file);
 worker=spawn(process.execPath,[path.join(__dirname,'../server.mjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',DATA_DIR:folder,AFFILIATE_MASTER_DIR:folder,PORT:'0',HOST:'127.0.0.1',ADMIN_PASSWORD:'',META_APP_ID:'',META_APP_SECRET:'',DESKTOP_MODE:'1'},stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),10000);worker.once('error',reject);worker.on('message',message=>{if(message.type==='ready'){clearTimeout(timer);resolve(message);}});});
 win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 await win.loadURL(`http://127.0.0.1:${ready.port}`);
 await until(`!!document.getElementById('master-tab')&&!!document.getElementById('shopee-url')`);
 await win.webContents.executeJavaScript(`document.getElementById('shopee-url').value='https://shopee.vn/keep-my-draft';document.getElementById('master-tab').click();true;`);
 await until(`!!document.getElementById('master-frame').contentDocument?.getElementById('status')?.textContent.includes('2 / 2')`);
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('studio-panel').hidden`),true);
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('master-frame').contentDocument.querySelectorAll('#rows img,[contenteditable]').length`),0);
 await win.webContents.executeJavaScript(`const d=document.getElementById('master-frame').contentDocument;d.getElementById('query').value='den dep';d.getElementById('search-form').requestSubmit();true;`);
 await until(`document.getElementById('master-frame').contentDocument.getElementById('status').textContent.includes('1 / 2')`);
 assert.ok(await win.webContents.executeJavaScript(`document.getElementById('master-frame').contentDocument.getElementById('rows').textContent.includes('Đèn ngủ đẹp')`));
 await win.webContents.executeJavaScript(`document.getElementById('studio-tab').click();true;`);
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('shopee-url').value`),'https://shopee.vn/keep-my-draft');
 assert.equal(await win.webContents.executeJavaScript(`document.getElementById('master-panel').hidden`),true);
 assert.deepEqual(await readFile(file),before);
 console.log('PASS: isolated table tab, accent-insensitive search, safe text, preserved app draft and unchanged workbook');
})().catch(error=>{console.error(error);exitCode=1;}).finally(async()=>{win?.destroy();if(worker){const stopped=once(worker,'exit');worker.kill();await stopped;}if(folder)await rm(folder,{recursive:true,force:true}).catch(()=>{});app.exit(exitCode);});
