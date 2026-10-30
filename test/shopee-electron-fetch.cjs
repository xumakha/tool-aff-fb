// Exercise the actual Chromium fetch stack, with no external requests.
const {app,session,BrowserWindow}=require('electron');
const http=require('node:http');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {downloadVideo}=require('../desktop/shopee-transfer.cjs');
const {galleryStructureScript}=require('../desktop/shopee-diagnostics.cjs');
const {mediaScript}=require('../desktop/shopee-media.cjs');
const bytes=Buffer.alloc(32);bytes.writeUInt32BE(24);bytes.write('ftyp',4);bytes.write('isom',8);
let requests=0,folder,win,exitCode=0;
const server=http.createServer((req,res)=>{requests++;res.setHeader('Content-Type','video/mp4');res.end(bytes);});
(async()=>{
 await app.whenReady();server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}/video`;
 await assert.rejects(session.defaultSession.fetch(url,{headers:{Referer:'https://shopee.vn/product/1/2'}}),/ERR_BLOCKED_BY_CLIENT/);
 assert.equal(requests,0);console.log('Reproduced old Referer regression: request blocked before reaching server');
 folder=await mkdtemp(path.join(tmpdir(),'shopee-electron-fetch-'));
 const temporary=path.join(folder,'video.part');
 // Remap only the destination to localhost; pass the production options intact.
 await downloadVideo({fetch:(_source,options)=>session.defaultSession.fetch(url,options),sources:['https://down-vn.vod.susercontent.com/video.mp4'],referer:'https://shopee.vn/product/1/2',temporary});
 assert.equal(requests,1);assert.deepEqual(await readFile(temporary),bytes);
 console.log('PASS: production downloader saves exact MP4 bytes through actual Electron session.fetch');
 win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 await win.loadURL('data:text/html,'+encodeURIComponent('<div class="gallery"><video></video><svg><path d="M0 0 L0 10 L10 5 Z"/></svg><input value="private-input"><p>private-text</p></div>'));
 const gallery=await win.webContents.executeJavaScript(galleryStructureScript);
 assert.equal(gallery.length,1);assert.ok(gallery[0].ancestors.some(node=>node.class==='gallery'&&node.icons.length===1));
 assert.ok(!JSON.stringify(gallery).includes('private-'));console.log('PASS: actual renderer diagnostics capture gallery structure without text or input values');
 // Reconstruct the icon-less gallery layout from the supplied diagnostics.
 const layout='<section class="flex card vr0998"><section class="C21rQm"><div class="flex flex-column"><div class="BvNoX2"><div class="OMOWB7"><div class="R32005"><div class="shopee-image-placeholder SKqokd"><svg class="stardust-icon"></svg></div><div class="center VmNEQ6"><img width="80" height="80" class="e3bgiU"><video style="display:none" class="QODm2C"></video></div></div></div></div><div class="Wi_1Rq"><img width="80" height="80"></div></div><button id="favorite">Favorite</button></section><section><h1>Product</h1><button name="buy">Buy</button></section></section>';
 await win.loadURL('data:text/html,'+encodeURIComponent(layout));
 await win.webContents.executeJavaScript(`window.posterClicks=0;window.otherClicks=0;document.querySelector('.BvNoX2').onclick=()=>{window.posterClicks++;Object.defineProperty(document.querySelector('video'),'currentSrc',{configurable:true,value:'https://down-vn.vod.susercontent.com/fixture.mp4'});};document.querySelectorAll('button').forEach(b=>b.onclick=()=>window.otherClicks++);document.querySelector('video').play=()=>Promise.resolve();true;`);
 const probed=await win.webContents.executeJavaScript(mediaScript,true);
 assert.equal(probed.activated,true);assert.equal(probed.productRoot,true);assert.ok(probed.urls.includes('https://down-vn.vod.susercontent.com/fixture.mp4'));
 await win.webContents.executeJavaScript(mediaScript,true);
 assert.deepEqual(await win.webContents.executeJavaScript('[window.posterClicks,window.otherClicks]'),[1,0]);
 for(const className of ['shopee-product-rating','product-detail']){
  await win.loadURL('data:text/html,'+encodeURIComponent('<div class="'+className+'">'+layout+'</div>'));
  assert.equal((await win.webContents.executeJavaScript(mediaScript,true)).activated,false);
 }
 console.log('PASS: diagnostic gallery poster activates once; purchase/favorite and review controls untouched');
 await require('./shopee-dialog-electron.cjs')(win);
})().catch(error=>{console.error(error);exitCode=1;}).finally(async()=>{win?.destroy();server.close();if(folder)await rm(folder,{recursive:true,force:true});app.exit(exitCode);});
